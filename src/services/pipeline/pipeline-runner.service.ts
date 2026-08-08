import { Injectable, Optional } from '@nestjs/common';
import {
    ConfigService,
    ID,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    UserService,
} from '@vendure/core';
import { Repository } from 'typeorm';
import {
    clearPipelineRunGateState,
    PipelineRun,
} from '../../entities/pipeline';
import { RunStatus } from '../../constants/enums';
import { PipelineMetrics } from '../../types';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { DataHubLogger, DataHubLoggerFactory, ExecutionLogger } from '../logger';
import { DISTRIBUTED_LOCK, LOGGER_CONTEXTS } from '../../constants';
import { DomainEventsService } from '../events/domain-events.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { ensureError, getErrorMessage } from '../../utils/error.utils';
import { createPipelineRunContext } from './pipeline-run-channel';
import { PipelineExecutionProcessorService } from './pipeline-execution-processor.service';
import { PipelineRunOutcomeService } from './pipeline-run-outcome.service';
import type {
    PipelineExecutionAttempt,
    PipelineExecutionContext as ExecutionContext,
} from './pipeline-runner-types';

export type { PipelineExecutionAttempt } from './pipeline-runner-types';

type PrepareResult =
    | { proceed: false }
    | { proceed: true; executionContext: ExecutionContext };

type LoadRunResult =
    | { valid: false }
    | { valid: true; run: PipelineRun; runLogger: DataHubLogger };

type LockResult =
    | { acquired: false }
    | { acquired: true; lockToken?: string };


@Injectable()
export class PipelineRunnerService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private userService: UserService,
        private configService: ConfigService,
        private definitionValidator: DefinitionValidationService,
        private domainEvents: DomainEventsService,
        private loggerFactory: DataHubLoggerFactory,
        private executionLogger: ExecutionLogger,
        private processor: PipelineExecutionProcessorService,
        private outcomes: PipelineRunOutcomeService,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_RUNNER);
    }

    /**
     * Runs pipeline execution phases: setup, steps, and completion.
     */
    async execute(runId: ID, executionAttempt: PipelineExecutionAttempt): Promise<void> {
        const prepareResult = await this.prepareExecution(runId, executionAttempt);
        if (!prepareResult.proceed) {
            return;
        }

        const execCtx = prepareResult.executionContext;

        try {
            await this.outcomes.recoverRemoteSourceAcknowledgements(execCtx);
            const metrics = await this.executeSteps(execCtx);
            this.assertExecutionLockHeld(execCtx);

            // Check if run was cancelled during execution
            const currentRun = await execCtx.runRepo.findOne({ where: { id: execCtx.runId }, select: ['id', 'status'] });
            if (currentRun?.status === RunStatus.CANCELLED) {
                // Persist partial metrics for observability
                const cancelledRun = await execCtx.runRepo.findOne({ where: { id: execCtx.runId } });
                if (cancelledRun) {
                    cancelledRun.metrics = metrics;
                    await execCtx.runRepo.save(cancelledRun, { reload: false });
                }
                execCtx.runLogger.info('Pipeline was cancelled during execution, skipping completion');
                execCtx.pipelineSpan.end('ok');
            } else if (metrics.paused) {
                await this.outcomes.pause(execCtx, metrics);
            } else {
                await this.outcomes.complete(execCtx, metrics);
            }
        } catch (error) {
            try {
                await this.outcomes.fail(execCtx, error, executionAttempt);
            } catch (failureError) {
                execCtx.runLogger.error(
                    `Failed to persist pipeline attempt state; run may remain RUNNING: ${getErrorMessage(failureError)}`,
                    ensureError(failureError),
                );
            }
            throw error;
        } finally {
            await this.releaseLock(execCtx);
        }
    }

    /**
     * Prepares execution context: loads run, validates status, acquires lock, and initializes logging.
     * Returns { proceed: false } if execution should be skipped.
     */
    private async prepareExecution(
        runId: ID,
        executionAttempt: PipelineExecutionAttempt,
    ): Promise<PrepareResult> {
        const lookupCtx = await this.createCtx();
        const lookupRepo = this.connection.getRepository(lookupCtx, PipelineRun);

        const loadResult = await this.loadAndValidateRun(runId, lookupRepo);
        if (!loadResult.valid) {
            return { proceed: false };
        }
        const { run, runLogger } = loadResult;
        const ctx = await this.restoreRunContext(
            lookupCtx,
            run,
            lookupRepo,
            runLogger,
            executionAttempt,
        );
        if (!ctx) {
            return { proceed: false };
        }
        const runRepo = this.connection.getRepository(ctx, PipelineRun);

        // Detect gate resume: run is already RUNNING (set by approveGate)
        const isGateResume = run.status === RunStatus.RUNNING;

        if (!isGateResume && run.pipeline?.id) {
            const activeCount = await runRepo.count({
                where: [
                    { pipeline: { id: run.pipeline.id }, status: RunStatus.RUNNING },
                    { pipeline: { id: run.pipeline.id }, status: RunStatus.PAUSED },
                ],
            });
            if (activeCount > 0) {
                runLogger.warn('Pipeline has an active run, failing new run');
                run.status = RunStatus.FAILED;
                run.finishedAt = new Date();
                run.error = 'Cannot start: another run of this pipeline is already active';
                clearPipelineRunGateState(run);
                await runRepo.save(run, { reload: false });
                return { proceed: false };
            }
        }

        const lockKey = `pipeline-exec:${run.pipeline?.id ?? runId}`;
        const lockResult = await this.acquireExecutionLock(lockKey, runLogger);
        if (!lockResult.acquired) {
            return { proceed: false };
        }

        const execCtx = await this.initializeExecutionContext(
            ctx, run, runId, runRepo, runLogger, lockKey, lockResult.lockToken,
        );
        execCtx.isGateResume = isGateResume;

        // Start lock renewal timer to prevent lock expiry during long-running pipelines
        if (this.distributedLock && execCtx.lockToken) {
            this.startLockRefresh(execCtx);
        }

        return { proceed: true, executionContext: execCtx };
    }

    private async restoreRunContext(
        lookupCtx: RequestContext,
        run: PipelineRun,
        lookupRepo: Repository<PipelineRun>,
        runLogger: DataHubLogger,
        executionAttempt: PipelineExecutionAttempt,
    ): Promise<RequestContext | null> {
        try {
            return await createPipelineRunContext(
                this.requestContextService,
                this.userService,
                this.configService,
                lookupCtx,
                run,
            );
        } catch (error) {
            const cause = ensureError(error);
            const message = `Cannot restore pipeline execution channel: ${cause.message}`;
            const willRetry = executionAttempt.attempt < executionAttempt.maxAttempts;

            if (willRetry) {
                runLogger.warn(message, {
                    attempt: executionAttempt.attempt,
                    maxAttempts: executionAttempt.maxAttempts,
                    channelId: run.channelId ?? undefined,
                });
                throw cause;
            }

            run.status = RunStatus.FAILED;
            run.finishedAt = new Date();
            run.error = message;
            clearPipelineRunGateState(run);
            await lookupRepo.save(run, { reload: false });
            runLogger.error(message, cause, {
                channelId: run.channelId ?? undefined,
            });
            this.domainEvents.publishRunFailed(
                String(run.id),
                run.pipeline.code,
                message,
            );
            return null;
        }
    }

    /**
     * Loads a run by ID and validates it exists and is in PENDING status.
     */
    private async loadAndValidateRun(runId: ID, runRepo: Repository<PipelineRun>): Promise<LoadRunResult> {
        const run = await runRepo.findOne({ where: { id: runId }, relations: { pipeline: true } });
        if (!run) {
            this.logger.warn('Run not found', { runId: String(runId) });
            return { valid: false };
        }
        if (!run.pipeline) {
            this.logger.warn('Orphaned run: pipeline no longer exists', { runId: String(runId) });
            return { valid: false };
        }

        const runLogger = this.logger.withContext({
            runId,
            pipelineId: run.pipeline.id,
            pipelineCode: run.pipeline.code,
            userId: run.startedByUserId ?? undefined,
        });

        // Accept PENDING (normal start) or RUNNING (gate resume) status
        if (run.status !== RunStatus.PENDING && run.status !== RunStatus.RUNNING) {
            runLogger.debug('Skipping run - not in PENDING or RUNNING status', { currentStatus: run.status });
            return { valid: false };
        }
        if (run.revisionId == null || run.definitionSnapshot == null) {
            const message = 'Pipeline run is missing its immutable published revision snapshot';
            run.status = RunStatus.FAILED;
            run.finishedAt = new Date();
            run.error = message;
            clearPipelineRunGateState(run);
            await runRepo.save(run, { reload: false });
            runLogger.error(message);
            this.domainEvents.publishRunFailed(
                String(run.id),
                run.pipeline.code,
                message,
            );
            return { valid: false };
        }

        return { valid: true, run, runLogger };
    }

    /**
     * Acquires a distributed lock to prevent duplicate execution in horizontal scaling.
     */
    private async acquireExecutionLock(lockKey: string, runLogger: DataHubLogger): Promise<LockResult> {
        if (!this.distributedLock) {
            return { acquired: true, lockToken: undefined };
        }

        const lockResult = await this.distributedLock.acquire(lockKey, {
            ttlMs: DISTRIBUTED_LOCK.PIPELINE_LOCK_TTL_MS,
            waitForLock: false, // Don't wait - another worker is handling it
        });

        if (!lockResult.acquired) {
            runLogger.debug('Run already being processed by another worker', {
                currentOwner: lockResult.currentOwner,
            });
            return { acquired: false };
        }

        runLogger.debug('Acquired distributed lock for run', { lockKey });
        return { acquired: true, lockToken: lockResult.token };
    }

    /** Starts periodic renewal and marks the execution unsafe on the first failed renewal. */
    private startLockRefresh(execCtx: ExecutionContext): void {
        if (!this.distributedLock || !execCtx.lockToken) return;

        const timer = setInterval(() => {
            void this.refreshExecutionLock(execCtx);
        }, DISTRIBUTED_LOCK.PIPELINE_LOCK_REFRESH_MS);

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        execCtx.lockRefreshTimer = timer;
    }

    private async refreshExecutionLock(execCtx: ExecutionContext): Promise<void> {
        if (!execCtx.lockToken || !this.distributedLock || execCtx.lockLossError) return;

        try {
            const extended = await this.distributedLock.extend(
                execCtx.lockKey,
                execCtx.lockToken,
                DISTRIBUTED_LOCK.PIPELINE_LOCK_TTL_MS,
            );
            if (!extended) {
                this.markExecutionLockLost(
                    execCtx,
                    new Error('Pipeline execution lock was lost'),
                );
            }
        } catch (error) {
            this.markExecutionLockLost(
                execCtx,
                new Error(`Pipeline execution lock refresh failed: ${getErrorMessage(error)}`),
            );
        }
    }

    private markExecutionLockLost(execCtx: ExecutionContext, error: Error): void {
        if (execCtx.lockLossError) return;

        execCtx.lockLossError = error;
        if (execCtx.lockRefreshTimer) {
            clearInterval(execCtx.lockRefreshTimer);
            execCtx.lockRefreshTimer = undefined;
        }
        execCtx.runLogger.error(error.message, error, {
            lockKey: execCtx.lockKey,
        });
    }

    private assertExecutionLockHeld(execCtx: ExecutionContext): void {
        if (execCtx.lockLossError) {
            throw execCtx.lockLossError;
        }
    }

    /**
     * Initializes execution context: starts span, updates run status, and persists start log.
     */
    private async initializeExecutionContext(
        ctx: RequestContext,
        run: PipelineRun,
        runId: ID,
        runRepo: Repository<PipelineRun>,
        runLogger: DataHubLogger,
        lockKey: string,
        lockToken: string | undefined,
    ): Promise<ExecutionContext> {
        // Detect gate resume: run is already RUNNING (set by approveGate)
        const isGateResume = run.status === RunStatus.RUNNING;

        const pipelineSpan = runLogger.logPipelineStart(run.pipeline.code, run.pipeline.id);
        const startTime = Date.now();

        run.queueRequestedAt = null;
        run.queueDispatchedAt = null;
        if (!isGateResume) {
            run.status = RunStatus.RUNNING;
            run.startedAt = new Date();
        }
        await runRepo.save(run, { reload: false });

        if (isGateResume) {
            // Gate resume: status is already RUNNING, preserve original startedAt
            runLogger.info('Resuming pipeline after gate approval', { runId: String(runId) });
        } else {
            this.domainEvents.publishRunStarted(
                String(runId),
                run.pipeline.code,
                String(run.pipeline.id),
            );

            await this.executionLogger.logPipelineStart(ctx, run.pipeline.code, {
                pipelineId: run.pipeline.id,
                runId,
            });
        }

        return { ctx, run, runId, runRepo, runLogger, pipelineSpan, startTime, lockKey, lockToken };
    }

    /**
     * Executes pipeline steps: validates definition and runs the pipeline processing.
     * Returns metrics from the pipeline execution.
     */
    private async executeSteps(execCtx: ExecutionContext): Promise<PipelineMetrics> {
        const { ctx, run, runId, runLogger, pipelineSpan } = execCtx;

        const definition = run.definitionSnapshot;
        if (!definition) {
            throw new Error('Pipeline run has no definition snapshot');
        }

        pipelineSpan.addEvent('definition.validate.start');
        this.definitionValidator.validate(definition, {
            requireAdapterBindings: true,
        });
        pipelineSpan.addEvent('definition.validate.complete');

        pipelineSpan.addEvent('processing.start', {
            stepCount: definition.steps?.length ?? 0,
        });

        return this.processor.execute(
            ctx,
            runId,
            definition,
            run.pipeline.id,
            runLogger,
            () => this.assertExecutionLockHeld(execCtx),
            execCtx.isGateResume,
            run.pipeline.code,
        );
    }

    /**
     * Updates run status to completed, persists logs, and ends the span.
     */
    private async releaseLock(execCtx: ExecutionContext): Promise<void> {
        const { runLogger, lockKey, lockToken } = execCtx;

        // Stop the lock refresh timer first
        if (execCtx.lockRefreshTimer) {
            clearInterval(execCtx.lockRefreshTimer);
            execCtx.lockRefreshTimer = undefined;
        }

        if (this.distributedLock && lockToken) {
            try {
                await this.distributedLock.release(lockKey, lockToken);
                runLogger.debug('Released distributed lock for run', { lockKey });
            } catch (lockError) {
                runLogger.warn('Failed to release distributed lock', {
                    lockKey,
                    error: getErrorMessage(lockError),
                });
            }
        }
    }

    private async createCtx(): Promise<RequestContext> {
        return this.requestContextService.create({ apiType: 'admin' });
    }

}
