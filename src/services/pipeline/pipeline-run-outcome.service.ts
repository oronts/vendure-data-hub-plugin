import {
    Injectable,
    Optional,
} from '@nestjs/common';
import { clearPipelineRunGateState } from '../../entities/pipeline';
import { RunStatus } from '../../constants/enums';
import {
    JsonObject,
    PipelineMetrics,
} from '../../types';
import { ExecutionLogger } from '../logger';
import { DomainEventsService } from '../events/domain-events.service';
import { HookService } from '../events/hook.service';
import {
    ensureError,
    getErrorMessage,
} from '../../utils/error.utils';
import { getPausedGateMetadata } from './pipeline-run-gate';
import { RemoteSourceAcknowledgementService } from './remote-source-acknowledgement.service';
import type {
    PipelineExecutionAttempt,
    PipelineExecutionContext,
} from './pipeline-runner-types';

@Injectable()
export class PipelineRunOutcomeService {
    constructor(
        private domainEvents: DomainEventsService,
        private hookService: HookService,
        private executionLogger: ExecutionLogger,
        @Optional()
        private remoteSourceAcknowledgements?: RemoteSourceAcknowledgementService,
    ) {}

    recoverRemoteSourceAcknowledgements(
        execution: PipelineExecutionContext,
    ): Promise<void> {
        return this.acknowledgeCompletedRemoteSources(execution);
    }

    async complete(
        execution: PipelineExecutionContext,
        metrics: PipelineMetrics,
    ): Promise<void> {
        const {
            ctx,
            run,
            runId,
            runRepo,
            runLogger,
            pipelineSpan,
        } = execution;

        run.status = RunStatus.COMPLETED;
        run.finishedAt = new Date();
        run.metrics = metrics;
        clearPipelineRunGateState(run);
        await runRepo.save(run, { reload: false });
        await this.acknowledgeCompletedRemoteSources(execution);

        this.domainEvents.publishRunCompleted(
            String(runId),
            run.pipeline.code,
            {
                processed: metrics.totalRecords ?? 0,
                succeeded: metrics.succeeded ?? 0,
                failed: metrics.failed ?? 0,
                skipped: metrics.skipped ?? 0,
                durationMs: metrics.durationMs ?? 0,
            },
        );

        await this.executionLogger.logPipelineComplete(ctx, run.pipeline.code, {
            pipelineId: run.pipeline.id,
            runId,
            durationMs: metrics.durationMs,
            recordsProcessed: metrics.totalRecords,
            recordsFailed: metrics.failed,
            metadata: metrics as JsonObject,
        });

        runLogger.logPipelineComplete(run.pipeline.code, {
            totalRecords: metrics.totalRecords ?? 0,
            succeeded: metrics.succeeded ?? 0,
            failed: metrics.failed ?? 0,
            durationMs: metrics.durationMs ?? 0,
        });

        pipelineSpan.setAttribute('records.total', metrics.totalRecords ?? 0);
        pipelineSpan.setAttribute('records.succeeded', metrics.succeeded ?? 0);
        pipelineSpan.setAttribute('records.failed', metrics.failed ?? 0);
        pipelineSpan.setAttribute('records.skipped', metrics.skipped ?? 0);
        pipelineSpan.end((metrics.failed ?? 0) > 0 ? 'error' : 'ok');
    }

    async pause(
        execution: PipelineExecutionContext,
        metrics: PipelineMetrics,
    ): Promise<void> {
        const {
            run,
            runRepo,
            runLogger,
            pipelineSpan,
        } = execution;
        const pausedAtStep = typeof metrics.pausedAtStep === 'string'
            ? metrics.pausedAtStep
            : 'unknown';
        const gate = run.definitionSnapshot
            ? getPausedGateMetadata(metrics, run.definitionSnapshot)
            : null;
        if (!gate) {
            throw new Error(
                `Pipeline reported a pause without an actionable GATE step: ${pausedAtStep}`,
            );
        }

        run.status = RunStatus.PAUSED;
        run.metrics = metrics;
        clearPipelineRunGateState(run);
        run.gateStepKey = gate.stepKey;
        run.gateTimeoutAt = gate.timeoutAt;
        await runRepo.save(run, { reload: false });

        runLogger.info('Pipeline paused at GATE step, awaiting approval', {
            pausedAtStep,
            totalRecords: metrics.totalRecords ?? 0,
            succeeded: metrics.succeeded ?? 0,
            failed: metrics.failed ?? 0,
            gateTimeoutAt: run.gateTimeoutAt?.toISOString(),
        });
        pipelineSpan.addEvent('pipeline.paused', { stepKey: pausedAtStep });
        pipelineSpan.end('ok');
    }

    async fail(
        execution: PipelineExecutionContext,
        failure: unknown,
        attempt: PipelineExecutionAttempt,
    ): Promise<void> {
        const durationMs = Date.now() - execution.startTime;
        const error = ensureError(failure);
        const willRetry = attempt.attempt < attempt.maxAttempts;

        if (willRetry) {
            await this.prepareForRetry(execution, error, attempt);
            return;
        }

        await this.persistTerminalFailure(execution, error, durationMs);
        execution.pipelineSpan.addEvent('error', {
            message: error.message,
            stack: error.stack,
        });
        execution.pipelineSpan.end('error');
    }

    private async prepareForRetry(
        execution: PipelineExecutionContext,
        error: Error,
        attempt: PipelineExecutionAttempt,
    ): Promise<void> {
        const {
            run,
            runRepo,
            runLogger,
            pipelineSpan,
        } = execution;

        run.status = RunStatus.PENDING;
        run.finishedAt = null;
        run.error = error.message;
        clearPipelineRunGateState(run);
        await runRepo.save(run, { reload: false });

        runLogger.warn('Pipeline execution attempt failed; queued job will retry', {
            attempt: attempt.attempt,
            maxAttempts: attempt.maxAttempts,
            error: error.message,
        });
        pipelineSpan.addEvent('attempt.failed', {
            attempt: attempt.attempt,
            maxAttempts: attempt.maxAttempts,
            message: error.message,
        });
        pipelineSpan.end('error');
    }

    private async persistTerminalFailure(
        execution: PipelineExecutionContext,
        error: Error,
        durationMs: number,
    ): Promise<void> {
        const {
            ctx,
            run,
            runId,
            runRepo,
            runLogger,
        } = execution;

        run.status = RunStatus.FAILED;
        run.finishedAt = new Date();
        run.error = error.message;
        run.metrics = {
            ...(run.metrics ?? {}),
            durationMs,
        };
        clearPipelineRunGateState(run);
        await runRepo.save(run, { reload: false });

        this.domainEvents.publishRunFailed(
            String(runId),
            run.pipeline.code,
            error.message,
        );
        await this.executionLogger.logPipelineFailed(ctx, run.pipeline.code, error, {
            pipelineId: run.pipeline.id,
            runId,
            durationMs,
        });
        runLogger.logPipelineFailed(run.pipeline.code, error, durationMs);

        try {
            const definition = run.definitionSnapshot;
            if (definition) {
                await this.hookService.run(
                    ctx,
                    definition,
                    'PIPELINE_FAILED',
                    {
                        error: error.message,
                        runId: String(runId),
                        durationMs,
                    } as unknown as JsonObject,
                );
            }
        } catch (hookError) {
            runLogger.warn('PIPELINE_FAILED hook failed', {
                error: getErrorMessage(hookError),
            });
        }
    }

    private async acknowledgeCompletedRemoteSources(
        execution: PipelineExecutionContext,
    ): Promise<void> {
        if (!this.remoteSourceAcknowledgements) return;
        try {
            const result = await this.remoteSourceAcknowledgements
                .acknowledgeCompletedForPipeline(
                    execution.ctx,
                    execution.run.pipeline.id,
                );
            if (result.acknowledged > 0 || result.failed > 0) {
                execution.runLogger.info('Remote source acknowledgements processed', {
                    acknowledged: result.acknowledged,
                    failed: result.failed,
                    pending: result.pending,
                });
            }
        } catch (error) {
            execution.runLogger.warn('Remote source acknowledgement recovery failed', {
                error: getErrorMessage(error),
            });
        }
    }
}
