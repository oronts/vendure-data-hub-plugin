import { Injectable, Optional } from '@nestjs/common';
import { ID, RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { Repository } from 'typeorm';
import { PipelineRun } from '../../entities/pipeline';
import { RunStatus, HookStage } from '../../constants/enums';
import { JsonObject, PipelineDefinition, PipelineMetrics } from '../../types/index';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { readSeededGraphCheckpoint, SeededGraphInput } from '../../runtime/orchestration';
import { RecordErrorService } from '../data/record-error.service';
import { DataHubLogger, DataHubLoggerFactory, ExecutionLogger, SpanContext } from '../logger';
import { LOGGER_CONTEXTS, DISTRIBUTED_LOCK, calculateThroughput } from '../../constants/index';
import { DomainEventsService } from '../events/domain-events.service';
import { HookService } from '../events/hook.service';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { getErrorMessage, ensureError } from '../../utils/error.utils';
import { createPipelineRunContext } from './pipeline-run-channel';

/** Context for pipeline execution passed between helper methods */
interface ExecutionContext {
    ctx: RequestContext;
    run: PipelineRun;
    runId: ID;
    runRepo: Repository<PipelineRun>;
    runLogger: DataHubLogger;
    pipelineSpan: SpanContext;
    startTime: number;
    lockKey: string;
    lockToken?: string;
    lockRefreshTimer?: NodeJS.Timeout;
    lockLossError?: Error;
    isGateResume?: boolean;
}

/** Result from prepareExecution indicating whether execution should proceed */
type PrepareResult =
    | { proceed: false }
    | { proceed: true; executionContext: ExecutionContext };

/** Result from loading and validating a run */
type LoadRunResult =
    | { valid: false }
    | { valid: true; run: PipelineRun; runLogger: DataHubLogger };

/** Result from acquiring execution lock */
type LockResult =
    | { acquired: false }
    | { acquired: true; lockToken?: string };

/** Context for processing execution */
interface ProcessingContext {
    ctx: RequestContext;
    runId: ID;
    pipelineId: ID | undefined;
    pipelineCode?: string;
    runLogger: DataHubLogger;
    runRepo: Repository<PipelineRun>;
    start: number;
    seed?: SeededGraphInput;
    assertLeaseHeld?: () => void;
}

/** Callbacks for pipeline execution */
interface ProcessingCallbacks {
    onCancelRequested: () => Promise<boolean>;
    onRecordError: (stepKey: string, message: string, payload: Record<string, unknown>, stackTrace?: string) => Promise<void>;
}

export interface PipelineExecutionAttempt {
    attempt: number;
    maxAttempts: number;
}

@Injectable()
export class PipelineRunnerService {
    private readonly logger: DataHubLogger;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private definitionValidator: DefinitionValidationService,
        private adapterRuntime: AdapterRuntimeService,
        private recordErrorService: RecordErrorService,
        private domainEvents: DomainEventsService,
        private hookService: HookService,
        private loggerFactory: DataHubLoggerFactory,
        private executionLogger: ExecutionLogger,
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
                await this.handlePaused(execCtx, metrics);
            } else {
                await this.handleCompletion(execCtx, metrics);
            }
        } catch (error) {
            try {
                await this.handleFailure(execCtx, error, executionAttempt);
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
        run: PipelineRun,
        lookupRepo: Repository<PipelineRun>,
        runLogger: DataHubLogger,
        executionAttempt: PipelineExecutionAttempt,
    ): Promise<RequestContext | null> {
        try {
            return await createPipelineRunContext(this.requestContextService, run);
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

        const timer = setInterval(async () => {
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
        }, DISTRIBUTED_LOCK.PIPELINE_LOCK_REFRESH_MS);

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        execCtx.lockRefreshTimer = timer;
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
        this.definitionValidator.validate(definition);
        pipelineSpan.addEvent('definition.validate.complete');

        pipelineSpan.addEvent('processing.start', {
            stepCount: definition.steps?.length ?? 0,
        });

        return this.executeProcessing(
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
    private async handleCompletion(execCtx: ExecutionContext, metrics: PipelineMetrics): Promise<void> {
        const { ctx, run, runId, runRepo, runLogger, pipelineSpan } = execCtx;

        run.status = RunStatus.COMPLETED;
        run.finishedAt = new Date();
        run.metrics = metrics;
        await runRepo.save(run, { reload: false });

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

    /**
     * Updates run status to PAUSED when a GATE step requests human approval.
     * The pipeline will resume when approveGate() is called.
     */
    private async handlePaused(execCtx: ExecutionContext, metrics: PipelineMetrics): Promise<void> {
        const { run, runRepo, runLogger, pipelineSpan } = execCtx;

        const pausedAtStep = typeof metrics.pausedAtStep === 'string' ? metrics.pausedAtStep : 'unknown';

        run.status = RunStatus.PAUSED;
        run.metrics = metrics;
        await runRepo.save(run, { reload: false });

        runLogger.info('Pipeline paused at GATE step, awaiting approval', {
            pausedAtStep,
            totalRecords: metrics.totalRecords ?? 0,
            succeeded: metrics.succeeded ?? 0,
            failed: metrics.failed ?? 0,
        });

        pipelineSpan.addEvent('pipeline.paused', { stepKey: pausedAtStep });
        pipelineSpan.end('ok');
    }

    /**
     * Updates run status to failed, persists error logs, and ends the span.
     */
    private async handleFailure(
        execCtx: ExecutionContext,
        failure: unknown,
        executionAttempt: PipelineExecutionAttempt,
    ): Promise<void> {
        const { pipelineSpan, startTime } = execCtx;

        const durationMs = Date.now() - startTime;
        const error = ensureError(failure);
        const willRetry = executionAttempt.attempt < executionAttempt.maxAttempts;

        if (willRetry) {
            await this.prepareRunForRetry(execCtx, error, executionAttempt);
            return;
        }

        await this.persistTerminalFailure(execCtx, error, durationMs);

        // End span with error status
        pipelineSpan.addEvent('error', {
            message: error.message,
            stack: error.stack,
        });
        pipelineSpan.end('error');
    }

    private async prepareRunForRetry(
        execCtx: ExecutionContext,
        error: Error,
        executionAttempt: PipelineExecutionAttempt,
    ): Promise<void> {
        const { run, runRepo, runLogger, pipelineSpan } = execCtx;

        run.status = RunStatus.PENDING;
        run.finishedAt = null;
        run.error = error.message;
        await runRepo.save(run, { reload: false });

        runLogger.warn('Pipeline execution attempt failed; queued job will retry', {
            attempt: executionAttempt.attempt,
            maxAttempts: executionAttempt.maxAttempts,
            error: error.message,
        });
        pipelineSpan.addEvent('attempt.failed', {
            attempt: executionAttempt.attempt,
            maxAttempts: executionAttempt.maxAttempts,
            message: error.message,
        });
        pipelineSpan.end('error');
    }

    private async persistTerminalFailure(
        execCtx: ExecutionContext,
        error: Error,
        durationMs: number,
    ): Promise<void> {
        const { ctx, run, runId, runRepo, runLogger } = execCtx;

        run.status = RunStatus.FAILED;
        run.finishedAt = new Date();
        run.error = error.message;
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
                    { error: error.message, runId: String(runId), durationMs } as unknown as JsonObject,
                );
            }
        } catch (hookError) {
            runLogger.warn('PIPELINE_FAILED hook failed', {
                error: getErrorMessage(hookError),
            });
        }
    }

    /**
     * Releases the distributed lock if one was acquired, and clears the refresh timer.
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

    private async executeProcessing(
        ctx: RequestContext,
        runId: ID,
        definition: PipelineDefinition,
        pipelineId: ID | undefined,
        runLogger: DataHubLogger,
        assertLeaseHeld: () => void,
        isGateResume?: boolean,
        pipelineCode?: string,
    ): Promise<PipelineMetrics> {
        const procCtx = await this.loadPipelineDefinition(ctx, runId, pipelineId, runLogger);
        procCtx.pipelineCode = pipelineCode;
        procCtx.assertLeaseHeld = assertLeaseHeld;
        const callbacks = this.createProcessingCallbacks(procCtx, definition);
        return this.runStepsWithMetrics(definition, procCtx, callbacks, isGateResume);
    }

    /**
     * Loads pipeline definition context including run checkpoint and seed data.
     */
    private async loadPipelineDefinition(
        ctx: RequestContext,
        runId: ID,
        pipelineId: ID | undefined,
        runLogger: DataHubLogger,
    ): Promise<ProcessingContext> {
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const run = await runRepo.findOne({ where: { id: runId } });
        const seed = readSeededGraphCheckpoint(run?.checkpoint);

        return { ctx, runId, pipelineId, runLogger, runRepo, start: Date.now(), seed };
    }

    /**
     * Creates callbacks for cancel requests and record errors during processing.
     */
    private createProcessingCallbacks(procCtx: ProcessingContext, definition: PipelineDefinition): ProcessingCallbacks {
        const { ctx, runId, pipelineId, runLogger, runRepo, start } = procCtx;

        const onCancelRequested = async (): Promise<boolean> => {
            const current = await runRepo.findOne({ where: { id: runId } });
            if (current?.status === RunStatus.CANCEL_REQUESTED) {
                runLogger.info('Pipeline cancellation requested', { durationMs: Date.now() - start });
                current.status = RunStatus.CANCELLED;
                current.finishedAt = new Date();
                await runRepo.save(current, { reload: false });
                this.domainEvents.publishRunCancelled(
                    pipelineId?.toString(),
                    String(runId),
                    ctx.activeUserId?.toString(),
                );
                return true;
            }
            return false;
        };

        const onRecordError = async (
            stepKey: string,
            message: string,
            payload: Record<string, unknown>,
            stackTrace?: string,
        ): Promise<void> => {
            await this.recordErrorService.record(ctx, runId, stepKey, message, payload as JsonObject, stackTrace);
            await this.executionLogger.logRecordError(ctx, stepKey, message, payload, { pipelineId, runId }, stackTrace);
            // Fire ON_ERROR hook for observability (WEBHOOK, EMIT, LOG, TRIGGER_PIPELINE)
            try {
                await this.hookService.run(ctx, definition, HookStage.ON_ERROR, { error: message, stepKey } as unknown as JsonObject, payload as JsonObject, runId);
            } catch {
                // ON_ERROR hooks are best-effort, never block the pipeline
            }
        };

        return { onCancelRequested, onRecordError };
    }

    /**
     * Runs pipeline steps and builds metrics from the execution result.
     */
    private async runStepsWithMetrics(
        definition: PipelineDefinition,
        procCtx: ProcessingContext,
        callbacks: ProcessingCallbacks,
        isGateResume?: boolean,
    ): Promise<PipelineMetrics> {
        const { ctx, runId, pipelineId, runLogger, start, seed } = procCtx;
        const { onCancelRequested, onRecordError } = callbacks;

        const result = await this.adapterRuntime.executePipeline(
            ctx,
            definition,
            onCancelRequested,
            onRecordError,
            pipelineId,
            runId,
            { resume: isGateResume || undefined, pipelineCode: procCtx.pipelineCode, seed },
        );

        const durationMs = Date.now() - start;

        runLogger.debug('Pipeline processing completed', {
            recordCount: result.processed,
            sourceRecordCount: result.sourceRecords,
            recordsSucceeded: result.succeeded,
            recordsFailed: result.failed,
            recordsSkipped: result.skipped,
            durationMs,
            throughput: calculateThroughput(result.processed, durationMs),
        });

        const resultWithDetails = result as {
            processed: number;
            succeeded: number;
            failed: number;
            skipped: number;
            sourceRecords: number;
            details?: JsonObject[];
            paused?: boolean;
            pausedAtStep?: string;
        };
        return {
            totalRecords: result.processed,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            skipped: result.skipped,
            sourceRecords: result.sourceRecords,
            durationMs,
            details: resultWithDetails.details,
            paused: resultWithDetails.paused,
            pausedAtStep: resultWithDetails.pausedAtStep,
        };
    }
}
