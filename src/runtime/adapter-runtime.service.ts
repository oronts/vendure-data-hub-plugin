import { Injectable } from '@nestjs/common';
import { RequestContext, RequestContextService, ID } from '@vendure/core';
import { PipelineDefinition, PipelineMetrics, JsonObject } from '../types/index';
import { CheckpointService } from '../services/data/checkpoint.service';
import { HookService } from '../services/events/hook.service';
import { DomainEventsService } from '../services/events/domain-events.service';
import { DataHubLogger, DataHubLoggerFactory, ExecutionLogger } from '../services/logger';
import { LOGGER_CONTEXTS } from '../constants/index';
import {
    RecordObject,
    OnRecordErrorCallback,
    ExecutorContext,
} from './executor-types';
import {
    ExtractExecutor,
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
    GateExecutor,
} from './executors';
import { getPath } from './utils';
import {
    executeGraph,
    executeLinear,
    executeWithSeed,
    replayFromStepLinear,
    replayFromStepGraph,
    executeLoadWithThroughput,
} from './orchestration';
import {
    CheckpointManager,
    ExecutionLifecycleManager,
    DryRunSimulator,
    createStepLogCallback,
} from './helpers';

@Injectable()
export class AdapterRuntimeService {
    private readonly logger: DataHubLogger;
    private readonly checkpointManager: CheckpointManager;
    private readonly executionLifecycle: ExecutionLifecycleManager;
    private readonly dryRunSimulator: DryRunSimulator;

    constructor(
        private requestContextService: RequestContextService,
        checkpointService: CheckpointService,
        private hookService: HookService,
        private domainEvents: DomainEventsService,
        private extractExecutor: ExtractExecutor,
        private transformExecutor: TransformExecutor,
        private loadExecutor: LoadExecutor,
        private exportExecutor: ExportExecutor,
        private feedExecutor: FeedExecutor,
        private sinkExecutor: SinkExecutor,
        private gateExecutor: GateExecutor,
        private executionLogger: ExecutionLogger,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ADAPTER_RUNTIME);
        this.checkpointManager = new CheckpointManager(checkpointService, this.logger);
        this.executionLifecycle = new ExecutionLifecycleManager(
            requestContextService,
            this.checkpointManager,
            hookService,
            domainEvents,
            this.logger,
        );
        this.dryRunSimulator = new DryRunSimulator(
            extractExecutor,
            transformExecutor,
            loadExecutor,
            this.logger,
        );
    }

    /**
     * Create the executor context for accessing checkpoint data and pipeline config
     */
    private createExecutorContext(definition?: PipelineDefinition): ExecutorContext {
        return {
            cpData: this.checkpointManager.getCheckpointData(),
            cpDirty: this.checkpointManager.isCheckpointDirty(),
            markCheckpointDirty: () => this.checkpointManager.markCheckpointDirty(),
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
    ): Promise<{ processed: number; succeeded: number; failed: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string }> {
        // If graph edges are defined, use graph-aware execution
        if (Array.isArray(definition.edges) && definition.edges.length > 0) {
            return this.executePipelineGraph(ctx, definition, onCancelRequested, onRecordError, pipelineId, runId, options);
        }

        const pipelineCtx = await this.executionLifecycle.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );
        const executorCtx = this.createExecutorContext(definition);
        const stepLog = createStepLogCallback(this.executionLogger, pipelineId, runId);

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
            gateExecutor: this.gateExecutor,
            loadWithThroughput: this.createLoadWithThroughput(),
            applyIdempotency: this.applyIdempotency.bind(this),
            onCancelRequested,
            onRecordError,
            pipelineId,
            runId,
            stepLog,
        });

        return this.executionLifecycle.finalizeExecution(ctx, definition, result, pipelineId);
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
        const pipelineCtx = await this.executionLifecycle.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );
        const executorCtx = this.createExecutorContext(definition);
        const stepLog = createStepLogCallback(this.executionLogger, pipelineId, runId);

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
            gateExecutor: this.gateExecutor,
            loadWithThroughput: this.createLoadWithThroughput(),
            applyIdempotency: this.applyIdempotency.bind(this),
            onCancelRequested,
            onRecordError,
            pipelineId,
            runId,
            stepLog,
        });

        return this.executionLifecycle.finalizeExecution(ctx, definition, result, pipelineId);
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
        return this.dryRunSimulator.executeDryRun(ctx, definition);
    }

    /**
     * Apply idempotency filter to records
     */
    private applyIdempotency(records: RecordObject[], definition: PipelineDefinition): RecordObject[] {
        const keyPath = definition.context?.idempotencyKeyField;
        if (!keyPath) return records;

        const seen = new Set<string>();
        return records.filter(r => {
            const fieldValue = getPath(r, keyPath);
            const key = fieldValue == null ? '' : String(fieldValue);
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
}
