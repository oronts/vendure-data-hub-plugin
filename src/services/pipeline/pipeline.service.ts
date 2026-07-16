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
import { JsonObject, PipelineDefinition, PipelineMetrics, RunStatus } from '../../types/index';
import { PipelineStatus, RevisionType, SortOrder, StepType } from '../../constants/enums';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { createSeededGraphInput, type SeededInputMode } from '../../runtime/orchestration';
import { DataHubRegistryService } from '../../sdk/registry.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';
import { RevisionService } from '../versioning/revision.service';
import {
    assertPipelineRunnable,
    clonePipelineDefinition,
    assertPipelineStatus,
    assertValidPipelineCode,
    definitionsEqual,
    normalizePipelineDefinition,
    normalizePipelineVersion,
    statusAfterExecutableUpdate,
} from './pipeline-policy';
import { getMissingPipelinePermissions } from './pipeline-capabilities';
import { sanitizePipelineDefinitionForOutput } from '../validation/hook-security';
import {
    createPipelineRunIdempotencyScope,
    PipelineRunIdempotencyConflictError,
    type PipelineRunIdempotencyScope,
} from './pipeline-run-idempotency';

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

export interface SeededRunOptions {
    triggerKey: string;
    skipPermissionCheck?: boolean;
    triggeredBy?: string;
    seedMode?: SeededInputMode;
    deferQueueEnqueue?: boolean;
}

export interface IdempotentSeededRunOptions extends SeededRunOptions {
    idempotencyKey: string;
    idempotencyTtlSeconds: number;
    requestFingerprint: string;
}

export interface IdempotentSeededRunResult {
    run: PipelineRun;
    duplicate: boolean;
}

function toPublicPipeline(pipeline: Pipeline): Pipeline {
    const sanitized = Object.assign(new Pipeline(), pipeline);
    sanitized.definition = sanitizePipelineDefinitionForOutput(pipeline.definition);
    return sanitized;
}

function toPublicRevision(revision: PipelineRevision): PipelineRevision {
    const sanitized = Object.assign(new PipelineRevision(), revision);
    sanitized.definition = sanitizePipelineDefinitionForOutput(revision.definition);
    return sanitized;
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
        private registry: DataHubRegistryService,
        private checkpointService: CheckpointService,
        private domainEvents: DomainEventsService,
        private revisionService: RevisionService,
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
        return { items: items.map(toPublicPipeline), totalItems };
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Pipeline | null> {
        const pipeline = await this.connection.getRepository(ctx, Pipeline).findOne({ where: { id } });
        return pipeline ? toPublicPipeline(pipeline) : null;
    }

    async findByCodes(ctx: RequestContext, codes: string[]): Promise<Pipeline[]> {
        if (!codes?.length) return [];
        const pipelines = await this.connection.getRepository(ctx, Pipeline)
            .createQueryBuilder('pipeline')
            .where('pipeline.code IN (:...codes)', { codes })
            .getMany();
        return pipelines.map(toPublicPipeline);
    }

    async findDependents(ctx: RequestContext, code: string): Promise<Pipeline[]> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const qb = repo.createQueryBuilder('pipeline')
            .where(`pipeline.definition LIKE :pattern`, { pattern: `%${code}%` });
        const candidates = await qb.getMany();
        return candidates
            .filter(pipeline => {
                const definition = pipeline.definition as PipelineDefinition & { dependsOn?: string[] };
                return Array.isArray(definition?.dependsOn) && definition.dependsOn.includes(code);
            })
            .map(toPublicPipeline);
    }

    async findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({ where: { code } });
    }

    async create(ctx: RequestContext, input: CreatePipelineInput): Promise<Pipeline> {
        this.logger.debug('Creating pipeline', { pipelineCode: input.code });
        assertValidPipelineCode(input.code);
        // Quick-fail optimization: check code availability before save.
        // The DB unique constraint on Pipeline.code is the true guard against race conditions.
        await this.assertCodeAvailable(ctx, input.code);
        const definition = normalizePipelineDefinition(input.definition, 1);
        this.definitionValidator.validate(definition);
        const entity = new Pipeline();
        entity.code = input.code;
        entity.name = input.name;
        entity.enabled = input.enabled ?? true;
        entity.version = normalizePipelineVersion(input.version, definition.version);
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
        let executableChanged = false;

        if (input.code && input.code !== entity.code) {
            assertValidPipelineCode(input.code);
            await this.assertCodeAvailable(ctx, input.code, entity.id);
            entity.code = input.code;
            executableChanged = true;
        }
        if (typeof input.name === 'string') entity.name = input.name;
        if (typeof input.enabled === 'boolean') entity.enabled = input.enabled;
        if (input.version !== undefined) {
            const version = normalizePipelineVersion(input.version, entity.version);
            executableChanged ||= version !== entity.version;
            entity.version = version;
        }
        if (input.definition) {
            const definition = normalizePipelineDefinition(input.definition, entity.version);
            this.definitionValidator.validate(definition);
            if (!definitionsEqual(entity.definition, definition)) {
                entity.definition = definition;
                executableChanged = true;
            }
        }
        const nextStatus = statusAfterExecutableUpdate(entity.status, executableChanged);
        if (nextStatus !== entity.status) {
            entity.status = nextStatus;
            entity.draftRevisionId = null;
        }

        await repo.save(entity, { reload: false });
        this.domainEvents.publishPipelineUpdated(entity.id.toString(), entity.code);
        return assertFound(this.findOne(ctx, entity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        // Capture id and code before remove(). TypeORM clears entity.id after deletion
        const deletedId = entity.id.toString();
        const deletedCode = entity.code;
        try {
            await repo.remove(entity);
            this.domainEvents.publishPipelineDeleted(deletedId, deletedCode);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            return { result: DeletionResult.NOT_DELETED, message: getErrorMessage(e) };
        }
    }

    async publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const revision = await this.revisionService.publishVersion(ctx, {
            pipelineId: id,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.findOne(ctx, revision.pipelineId));
    }

    async approve(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'approve');
        return this.publish(ctx, id);
    }

    async submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.DRAFT], 'submit for review');
        this.definitionValidator.validate(pipeline.definition);
        pipeline.status = PipelineStatus.REVIEW;
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.REVIEW], 'reject review for');
        pipeline.status = PipelineStatus.DRAFT;
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async archive(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        assertPipelineStatus(pipeline.status, [PipelineStatus.PUBLISHED], 'archive');
        pipeline.status = PipelineStatus.ARCHIVED;
        pipeline.enabled = false;
        await repo.save(pipeline, { reload: false });
        this.domainEvents.publishPipelineArchived(pipeline.id.toString(), pipeline.code);
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async listRevisions(ctx: RequestContext, pipelineId: ID): Promise<PipelineRevision[]> {
        const repo = this.connection.getRepository(ctx, PipelineRevision);
        const revisions = await repo.find({
            where: { pipelineId },
            order: { createdAt: SortOrder.DESC },
        });
        return revisions.map(toPublicRevision);
    }

    async revertToRevision(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revision = await this.revisionService.revertToRevision(ctx, {
            revisionId,
            authorUserId: ctx.activeUserId?.toString(),
        });
        return assertFound(this.findOne(ctx, revision.pipelineId));
    }

    async listRuns(
        ctx: RequestContext,
        options?: ListQueryOptions<PipelineRun>,
        pipelineId?: ID,
    ): Promise<PaginatedList<PipelineRun>> {
        const qb = this.listQueryBuilder.build(PipelineRun, options, { ctx });
        // Always join the pipeline relation. Required because the GraphQL schema
        // exposes pipeline as a non-nullable field on PipelineRun.
        qb.leftJoinAndSelect(`${qb.alias}.pipeline`, 'pipeline');
        if (pipelineId) {
            qb.andWhere(`${qb.alias}.pipelineId = :pid`, { pid: pipelineId });
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
        assertPipelineRunnable(pipeline);
        const definition = await this.getPublishedDefinition(ctx, pipeline);
        if (!options?.skipPermissionCheck) {
            await this.assertCapabilitiesAllowed(ctx, definition);
        }
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.definitionSnapshot = definition;
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
        if (run.status === RunStatus.RUNNING) {
            run.status = RunStatus.CANCEL_REQUESTED;
            await repo.save(run, { reload: false });
        } else if (run.status === RunStatus.PAUSED) {
            // PAUSED runs have no active runner to detect CANCEL_REQUESTED, so cancel immediately
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            run.error = 'Cancelled by user while paused at gate';
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
        options: SeededRunOptions,
    ): Promise<PipelineRun> {
        return this.createSeededRun(ctx, pipelineId, seed, options);
    }

    async startIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        const scope = createPipelineRunIdempotencyScope(
            ctx.channelId,
            options.triggerKey,
            options.idempotencyKey,
            options.requestFingerprint,
            options.idempotencyTtlSeconds,
        );
        const existing = await this.findIdempotentRun(ctx, pipelineId, scope);
        if (existing && !this.isIdempotencyExpired(existing)) {
            return this.toDuplicateIdempotentResult(existing, scope);
        }
        if (existing) {
            await this.releaseIdempotencyScope(ctx, existing);
        }

        try {
            const run = await this.createSeededRun(ctx, pipelineId, seed, options, scope);
            return { run, duplicate: false };
        } catch (error) {
            if (!isDuplicateEntryError(getErrorMessage(error))) {
                throw error;
            }
            const winner = await this.findIdempotentRun(ctx, pipelineId, scope);
            if (!winner) {
                throw error;
            }
            return this.toDuplicateIdempotentResult(winner, scope);
        }
    }

    private async findIdempotentRun(
        ctx: RequestContext,
        pipelineId: ID,
        scope: PipelineRunIdempotencyScope,
    ): Promise<PipelineRun | null> {
        return this.connection.getRepository(ctx, PipelineRun).findOne({
            where: {
                pipelineId,
                idempotencyChannelId: scope.channelId,
                idempotencyTriggerKeyHash: scope.triggerKeyHash,
                idempotencyKeyHash: scope.keyHash,
            },
            relations: { pipeline: true },
        });
    }

    private isIdempotencyExpired(run: PipelineRun): boolean {
        return run.idempotencyExpiresAt !== null &&
            run.idempotencyExpiresAt.getTime() <= Date.now();
    }

    private toDuplicateIdempotentResult(
        run: PipelineRun,
        scope: PipelineRunIdempotencyScope,
    ): IdempotentSeededRunResult {
        if (run.idempotencyPayloadHash !== scope.payloadHash) {
            throw new PipelineRunIdempotencyConflictError();
        }
        return { run, duplicate: true };
    }

    private async releaseIdempotencyScope(
        ctx: RequestContext,
        run: PipelineRun,
    ): Promise<void> {
        run.idempotencyChannelId = null;
        run.idempotencyTriggerKeyHash = null;
        run.idempotencyKeyHash = null;
        run.idempotencyPayloadHash = null;
        run.idempotencyExpiresAt = null;
        await this.connection.getRepository(ctx, PipelineRun).save(run, { reload: false });
    }

    private async createSeededRun(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
        idempotency?: PipelineRunIdempotencyScope,
    ): Promise<PipelineRun> {
        const seededInput = createSeededGraphInput(options.triggerKey, seed, options.seedMode);
        const seedCheckpoint: JsonObject = {
            __seed: {
                triggerKey: seededInput.triggerKey,
                records: seededInput.records,
                mode: seededInput.mode,
            },
        };
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        assertPipelineRunnable(pipeline);
        const definition = await this.getPublishedDefinition(ctx, pipeline);
        if (!options.skipPermissionCheck) {
            await this.assertCapabilitiesAllowed(ctx, definition);
        }
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.definitionSnapshot = definition;
        runEntity.checkpoint = seedCheckpoint;
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options.triggeredBy ??
            (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        runEntity.idempotencyChannelId = idempotency?.channelId ?? null;
        runEntity.idempotencyTriggerKeyHash = idempotency?.triggerKeyHash ?? null;
        runEntity.idempotencyKeyHash = idempotency?.keyHash ?? null;
        runEntity.idempotencyPayloadHash = idempotency?.payloadHash ?? null;
        runEntity.idempotencyExpiresAt = idempotency?.expiresAt ?? null;

        const run = await this.connection.getRepository(ctx, PipelineRun).save(runEntity);
        if (!options.deferQueueEnqueue) {
            this.eventBus.publish(new PipelineQueueRequestEvent(
                run.id,
                pipelineId,
                runEntity.triggeredBy,
                seedCheckpoint,
            ));
        }
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunByCode(
        ctx: RequestContext,
        code: string,
        opts?: {
            seedRecords?: unknown[];
            triggerKey?: string;
            seedMode?: SeededInputMode;
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
        },
    ): Promise<PipelineRun> {
        const pipeline = await this.findByCode(ctx, code);
        if (!pipeline) {
            throw new Error(`Pipeline with code "${code}" not found`);
        }
        if (opts?.seedRecords) {
            if (!opts.triggerKey) {
                throw new Error('Seeded pipeline execution requires a trigger key');
            }
            return this.startRunWithSeed(ctx, pipeline.id, opts.seedRecords, {
                triggerKey: opts.triggerKey,
                skipPermissionCheck: opts.skipPermissionCheck,
                triggeredBy: opts.triggeredBy,
                seedMode: opts.seedMode,
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
     * Uses atomic UPDATE WHERE to prevent TOCTOU race: only one concurrent caller
     * can flip PAUSED -> RUNNING. Subsequent callers see 0 affected rows and fail.
     */
    async approveGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);

        // Atomic status transition: only succeeds if run is currently PAUSED
        const updateResult = await repo.update(
            { id: runId, status: RunStatus.PAUSED },
            { status: RunStatus.RUNNING },
        );
        if (updateResult.affected === 0) {
            const existing = await repo.findOne({ where: { id: runId } });
            if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
            throw new Error(`Cannot approve gate: run is not paused (current status: ${existing.status})`);
        }

        const run = await repo.findOne({
            where: { id: runId },
            relations: { pipeline: true },
        });
        if (!run) throw new Error(`Pipeline run not found after approval: ${runId}`);

        const pipelineId = run.pipeline?.id ?? run.pipelineId;

        // Mark the gate as approved in the DataHubCheckpoint entity (read by the executor on resume)
        if (pipelineId) {
            const existing = await this.checkpointService.getByPipeline(ctx, pipelineId);
            const cpData: JsonObject = { ...(existing?.data ?? {}) };
            cpData[`__gateApproved:${stepKey}`] = true;
            await this.checkpointService.setForPipeline(ctx, pipelineId, cpData);
        }

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

    /**
     * Reject a paused GATE step and cancel the pipeline run.
     *
     * Uses atomic UPDATE WHERE to prevent TOCTOU race: only one concurrent caller
     * can flip PAUSED -> CANCELLED. Subsequent callers see 0 affected rows and fail.
     */
    async rejectGate(ctx: RequestContext, runId: ID, stepKey: string): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);

        // Atomic status transition: only succeeds if run is currently PAUSED
        const updateResult = await repo.update(
            { id: runId, status: RunStatus.PAUSED },
            {
                status: RunStatus.CANCELLED,
                finishedAt: new Date(),
                error: `Gate step "${stepKey}" rejected by user`,
            },
        );
        if (updateResult.affected === 0) {
            const existing = await repo.findOne({ where: { id: runId } });
            if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
            throw new Error(`Cannot reject gate: run is not paused (current status: ${existing.status})`);
        }

        const run = await repo.findOne({
            where: { id: runId },
            relations: { pipeline: true },
        });
        if (!run) throw new Error(`Pipeline run not found after rejection: ${runId}`);

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

    private async getPublishedDefinition(
        ctx: RequestContext,
        pipeline: Pipeline,
    ): Promise<PipelineDefinition> {
        if (pipeline.currentRevisionId == null) {
            throw new Error(`Published pipeline "${pipeline.code}" has no active revision`);
        }

        const revision = await this.connection.getRepository(ctx, PipelineRevision).findOne({
            where: {
                id: pipeline.currentRevisionId,
                pipelineId: pipeline.id,
                type: RevisionType.PUBLISHED,
            },
        });
        if (!revision) {
            throw new Error(`Active revision not found for pipeline "${pipeline.code}"`);
        }
        return clonePipelineDefinition(revision.definition);
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
        await this.assertCapabilitiesAllowed(ctx, pipeline.definition);

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
        const missing = getMissingPipelinePermissions(this.registry, ctx, definition);
        if (!missing.length) return;

        this.logger.warn('Pipeline requires permissions not held by user', {
            userId: ctx.activeUserId,
            missing,
        });
        throw new Error(`Missing required permissions for this pipeline: ${missing.join(', ')}`);
    }
}
