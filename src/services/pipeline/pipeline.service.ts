import { Injectable } from '@nestjs/common';
import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';
import {
    assertFound,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { Pipeline, PipelineRevision, PipelineRun } from '../../entities/pipeline';
import { PipelineDefinition, PipelineMetrics, RunStatus } from '../../types/index';
import { validatePipelineDefinition } from '../../validation/pipeline-definition.validator';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { forwardRef, Inject } from '@nestjs/common';
import { DataHubRunQueueHandler } from '../../jobs/handlers/pipeline-run.handler';
import { LOGGER_CONTEXTS } from '../../constants/index';

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
        @Inject(forwardRef(() => DataHubRunQueueHandler))
        private runQueue: DataHubRunQueueHandler,
        private definitionValidator: DefinitionValidationService,
        private adapterRuntime: AdapterRuntimeService,
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
        const all = await repo.find();
        return all.filter(p => Array.isArray((p.definition as any)?.dependsOn) && (p.definition as any).dependsOn.includes(code));
    }

    async findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({ where: { code } });
    }

    async create(ctx: RequestContext, input: CreatePipelineInput): Promise<Pipeline> {
        this.logger.debug('Creating pipeline', { pipelineCode: input.code });
        await this.assertCodeAvailable(ctx, input.code);
        // Ensure definition has a valid version
        const definition = { ...input.definition };
        if (!definition.version || definition.version < 1) {
            definition.version = 1;
        }
        if (typeof definition.version === 'string') {
            definition.version = parseInt(definition.version as any, 10) || 1;
        }
        this.definitionValidator.validate(definition);
        const entity = new Pipeline();
        entity.code = input.code;
        entity.name = input.name;
        entity.enabled = input.enabled ?? true;
        entity.version = input.version ?? definition.version ?? 1;
        entity.definition = definition;
        const saved = await this.connection.getRepository(ctx, Pipeline).save(entity);
        this.logger.info('Pipeline created', {
            pipelineCode: input.code,
            pipelineId: saved.id,
        } as any);
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
                definition.version = parseInt(definition.version as any, 10) || 1;
            }
            this.definitionValidator.validate(definition);
            entity.definition = definition;
        }
        await repo.save(entity, { reload: false });
        return assertFound(this.findOne(ctx, entity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const entity = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        try {
            await repo.remove(entity);
            return { result: DeletionResult.DELETED };
        } catch (e) {
            return { result: DeletionResult.NOT_DELETED, message: e instanceof Error ? e.message : String(e) };
        }
    }

    async publish(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        this.definitionValidator.validate(pipeline.definition);
        await this.assertCapabilitiesAllowed(ctx, pipeline.definition);

        // Auto-increment version on publish
        const previousVersion = pipeline.version ?? 0;
        pipeline.version = previousVersion + 1;
        pipeline.status = 'PUBLISHED' as any;
        pipeline.publishedAt = new Date();
        pipeline.publishedByUserId = (ctx.activeUserId ?? null) as any;
        await repo.save(pipeline, { reload: false });

        // Save revision for version history
        try {
            const revRepo = this.connection.getRepository(ctx, PipelineRevision as any);
            const revision = new (PipelineRevision as any)({
                pipeline,
                pipelineId: pipeline.id,
                version: pipeline.version,
                definition: pipeline.definition,
                type: 'published',
                authorUserId: (ctx.activeUserId ?? null) as any,
                definitionSize: JSON.stringify(pipeline.definition).length,
            });
            const savedRevision = await revRepo.save(revision);
            // Update pipeline to point to this revision
            pipeline.currentRevisionId = savedRevision.id;
            pipeline.publishedVersionCount = (pipeline.publishedVersionCount ?? 0) + 1;
            await repo.save(pipeline, { reload: false });
            this.logger.info('Pipeline published with revision', {
                pipelineCode: pipeline.code,
                version: pipeline.version,
                revisionId: savedRevision.id,
            });
        } catch (e) {
            this.logger.warn('Failed to save pipeline revision', {
                pipelineCode: pipeline.code,
                error: e instanceof Error ? e.message : String(e),
            });
        }
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async submitForReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        if ((pipeline as any).status === 'PUBLISHED') return pipeline;
        (pipeline as any).status = 'REVIEW';
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async rejectReview(ctx: RequestContext, id: ID): Promise<Pipeline> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, id);
        if ((pipeline as any).status !== 'REVIEW') return pipeline;
        (pipeline as any).status = 'DRAFT';
        await repo.save(pipeline, { reload: false });
        return assertFound(this.findOne(ctx, pipeline.id));
    }

    async listRevisions(ctx: RequestContext, pipelineId: ID) {
        const repo = this.connection.getRepository(ctx, PipelineRevision);
        return repo.find({ where: { pipeline: { id: pipelineId } } as any, order: { createdAt: 'DESC' as any } as any } as any);
    }

    async revertToRevision(ctx: RequestContext, revisionId: ID): Promise<Pipeline> {
        const revRepo = this.connection.getRepository(ctx, PipelineRevision);
        const revision = await this.connection.getEntityOrThrow(ctx, PipelineRevision, revisionId);
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, (revision as any).pipeline.id);
        try {
            const rev = new PipelineRevision();
            rev.pipeline = pipeline;
            rev.version = pipeline.version;
            rev.definition = pipeline.definition;
            rev.authorUserId = (ctx.activeUserId ?? null) as any;
            await revRepo.save(rev);
        } catch (error) {
            this.logger.warn('Failed to save pre-revert revision snapshot', {
                pipelineCode: pipeline.code,
                revisionId,
                error: (error as Error)?.message,
            });
        }
        pipeline.definition = revision.definition as any;
        pipeline.version = (pipeline.version ?? 1) + 1;
        pipeline.status = 'DRAFT' as any;
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
            qb.andWhere('pipelineRun__pipeline.id = :pid', { pid: pipelineId });
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
        options?: { skipPermissionCheck?: boolean },
    ): Promise<PipelineRun> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        if (!pipeline.enabled) {
            this.logger.warn('Attempted to start disabled pipeline', {
                pipelineId,
                pipelineCode: pipeline.code,
            });
            throw new Error('Pipeline is disabled');
        }
        // Enforce capabilities.requires: current admin must hold all required permissions
        // Skip for scheduled runs (system-triggered) since pipeline was already configured by admin
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
        runEntity.startedByUserId = (ctx.activeUserId ?? null) as any;
        const run = await repo.save(runEntity);
        await this.runQueue.enqueueRun(run.id);
        this.logger.info('Pipeline run started', {
            pipelineId,
            pipelineCode: pipeline.code,
            runId: run.id,
            userId: ctx.activeUserId,
        } as any);
        return assertFound(this.runById(ctx, run.id));
    }

    async cancelRun(ctx: RequestContext, id: ID): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await this.connection.getEntityOrThrow(ctx, PipelineRun, id);
        if (run.status === RunStatus.RUNNING) {
            run.status = RunStatus.CANCEL_REQUESTED;
            await repo.save(run, { reload: false });
            this.logger.info('Pipeline run cancellation requested', { runId: id });
        } else if (run.status === RunStatus.PENDING) {
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            await repo.save(run, { reload: false });
            this.logger.info('Pipeline run cancelled', { runId: id });
        }
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options?: { skipPermissionCheck?: boolean },
    ): Promise<PipelineRun> {
        const pipeline = await this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId);
        if (!pipeline.enabled) {
            throw new Error('Pipeline is disabled');
        }
        // Skip permission check for event-triggered runs (system-triggered)
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
        runEntity.checkpoint = { __seed: seed } as any;
        runEntity.startedByUserId = (ctx.activeUserId ?? null) as any;
        const run = await repo.save(runEntity);
        await this.runQueue.enqueueRun(run.id);
        return assertFound(this.runById(ctx, run.id));
    }

    async startRunByCode(
        ctx: RequestContext,
        code: string,
        opts?: { seedRecords?: unknown[]; skipPermissionCheck?: boolean },
    ): Promise<PipelineRun> {
        const pipeline = await this.findByCode(ctx, code);
        if (!pipeline) {
            throw new Error(`Pipeline with code "${code}" not found`);
        }
        if (opts?.seedRecords && opts.seedRecords.length) {
            return this.startRunWithSeed(ctx, pipeline.id as any, opts.seedRecords, {
                skipPermissionCheck: opts.skipPermissionCheck,
            });
        }
        return this.startRun(ctx, pipeline.id as any, { skipPermissionCheck: opts?.skipPermissionCheck });
    }

    private async assertCodeAvailable(ctx: RequestContext, code: string, excludeId?: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, Pipeline);
        const existing = await repo.findOne({ where: { code } });
        if (existing && (!excludeId || existing.id !== excludeId)) {
            throw new Error(`Pipeline code "${code}" already exists`);
        }
    }

    private buildInitialMetrics(): PipelineMetrics {
        return {
            totalRecords: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            durationMs: 0,
        };
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
            if (pipeline.definition?.steps?.[0]?.type === 'EXTRACT') {
                const extractConfig = pipeline.definition.steps[0].config as any;
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
        const requires: string[] = Array.isArray(definition?.capabilities?.requires) ? (definition.capabilities!.requires as string[]) : [];
        if (!requires.length) return;

        // Use Vendure's built-in permission checking via RequestContext
        // The ctx.userHasPermission check relies on the session's permissions being populated
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
