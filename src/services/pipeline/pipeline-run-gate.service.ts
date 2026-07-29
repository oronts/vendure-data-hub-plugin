import { Injectable } from '@nestjs/common';
import {
    assertFound,
    EventBus,
    ID,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    CLEARED_PIPELINE_RUN_GATE_STATE,
    PipelineRun,
} from '../../entities/pipeline';
import {
    JsonObject,
    RunStatus,
} from '../../types';
import { StepType } from '../../constants/enums';
import {
    getGateCheckpointKeys,
    type GateCheckpointKeys,
} from '../../runtime/gate-checkpoint';
import { LOGGER_CONTEXTS } from '../../constants';
import { PipelineQueueRequestEvent } from '../events/pipeline-events';
import { CheckpointService } from '../data/checkpoint.service';
import { DomainEventsService } from '../events/domain-events.service';
import {
    DataHubLogger,
    DataHubLoggerFactory,
} from '../logger';
import { getActivePipelineRunChannelId } from './pipeline-run-channel';
import { findPipelineRunInActiveChannel } from './pipeline-run-lookup';

@Injectable()
export class PipelineRunGateService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private eventBus: EventBus,
        private checkpointService: CheckpointService,
        private domainEvents: DomainEventsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    async approveGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const gateState = await this.connection.withTransaction(
            ctx,
            async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PipelineRun);
                const state = await this.getPausedGateState(
                    transactionCtx,
                    runId,
                    stepKey,
                );
                const updateResult = await repo.update(
                    {
                        id: runId,
                        channelId,
                        status: RunStatus.PAUSED,
                        gateStepKey: stepKey,
                    },
                    {
                        status: RunStatus.RUNNING,
                        queueRequestedAt: new Date(),
                        queueDispatchedAt: null,
                        ...CLEARED_PIPELINE_RUN_GATE_STATE,
                    },
                );
                if (updateResult.affected === 0) {
                    const existing = await repo.findOne({
                        where: { id: runId, channelId },
                    });
                    if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
                    throw new Error(
                        `Cannot approve gate: run is not paused (current status: ${existing.status})`,
                    );
                }
                await this.checkpointService.updateForPipeline(
                    transactionCtx,
                    state.pipelineId,
                    current => {
                        if (!(state.keys.pending in current)) {
                            throw new Error(
                                `Cannot approve gate "${stepKey}": pending gate state was removed concurrently`,
                            );
                        }
                        return {
                            ...current,
                            [state.keys.approved]: true,
                        };
                    },
                );
                return state;
            },
        );

        this.domainEvents.publishGateApproved(
            gateState.pipelineId.toString(),
            String(runId),
            stepKey,
            ctx.activeUserId?.toString(),
        );

        this.logger.info('Gate approved, resuming pipeline run', {
            runId,
            stepKey,
            pipelineId: gateState.pipelineId,
            userId: ctx.activeUserId,
        });

        this.eventBus.publish(new PipelineQueueRequestEvent(
            ctx,
            runId,
            gateState.pipelineId,
            ctx.activeUserId ? `gate-approve:${ctx.activeUserId}` : 'gate-approve',
        ));

        return this.getRunOrThrow(ctx, gateState.run.id);
    }

    async rejectGate(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<PipelineRun> {
        const channelId = getActivePipelineRunChannelId(ctx);
        const gateState = await this.connection.withTransaction(
            ctx,
            async transactionCtx => {
                const repo = this.connection.getRepository(transactionCtx, PipelineRun);
                const state = await this.getPausedGateState(
                    transactionCtx,
                    runId,
                    stepKey,
                );
                const updateResult = await repo.update(
                    {
                        id: runId,
                        channelId,
                        status: RunStatus.PAUSED,
                        gateStepKey: stepKey,
                    },
                    {
                        status: RunStatus.CANCELLED,
                        finishedAt: new Date(),
                        error: `Gate step "${stepKey}" rejected by user`,
                        ...CLEARED_PIPELINE_RUN_GATE_STATE,
                    },
                );
                if (updateResult.affected === 0) {
                    const existing = await repo.findOne({
                        where: { id: runId, channelId },
                    });
                    if (!existing) throw new Error(`Pipeline run not found: ${runId}`);
                    throw new Error(
                        `Cannot reject gate: run is not paused (current status: ${existing.status})`,
                    );
                }

                await this.checkpointService.updateForPipeline(
                    transactionCtx,
                    state.pipelineId,
                    current => {
                        if (!(state.keys.pending in current)) {
                            throw new Error(
                                `Cannot reject gate "${stepKey}": pending gate state was removed concurrently`,
                            );
                        }
                        const next: JsonObject = { ...current };
                        delete next[state.keys.pending];
                        delete next[state.keys.approved];
                        return next;
                    },
                );
                return state;
            },
        );

        this.domainEvents.publishGateRejected(
            gateState.pipelineId.toString(),
            String(runId),
            stepKey,
            `Rejected by user ${ctx.activeUserId ?? 'unknown'}`,
        );
        this.logger.info('Gate rejected, cancelling pipeline run', {
            runId,
            stepKey,
            userId: ctx.activeUserId,
        });
        return this.getRunOrThrow(ctx, gateState.run.id);
    }

    private async getPausedGateState(
        ctx: RequestContext,
        runId: ID,
        stepKey: string,
    ): Promise<{
        run: PipelineRun;
        pipelineId: ID;
        keys: GateCheckpointKeys;
    }> {
        const run = await findPipelineRunInActiveChannel(
            this.connection,
            ctx,
            runId,
        );
        if (!run) {
            throw new Error(`Pipeline run not found: ${runId}`);
        }
        if (run.status !== RunStatus.PAUSED) {
            throw new Error(
                `Cannot act on gate: run is not paused (current status: ${run.status})`,
            );
        }
        if (run.gateStepKey !== stepKey) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run is paused at "${run.gateStepKey ?? 'unknown'}"`,
            );
        }
        const definition = run.definitionSnapshot;
        if (!definition) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run has no immutable definition snapshot`,
            );
        }
        const step = definition.steps.find(candidate => candidate.key === stepKey);
        if (step?.type !== StepType.GATE) {
            throw new Error(
                `Cannot act on gate "${stepKey}": run snapshot does not contain that gate`,
            );
        }
        const pipelineId = run.pipelineId ?? run.pipeline?.id;
        if (pipelineId == null) {
            throw new Error(`Pipeline run ${runId} has no pipeline`);
        }
        const checkpoint = await this.checkpointService.getByPipeline(
            ctx,
            pipelineId,
        );
        const checkpointData: JsonObject = { ...(checkpoint?.data ?? {}) };
        const keys = getGateCheckpointKeys(runId, stepKey);
        if (!(keys.pending in checkpointData)) {
            throw new Error(
                `Cannot act on gate "${stepKey}": pending gate state was not found for run ${runId}`,
            );
        }
        return {
            run,
            pipelineId,
            keys,
        };
    }

    private getRunOrThrow(ctx: RequestContext, runId: ID): Promise<PipelineRun> {
        return assertFound(findPipelineRunInActiveChannel(
            this.connection,
            ctx,
            runId,
        ));
    }
}
