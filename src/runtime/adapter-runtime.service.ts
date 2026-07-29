import { Injectable } from '@nestjs/common';
import { RequestContext, RequestContextService, ID } from '@vendure/core';
import {
    DryRunRecordError,
    PipelineDefinition,
    PipelineMetrics,
    JsonObject,
} from '../types/index';
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
    SeededGraphInput,
    replayFromStepLinear,
    replayFromStepGraph,
    executeLoadWithThroughput,
    resolveEffectiveStepContext,
} from './orchestration';
import {
    CheckpointManager,
    ExecutionLifecycleManager,
    DryRunSimulator,
    createStepLogCallback,
} from './helpers';

export interface PipelineExecutionOptions {
    resume?: boolean;
    resetCheckpoint?: boolean;
    pipelineCode?: string;
    seed?: SeededGraphInput;
}

@Injectable()
export class AdapterRuntimeService {
    private readonly logger: DataHubLogger;
    private readonly dryRunSimulator: DryRunSimulator;

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
        private gateExecutor: GateExecutor,
        private executionLogger: ExecutionLogger,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ADAPTER_RUNTIME);
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
    private createExecutorContext(
        checkpointManager: CheckpointManager,
        definition?: PipelineDefinition,
        onCancelRequested?: () => Promise<boolean>,
        runId?: ID,
    ): ExecutorContext {
        return {
            runId,
            cpData: checkpointManager.getCheckpointData(),
            cpDirty: checkpointManager.isCheckpointDirty(),
            markCheckpointDirty: () => checkpointManager.markCheckpointDirty(),
            errorHandling: definition?.context?.errorHandling,
            onCancelRequested,
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
        options?: PipelineExecutionOptions,
    ): Promise<{ processed: number; succeeded: number; failed: number; skipped: number; sourceRecords: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string }> {
        // If graph edges are defined, use graph-aware execution
        if (options?.seed && (!Array.isArray(definition.edges) || definition.edges.length === 0)) {
            throw new Error('Seeded pipeline execution requires graph edges');
        }
        if (Array.isArray(definition.edges) && definition.edges.length > 0) {
            return this.executePipelineGraph(ctx, definition, onCancelRequested, onRecordError, pipelineId, runId, options);
        }

        const { checkpointManager, executionLifecycle } = this.createExecutionScope();
        const pipelineCtx = await executionLifecycle.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );
        const executorCtx = this.createExecutorContext(
            checkpointManager,
            definition,
            onCancelRequested,
            runId,
        );
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
            pipelineCode: options?.pipelineCode,
            runId,
            stepLog,
        });

        return executionLifecycle.finalizeExecution(ctx, definition, result, pipelineId);
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
        options?: PipelineExecutionOptions,
    ): Promise<{ processed: number; succeeded: number; failed: number; skipped: number; sourceRecords: number; details?: JsonObject[]; paused?: boolean; pausedAtStep?: string }> {
        const { checkpointManager, executionLifecycle } = this.createExecutionScope();
        const pipelineCtx = await executionLifecycle.prepareExecution(
            ctx, definition, pipelineId, runId, options,
        );
        const executorCtx = this.createExecutorContext(
            checkpointManager,
            definition,
            onCancelRequested,
            runId,
        );
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
            pipelineCode: options?.pipelineCode,
            runId,
            stepLog,
            seed: options?.seed,
        });

        return executionLifecycle.finalizeExecution(ctx, definition, result, pipelineId);
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
    ): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
        const { checkpointManager, executionLifecycle } = this.createExecutionScope();
        const executorCtx = this.createExecutorContext(checkpointManager, definition);
        const pipelineCtx = await executionLifecycle.resolvePipelineContext(ctx, definition);

        // Use graph replay if edges are defined
        if (Array.isArray(definition.edges) && definition.edges.length > 0) {
            return replayFromStepGraph({
                ctx: pipelineCtx,
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
            ctx: pipelineCtx,
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
        recordLimit?: number,
        initialRecords: readonly Record<string, unknown>[] = [],
    ): Promise<{
        metrics: PipelineMetrics;
        sampleRecords: Array<{ step: string; before: RecordObject; after: RecordObject }>;
        outputRecords: RecordObject[];
        errors?: DryRunRecordError[];
    }> {
        return this.dryRunSimulator.executeDryRun(
            ctx,
            definition,
            recordLimit,
            initialRecords,
        );
    }


    private createExecutionScope(): {
        checkpointManager: CheckpointManager;
        executionLifecycle: ExecutionLifecycleManager;
    } {
        const checkpointManager = new CheckpointManager(this.checkpointService, this.logger);
        return {
            checkpointManager,
            executionLifecycle: new ExecutionLifecycleManager(
                this.requestContextService,
                checkpointManager,
                this.hookService,
                this.domainEvents,
                this.logger,
            ),
        };
    }

    private applyIdempotency(records: RecordObject[], definition: PipelineDefinition): RecordObject[] {
        const keyPath = definition.context?.idempotencyKeyField;
        if (!keyPath) return records;

        const seen = new Set<string>();
        return records.filter(r => {
            const fieldValue = getPath(r, keyPath);
            if (fieldValue == null) return true;
            const key = String(fieldValue);
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
            pipelineContext?: import('../types/index').PipelineContext,
        ) => executeLoadWithThroughput({
            ctx,
            step,
            batch,
            definition,
            loadExecutor: this.loadExecutor,
            onRecordError,
            pipelineContext: pipelineContext ?? resolveEffectiveStepContext(
                ctx,
                definition.context,
                step.context,
            ),
        });
    }
}
