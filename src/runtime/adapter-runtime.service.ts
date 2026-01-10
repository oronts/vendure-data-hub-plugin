import { Injectable } from '@nestjs/common';
import { RequestContext, RequestContextService, ID } from '@vendure/core';
import { PipelineDefinition, StepType, PipelineMetrics } from '../types/index';
// Import directly from service files to avoid circular dependencies through barrel exports
import { CheckpointService } from '../services/data/checkpoint.service';
import { HookService } from '../services/events/hook.service';
import { DomainEventsService } from '../services/events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory, LogContext, ExecutionLogger } from '../services/logger';
import { LOGGER_CONTEXTS } from '../constants/index';
import {
    RecordObject,
    OnRecordErrorCallback,
    ExecutorContext,
    CheckpointData,
} from './executor-types';
import {
    ExtractExecutor,
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
} from './executors';
import { getPath } from './utils';
import {
    executeGraph,
    executeLinear,
    executeWithSeed,
    replayFromStepLinear,
    replayFromStepGraph,
    executeLoadWithThroughput,
    StepLogCallback,
    StepLogInfo,
} from './orchestration';

@Injectable()
export class AdapterRuntimeService {
    private readonly logger: DataHubLogger;
    private cpData: CheckpointData | null = null;
    private cpDirty = false;

    constructor(
        private requestContextService: RequestContextService,
        private checkpointService: CheckpointService,
        private hookService: HookService,
        private domainEvents: DomainEventsService,
        private extractExecutor: ExtractExecutor,
        private transformExecutor: TransformExecutor,
        private loadExecutor: LoadExecutor,
        private exportExecutor: ExportExecutor,
        private feedExecutor: FeedExecutor,
        private sinkExecutor: SinkExecutor,
        private executionLogger: ExecutionLogger,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ADAPTER_RUNTIME);
    }

    /**
     * Create a logger with pipeline execution context
     */
    private createPipelineLogger(context: LogContext): DataHubLogger {
        return this.logger.withContext(context);
    }

    /**
     * Create the executor context for accessing checkpoint data and pipeline config
     */
    private createExecutorContext(definition?: PipelineDefinition): ExecutorContext {
        return {
            cpData: this.cpData,
            cpDirty: this.cpDirty,
            markCheckpointDirty: () => { this.cpDirty = true; },
            errorHandling: definition?.context?.errorHandling,
            checkpointing: definition?.context?.checkpointing,
        };
    }

    /**
     * Execute a pipeline definition
     *
     * @param options.resume - If true, resume from existing checkpoint. If false (default), start fresh.
     */
    async executePipeline(
        ctx: RequestContext,
        definition: PipelineDefinition,
        onCancelRequested?: () => Promise<boolean>,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
        options?: { resume?: boolean },
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: Array<Record<string, any>> }> {
        const resume = options?.resume ?? false;

        // If graph edges are defined, use graph-aware execution
        if (Array.isArray((definition as any).edges) && (definition as any).edges.length > 0) {
            return this.executePipelineGraph(ctx, definition, onCancelRequested, onRecordError, pipelineId, runId, options);
        }

        // Apply pipeline context channel if present
        const pipelineCtx = await this.resolvePipelineContext(ctx, definition);

        // Handle checkpoint: clear for fresh runs, load for resume
        if (pipelineId && !resume) {
            await this.clearCheckpoint(ctx, pipelineId);
        }
        await this.loadCheckpoint(ctx, pipelineId);

        const executorCtx = this.createExecutorContext(definition);

        // Create step logging callback for database persistence
        const stepLog = this.createStepLogCallback(pipelineId, runId);

        // Execute linear pipeline
        const result = await executeLinear({
            ctx: pipelineCtx,
            definition,
            executorCtx,
            hookService: this.hookService,
            domainEvents: this.domainEvents,
            extractExecutor: this.extractExecutor,
            transformExecutor: this.transformExecutor,
            loadExecutor: this.loadExecutor,
            exportExecutor: this.exportExecutor,
            feedExecutor: this.feedExecutor,
            sinkExecutor: this.sinkExecutor,
            loadWithThroughput: this.createLoadWithThroughput(),
            applyIdempotency: this.applyIdempotency.bind(this),
            onCancelRequested,
            onRecordError,
            pipelineId,
            runId,
            stepLog,
        });

        // Persist checkpoint if dirty
        await this.saveCheckpoint(ctx, pipelineId);

        // Finalize
        result.details.push({ counters: result.counters });
        await this.hookService.run(ctx, definition, result.failed > 0 ? 'pipelineFailed' : 'pipelineCompleted');
        try {
            if (result.failed > 0) {
                this.domainEvents.publish('PipelineFailed', {
                    pipelineId,
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                });
            } else {
                this.domainEvents.publish('PipelineCompleted', {
                    pipelineId,
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                });
            }
        } catch (err) {
            this.logger.debug('Failed to publish domain event', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return {
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            details: result.details,
        };
    }

    /**
     * Execute a graph-based pipeline definition
     */
    private async executePipelineGraph(
        ctx: RequestContext,
        definition: PipelineDefinition,
        onCancelRequested?: () => Promise<boolean>,
        onRecordError?: OnRecordErrorCallback,
        pipelineId?: ID,
        runId?: ID,
        options?: { resume?: boolean },
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: Array<Record<string, any>> }> {
        const resume = options?.resume ?? false;
        const pipelineCtx = await this.resolvePipelineContext(ctx, definition);

        // Handle checkpoint: clear for fresh runs, load for resume
        if (pipelineId && !resume) {
            await this.clearCheckpoint(ctx, pipelineId);
        }
        await this.loadCheckpoint(ctx, pipelineId);
        const executorCtx = this.createExecutorContext(definition);

        // Create step logging callback for database persistence
        const stepLog = this.createStepLogCallback(pipelineId, runId);

        const result = await executeGraph({
            ctx: pipelineCtx,
            definition,
            executorCtx,
            hookService: this.hookService,
            domainEvents: this.domainEvents,
            extractExecutor: this.extractExecutor,
            transformExecutor: this.transformExecutor,
            loadExecutor: this.loadExecutor,
            exportExecutor: this.exportExecutor,
            feedExecutor: this.feedExecutor,
            sinkExecutor: this.sinkExecutor,
            loadWithThroughput: this.createLoadWithThroughput(),
            applyIdempotency: this.applyIdempotency.bind(this),
            onCancelRequested,
            onRecordError,
            pipelineId,
            runId,
            stepLog,
        });

        await this.saveCheckpoint(ctx, pipelineId);

        result.details.push({ counters: result.counters });
        await this.hookService.run(ctx, definition, result.failed > 0 ? 'pipelineFailed' : 'pipelineCompleted');
        try {
            if (result.failed > 0) {
                this.domainEvents.publish('PipelineFailed', {
                    pipelineId,
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                });
            } else {
                this.domainEvents.publish('PipelineCompleted', {
                    pipelineId,
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                });
            }
        } catch (err) {
            this.logger.debug('Failed to publish domain event', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return {
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            details: result.details,
        };
    }

    /**
     * Execute pipeline with seed records (skip extract steps)
     */
    async executePipelineWithSeedRecords(
        ctx: RequestContext,
        definition: PipelineDefinition,
        seed: RecordObject[],
        onCancelRequested?: () => Promise<boolean>,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<{ processed: number; succeeded: number; failed: number }> {
        const executorCtx = this.createExecutorContext(definition);

        return executeWithSeed({
            ctx,
            definition,
            seed,
            executorCtx,
            transformExecutor: this.transformExecutor,
            loadExecutor: this.loadExecutor,
            exportExecutor: this.exportExecutor,
            feedExecutor: this.feedExecutor,
            sinkExecutor: this.sinkExecutor,
            onCancelRequested,
            onRecordError,
        });
    }

    /**
     * Replay from a specific step in the pipeline
     */
    async replayFromStep(
        ctx: RequestContext,
        definition: PipelineDefinition,
        startStepKey: string,
        seed: RecordObject[],
        onCancelRequested?: () => Promise<boolean>,
        onRecordError?: OnRecordErrorCallback,
    ): Promise<{ processed: number; succeeded: number; failed: number }> {
        const executorCtx = this.createExecutorContext(definition);

        // Use graph replay if edges are defined
        if (Array.isArray((definition as any).edges) && (definition as any).edges.length > 0) {
            return replayFromStepGraph({
                ctx,
                definition,
                startStepKey,
                seed,
                executorCtx,
                transformExecutor: this.transformExecutor,
                loadExecutor: this.loadExecutor,
                exportExecutor: this.exportExecutor,
                feedExecutor: this.feedExecutor,
                sinkExecutor: this.sinkExecutor,
                onCancelRequested,
                onRecordError,
            });
        }

        return replayFromStepLinear({
            ctx,
            definition,
            startStepKey,
            seed,
            executorCtx,
            transformExecutor: this.transformExecutor,
            loadExecutor: this.loadExecutor,
            exportExecutor: this.exportExecutor,
            feedExecutor: this.feedExecutor,
            sinkExecutor: this.sinkExecutor,
            onCancelRequested,
            onRecordError,
        });
    }

    /**
     * Execute a dry run of the pipeline
     * Returns metrics, details, and sample records showing before/after for transforms
     */
    async executeDryRun(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): Promise<{
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        errors?: string[];
    }> {
        let records: RecordObject[] = [];
        const details: any[] = [];
        const sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        const errors: string[] = [];
        let processed = 0;
        // Create a FRESH executor context without checkpoint data for dry runs
        // This ensures extractions always start from offset 0 and don't use persisted state
        const executorCtx: ExecutorContext = {
            cpData: {}, // Empty checkpoint - always start fresh
            cpDirty: false,
            markCheckpointDirty: () => {}, // No-op - don't persist anything
            errorHandling: definition?.context?.errorHandling,
            checkpointing: definition?.context?.checkpointing,
        };
        const SAMPLE_LIMIT = 5; // Max samples to collect per step

        // Error callback to capture extraction errors
        const onRecordError = async (stepKey: string, message: string, _payload?: any) => {
            errors.push(`[${stepKey}] ${message}`);
        };

        for (const step of definition.steps) {
            switch (step.type) {
                case StepType.TRIGGER:
                    break;

                case StepType.EXTRACT: {
                    try {
                        const out = await this.extractExecutor.execute(ctx, step, executorCtx, onRecordError);
                        records = out;
                        processed += out.length;
                        // Capture extract samples (before is empty, after is the extracted record)
                        for (let i = 0; i < Math.min(out.length, SAMPLE_LIMIT); i++) {
                            sampleRecords.push({
                                step: step.key || step.name || 'extract',
                                before: {},
                                after: out[i],
                            });
                        }
                        if (out.length === 0) {
                            this.logger.debug('Dry run extract returned 0 records', {
                                stepKey: step.key,
                                adapterCode: (step.config as any)?.adapterCode,
                            });
                        }
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        errors.push(`[${step.key || 'extract'}] ${msg}`);
                        this.logger.error('Dry run extract failed', err instanceof Error ? err : undefined, {
                            stepKey: step.key,
                        });
                    }
                    break;
                }

                case StepType.TRANSFORM: {
                    // Capture before state for samples
                    const beforeSamples = records.slice(0, SAMPLE_LIMIT).map(r => ({ ...r }));
                    records = await this.transformExecutor.executeOperator(ctx, step, records, executorCtx);
                    // Capture after state and create sample pairs
                    for (let i = 0; i < Math.min(beforeSamples.length, records.length); i++) {
                        sampleRecords.push({
                            step: step.key || step.name || 'transform',
                            before: beforeSamples[i],
                            after: records[i],
                        });
                    }
                    break;
                }

                case StepType.VALIDATE: {
                    const beforeSamples = records.slice(0, SAMPLE_LIMIT).map(r => ({ ...r }));
                    records = await this.transformExecutor.executeValidate(ctx, step, records);
                    for (let i = 0; i < Math.min(beforeSamples.length, records.length); i++) {
                        sampleRecords.push({
                            step: step.key || step.name || 'validate',
                            before: beforeSamples[i],
                            after: records[i],
                        });
                    }
                    break;
                }

                case StepType.LOAD: {
                    const sim = await this.loadExecutor.simulate(ctx, step, records);
                    details.push({
                        stepKey: step.key,
                        adapterCode: (step.config as any)?.adapterCode,
                        ...sim,
                    });
                    break;
                }

                case StepType.ENRICH:
                case StepType.ROUTE:
                case StepType.EXPORT:
                case StepType.FEED:
                case StepType.SINK:
                    // These step types are not yet simulated in dry run
                    // Future: Add simulation support for these types
                    break;

                default:
                    // Log unhandled step types for debugging extensibility issues
                    this.logger.debug(`executeDryRun: Step type "${step.type}" not handled in dry run simulation`, {
                        stepKey: step.key,
                        stepType: step.type,
                    });
                    break;
            }
        }

        return {
            metrics: {
                totalRecords: processed,
                processed,
                succeeded: processed,
                failed: errors.length,
                recordsProcessed: processed,
                recordsSucceeded: processed,
                recordsFailed: errors.length,
                recordsSkipped: 0,
                durationMs: 0,
                details: details as any,
            },
            sampleRecords,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    private async resolvePipelineContext(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): Promise<RequestContext> {
        const channelFromContext = definition.context?.channel;
        const langFromContext = definition.context?.contentLanguage as any;

        if (channelFromContext || langFromContext) {
            const req = await this.requestContextService.create({
                apiType: ctx.apiType as any,
                channelOrToken: channelFromContext ?? (ctx as any)._channel?.token,
                languageCode: langFromContext,
            });
            if (req) return req;
        }

        return ctx;
    }

    /**
     * Load checkpoint data for a pipeline
     */
    private async loadCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        this.cpData = null;
        this.cpDirty = false;

        if (pipelineId) {
            try {
                const cp = await this.checkpointService.getByPipeline(ctx, pipelineId);
                this.cpData = (cp?.data ?? {}) as any;
            } catch (err) {
                this.logger.debug('Failed to load checkpoint', {
                    pipelineId: String(pipelineId),
                    error: err instanceof Error ? err.message : String(err),
                });
                this.cpData = {};
            }
        }
    }

    /**
     * Clear checkpoint data for a pipeline (fresh start)
     */
    private async clearCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (!pipelineId) return;

        try {
            await this.checkpointService.clearForPipeline(ctx, pipelineId);
            this.logger.debug('Checkpoint cleared for fresh run', {
                pipelineId: String(pipelineId),
            });
        } catch (err) {
            this.logger.debug('Failed to clear checkpoint', {
                pipelineId: String(pipelineId),
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Save checkpoint data if dirty
     */
    private async saveCheckpoint(ctx: RequestContext, pipelineId?: ID): Promise<void> {
        if (pipelineId && this.cpDirty && this.cpData) {
            try {
                await this.checkpointService.setForPipeline(ctx, pipelineId, this.cpData);
            } catch (err) {
                this.logger.warn('Failed to save checkpoint', {
                    pipelineId: String(pipelineId),
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    /**
     * Apply idempotency filter to records
     */
    private applyIdempotency(records: RecordObject[], definition: PipelineDefinition): RecordObject[] {
        const keyPath = definition.context?.idempotencyKeyField;
        if (!keyPath) return records;

        const seen = new Set<string>();
        return records.filter(r => {
            const v = getPath(r, keyPath);
            const key = v == null ? '' : String(v);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Create load with throughput function
     */
    private createLoadWithThroughput() {
        return (
            ctx: RequestContext,
            step: any,
            batch: RecordObject[],
            definition: PipelineDefinition,
            onRecordError?: OnRecordErrorCallback,
        ) => executeLoadWithThroughput({
            ctx,
            step,
            batch,
            definition,
            loadExecutor: this.loadExecutor,
            onRecordError,
        });
    }

    /**
     * Create step logging callback for database persistence
     */
    private createStepLogCallback(pipelineId?: ID, runId?: ID): StepLogCallback {
        const options = { pipelineId, runId };

        return {
            onStepStart: async (ctx: RequestContext, stepKey: string, stepType: string, recordsIn: number) => {
                await this.executionLogger.logStepStart(ctx, stepKey, stepType, {
                    ...options,
                    recordsProcessed: recordsIn,
                });
            },
            onStepComplete: async (ctx: RequestContext, info: StepLogInfo) => {
                await this.executionLogger.logStepExecution(ctx, {
                    stepKey: info.stepKey,
                    stepType: info.stepType,
                    adapterCode: info.adapterCode,
                    recordsIn: info.recordsIn,
                    recordsOut: info.recordsOut,
                    succeeded: info.succeeded,
                    failed: info.failed,
                    durationMs: info.durationMs,
                    sampleRecord: info.sampleOutput as Record<string, unknown> | undefined,
                }, options);
            },
            onStepFailed: async (ctx: RequestContext, stepKey: string, stepType: string, error: Error, durationMs: number) => {
                await this.executionLogger.logStepFailed(ctx, stepKey, stepType, error, {
                    ...options,
                    durationMs,
                });
            },
            onExtractData: async (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => {
                await this.executionLogger.logExtractedData(ctx, stepKey, adapterCode, records as Record<string, unknown>[], options);
            },
            onLoadData: async (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => {
                await this.executionLogger.logLoadTargetData(ctx, stepKey, adapterCode, records as Record<string, unknown>[], options);
            },
            onTransformMapping: async (ctx: RequestContext, stepKey: string, adapterCode: string, inputRecord: RecordObject, outputRecord: RecordObject) => {
                await this.executionLogger.logFieldMappings(ctx, stepKey, adapterCode, inputRecord as Record<string, unknown>, outputRecord as Record<string, unknown>, options);
            },
        };
    }
}
