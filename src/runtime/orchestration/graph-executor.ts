/**
 * Graph Executor
 *
 * Graph-based pipeline execution where steps can have
 * complex dependencies via edges (DAG topology).
 *
 * Step execution uses strategies from ./step-strategies/.
 */

import { Logger } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition, PipelineEdge, ParallelExecutionConfig } from '../../types/index';
import {
    RecordObject,
    BranchOutput,
    OnRecordErrorCallback,
    ExecutorContext,
} from '../executor-types';
import {
    ExtractExecutor,
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
    GateExecutor,
} from '../executors';
import { HookService } from '../../services/events/hook.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import {
    GraphExecutionResult,
    StepLogCallback,
    StepExecutionResult,
    TopologyData,
} from './types';
import { buildTopology, gatherInput } from './helpers';
import { createStepDispatcher, StepDispatcher, StepExecutionParams } from './step-strategies';
import { getErrorMessage } from '../../utils/error.utils';
import { StepType as StepTypeEnum } from '../../constants/enums';

const logger = new Logger('DataHub:GraphExecutor');

export type { GraphExecutionResult };

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for executeGraph function
 */
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
    ) => Promise<{ ok: number; fail: number }>;
    applyIdempotency: (records: RecordObject[], definition: PipelineDefinition) => RecordObject[];
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    runId?: ID;
    /** Optional step logging callback for database persistence */
    stepLog?: StepLogCallback;
}

/**
 * Execution order context returned by buildExecutionOrder
 */
interface ExecutionOrderContext {
    stepByKey: Map<string, PipelineStepDefinition>;
    edges: PipelineEdge[];
    topology: TopologyData;
}

/**
 * Aggregated metrics during execution
 */
interface ExecutionMetrics {
    processed: number;
    succeeded: number;
    failed: number;
    details: Array<import('../../types/index').JsonObject>;
    counters: Record<string, number>;
    paused?: boolean;
    pausedAtStep?: string;
}

/**
 * Node execution result with timing
 */
interface NodeExecutionResult {
    stepResult: StepExecutionResult;
    durationMs: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds the execution order using topological sort
 * Returns the step lookup map, edges, and topology data
 */
function buildExecutionOrder(definition: PipelineDefinition): ExecutionOrderContext {
    const steps = definition.steps;
    const stepByKey = new Map<string, PipelineStepDefinition>();
    for (const s of steps) {
        stepByKey.set(s.key, s);
    }

    const edges = definition.edges ?? [];
    const topology = buildTopology(steps, edges);

    return { stepByKey, edges, topology };
}

/**
 * Collects outputs from predecessor nodes for the given node
 */
function collectNodeOutputs(
    nodeKey: string,
    preds: TopologyData['preds'],
    outputs: Map<string, RecordObject[] | BranchOutput>,
): RecordObject[] {
    return gatherInput(nodeKey, preds, outputs);
}

/**
 * Executes a single node and returns the result with timing
 */
async function executeNode(
    stepDispatcher: StepDispatcher,
    params: StepExecutionParams,
): Promise<NodeExecutionResult> {
    const t0 = Date.now();
    const stepResult = await stepDispatcher.executeStep(params);
    return {
        stepResult,
        durationMs: Date.now() - t0,
    };
}

/**
 * Logs errors that occur when publishing domain events.
 */
function handleNodeError(
    error: Error,
    eventType: string,
    context: { stepKey?: string; pipelineId?: ID },
): void {
    const message = `Failed to publish ${eventType} event: ${error?.message}`;
    if (context.stepKey) {
        logger.warn(message, { stepKey: context.stepKey, eventType });
    } else {
        logger.warn(message, { pipelineId: context.pipelineId });
    }
}

/**
 * Updates metrics with step execution result
 */
function updateMetrics(
    metrics: ExecutionMetrics,
    stepResult: StepExecutionResult,
    durationMs: number,
): void {
    metrics.details.push({ ...stepResult.detail, durationMs });
    metrics.processed += stepResult.processed;
    metrics.succeeded += stepResult.succeeded;
    metrics.failed += stepResult.failed;

    for (const [k, v] of Object.entries(stepResult.counters)) {
        metrics.counters[k] = (metrics.counters[k] ?? 0) + v;
    }
}

/**
 * Processes neighbor indegrees after a node completes
 */
function processNeighborIndegrees(
    completedKey: string,
    edges: PipelineEdge[],
    indeg: TopologyData['indeg'],
    queue: string[],
): void {
    for (const e of (edges ?? [])) {
        if (e.from === completedKey) {
            indeg.set(e.to, (indeg.get(e.to) ?? 1) - 1);
            if ((indeg.get(e.to) ?? 0) === 0) {
                queue.push(e.to);
            }
        }
    }
}

/**
 * Creates initial execution metrics
 */
function createInitialMetrics(): ExecutionMetrics {
    return {
        processed: 0,
        succeeded: 0,
        failed: 0,
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

/**
 * Publish run progress event after each step completes in graph execution
 */
function publishRunProgress(
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
            params.definition.name ?? '',
            progressPercent,
            `Completed step ${completedCount}/${totalSteps}: ${currentStepKey}`,
            metrics.processed,
            metrics.failed,
            currentStepKey,
        );
    } catch (error) {
        handleNodeError(error as Error, 'PipelineRunProgress', { stepKey: currentStepKey, pipelineId: params.pipelineId });
    }
}

/**
 * Creates step dispatcher from execution params
 */
function createDispatcher(params: ExecuteGraphParams): StepDispatcher {
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

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Default parallel execution configuration
 */
const DEFAULT_PARALLEL_CONFIG: Required<ParallelExecutionConfig> = {
    enabled: false,
    maxConcurrentSteps: 4,
    errorPolicy: 'FAIL_FAST',
};

/**
 * Get parallel execution config from definition
 */
function getParallelConfig(definition: PipelineDefinition): Required<ParallelExecutionConfig> {
    const config = definition.context?.parallelExecution;
    return {
        enabled: config?.enabled ?? DEFAULT_PARALLEL_CONFIG.enabled,
        maxConcurrentSteps: config?.maxConcurrentSteps ?? DEFAULT_PARALLEL_CONFIG.maxConcurrentSteps,
        errorPolicy: config?.errorPolicy ?? DEFAULT_PARALLEL_CONFIG.errorPolicy,
    };
}

/**
 * Executes a graph-based pipeline using topological sort
 * Supports both sequential and parallel execution modes
 */
export async function executeGraph(params: ExecuteGraphParams): Promise<GraphExecutionResult> {
    const { definition, domainEvents, onCancelRequested, pipelineId } = params;

    const stepDispatcher = createDispatcher(params);
    const { stepByKey, edges, topology } = buildExecutionOrder(definition);
    const { preds, indeg, queue } = topology;

    // Get parallel execution configuration
    const parallelConfig = getParallelConfig(definition);

    // Run PIPELINE_STARTED hook (mirrors linear executor's publishPipelineStarted)
    await params.hookService.run(params.ctx, definition, 'PIPELINE_STARTED');

    // Publish pipeline started event
    try {
        domainEvents.publish('PIPELINE_STARTED', { pipelineId });
    } catch (error) {
        handleNodeError(error as Error, 'PIPELINE_STARTED', { pipelineId });
    }

    const metrics = createInitialMetrics();
    const outputs = new Map<string, RecordObject[] | BranchOutput>();

    // Choose execution strategy based on configuration
    if (parallelConfig.enabled) {
        await executeParallel(
            queue, stepByKey, edges, preds, indeg, outputs, metrics,
            stepDispatcher, params, parallelConfig, onCancelRequested,
        );
    } else {
        await executeSequential(
            queue, stepByKey, edges, preds, indeg, outputs, metrics,
            stepDispatcher, params, onCancelRequested,
        );
    }

    return metrics;
}

/**
 * Sequential execution - processes one step at a time
 */
async function executeSequential(
    queue: string[],
    stepByKey: Map<string, PipelineStepDefinition>,
    edges: PipelineEdge[],
    preds: TopologyData['preds'],
    indeg: TopologyData['indeg'],
    outputs: Map<string, RecordObject[] | BranchOutput>,
    metrics: ExecutionMetrics,
    stepDispatcher: StepDispatcher,
    params: ExecuteGraphParams,
    onCancelRequested?: () => Promise<boolean>,
): Promise<void> {
    const { ctx, definition, executorCtx, hookService, domainEvents, onRecordError, pipelineId, runId, stepLog } = params;

    const pipelineIdStr = pipelineId?.toString();
    const runIdStr = runId?.toString();
    const totalSteps = stepByKey.size;
    let completedCount = 0;

    while (queue.length) {
        const key = queue.shift();
        if (key === undefined) break;
        const step = stepByKey.get(key);
        if (!step) continue;
        if (onCancelRequested && (await onCancelRequested())) break;

        // Publish StepStarted event (typed helper already wraps in try/catch)
        domainEvents.publishStepStarted(pipelineIdStr, runIdStr, key, step.type);

        let stepResult: StepExecutionResult;
        let durationMs: number;
        try {
            const input = collectNodeOutputs(key, preds, outputs);
            const nodeResult = await executeNode(stepDispatcher, {
                ctx, definition, step, key, input, executorCtx, hookService, domainEvents, onRecordError, pipelineId, runId, stepLog,
            });
            stepResult = nodeResult.stepResult;
            durationMs = nodeResult.durationMs;
        } catch (error) {
            // Publish StepFailed event (typed helper already wraps in try/catch)
            domainEvents.publishStepFailed(pipelineIdStr, runIdStr, key, step.type, getErrorMessage(error));
            throw error;
        }

        // Publish StepCompleted event (typed helper already wraps in try/catch)
        domainEvents.publishStepCompleted(pipelineIdStr, runIdStr, key, step.type, stepResult.processed);

        outputs.set(key, stepResult.output);
        updateMetrics(metrics, stepResult, durationMs);

        // Publish run progress
        completedCount++;
        publishRunProgress(params, metrics, completedCount, totalSteps, key);

        if (stepResult.event) {
            try {
                domainEvents.publish(stepResult.event.type, stepResult.event.data);
            } catch (error) {
                handleNodeError(error as Error, stepResult.event.type, { stepKey: key });
            }
        }

        // Check if a GATE step requested a pause
        if (step?.type === StepTypeEnum.GATE && stepResult.detail?.['shouldPause'] === true) {
            metrics.paused = true;
            metrics.pausedAtStep = key;
            logger.log(`Pipeline paused at GATE step "${key}" - awaiting approval`);
            try {
                domainEvents.publish('PipelinePaused', {
                    pipelineId,
                    runId,
                    stepKey: key,
                    pausedAt: new Date().toISOString(),
                });
            } catch (error) {
                handleNodeError(error as Error, 'PipelinePaused', { stepKey: key });
            }
            break;
        }

        processNeighborIndegrees(key, edges, indeg, queue);
    }
}

/**
 * Parallel execution - processes independent steps concurrently
 */
async function executeParallel(
    queue: string[],
    stepByKey: Map<string, PipelineStepDefinition>,
    edges: PipelineEdge[],
    preds: TopologyData['preds'],
    indeg: TopologyData['indeg'],
    outputs: Map<string, RecordObject[] | BranchOutput>,
    metrics: ExecutionMetrics,
    stepDispatcher: StepDispatcher,
    params: ExecuteGraphParams,
    parallelConfig: Required<ParallelExecutionConfig>,
    onCancelRequested?: () => Promise<boolean>,
): Promise<void> {
    const { ctx, definition, executorCtx, hookService, domainEvents, onRecordError, pipelineId, runId, stepLog } = params;
    const pipelineIdStr = pipelineId?.toString();
    const runIdStr = runId?.toString();

    // Track in-flight step executions
    const inFlight = new Map<string, Promise<{ key: string; stepResult: StepExecutionResult; durationMs: number }>>();
    const errors: Array<{ key: string; error: unknown }> = [];
    let cancelled = false;
    const totalSteps = stepByKey.size;
    let completedCount = 0;

    while (queue.length > 0 || inFlight.size > 0) {
        // Check for cancellation
        if (onCancelRequested && (await onCancelRequested())) {
            cancelled = true;
            break;
        }

        // Check for fail-fast error
        if (parallelConfig.errorPolicy === 'FAIL_FAST' && errors.length > 0) {
            break;
        }

        // Start new steps up to max concurrency
        while (queue.length > 0 && inFlight.size < parallelConfig.maxConcurrentSteps) {
            const key = queue.shift();
            if (key === undefined) break;
            const step = stepByKey.get(key);
            if (!step) continue;

            const input = collectNodeOutputs(key, preds, outputs);

            // Publish StepStarted event (typed helper already wraps in try/catch)
            domainEvents.publishStepStarted(pipelineIdStr, runIdStr, key, step.type);

            logger.debug(`[Parallel] Starting step: ${key}`, {
                step: key,
                inFlightCount: inFlight.size,
                queueLength: queue.length,
            });

            const stepType = step.type;
            const promise = executeNode(stepDispatcher, {
                ctx, definition, step, key, input, executorCtx, hookService, domainEvents, onRecordError, pipelineId, runId, stepLog,
            })
                .then(({ stepResult, durationMs }) => ({ key, stepResult, durationMs }))
                .catch((error: unknown) => {
                    errors.push({ key, error });
                    // Publish StepFailed event (typed helper already wraps in try/catch)
                    domainEvents.publishStepFailed(pipelineIdStr, runIdStr, key, stepType, getErrorMessage(error));
                    // Return empty result on error
                    return {
                        key,
                        stepResult: {
                            output: [] as RecordObject[],
                            processed: 0,
                            succeeded: 0,
                            failed: 0,
                            detail: { error: getErrorMessage(error) },
                            counters: {},
                        } as StepExecutionResult,
                        durationMs: 0,
                    };
                });

            inFlight.set(key, promise);
        }

        // Wait for at least one step to complete
        if (inFlight.size > 0) {
            const completedResult = await Promise.race(inFlight.values());
            const { key, stepResult, durationMs } = completedResult;

            // Remove from in-flight
            inFlight.delete(key);

            logger.debug(`[Parallel] Completed step: ${key}`, {
                step: key,
                inFlightCount: inFlight.size,
                processed: stepResult.processed,
                durationMs,
            });

            // Publish StepCompleted event (only if the step didn't already fail)
            const completedStepDef = stepByKey.get(key);
            if (!stepResult.detail?.['error']) {
                // Typed helper already wraps in try/catch
                domainEvents.publishStepCompleted(pipelineIdStr, runIdStr, key, completedStepDef?.type ?? '', stepResult.processed);
            }

            // Store output and update metrics
            outputs.set(key, stepResult.output);
            updateMetrics(metrics, stepResult, durationMs);

            // Publish run progress
            completedCount++;
            publishRunProgress(params, metrics, completedCount, totalSteps, key);

            // Publish domain event if any
            if (stepResult.event) {
                try {
                    domainEvents.publish(stepResult.event.type, stepResult.event.data);
                } catch (error) {
                    handleNodeError(error as Error, stepResult.event.type, { stepKey: key });
                }
            }

            // Check if a GATE step requested a pause
            const completedStep = stepByKey.get(key);
            if (completedStep?.type === StepTypeEnum.GATE && stepResult.detail?.['shouldPause'] === true) {
                metrics.paused = true;
                metrics.pausedAtStep = key;
                logger.log(`[Parallel] Pipeline paused at GATE step "${key}" - awaiting approval`);
                try {
                    domainEvents.publish('PipelinePaused', {
                        pipelineId,
                        runId,
                        stepKey: key,
                        pausedAt: new Date().toISOString(),
                    });
                } catch (error) {
                    handleNodeError(error as Error, 'PipelinePaused', { stepKey: key });
                }
                break;
            }

            // Update indegrees and add newly ready steps to queue
            processNeighborIndegrees(key, edges, indeg, queue);
        }
    }

    // Drain remaining in-flight promises and collect their metrics
    if (inFlight.size > 0) {
        const settled = await Promise.allSettled(inFlight.values());
        for (const result of settled) {
            if (result.status === 'fulfilled') {
                const { key, stepResult, durationMs } = result.value;
                outputs.set(key, stepResult.output);
                updateMetrics(metrics, stepResult, durationMs);

                const settledStep = stepByKey.get(key);
                if (!stepResult.detail?.['error']) {
                    domainEvents.publishStepCompleted(pipelineIdStr, runIdStr, key, settledStep?.type ?? '', stepResult.processed);
                }
                completedCount++;
                publishRunProgress(params, metrics, completedCount, totalSteps, key);

                if (stepResult.event) {
                    try {
                        domainEvents.publish(stepResult.event.type, stepResult.event.data);
                    } catch (error) {
                        handleNodeError(error as Error, stepResult.event.type, { stepKey: key });
                    }
                }

                logger.debug(`[Parallel] Drained in-flight step: ${key}`, {
                    step: key,
                    processed: stepResult.processed,
                    durationMs,
                });
            }
        }
        inFlight.clear();
    }

    // Handle collected errors based on policy
    if (errors.length > 0) {
        if (parallelConfig.errorPolicy === 'BEST_EFFORT') {
            // Log errors but don't throw
            for (const { key, error } of errors) {
                logger.warn(`[Parallel] Step ${key} failed (best-effort mode): ${getErrorMessage(error)}`);
            }
        } else {
            // Throw the first error
            const firstError = errors[0];
            throw new Error(`Parallel execution failed at step "${firstError.key}": ${getErrorMessage(firstError.error)}`);
        }
    }

    if (cancelled) {
        logger.log('[Parallel] Execution cancelled');
        try {
            domainEvents.publish('PipelineRunCancelled', {
                pipelineId: pipelineIdStr,
                runId: runIdStr,
                cancelledAt: new Date().toISOString(),
            });
        } catch (error) {
            handleNodeError(error as Error, 'PipelineRunCancelled', { pipelineId });
        }
    }
}
