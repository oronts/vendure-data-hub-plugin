import { Injectable } from '@nestjs/common';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import {
    assertFound,
    EventBus,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { JsonObject, JsonValue, PipelineDefinition, PipelineMetrics, RunStatus } from '../../types/index';
import { PipelineStatus, RevisionType, SortOrder, StepType } from '../../constants/enums';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { escapeLikePattern } from '../../utils/sql-security.utils';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';

export interface CreatePipelineInput {
    code: string;
    name: string;
    enabled?: boolean;
    version?: number;
    definition: PipelineDefinition;
}

export interface UpdatePipelineInput {
    id: ID;
    code?: string;
    name?: string;
    enabled?: boolean;
    version?: number;
    definition?: PipelineDefinition;
}

@Injectable()
export class PipelineService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private eventBus: EventBus,
        private definitionValidator: DefinitionValidationService,
        private adapterRuntime: AdapterRuntimeService,
        private checkpointService: CheckpointService,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<Pipeline>,
    ): Promise<PaginatedList<Pipeline>> {
        const qb = this.listQueryBuilder.build(Pipeline, options, { ctx });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    findOne(ctx: RequestContext, id: ID): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({ where: { id } });
    }

    async findByCodes(ctx: RequestContext, codes: string[]): Promise<Pipeline[]> {
        if (!codes?.length) return [];
        return this.connection.getRepository(ctx, Pipeline).createQueryBuilder('pipeline')
            .where('pipeline.code IN (:...codes)', { codes })
            .getMany();
    }

    async findDependents(ctx: RequestContext, code: string): Promise<Pipeline[]> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        // Pre-filter at SQL level: the definition JSON column must contain the code string
        const escapedCode = escapeLikePattern(code);
        const candidates = await repo
            .createQueryBuilder('pipeline')
            .where('pipeline.definition::text LIKE :pattern', { pattern: `%${escapedCode}%` })
            .getMany();
        // Post-filter for exact match in dependsOn array
        return candidates.filter(p => {
            const def = p.definition as PipelineDefinition & { dependsOn?: string[] };
            return Array.isArray(def?.dependsOn) && def.dependsOn.includes(code);
        });
    }

    async findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({ where: { code } });
    }

    async create(ctx: RequestContext, input: CreatePipelineInput): Promise<Pipeline> {
        this.logger.debug('Creating pipeline', { pipelineCode: input.code });
        // Quick-fail optimization: check code availability before save.
        // The DB unique constraint on Pipeline.code is the true guard against race conditions.
        await this.assertCodeAvailable(ctx, input.code);
        // Ensure definition has a valid version
        const definition = { ...input.definition };
        if (!definition.version || definition.version < 1) {
            definition.version = 1;
        }
        if (typeof definition.version === 'string') {
            definition.version = parseInt(String(definition.version), 10) || 1;
        }
        this.definitionValidator.validate(definition);
        const entity = new Pipeline();
        entity.code = input.code;
        entity.name = input.name;
        entity.enabled = input.enabled ?? true;
        entity.version = input.version ?? definition.version ?? 1;
        entity.definition = definition;
        let saved: Pipeline;
        try {
            saved = await this.connection.getRepository(ctx, Pipeline).save(entity);
        } catch (error: unknown) {
            // Handle unique constraint violation from concurrent inserts (TOCTOU race)
            const msg = getErrorMessage(error);
            if (isDuplicateEntryError(msg)) {
                throw new Error(`Pipeline code "${input.code}" already exists`);
            }
            throw error;
        }
        this.logger.info('Pipeline created', {
            pipelineCode: input.code,
            pipelineId: saved.id,
        });
        this.domainEvents.publishPipelineCreated(saved.id.toString(), input.code);
        return assertFound(this.findOne(ctx, saved.id));
    }

    async update(ctx: RequestContext, input: UpdatePipelineInput): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.connection.getEntityOrThrow(ctx, Pipeline, input.id);
        if (input.code && input.code !== entity.code) {
            await this.assertCodeAvailable(ctx, input.code, entity.id);
            entity.code = input.code;
        }
        if (typeof input.name === 'string') entity.name = input.name;
        if (typeof input.enabled === 'boolean') entity.enabled = input.enabled;
        if (input.version !== undefined) {
            const ver = typeof input.version === 'string' ? parseInt(input.version, 10) : input.version;
            if (typeof ver === 'number' && !isNaN(ver)) entity.version = ver;
        }
        if (input.definition) {
            // Ensure definition has a valid version
            const definition = { ...input.definition };
            if (!definition.version || definition.version < 1) {
                definition.version = entity.version || 1;
            }
            if (typeof definition.version === 'string') {
                definition.version = parseInt(String(definition.version), 10) || 1;
            }
            this.definitionValidator.validate(definition);
            entity.definition = definition;
        }
        await repo.save(entity, { reload: false });
        this.domainEvents.publishPipelineUpdated(entity.id.toString(), entity.code);
        return assertFound(this.findOne(ctx, entity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        try {
            await repo.remove(entity);
            this.domainEvents.publishPipelineDeleted(entity.id.toString(), entity.code);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            return { result: DeletionResult.NOT_DELETED, message: getErrorMessage(e) };
        }
    }

    async publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        this.definitionValidator.validate(pipeline.definition);
        await this.assertCapabilitiesAllowed(ctx, pipeline.definition);

        const newVersion = (pipeline.version ?? 0) + 1;

        // Save revision FIRST so version increment is only committed on success
        let savedRevisionId: number | undefined;
        try {
            const revRepo = this.connection.getRepository(ctx, PipelineRevision);
            const revision = new PipelineRevision();
            revision.pipeline = pipeline;
            revision.pipelineId = Number(pipeline.id);
            revision.version = newVersion;
            revision.definition = pipeline.definition;
            revision.type = RevisionType.PUBLISHED;
            revision.authorUserId = ctx.activeUserId?.toString() ?? null;
            revision.definitionSize = JSON.stringify(pipeline.definition).length;
            const savedRevision = await revRepo.save(revision);
            savedRevisionId = Number(savedRevision.id);
        } catch (e) {
            this.logger.warn('Failed to save pipeline revision', {
                pipelineCode: pipeline.code,
                error: getErrorMessage(e),
            });
        }

        // Commit all pipeline changes in a single save
        pipeline.version = newVersion;
        pipeline.status = PipelineStatus.PUBLISHED;
        pipeline.publishedAt = new Date();
        pipeline.publishedByUserId = ctx.activeUserId?.toString() ?? null;
        if (savedRevisionId != null) {
            pipeline.currentRevisionId = savedRevisionId;
            pipeline.publishedVersionCount = (pipeline.publishedVersionCount ?? 0) + 1;
        }
        await repo.save(pipeline, { reload: false });

        this.logger.info('Pipeline published', {
            pipelineCode: pipeline.code,
            version: newVersion,
            revisionId: savedRevisionId,
        });
        this.domainEvents.publishPipelinePublished(pipeline.id.toString(), pipeline.code);

        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        if (pipeline.status === PipelineStatus.PUBLISHED) return pipeline;
        pipeline.status = PipelineStatus.REVIEW;
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        if (pipeline.status !== PipelineStatus.REVIEW) return pipeline;
        pipeline.status = PipelineStatus.DRAFT;
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async archive(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        pipeline.status = PipelineStatus.ARCHIVED;
        pipeline.enabled = false;
        await repo.save(pipeline, { reload: false });
        this.domainEvents.publishPipelineArchived(pipeline.id.toString(), pipeline.code);
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async listRevisions(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision[]> {
        const repo = this.connection.getRepository(ctx, PipelineRevision);
        return repo.find({
            where: { pipelineId: Number(pipelineId) },
            order: { createdAt: SortOrder.DESC },
        });
    }

    async revertToRevision(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revRepo = this.connection.getRepository(ctx, PipelineRevision);
        const revision = await this.connection.getEntityOrThrow(ctx, PipelineRevision, revisionId);
        if (!revision.pipelineId) {
            throw new Error('Revision has no associated pipeline');
        }
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, revision.pipelineId);
        try {
            const rev = new PipelineRevision();
            rev.pipeline = pipeline;
            rev.version = pipeline.version;
            rev.definition = pipeline.definition;
            rev.authorUserId = ctx.activeUserId?.toString() ?? null;
            await revRepo.save(rev);
        } catch (error) {
            this.logger.warn('Failed to save pre-revert revision snapshot', {
                pipelineCode: pipeline.code,
                revisionId,
                error: getErrorMessage(error),
            });
        }
        pipeline.definition = revision.definition;
        pipeline.version = (pipeline.version ?? 1) + 1;
        pipeline.status = PipelineStatus.DRAFT;
        await this.connection.getRepository(ctx, Pipeline).save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async listRuns(
        ctx: RequestContext,
        options?: ListQueryOptions<PipelineRun>,
        pipelineId?: ID,
    ): Promise<PaginatedList<PipelineRun>> {
        const qb = this.listQueryBuilder.build(PipelineRun, options, { ctx });
        if (pipelineId) {
            qb.andWhere('pipelineRun.pipelineId = :pid', { pid: pipelineId });
        }
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    runById(ctx: RequestContext, id: ID): Promise<PipelineRun | null> {
        return this.connection.getRepository(ctx, PipelineRun).findOne({
            where: { id },
            relations: { pipeline: true },
        });
    }

    async startRun(
        ctx: RequestContext,
        pipelineId: ID,
        options?: { skipPermissionCheck?: boolean; triggeredBy?: string },
    ): Promise<PipelineRun> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        if (!pipeline.enabled) {
            this.logger.warn('Attempted to start disabled pipeline', {
                pipelineId,
                pipelineCode: pipeline.code,
            });
            throw new Error('Pipeline is disabled');
        }
        if (!options?.skipPermissionCheck) {
            await this.assertCapabilitiesAllowed(ctx, pipeline.definition);
        }
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.checkpoint = null;
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options?.triggeredBy ?? (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        const run = await repo.save(runEntity);
        this.eventBus.publish(new PipelineQueueRequestEvent(
            run.id,
            pipelineId,
            runEntity.triggeredBy,
        ));
        this.logger.info('Pipeline run started', {
            pipelineId,
            pipelineCode: pipeline.code,
            runId: run.id,
            userId: ctx.activeUserId,
        });
        return assertFound(this.runById(ctx, run.id));
    }

    async cancelRun(ctx: RequestContext, id: ID): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, id);
        if (run.status === RunStatus.RUNNING || run.status === RunStatus.PAUSED) {
            run.status = RunStatus.CANCEL_REQUESTED;
            await repo.save(run, { reload: false });

            // Emit cancellation event for subscribers (webhooks, audit logs, monitoring)
            this.domainEvents.publishRunCancelled(
                run.pipelineId?.toString(),
                String(id),
                ctx.activeUserId?.toString(),
            );

            this.logger.info('Pipeline run cancellation requested', { runId: id });
        } else if (run.status === RunStatus.PENDING) {
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            await repo.save(run, { reload: false });
            this.domainEvents.publishRunCancelled(
                run.pipelineId?.toString(),
                String(id),
                ctx.activeUserId?.toString(),
            );
            this.logger.info('Pipeline run cancelled', { runId: id });
        }
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options?: { skipPermissionCheck?: boolean; triggeredBy?: string },
    ): Promise<PipelineRun> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        if (!pipeline.enabled) {
            throw new Error('Pipeline is disabled');
        }
        if (!options?.skipPermissionCheck) {
            await this.assertCapabilitiesAllowed(ctx, pipeline.definition);
        }
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.checkpoint = { __seed: seed as JsonValue[] };
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options?.triggeredBy ?? (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        const run = await repo.save(runEntity);
        this.eventBus.publish(new PipelineQueueRequestEvent(
            run.id,
            pipelineId,
            runEntity.triggeredBy,
            { __seed: seed as JsonValue[] },
        ));
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunByCode(
        ctx: RequestContext,
        code: string,
        opts?: { seedRecords?: unknown[]; skipPermissionCheck?: boolean; triggeredBy?: string },
    ): Promise<PipelineRun> {
        const pipeline = await this.findByCode(ctx, code);
        if (!pipeline) {
            throw new Error(`Pipeline with code "${code}" not found`);
        }
        if (opts?.seedRecords && opts.seedRecords.length) {
            return this.startRunWithSeed(ctx, pipeline.id, opts.seedRecords, {
                skipPermissionCheck: opts?.skipPermissionCheck,
                triggeredBy: opts?.triggeredBy,
            });
        }
        return this.startRun(ctx, pipeline.id, {
            skipPermissionCheck: opts?.skipPermissionCheck,
            triggeredBy: opts?.triggeredBy,
        });
    }

    /**
     * Approve a paused GATE step and resume the pipeline run.
     *
     * Race condition safety: concurrent calls to approveGate for the same runId
     * are serialized by the database transaction. The status check (PAUSED) acts
     * as a guard — only the first caller succeeds; subsequent callers see RUNNING
     * and receive an error, preventing duplicate resumptions.
     */
    async approveGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await repo.findOne({
            where: { id: runId },
            relations: { pipeline: true },
        });
        if (!run) {
            throw new Error(`Pipeline run not found: ${runId}`);
        }
        if (run.status !== RunStatus.PAUSED) {
            throw new Error(`Cannot approve gate: run is not paused (current status: ${run.status})`);
        }

        const pipelineId = run.pipeline?.id ?? run.pipelineId;

        // Mark the gate as approved in the DataHubCheckpoint entity (read by the executor on resume)
        if (pipelineId) {
            const existing = await this.checkpointService.getByPipeline(ctx, pipelineId);
            const cpData: JsonObject = { ...(existing?.data ?? {}) };
            cpData[`__gateApproved:${stepKey}`] = true;
            await this.checkpointService.setForPipeline(ctx, pipelineId, cpData);
        }

        // Set status to RUNNING so the runner picks it up
        run.status = RunStatus.RUNNING;
        await repo.save(run, { reload: false });

        this.domainEvents.publishGateApproved(
            pipelineId?.toString(),
            String(runId),
            stepKey,
            ctx.activeUserId?.toString(),
        );

        this.logger.info('Gate approved, resuming pipeline run', {
            runId,
            stepKey,
            pipelineId,
            userId: ctx.activeUserId,
        });

        // Dispatch the run for continued execution via the job queue
        if (pipelineId) {
            this.eventBus.publish(new PipelineQueueRequestEvent(
                runId,
                pipelineId,
                ctx.activeUserId ? `gate-approve:${ctx.activeUserId}` : 'gate-approve',
            ));
        }

        return assertFound(this.runById(ctx, run.id));
    }

    async rejectGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, runId);
        if (run.status !== RunStatus.PAUSED) {
            throw new Error(`Cannot reject gate: run is not paused (current status: ${run.status})`);
        }
        run.status = RunStatus.CANCELLED;
        run.finishedAt = new Date();
        run.error = `Gate step "${stepKey}" rejected by user`;
        await repo.save(run, { reload: false });
        this.domainEvents.publishGateRejected(
            run.pipelineId?.toString(),
            String(runId),
            stepKey,
            `Rejected by user ${ctx.activeUserId ?? 'unknown'}`,
        );
        this.logger.info('Gate rejected, cancelling pipeline run', {
            runId,
            stepKey,
            userId: ctx.activeUserId,
        });
        return assertFound(this.runById(ctx, run.id));
    }

    private async assertCodeAvailable(ctx: RequestContext, code: string, excludeId?: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const existing = await repo.findOne({ where: { code } });
        if (existing && (!excludeId || existing.id !== excludeId)) {
            throw new Error(`Pipeline code "${code}" already exists`);
        }
    }

    async dryRun(ctx: RequestContext, pipelineId: ID): Promise<{
        metrics: PipelineMetrics;
        notes: string[];
        sampleRecords?: Array<{ step: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
    }> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        this.definitionValidator.validate(pipeline.definition);

        this.logger.debug('Starting dry run', {
            pipelineId,
            pipelineCode: pipeline.code,
            stepCount: pipeline.definition?.steps?.length ?? 0,
        });

        const result = await this.adapterRuntime.executeDryRun(ctx, pipeline.definition);
        const notes: string[] = [];

        if (result.metrics.totalRecords === 0) {
            notes.push('No records were extracted. Check that your extract step has data available.');
            if (pipeline.definition?.steps?.[0]?.type === StepType.EXTRACT) {
                const extractConfig = pipeline.definition.steps[0].config as { adapterCode?: string };
                notes.push(`Extract adapter: ${extractConfig?.adapterCode ?? 'unknown'}`);
            }
        } else {
            notes.push('Dry run completed successfully');
            notes.push(`Processed ${result.metrics.totalRecords} record(s)`);
        }

        if (result.errors?.length) {
            notes.push(...result.errors.map(e => `Error: ${e}`));
        }

        this.logger.debug('Dry run completed', {
            pipelineCode: pipeline.code,
            totalRecords: result.metrics.totalRecords,
            sampleCount: result.sampleRecords?.length ?? 0,
        });

        return {
            metrics: result.metrics,
            notes,
            sampleRecords: result.sampleRecords,
        };
    }

    private async assertCapabilitiesAllowed(ctx: RequestContext, definition: PipelineDefinition): Promise<void> {
        const requires: string[] = Array.isArray(definition?.capabilities?.requires) ? (definition.capabilities.requires as string[]) : [];
        if (!requires.length) return;

        const userPermissions = ctx.session?.user?.channelPermissions?.flatMap(cp => cp.permissions) ?? [];
        const permissionSet = new Set(userPermissions.map(p => String(p)));

        // SuperAdmin has all permissions
        if (permissionSet.has('SuperAdmin')) return;

        const missing = requires.filter(r => !permissionSet.has(r));
        if (missing.length) {
            this.logger.warn('Pipeline requires permissions not held by user', {
                userId: ctx.activeUserId,
                required: requires,
                missing,
            });
            throw new Error(`Missing required permissions for this pipeline: ${missing.join(', ')}`);
        }
    }
}
