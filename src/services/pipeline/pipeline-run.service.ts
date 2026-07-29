import { Injectable } from '@nestjs/common';
import {
    assertFound,
    ID,
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    clearPipelineRunGateState,
    PipelineRun,
} from '../../entities/pipeline';
import { RunStatus } from '../../types';
import type { SeededInputMode } from '../../runtime/orchestration';
import { LOGGER_CONTEXTS } from '../../constants';
import { DomainEventsService } from '../events/domain-events.service';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import { getActivePipelineRunChannelId } from './pipeline-run-channel';
import { findPipelineRunInActiveChannel } from './pipeline-run-lookup';
import { PipelineRunCreationService } from './pipeline-run-creation.service';
import { PipelineRunGateService } from './pipeline-run-gate.service';
import type {
    IdempotentSeededRunOptions,
    IdempotentSeededRunResult,
    SeededRunOptions,
} from './pipeline-run-types';

export type {
    IdempotentSeededRunOptions,
    IdempotentSeededRunResult,
    SeededRunOptions,
} from './pipeline-run-types';

@Injectable()
export class PipelineRunService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private domainEvents: DomainEventsService,
        private creation: PipelineRunCreationService,
        private gates: PipelineRunGateService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async listRuns(
        ctx: RequestContext,
        options?: ListQueryOptions<PipelineRun>,
        pipelineId?: ID,
    ): Promise<PaginatedList<PipelineRun>> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const qb = this.listQueryBuilder.build(PipelineRun, options, { ctx });
        qb.leftJoinAndSelect(`${qb.alias}.pipeline`, 'pipeline');
        qb.andWhere(`${qb.alias}.channelId = :channelId`, { channelId });
        if (pipelineId) {
            qb.andWhere(`${qb.alias}.pipelineId = :pid`, { pid: pipelineId });
        }
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    runById(ctx: RequestContext, id: ID): Promise<PipelineRun | null> {
        return findPipelineRunInActiveChannel(this.connection, ctx, id);
    }

    startRun(
        ctx: RequestContext,
        pipelineId: ID,
        options?: {
            skipPermissionCheck?: boolean;
            triggeredBy?: string;
            expectedRevisionId?: ID;
        },
    ): Promise<PipelineRun> {
        return this.creation.startRun(ctx, pipelineId, options);
    }

    async cancelRun(ctx: RequestContext, id: ID): Promise<PipelineRun> {
        const repo = this.connection.getRepository(ctx, PipelineRun);
        const run = await assertFound(this.runById(ctx, id));
        if (run.status === RunStatus.RUNNING) {
            run.status = RunStatus.CANCEL_REQUESTED;
            await repo.save(run, { reload: false });
        } else if (run.status === RunStatus.PAUSED) {
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            run.error = 'Cancelled by user while paused at gate';
            clearPipelineRunGateState(run);
            await repo.save(run, { reload: false });
            this.publishCancellation(ctx, run, id);
            this.logger.info('Pipeline run cancellation requested', { runId: id });
        } else if (run.status === RunStatus.PENDING) {
            run.status = RunStatus.CANCELLED;
            run.finishedAt = new Date();
            run.queueRequestedAt = null;
            run.queueDispatchedAt = null;
            clearPipelineRunGateState(run);
            await repo.save(run, { reload: false });
            this.publishCancellation(ctx, run, id);
            this.logger.info('Pipeline run cancelled', { runId: id });
        }
        return assertFound(this.runById(ctx, run.id));
    }

    startRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: SeededRunOptions,
    ): Promise<PipelineRun> {
        return this.creation.startRunWithSeed(ctx, pipelineId, seed, options);
    }

    startIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.creation.startIdempotentRunWithSeed(
            ctx,
            pipelineId,
            seed,
            options,
        );
    }

    startPinnedIdempotentRunWithSeed(
        ctx: RequestContext,
        pipelineId: ID,
        revisionId: ID,
        seed: unknown[],
        options: IdempotentSeededRunOptions,
    ): Promise<IdempotentSeededRunResult> {
        return this.creation.startPinnedIdempotentRunWithSeed(
            ctx,
            pipelineId,
            revisionId,
            seed,
            options,
        );
    }

    startRunByCode(
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
        return this.creation.startRunByCode(ctx, code, opts);
    }

    approveGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        return this.gates.approveGate(ctx, runId, stepKey);
    }

    rejectGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        return this.gates.rejectGate(ctx, runId, stepKey);
    }

    private publishCancellation(
        ctx: RequestContext,
        run: PipelineRun,
        runId: ID,
    ): void {
        this.domainEvents.publishRunCancelled(
            run.pipelineId?.toString(),
            String(runId),
            ctx.activeUserId?.toString(),
        );
    }
}
