import type { ID, RequestContext } from '@vendure/core';
import type {
    ParallelExecutionConfig,
    PipelineDefinition,
    PipelineEdge,
    PipelineStepDefinition,
} from '../../types';
import type {
    BranchOutput,
    ExecutorContext,
    LoaderExecutionResult,
    OnRecordErrorCallback,
    RecordObject,
} from '../executor-types';
import type {
    ExportExecutor,
    ExtractExecutor,
    FeedExecutor,
    GateExecutor,
    LoadExecutor,
    SinkExecutor,
    TransformExecutor,
} from '../executors';
import type { HookService } from '../../services/events/hook.service';
import type { DomainEventsService } from '../../services/events/domain-events.service';
import type {
    StepExecutionResult,
    StepLogCallback,
    TopologyData,
} from './types';
import { buildTopology, gatherInput } from './helpers';
import {
    createStepDispatcher,
    type StepDispatcher,
    type StepExecutionParams,
} from './step-strategies';
import { StepType } from '../../constants/enums';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { PARALLEL_EXECUTION } from '../../constants/defaults/runtime-defaults';
import { DataHubLoggerFactory } from '../../services/logger';
import type { SeededGraphInput } from './seeded-graph';

export const graphLogger = DataHubLoggerFactory.create(
    LOGGER_CONTEXTS.GRAPH_EXECUTOR,
);

export interface ExecuteGraphParams {
    ctx: RequestContext;
    definition: PipelineDefinition;
    executorCtx: ExecutorContext;
    hookService: HookService;
    domainEvents: DomainEventsService;
    extractExecutor: ExtractExecutor;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    gateExecutor: GateExecutor;
    loadWithThroughput: (
        ctx: RequestContext,
        step: PipelineStepDefinition,
        batch: RecordObject[],
        definition: PipelineDefinition,
        onRecordError?: OnRecordErrorCallback,
    ) => Promise<LoaderExecutionResult>;
    applyIdempotency: (
        records: RecordObject[],
        definition: PipelineDefinition,
    ) => RecordObject[];
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    pipelineCode?: string;
    runId?: ID;
    stepLog?: StepLogCallback;
    seed?: SeededGraphInput;
}

export interface ExecutionMetrics {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    details: Array<import('../../types').JsonObject>;
    counters: Record<string, number>;
    paused?: boolean;
    pausedAtStep?: string;
    cancelled?: boolean;
}

interface ExecutionOrderContext {
    stepByKey: Map<string, PipelineStepDefinition>;
    edges: PipelineEdge[];
    topology: TopologyData;
}

export function buildExecutionOrder(
    definition: PipelineDefinition,
): ExecutionOrderContext {
    const stepByKey = new Map(
        definition.steps.map(step => [step.key, step]),
    );
    const edges = definition.edges ?? [];
    return {
        stepByKey,
        edges,
        topology: buildTopology(definition.steps, edges),
    };
}

export function collectNodeOutputs(
    nodeKey: string,
    preds: TopologyData['preds'],
    outputs: Map<string, RecordObject[] | BranchOutput>,
): RecordObject[] {
    return gatherInput(nodeKey, preds, outputs);
}

export async function executeNode(
    stepDispatcher: StepDispatcher,
    params: StepExecutionParams,
): Promise<{ stepResult: StepExecutionResult; durationMs: number }> {
    const startedAt = Date.now();
    const stepResult = await stepDispatcher.executeStep(params);
    return { stepResult, durationMs: Date.now() - startedAt };
}

export function handleNodeError(
    error: Error,
    eventType: string,
    context: { stepKey?: string; pipelineId?: ID },
): void {
    const message = `Failed to publish ${eventType} event: ${error?.message}`;
    if (context.stepKey) {
        graphLogger.warn(message, { stepKey: context.stepKey, eventType });
        return;
    }
    graphLogger.warn(message, { pipelineId: context.pipelineId });
}

export function updateMetrics(
    metrics: ExecutionMetrics,
    stepResult: StepExecutionResult,
    durationMs: number,
): void {
    metrics.details.push({ ...stepResult.detail, durationMs });
    metrics.processed += stepResult.processed;
    metrics.succeeded += stepResult.succeeded;
    metrics.failed += stepResult.failed;
    metrics.skipped += stepResult.skipped;
    for (const [key, value] of Object.entries(stepResult.counters)) {
        metrics.counters[key] = (metrics.counters[key] ?? 0) + value;
    }
}

export function processNeighborIndegrees(
    completedKey: string,
    edges: PipelineEdge[],
    indeg: TopologyData['indeg'],
    queue: string[],
): void {
    for (const edge of edges) {
        if (edge.from !== completedKey) continue;
        indeg.set(edge.to, (indeg.get(edge.to) ?? 1) - 1);
        if ((indeg.get(edge.to) ?? 0) === 0) {
            queue.push(edge.to);
        }
    }
}

export function createInitialMetrics(): ExecutionMetrics {
    return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        details: [],
        counters: {
            extracted: 0,
            transformed: 0,
            validated: 0,
            enriched: 0,
            routed: 0,
            loaded: 0,
            rejected: 0,
        },
    };
}

export function publishRunProgress(
    params: ExecuteGraphParams,
    metrics: ExecutionMetrics,
    completedCount: number,
    totalSteps: number,
    currentStepKey: string,
): void {
    if (!params.runId) return;
    const progressPercent = totalSteps > 0
        ? Math.round((completedCount / totalSteps) * 100)
        : 0;

    try {
        params.domainEvents.publishRunProgress(
            String(params.runId),
            params.pipelineCode ?? params.definition.name ?? '',
            progressPercent,
            `Completed step ${completedCount}/${totalSteps}: ${currentStepKey}`,
            metrics.processed,
            metrics.failed,
            currentStepKey,
        );
    } catch (error) {
        handleNodeError(error as Error, 'PipelineRunProgress', {
            stepKey: currentStepKey,
            pipelineId: params.pipelineId,
        });
    }
}

export function handleGatePause(
    key: string,
    step: PipelineStepDefinition | undefined,
    stepResult: StepExecutionResult,
    metrics: ExecutionMetrics,
    params: { pipelineId?: ID; runId?: ID },
    domainEvents: DomainEventsService,
): boolean {
    if (
        step?.type !== StepType.GATE
        || stepResult.detail?.['shouldPause'] !== true
    ) {
        return false;
    }

    metrics.paused = true;
    metrics.pausedAtStep = key;
    graphLogger.log(
        `Pipeline paused at GATE step "${key}" - awaiting approval`,
    );
    try {
        domainEvents.publish('PipelinePaused', {
            pipelineId: params.pipelineId,
            runId: params.runId,
            stepKey: key,
            pausedAt: new Date().toISOString(),
        });
    } catch (error) {
        handleNodeError(error as Error, 'PipelinePaused', { stepKey: key });
    }
    return true;
}

export function createDispatcher(params: ExecuteGraphParams): StepDispatcher {
    return createStepDispatcher({
        extractExecutor: params.extractExecutor,
        transformExecutor: params.transformExecutor,
        loadExecutor: params.loadExecutor,
        exportExecutor: params.exportExecutor,
        feedExecutor: params.feedExecutor,
        sinkExecutor: params.sinkExecutor,
        gateExecutor: params.gateExecutor,
        loadWithThroughput: params.loadWithThroughput,
        applyIdempotency: params.applyIdempotency,
    });
}

const DEFAULT_PARALLEL_CONFIG: Required<ParallelExecutionConfig> = {
    enabled: false,
    maxConcurrentSteps: PARALLEL_EXECUTION.DEFAULT_MAX_CONCURRENT_STEPS,
    errorPolicy: 'FAIL_FAST',
};

export function getParallelConfig(
    definition: PipelineDefinition,
): Required<ParallelExecutionConfig> {
    const config = definition.context?.parallelExecution;
    const maxConcurrentSteps = config?.maxConcurrentSteps
        ?? DEFAULT_PARALLEL_CONFIG.maxConcurrentSteps;
    if (
        !Number.isSafeInteger(maxConcurrentSteps)
        || maxConcurrentSteps < 1
        || maxConcurrentSteps > PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS
    ) {
        throw new Error(
            `parallelExecution.maxConcurrentSteps must be an integer from 1 to ${PARALLEL_EXECUTION.MAX_CONCURRENT_STEPS}`,
        );
    }

    const errorPolicy = config?.errorPolicy ?? DEFAULT_PARALLEL_CONFIG.errorPolicy;
    if (!PARALLEL_EXECUTION.ERROR_POLICIES.some(policy => policy === errorPolicy)) {
        throw new Error(
            `parallelExecution.errorPolicy must be one of ${PARALLEL_EXECUTION.ERROR_POLICIES.join(', ')}`,
        );
    }
    return {
        enabled: config?.enabled ?? DEFAULT_PARALLEL_CONFIG.enabled,
        maxConcurrentSteps,
        errorPolicy,
    };
}
