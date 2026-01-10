import { Injectable } from '@nestjs/common';
import { ID, RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { PipelineRun, Pipeline, LogLevel } from '../../entities/pipeline';
import { PipelineDefinition, PipelineMetrics, RunStatus } from '../../types/index';
import { DefinitionValidationService } from '../validation/definition-validation.service';
import { AdapterRuntimeService } from '../../runtime/adapter-runtime.service';
import { RecordErrorService } from '../data/record-error.service';
import { DataHubLogger, DataHubLoggerFactory, SpanContext, ExecutionLogger } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

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
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_RUNNER);
    }

    async execute(runId: ID): Promise<void> {
        const ctx = await this.createCtx();
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);

        const run = await runRepo.findOne({ where: { id: runId }, relations: { pipeline: true } });
        if (!run) {
            this.logger.warn('Run not found', { runId: runId as any });
            return;
        }

        // Create a run-specific logger with full trace context
        const runLogger = this.logger.withContext({
            runId,
            pipelineId: run.pipeline.id,
            pipelineCode: run.pipeline.code,
            userId: (run as any).startedByUserId,
        });

        if (run.status !== RunStatus.PENDING) {
            runLogger.debug('Skipping run - not in PENDING status', { currentStatus: run.status });
            return;
        }

        // Start pipeline execution span
        const pipelineSpan = runLogger.logPipelineStart(run.pipeline.code, run.pipeline.id);
        const startTime = Date.now();

        run.status = RunStatus.RUNNING;
        run.startedAt = new Date();
        await runRepo.save(run, { reload: false });

        // Persist log: pipeline started (respects log persistence level setting)
        await this.executionLogger.logPipelineStart(ctx, run.pipeline.code, {
            pipelineId: run.pipeline.id,
            runId,
        });

        try {
            const pipeline = await pipelineRepo.findOne({ where: { id: run.pipeline.id } });
            if (!pipeline) {
                throw new Error('Pipeline not found for run');
            }

            // Validate pipeline definition
            pipelineSpan.addEvent('definition.validate.start');
            this.definitionValidator.validate(pipeline.definition);
            pipelineSpan.addEvent('definition.validate.complete');

            // Execute the pipeline processing
            pipelineSpan.addEvent('processing.start', {
                stepCount: pipeline.definition.steps?.length ?? 0,
            });

            const metrics = await this.executeProcessing(
                ctx,
                runId,
                pipeline.definition,
                pipeline.id,
                runLogger,
            );

            // Update run status to completed
            run.status = RunStatus.COMPLETED;
            run.finishedAt = new Date();
            run.metrics = metrics;
            await runRepo.save(run, { reload: false });

            // Persist log: pipeline completed (respects log persistence level setting)
            await this.executionLogger.logPipelineComplete(ctx, run.pipeline.code, {
                pipelineId: run.pipeline.id,
                runId,
                durationMs: metrics.durationMs,
                recordsProcessed: metrics.totalRecords,
                recordsFailed: metrics.failed,
                metadata: metrics,
            });

            // Log pipeline completion with metrics (console)
            runLogger.logPipelineComplete(run.pipeline.code, {
                totalRecords: metrics.totalRecords ?? 0,
                succeeded: metrics.succeeded ?? 0,
                failed: metrics.failed ?? 0,
                durationMs: metrics.durationMs ?? 0,
            });

            // End span with success
            pipelineSpan.setAttribute('records.total', metrics.totalRecords ?? 0);
            pipelineSpan.setAttribute('records.succeeded', metrics.succeeded ?? 0);
            pipelineSpan.setAttribute('records.failed', metrics.failed ?? 0);
            pipelineSpan.end((metrics.failed ?? 0) > 0 ? 'error' : 'ok');
        } catch (e) {
            const durationMs = Date.now() - startTime;
            const error = e instanceof Error ? e : new Error(String(e));

            // Update run status to failed
            run.status = RunStatus.FAILED;
            run.finishedAt = new Date();
            run.error = error.message;
            await runRepo.save(run, { reload: false });

            // Persist log: pipeline failed (always persists - errors are always logged)
            await this.executionLogger.logPipelineFailed(ctx, run.pipeline.code, error, {
                pipelineId: run.pipeline.id,
                runId,
                durationMs,
            });

            // Log pipeline failure with error details (console)
            runLogger.logPipelineFailed(run.pipeline.code, error, durationMs);

            // End span with error status
            pipelineSpan.addEvent('error', {
                message: error.message,
                stack: error.stack,
            });
            pipelineSpan.end('error');
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
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const run = await runRepo.findOne({ where: { id: runId } });
        const start = Date.now();
        const seed = (run?.checkpoint as any)?.__seed as any[] | undefined;

        // Create cancellation checker with logging
        const onCancelRequested = async (): Promise<boolean> => {
            const current = await runRepo.findOne({ where: { id: runId } });
            if (current?.status === RunStatus.CANCEL_REQUESTED) {
                runLogger.info('Pipeline cancellation requested', {
                    durationMs: Date.now() - start,
                });
                current.status = RunStatus.CANCELLED;
                current.finishedAt = new Date();
                await runRepo.save(current, { reload: false });
                return true;
            }
            return false;
        };

        // Create error handler with logging
        const onRecordError = async (
            stepKey: string,
            message: string,
            payload: Record<string, unknown>,
        ): Promise<void> => {
            // Always record to error table
            await this.recordErrorService.record(ctx, runId, stepKey, message, payload);

            // Persist to log table (respects log persistence level - errors always logged)
            await this.executionLogger.logRecordError(ctx, stepKey, message, payload, {
                pipelineId,
                runId,
            });
        };

        // Execute pipeline (with or without seed records)
        const result = seed
            ? await this.adapterRuntime.executePipelineWithSeedRecords(
                  ctx,
                  definition,
                  seed,
                  onCancelRequested,
                  onRecordError,
              )
            : await this.adapterRuntime.executePipeline(
                  ctx,
                  definition,
                  onCancelRequested,
                  onRecordError,
                  pipelineId,
                  runId,
              );

        const durationMs = Date.now() - start;

        // Log processing summary
        runLogger.debug('Pipeline processing completed', {
            recordCount: result.processed,
            recordsSucceeded: result.succeeded,
            recordsFailed: result.failed,
            durationMs,
            throughput: durationMs > 0 ? Math.round((result.processed / durationMs) * 1000) : 0,
        });

        return {
            totalRecords: result.processed,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            durationMs,
            details: (result as any).details ?? [],
        };
    }
}
