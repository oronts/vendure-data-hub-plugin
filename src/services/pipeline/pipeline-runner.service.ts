import { Injectable, Optional } from '@nestjs/common';
import { ID, RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { Repository } from 'typeorm';
import { PipelineRun, Pipeline } from '../../entities/pipeline';
import { RunStatus } from '../../constants/enums';
import { JsonObject, PipelineDefinition, PipelineMetrics } from '../../types/index';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { RecordErrorService } from '../data/record-error.service';
import { DataHubLogger, DataHubLoggerFactory, ExecutionLogger, SpanContext } from '../logger';
import { LOGGER_CONTEXTS, DISTRIBUTED_LOCK, calculateThroughput } from '../../constants/index';
import { DistributedLockService } from '../runtime/distributed-lock.service';
import { getErrorMessage } from '../../utils/error.utils';

/** Context for pipeline execution passed between helper methods */
interface ExecutionContext {
    ctx: RequestContext;
    run: PipelineRun;
    runId: ID;
    runRepo: Repository<PipelineRun>;
    pipelineRepo: Repository<Pipeline>;
    runLogger: DataHubLogger;
    pipelineSpan: SpanContext;
    startTime: number;
    lockKey: string;
    lockToken?: string;
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
    runLogger: DataHubLogger;
    runRepo: Repository<PipelineRun>;
    start: number;
    seed?: unknown[];
}

/** Callbacks for pipeline execution */
interface ProcessingCallbacks {
    onCancelRequested: () => Promise<boolean>;
    onRecordError: (stepKey: string, message: string, payload: Record<string, unknown>) => Promise<void>;
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
        private loggerFactory: DataHubLoggerFactory,
        private executionLogger: ExecutionLogger,
        @Optional() private distributedLock?: DistributedLockService,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_RUNNER);
    }

    /**
     * Runs pipeline execution phases: setup, steps, and completion.
     */
    async execute(runId: ID): Promise<void> {
        const prepareResult = await this.prepareExecution(runId);
        if (!prepareResult.proceed) {
            return;
        }

        const execCtx = prepareResult.executionContext;

        try {
            const metrics = await this.executeSteps(execCtx);

            // If the pipeline paused at a GATE step, set PAUSED status instead of COMPLETED
            if (metrics.paused) {
                await this.handlePaused(execCtx, metrics);
            } else {
                await this.handleCompletion(execCtx, metrics);
            }
        } catch (e) {
            await this.handleFailure(execCtx, e);
        } finally {
            await this.releaseLock(execCtx);
        }
    }

    /**
     * Prepares execution context: loads run, validates status, acquires lock, and initializes logging.
     * Returns { proceed: false } if execution should be skipped.
     */
    private async prepareExecution(runId: ID): Promise<PrepareResult> {
        const ctx = await this.createCtx();
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);

        const loadResult = await this.loadAndValidateRun(runId, runRepo);
        if (!loadResult.valid) {
            return { proceed: false };
        }
        const { run, runLogger } = loadResult;

        const lockKey = `pipeline-run:${runId}`;
        const lockResult = await this.acquireExecutionLock(lockKey, runLogger);
        if (!lockResult.acquired) {
            return { proceed: false };
        }

        const execCtx = await this.initializeExecutionContext(
            ctx, run, runId, runRepo, pipelineRepo, runLogger, lockKey, lockResult.lockToken,
        );

        return { proceed: true, executionContext: execCtx };
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

    /**
     * Initializes execution context: starts span, updates run status, and persists start log.
     */
    private async initializeExecutionContext(
        ctx: RequestContext,
        run: PipelineRun,
        runId: ID,
        runRepo: Repository<PipelineRun>,
        pipelineRepo: Repository<Pipeline>,
        runLogger: DataHubLogger,
        lockKey: string,
        lockToken: string | undefined,
    ): Promise<ExecutionContext> {
        const pipelineSpan = runLogger.logPipelineStart(run.pipeline.code, run.pipeline.id);
        const startTime = Date.now();

        run.status = RunStatus.RUNNING;
        run.startedAt = new Date();
        await runRepo.save(run, { reload: false });

        await this.executionLogger.logPipelineStart(ctx, run.pipeline.code, {
            pipelineId: run.pipeline.id,
            runId,
        });

        return { ctx, run, runId, runRepo, pipelineRepo, runLogger, pipelineSpan, startTime, lockKey, lockToken };
    }

    /**
     * Executes pipeline steps: validates definition and runs the pipeline processing.
     * Returns metrics from the pipeline execution.
     */
    private async executeSteps(execCtx: ExecutionContext): Promise<PipelineMetrics> {
        const { ctx, run, runId, pipelineRepo, runLogger, pipelineSpan } = execCtx;

        const pipeline = await pipelineRepo.findOne({ where: { id: run.pipeline.id } });
        if (!pipeline) {
            throw new Error('Pipeline not found for run');
        }

        pipelineSpan.addEvent('definition.validate.start');
        this.definitionValidator.validate(pipeline.definition);
        pipelineSpan.addEvent('definition.validate.complete');

        pipelineSpan.addEvent('processing.start', {
            stepCount: pipeline.definition.steps?.length ?? 0,
        });

        return this.executeProcessing(ctx, runId, pipeline.definition, pipeline.id, runLogger);
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
    private async handleFailure(execCtx: ExecutionContext, e: unknown): Promise<void> {
        const { ctx, run, runId, runRepo, runLogger, pipelineSpan, startTime } = execCtx;

        const durationMs = Date.now() - startTime;
        const error = e instanceof Error ? e : new Error(String(e));

        run.status = RunStatus.FAILED;
        run.finishedAt = new Date();
        run.error = error.message;
        await runRepo.save(run, { reload: false });

        await this.executionLogger.logPipelineFailed(ctx, run.pipeline.code, error, {
            pipelineId: run.pipeline.id,
            runId,
            durationMs,
        });

        runLogger.logPipelineFailed(run.pipeline.code, error, durationMs);

        // End span with error status
        pipelineSpan.addEvent('error', {
            message: error.message,
            stack: error.stack,
        });
        pipelineSpan.end('error');
    }

    /**
     * Releases the distributed lock if one was acquired.
     */
    private async releaseLock(execCtx: ExecutionContext): Promise<void> {
        const { runLogger, lockKey, lockToken } = execCtx;

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
    ): Promise<PipelineMetrics> {
        const procCtx = await this.loadPipelineDefinition(ctx, runId, pipelineId, runLogger);
        const callbacks = this.createProcessingCallbacks(procCtx);
        return this.runStepsWithMetrics(definition, procCtx, callbacks);
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
        const checkpoint = run?.checkpoint as { __seed?: unknown[] } | null;
        const seed = checkpoint?.__seed;

        return { ctx, runId, pipelineId, runLogger, runRepo, start: Date.now(), seed };
    }

    /**
     * Creates callbacks for cancel requests and record errors during processing.
     */
    private createProcessingCallbacks(procCtx: ProcessingContext): ProcessingCallbacks {
        const { ctx, runId, pipelineId, runLogger, runRepo, start } = procCtx;

        const onCancelRequested = async (): Promise<boolean> => {
            const current = await runRepo.findOne({ where: { id: runId } });
            if (current?.status === RunStatus.CANCEL_REQUESTED) {
                runLogger.info('Pipeline cancellation requested', { durationMs: Date.now() - start });
                current.status = RunStatus.CANCELLED;
                current.finishedAt = new Date();
                await runRepo.save(current, { reload: false });
                return true;
            }
            return false;
        };

        const onRecordError = async (
            stepKey: string,
            message: string,
            payload: Record<string, unknown>,
        ): Promise<void> => {
            await this.recordErrorService.record(ctx, runId, stepKey, message, payload as JsonObject);
            await this.executionLogger.logRecordError(ctx, stepKey, message, payload, { pipelineId, runId });
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
    ): Promise<PipelineMetrics> {
        const { ctx, runId, pipelineId, runLogger, start, seed } = procCtx;
        const { onCancelRequested, onRecordError } = callbacks;

        const result = seed
            ? await this.adapterRuntime.executePipelineWithSeedRecords(
                  ctx, definition, seed as JsonObject[], onCancelRequested, onRecordError,
              )
            : await this.adapterRuntime.executePipeline(
                  ctx, definition, onCancelRequested, onRecordError, pipelineId, runId,
              );

        const durationMs = Date.now() - start;

        runLogger.debug('Pipeline processing completed', {
            recordCount: result.processed,
            recordsSucceeded: result.succeeded,
            recordsFailed: result.failed,
            durationMs,
            throughput: calculateThroughput(result.processed, durationMs),
        });

        const resultWithDetails = result as { processed: number; succeeded: number; failed: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string };
        return {
            totalRecords: result.processed,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            durationMs,
            details: resultWithDetails.details,
            paused: resultWithDetails.paused,
            pausedAtStep: resultWithDetails.pausedAtStep,
        };
    }
}
