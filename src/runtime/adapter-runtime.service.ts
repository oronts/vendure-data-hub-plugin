import { Injectable } from '@nestjs/common';
import { RequestContext, RequestContextService, ID } from '@vendure/core';
import { PipelineDefinition, StepType, PipelineMetrics, JsonObject } from '../types/index';
import { CheckpointService } from '../services/data/checkpoint.service';
import { HookService } from '../services/events/hook.service';
import { DomainEventsService } from '../services/events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory, ExecutionLogger } from '../services/logger';
import { LOGGER_CONTEXTS, SANDBOX } from '../constants/index';
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
import { getAdapterCode } from '../utils/step-utils';

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
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: JsonObject[] }> {
        // If graph edges are defined, use graph-aware execution
        if (Array.isArray(definition.edges) && definition.edges.length > 0) {
            return this.executePipelineGraph(ctx, definition, onCancelRequested, onRecordError, pipelineId, runId, options);
        }

        const { pipelineCtx, executorCtx, stepLog } = await this.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );

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

        return this.finalizeExecution(ctx, definition, result, pipelineId);
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
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: JsonObject[] }> {
        const { pipelineCtx, executorCtx, stepLog } = await this.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );

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

        return this.finalizeExecution(ctx, definition, result, pipelineId);
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
        if (Array.isArray(definition.edges) && definition.edges.length > 0) {
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
        const dryRunCtx = this.prepareDryRunContext(definition);
        const { executorCtx, errors } = dryRunCtx;

        const simResult = await this.simulateSteps(ctx, definition, executorCtx, dryRunCtx);

        return this.buildDryRunReport(simResult.processed, simResult.details, simResult.sampleRecords, errors);
    }

    // ============================================================
    // Pipeline Execution Helpers
    // ============================================================

    /**
     * Prepare execution context, checkpoint, and step logging for pipeline execution
     */
    private async prepareExecution(
        ctx: RequestContext,
        definition: PipelineDefinition,
        pipelineId?: ID,
        runId?: ID,
        options?: { resume?: boolean },
    ): Promise<{
        pipelineCtx: RequestContext;
        executorCtx: ExecutorContext;
        stepLog: StepLogCallback;
    }> {
        const resume = options?.resume ?? false;
        const pipelineCtx = await this.resolvePipelineContext(ctx, definition);

        // Handle checkpoint: clear for fresh runs, load for resume
        if (pipelineId && !resume) {
            await this.clearCheckpoint(ctx, pipelineId);
        }
        await this.loadCheckpoint(ctx, pipelineId);

        const executorCtx = this.createExecutorContext(definition);
        const stepLog = this.createStepLogCallback(pipelineId, runId);

        return { pipelineCtx, executorCtx, stepLog };
    }

    /**
     * Finalize execution: save checkpoint, run hooks, publish domain events
     */
    private async finalizeExecution(
        ctx: RequestContext,
        definition: PipelineDefinition,
        result: { processed: number; succeeded: number; failed: number; details: JsonObject[]; counters: JsonObject },
        pipelineId?: ID,
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: JsonObject[] }> {
        await this.saveCheckpoint(ctx, pipelineId);

        result.details.push({ counters: result.counters });
        await this.hookService.run(ctx, definition, result.failed > 0 ? 'PIPELINE_FAILED' : 'PIPELINE_COMPLETED');

        this.publishPipelineDomainEvent(pipelineId, result);

        return {
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            details: result.details,
        };
    }

    /**
     * Publish pipeline completion or failure domain event
     */
    private publishPipelineDomainEvent(
        pipelineId: ID | undefined,
        result: { processed: number; succeeded: number; failed: number },
    ): void {
        try {
            const eventType = result.failed > 0 ? 'PIPELINE_FAILED' : 'PIPELINE_COMPLETED';
            this.domainEvents.publish(eventType, {
                pipelineId,
                processed: result.processed,
                succeeded: result.succeeded,
                failed: result.failed,
            });
        } catch (err) {
            this.logger.debug('Failed to publish domain event', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ============================================================
    // Dry Run Helpers
    // ============================================================

    /** Max samples to collect per step in dry run - uses SANDBOX.MAX_SAMPLES_PER_STEP constant */
    private readonly DRY_RUN_SAMPLE_LIMIT = SANDBOX.MAX_SAMPLES_PER_STEP;

    /**
     * Prepare dry run context with empty checkpoint and error collection
     */
    private prepareDryRunContext(definition: PipelineDefinition): {
        executorCtx: ExecutorContext;
        errors: string[];
        onRecordError: OnRecordErrorCallback;
    } {
        const errors: string[] = [];
        const executorCtx: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: () => {},
            errorHandling: definition?.context?.errorHandling,
            checkpointing: definition?.context?.checkpointing,
        };
        const onRecordError: OnRecordErrorCallback = async (stepKey: string, message: string) => {
            errors.push(`[${stepKey}] ${message}`);
        };
        return { executorCtx, errors, onRecordError };
    }

    /**
     * Simulate all pipeline steps for dry run
     */
    private async simulateSteps(
        ctx: RequestContext,
        definition: PipelineDefinition,
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
    ): Promise<{
        processed: number;
        details: JsonObject[];
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        let records: RecordObject[] = [];
        const details: JsonObject[] = [];
        const sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        let processed = 0;

        for (const step of definition.steps) {
            const stepResult = await this.simulateSingleStep(
                ctx, step, records, executorCtx, dryRunCtx, details,
            );
            records = stepResult.records;
            processed += stepResult.processedDelta;
            sampleRecords.push(...stepResult.samples);
        }

        return { processed, details, sampleRecords };
    }

    /** Result type for single step simulation */
    private readonly noopStepResult = (records: RecordObject[]) => ({
        records,
        processedDelta: 0,
        samples: [] as Array<{ step: string; before: RecordObject; after: RecordObject }>,
    });

    /**
     * Simulate a single step in dry run - routes to type-specific handlers
     */
    private async simulateSingleStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ): Promise<{
        records: RecordObject[];
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const handler = this.getStepSimulationHandler(step.type);
        if (handler) {
            return handler(ctx, step, records, executorCtx, dryRunCtx, details);
        }
        return this.handleUnknownStepType(step, records);
    }

    /** Handler function type for step simulation */
    private readonly stepSimulationHandlers: Record<string, (
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ) => Promise<{
        records: RecordObject[];
        processedDelta: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }>> = {
        TRIGGER: this.handleTriggerSimulation.bind(this),
        EXTRACT: this.handleExtractSimulation.bind(this),
        TRANSFORM: this.handleTransformSimulation.bind(this),
        VALIDATE: this.handleValidateSimulation.bind(this),
        LOAD: this.handleLoadSimulation.bind(this),
        ENRICH: this.handleNoopSimulation.bind(this),
        ROUTE: this.handleNoopSimulation.bind(this),
        EXPORT: this.handleNoopSimulation.bind(this),
        FEED: this.handleNoopSimulation.bind(this),
        SINK: this.handleNoopSimulation.bind(this),
    };

    /**
     * Get the simulation handler for a given step type
     */
    private getStepSimulationHandler(stepType: string) {
        return this.stepSimulationHandlers[stepType] ?? null;
    }

    /** Handle trigger step simulation (no-op) */
    private async handleTriggerSimulation(
        _ctx: RequestContext,
        _step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        return this.noopStepResult(records);
    }

    /** Handle extract step simulation */
    private async handleExtractSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        _records: RecordObject[],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateExtractStep(ctx, step, executorCtx, dryRunCtx);
        return { records: result.records, processedDelta: result.processed, samples: result.samples };
    }

    /** Handle transform step simulation */
    private async handleTransformSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateTransformStep(ctx, step, records, executorCtx, 'transform');
        return { records: result.records, processedDelta: 0, samples: result.samples };
    }

    /** Handle validate step simulation */
    private async handleValidateSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        const result = await this.simulateValidateStep(ctx, step, records);
        return { records: result.records, processedDelta: 0, samples: result.samples };
    }

    /** Handle load step simulation */
    private async handleLoadSimulation(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        details: JsonObject[],
    ) {
        await this.simulateLoadStep(ctx, step, records, details);
        return this.noopStepResult(records);
    }

    /** Handle steps that don't need simulation (enrich, route, export, feed, sink) */
    private async handleNoopSimulation(
        _ctx: RequestContext,
        _step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        _executorCtx: ExecutorContext,
        _dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
        _details: JsonObject[],
    ) {
        return this.noopStepResult(records);
    }

    /** Handle unknown step types with logging */
    private handleUnknownStepType(
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
    ) {
        this.logger.debug(`executeDryRun: Step type "${step.type}" not handled in dry run simulation`, {
            stepKey: step.key,
            stepType: step.type,
        });
        return this.noopStepResult(records);
    }

    /**
     * Simulate extract step in dry run
     */
    private async simulateExtractStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        executorCtx: ExecutorContext,
        dryRunCtx: { errors: string[]; onRecordError: OnRecordErrorCallback },
    ): Promise<{
        records: RecordObject[];
        processed: number;
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const samples: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];

        try {
            const out = await this.extractExecutor.execute(ctx, step, executorCtx, dryRunCtx.onRecordError);
            for (let i = 0; i < Math.min(out.length, this.DRY_RUN_SAMPLE_LIMIT); i++) {
                samples.push({ step: step.key || step.name || 'extract', before: {}, after: out[i] });
            }
            if (out.length === 0) {
                this.logger.debug('Dry run extract returned 0 records', {
                    stepKey: step.key,
                    adapterCode: getAdapterCode(step),
                });
            }
            return { records: out, processed: out.length, samples };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            dryRunCtx.errors.push(`[${step.key || 'extract'}] ${msg}`);
            this.logger.error('Dry run extract failed', err instanceof Error ? err : undefined, { stepKey: step.key });
            return { records: [], processed: 0, samples };
        }
    }

    /**
     * Simulate transform step in dry run
     */
    private async simulateTransformStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        executorCtx: ExecutorContext,
        stepLabel: string,
    ): Promise<{
        records: RecordObject[];
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const beforeSamples = records.slice(0, this.DRY_RUN_SAMPLE_LIMIT).map(r => ({ ...r }));
        const transformed = await this.transformExecutor.executeOperator(ctx, step, records, executorCtx);
        const samples = this.collectSamplePairs(step, beforeSamples, transformed, stepLabel);
        return { records: transformed, samples };
    }

    /**
     * Simulate validate step in dry run
     */
    private async simulateValidateStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
    ): Promise<{
        records: RecordObject[];
        samples: Array<{ step: string; before: RecordObject; after: RecordObject }>;
    }> {
        const beforeSamples = records.slice(0, this.DRY_RUN_SAMPLE_LIMIT).map(r => ({ ...r }));
        const validated = await this.transformExecutor.executeValidate(ctx, step, records);
        const samples = this.collectSamplePairs(step, beforeSamples, validated, 'validate');
        return { records: validated, samples };
    }

    /**
     * Simulate load step in dry run
     */
    private async simulateLoadStep(
        ctx: RequestContext,
        step: PipelineDefinition['steps'][number],
        records: RecordObject[],
        details: JsonObject[],
    ): Promise<void> {
        const sim = await this.loadExecutor.simulate(ctx, step, records);
        const adapterCode = getAdapterCode(step);
        details.push({
            stepKey: step.key,
            ...(adapterCode ? { adapterCode } : {}),
            ...sim,
        });
    }

    /**
     * Collect before/after sample pairs for dry run reporting
     */
    private collectSamplePairs(
        step: PipelineDefinition['steps'][number],
        beforeSamples: RecordObject[],
        afterRecords: RecordObject[],
        stepLabel: string,
    ): Array<{ step: string; before: RecordObject; after: RecordObject }> {
        const samples: Array<{ step: string; before: RecordObject; after: RecordObject }> = [];
        for (let i = 0; i < Math.min(beforeSamples.length, afterRecords.length); i++) {
            samples.push({
                step: step.key || step.name || stepLabel,
                before: beforeSamples[i],
                after: afterRecords[i],
            });
        }
        return samples;
    }

    /**
     * Build the final dry run report with metrics
     */
    private buildDryRunReport(
        processed: number,
        details: JsonObject[],
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>,
        errors: string[],
    ): {
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        errors?: string[];
    } {
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
                details,
            },
            sampleRecords,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    // ============================================================
    // Context and Checkpoint Helpers
    // ============================================================

    private async resolvePipelineContext(
        ctx: RequestContext,
        definition: PipelineDefinition,
    ): Promise<RequestContext> {
        const channelFromContext = definition.context?.channel;
        const langFromContext = definition.context?.contentLanguage;

        if (channelFromContext || langFromContext) {
            // Extract channel token from context if available
            const channelToken = channelFromContext ?? ctx.channel?.token;
            const req = await this.requestContextService.create({
                apiType: ctx.apiType,
                channelOrToken: channelToken,
                languageCode: langFromContext as import('@vendure/core').LanguageCode | undefined,
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
                this.cpData = (cp?.data ?? {}) as CheckpointData;
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
            step: PipelineDefinition['steps'][number],
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
