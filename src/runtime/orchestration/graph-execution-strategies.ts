import type { PipelineEdge, PipelineStepDefinition, ParallelExecutionConfig } from '../../types';
import type { BranchOutput, RecordObject } from '../executor-types';
import type { StepExecutionResult, TopologyData } from './types';
import type { StepDispatcher } from './step-strategies';
import { getErrorMessage } from '../../utils/error.utils';
import {
    collectNodeOutputs,
    executeNode,
    graphLogger,
    handleGatePause,
    handleNodeError,
    processNeighborIndegrees,
    publishRunProgress,
    updateMetrics,
    type ExecuteGraphParams,
    type ExecutionMetrics,
} from './graph-execution-context';

interface ExecutionStrategyParams {
    queue: string[];
    stepByKey: Map<string, PipelineStepDefinition>;
    edges: PipelineEdge[];
    preds: TopologyData['preds'];
    indeg: TopologyData['indeg'];
    outputs: Map<string, RecordObject[] | BranchOutput>;
    metrics: ExecutionMetrics;
    stepDispatcher: StepDispatcher;
    params: ExecuteGraphParams;
    onCancelRequested?: () => Promise<boolean>;
}

export async function executeSequential(
    strategy: ExecutionStrategyParams,
): Promise<void> {
    const {
        queue,
        stepByKey,
        edges,
        preds,
        indeg,
        outputs,
        metrics,
        stepDispatcher,
        params,
        onCancelRequested,
    } = strategy;
    const {
        ctx,
        definition,
        executorCtx,
        hookService,
        domainEvents,
        onRecordError,
        pipelineId,
        runId,
        stepLog,
    } = params;
    const pipelineIdStr = pipelineId?.toString();
    const runIdStr = runId?.toString();
    const totalSteps = stepByKey.size;
    let completedCount = 0;

    while (queue.length > 0) {
        const key = queue.shift();
        if (key === undefined) break;
        const step = stepByKey.get(key);
        if (!step) continue;
        if (onCancelRequested && await onCancelRequested()) {
            metrics.cancelled = true;
            break;
        }

        domainEvents.publishStepStarted(pipelineIdStr, runIdStr, key, step.type);

        let stepResult: StepExecutionResult;
        let durationMs: number;
        try {
            const input = params.seed?.triggerKey === key
                ? params.seed.records
                : collectNodeOutputs(key, preds, outputs);
            const result = await executeNode(stepDispatcher, {
                ctx,
                definition,
                step,
                key,
                input,
                executorCtx,
                hookService,
                domainEvents,
                onRecordError,
                pipelineId,
                runId,
                stepLog,
                seedMode: params.seed?.mode,
            });
            stepResult = result.stepResult;
            durationMs = result.durationMs;
        } catch (error) {
            domainEvents.publishStepFailed(
                pipelineIdStr,
                runIdStr,
                key,
                step.type,
                getErrorMessage(error),
            );
            throw error;
        }

        domainEvents.publishStepCompleted(
            pipelineIdStr,
            runIdStr,
            key,
            step.type,
            stepResult.processed,
        );
        outputs.set(key, stepResult.output);
        updateMetrics(metrics, stepResult, durationMs);
        completedCount++;
        publishRunProgress(params, metrics, completedCount, totalSteps, key);

        publishStepEvent(domainEvents, stepResult, key);
        if (handleGatePause(
            key,
            step,
            stepResult,
            metrics,
            { pipelineId, runId },
            domainEvents,
        )) {
            break;
        }
        processNeighborIndegrees(key, edges, indeg, queue);
    }
}

export async function executeParallel(
    strategy: ExecutionStrategyParams,
    parallelConfig: Required<ParallelExecutionConfig>,
): Promise<void> {
    const {
        queue,
        stepByKey,
        edges,
        preds,
        indeg,
        outputs,
        metrics,
        stepDispatcher,
        params,
        onCancelRequested,
    } = strategy;
    const {
        ctx,
        definition,
        executorCtx,
        hookService,
        domainEvents,
        onRecordError,
        pipelineId,
        runId,
        stepLog,
    } = params;
    const pipelineIdStr = pipelineId?.toString();
    const runIdStr = runId?.toString();
    const inFlight = new Map<string, Promise<CompletedStep>>();
    const errors: Array<{ key: string; error: unknown }> = [];
    const totalSteps = stepByKey.size;
    let completedCount = 0;
    let cancelled = false;

    while (queue.length > 0 || inFlight.size > 0) {
        if (onCancelRequested && await onCancelRequested()) {
            cancelled = true;
            metrics.cancelled = true;
            break;
        }
        if (parallelConfig.errorPolicy === 'FAIL_FAST' && errors.length > 0) {
            break;
        }

        while (queue.length > 0 && inFlight.size < parallelConfig.maxConcurrentSteps) {
            const key = queue.shift();
            if (key === undefined) break;
            const step = stepByKey.get(key);
            if (!step) continue;
            const input = params.seed?.triggerKey === key
                ? params.seed.records
                : collectNodeOutputs(key, preds, outputs);

            domainEvents.publishStepStarted(pipelineIdStr, runIdStr, key, step.type);
            graphLogger.debug(`[Parallel] Starting step: ${key}`, {
                step: key,
                inFlightCount: inFlight.size,
                queueLength: queue.length,
            });

            const promise = executeNode(stepDispatcher, {
                ctx,
                definition,
                step,
                key,
                input,
                executorCtx,
                hookService,
                domainEvents,
                onRecordError,
                pipelineId,
                runId,
                stepLog,
                seedMode: params.seed?.mode,
            })
                .then(result => ({ key, ...result }))
                .catch((error: unknown) => {
                    errors.push({ key, error });
                    domainEvents.publishStepFailed(
                        pipelineIdStr,
                        runIdStr,
                        key,
                        step.type,
                        getErrorMessage(error),
                    );
                    return failedStep(key, error);
                });
            inFlight.set(key, promise);
        }

        if (inFlight.size > 0) {
            const completed = await Promise.race(inFlight.values());
            inFlight.delete(completed.key);
            completedCount = processCompletedStep(
                completed,
                strategy,
                completedCount,
                totalSteps,
                inFlight.size,
            );
            const completedStep = stepByKey.get(completed.key);
            if (handleGatePause(
                completed.key,
                completedStep,
                completed.stepResult,
                metrics,
                { pipelineId, runId },
                domainEvents,
            )) {
                break;
            }
            processNeighborIndegrees(completed.key, edges, indeg, queue);
        }
    }

    if (inFlight.size > 0) {
        const settled = await Promise.allSettled(inFlight.values());
        for (const result of settled) {
            if (result.status !== 'fulfilled') continue;
            completedCount = processDrainedStep(
                result.value,
                strategy,
                completedCount,
                totalSteps,
            );
        }
        inFlight.clear();
    }

    handleParallelErrors(errors, parallelConfig.errorPolicy);
    if (cancelled) {
        graphLogger.log('[Parallel] Execution cancelled');
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

interface CompletedStep {
    key: string;
    stepResult: StepExecutionResult;
    durationMs: number;
}

function failedStep(key: string, error: unknown): CompletedStep {
    return {
        key,
        stepResult: {
            output: [],
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            detail: { error: getErrorMessage(error) },
            counters: {},
        },
        durationMs: 0,
    };
}

function processCompletedStep(
    completed: CompletedStep,
    strategy: ExecutionStrategyParams,
    completedCount: number,
    totalSteps: number,
    inFlightCount: number,
): number {
    const { params, metrics } = strategy;
    graphLogger.debug(`[Parallel] Completed step: ${completed.key}`, {
        step: completed.key,
        inFlightCount,
        processed: completed.stepResult.processed,
        durationMs: completed.durationMs,
    });
    persistCompletedStep(completed, strategy);
    const nextCount = completedCount + 1;
    publishRunProgress(params, metrics, nextCount, totalSteps, completed.key);
    publishStepEvent(params.domainEvents, completed.stepResult, completed.key);
    return nextCount;
}

function processDrainedStep(
    completed: CompletedStep,
    strategy: ExecutionStrategyParams,
    completedCount: number,
    totalSteps: number,
): number {
    const { params, stepByKey, outputs, metrics } = strategy;
    outputs.set(completed.key, completed.stepResult.output);
    updateMetrics(metrics, completed.stepResult, completed.durationMs);
    const step = stepByKey.get(completed.key);
    if (!completed.stepResult.detail?.['error']) {
        params.domainEvents.publishStepCompleted(
            params.pipelineId?.toString(),
            params.runId?.toString(),
            completed.key,
            step?.type ?? '',
            completed.stepResult.processed,
        );
    }
    const nextCount = completedCount + 1;
    publishRunProgress(
        params,
        metrics,
        nextCount,
        totalSteps,
        completed.key,
    );
    publishStepEvent(
        params.domainEvents,
        completed.stepResult,
        completed.key,
    );
    graphLogger.debug(`[Parallel] Drained in-flight step: ${completed.key}`, {
        step: completed.key,
        processed: completed.stepResult.processed,
        durationMs: completed.durationMs,
    });
    return nextCount;
}

function persistCompletedStep(
    completed: CompletedStep,
    strategy: ExecutionStrategyParams,
): void {
    const { params, stepByKey, outputs, metrics } = strategy;
    const step = stepByKey.get(completed.key);
    if (!completed.stepResult.detail?.['error']) {
        params.domainEvents.publishStepCompleted(
            params.pipelineId?.toString(),
            params.runId?.toString(),
            completed.key,
            step?.type ?? '',
            completed.stepResult.processed,
        );
    }
    outputs.set(completed.key, completed.stepResult.output);
    updateMetrics(metrics, completed.stepResult, completed.durationMs);
}

function publishStepEvent(
    domainEvents: ExecuteGraphParams['domainEvents'],
    stepResult: StepExecutionResult,
    stepKey: string,
): void {
    if (!stepResult.event) return;
    try {
        domainEvents.publish(stepResult.event.type, stepResult.event.data);
    } catch (error) {
        handleNodeError(error as Error, stepResult.event.type, { stepKey });
    }
}

function handleParallelErrors(
    errors: Array<{ key: string; error: unknown }>,
    errorPolicy: ParallelExecutionConfig['errorPolicy'],
): void {
    if (errors.length === 0) return;
    if (errorPolicy === 'BEST_EFFORT') {
        for (const { key, error } of errors) {
            graphLogger.warn(
                `[Parallel] Step ${key} failed (best-effort mode): ${getErrorMessage(error)}`,
            );
        }
        return;
    }
    const firstError = errors[0];
    throw new Error(
        `Parallel execution failed at step "${firstError.key}": ${getErrorMessage(firstError.error)}`,
    );
}
