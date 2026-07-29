import { Injectable } from '@nestjs/common';
import {
    assertFound,
    EventBus,
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    clearPipelineRunGateState,
    Pipeline,
    PipelineRun,
} from '../../entities/pipeline';
import {
    JsonObject,
    PipelineDefinition,
    RunStatus,
} from '../../types';
import { StepType } from '../../constants/enums';
import {
    createSeededGraphInput,
    type SeededInputMode,
} from '../../runtime/orchestration';
import { LOGGER_CONTEXTS } from '../../constants';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { getErrorMessage, isDuplicateEntryError } from '../../utils/error.utils';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import {
    assertPipelineRunnable,
    PipelineRevisionMismatchError,
    PublishedPipelineRevisionUnavailableError,
} from './pipeline-policy';
import { PipelineExecutionPermissionService } from './pipeline-execution-permission.service';
import {
    createPipelineRunIdempotencyScope,
    PipelineRunIdempotencyConflictError,
    type PipelineRunIdempotencyScope,
} from './pipeline-run-idempotency';
import { getPipelineRunChannel } from './pipeline-run-channel';
import { findPipelineRunInActiveChannel } from './pipeline-run-lookup';
import {
    type IdempotentSeededRunOptions,
    type IdempotentSeededRunResult,
    type SeededRunOptions,
} from './pipeline-run-types';
import { loadPublishedPipelineDefinition } from './published-pipeline-definition';

interface PreparedPipelineRun {
    readonly pipeline: Pipeline;
    readonly revisionId: ID;
    readonly definition: PipelineDefinition;
}

@Injectable()
export class PipelineRunCreationService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
        private executionPermissions: PipelineExecutionPermissionService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async startRun(
        ctx: RequestContext,
        pipelineId: ID,
        options?: {
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        const runChannel = getPipelineRunChannel(ctx);
        const { pipeline, revisionId, definition } = await this.preparePipelineRun(
            ctx,
            pipelineId,
            options?.skipPermissionCheck,
            options?.expectedRevisionId,
        );
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.revisionId = revisionId;
        runEntity.status = RunStatus.PENDING;
        runEntity.startedAt = null;
        runEntity.finishedAt = null;
        runEntity.metrics = null;
        runEntity.error = null;
        runEntity.definitionSnapshot = definition;
        runEntity.checkpoint = null;
        runEntity.startedByUserId = ctx.activeUserId?.toString() ?? null;
        runEntity.triggeredBy = options?.triggeredBy ??
            (ctx.activeUserId ? `manual:${ctx.activeUserId}` : 'manual');
        runEntity.channelId = runChannel.channelId;
        runEntity.channelToken = runChannel.channelToken;
        runEntity.queueRequestedAt = new Date();
        runEntity.queueDispatchedAt = null;
        clearPipelineRunGateState(runEntity);
        const run = await repo.save(runEntity);
        this.eventBus.publish(new PipelineQueueRequestEvent(
            ctx,
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
        return this.getRunOrThrow(ctx, run.id);
    }

    startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
    ): Promise<PipelineRun> {
        return this.createSeededRun(ctx, pipelineId, seed, options);
    }

    startIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.startPreparedIdempotentRun(
            ctx,
            pipelineId,
            seed,
            options,
            () => this.preparePipelineRun(
                ctx,
                pipelineId,
                options.skipPermissionCheck,
                options.expectedRevisionId,
            ),
        );
    }

    startPinnedIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        revisionId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.startPreparedIdempotentRun(
            ctx,
            pipelineId,
            seed,
            options,
            () => this.preparePipelineRun(
                ctx,
                pipelineId,
                options.skipPermissionCheck,
                undefined,
                revisionId,
            ),
        );
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
            expectedRevisionId?: ID;
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
                expectedRevisionId: opts.expectedRevisionId,
            });
        }
        return this.startRun(ctx, pipeline.id, {
            skipPermissionCheck: opts?.skipPermissionCheck,
            triggeredBy: opts?.triggeredBy,
            expectedRevisionId: opts?.expectedRevisionId,
        });
    }

    private async startPreparedIdempotentRun(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
        prepare: () => Promise<PreparedPipelineRun>,
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
        const prepared = await prepare();
        if (existing) {
            await this.releaseIdempotencyScope(ctx, existing);
        }

        try {
            const run = await this.createSeededRun(
                ctx,
                pipelineId,
                seed,
                options,
                scope,
                prepared,
            );
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

    private findIdempotentRun(
        ctx: RequestContext,
        pipelineId: ID,
        scope: PipelineRunIdempotencyScope,
    ): Promise<PipelineRun | null> {
        return this.connection.getRepository(ctx, PipelineRun).findOne({
            where: {
                pipelineId,
                channelId: scope.channelId,
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
        await this.connection.getRepository(ctx, PipelineRun).update(run.id, {
            idempotencyChannelId: null,
            idempotencyTriggerKeyHash: null,
            idempotencyKeyHash: null,
            idempotencyPayloadHash: null,
            idempotencyExpiresAt: null,
        });
    }

    private async createSeededRun(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
        idempotency?: PipelineRunIdempotencyScope,
        prepared?: PreparedPipelineRun,
    ): Promise<PipelineRun> {
        const runChannel = getPipelineRunChannel(ctx);
        const seededInput = createSeededGraphInput(options.triggerKey, seed, options.seedMode);
        const seedCheckpoint: JsonObject = {
            __seed: {
                triggerKey: seededInput.triggerKey,
                records: seededInput.records,
                mode: seededInput.mode,
            },
        };
        const { pipeline, revisionId, definition } = prepared ?? await this.preparePipelineRun(
            ctx,
            pipelineId,
            options.skipPermissionCheck,
            options.expectedRevisionId,
        );
        this.assertSeedTriggerRunnable(definition, options.triggerKey);
        const runEntity = new PipelineRun();
        runEntity.pipeline = pipeline;
        runEntity.revisionId = revisionId;
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
        runEntity.channelId = runChannel.channelId;
        runEntity.channelToken = runChannel.channelToken;
        runEntity.queueRequestedAt = new Date();
        runEntity.queueDispatchedAt = null;
        runEntity.idempotencyChannelId = idempotency?.channelId ?? null;
        runEntity.idempotencyTriggerKeyHash = idempotency?.triggerKeyHash ?? null;
        runEntity.idempotencyKeyHash = idempotency?.keyHash ?? null;
        runEntity.idempotencyPayloadHash = idempotency?.payloadHash ?? null;
        runEntity.idempotencyExpiresAt = idempotency?.expiresAt ?? null;
        clearPipelineRunGateState(runEntity);

        const run = await this.connection.getRepository(ctx, PipelineRun).save(runEntity);
        if (!options.deferQueueEnqueue) {
            this.eventBus.publish(new PipelineQueueRequestEvent(
                ctx,
                run.id,
                pipelineId,
                runEntity.triggeredBy,
                seedCheckpoint,
            ));
        }
        return this.getRunOrThrow(ctx, run.id);
    }

    private assertSeedTriggerRunnable(
        definition: PipelineDefinition,
        triggerKey: string,
    ): void {
        const trigger = definition.steps.find(step => step.key === triggerKey);
        if (
            !trigger
            || trigger.type !== StepType.TRIGGER
            || trigger.disabled === true
        ) {
            throw new Error(
                `Published revision has no enabled trigger step "${triggerKey}"`,
            );
        }
        if (!(definition.edges ?? []).some(edge => edge.from === triggerKey)) {
            throw new Error(
                `Published revision trigger "${triggerKey}" has no outgoing route`,
            );
        }
    }

    private async preparePipelineRun(
        ctx: RequestContext,
        pipelineId: ID,
        skipPermissionCheck = false,
        expectedRevisionId?: ID,
        pinnedRevisionId?: ID,
    ): Promise<PreparedPipelineRun> {
        let pipeline: Pipeline;
        try {
            pipeline = await this.getPipelineInActiveChannel(ctx, pipelineId);
        } catch (error) {
            if (pinnedRevisionId != null) {
                throw new PublishedPipelineRevisionUnavailableError(
                    `id:${String(pipelineId)}`,
                    pinnedRevisionId,
                );
            }
            throw error;
        }
        assertPipelineRunnable(pipeline);
        if (
            expectedRevisionId != null
            && String(pipeline.currentRevisionId) !== String(expectedRevisionId)
        ) {
            throw new PipelineRevisionMismatchError(
                expectedRevisionId,
                pipeline.currentRevisionId,
            );
        }
        const revisionId = pinnedRevisionId ?? pipeline.currentRevisionId!;
        const definition = await loadPublishedPipelineDefinition(
            this.connection,
            ctx,
            pipeline,
            revisionId,
        );
        if (!skipPermissionCheck) {
            await this.executionPermissions.assertAllowed(ctx, definition);
        }
        return { pipeline, revisionId, definition };
    }

    private getRunOrThrow(ctx: RequestContext, runId: ID): Promise<PipelineRun> {
        return assertFound(findPipelineRunInActiveChannel(
            this.connection,
            ctx,
            runId,
        ));
    }

    private findByCode(ctx: RequestContext, code: string): Promise<Pipeline | null> {
        return this.connection.getRepository(ctx, Pipeline).findOne({
            where: { code, channels: { id: ctx.channelId } },
        });
    }

    private getPipelineInActiveChannel(
        ctx: RequestContext,
        pipelineId: ID,
    ): Promise<Pipeline> {
        return this.connection.getEntityOrThrow(ctx, Pipeline, pipelineId, {
            channelId: ctx.channelId,
        });
    }
}
