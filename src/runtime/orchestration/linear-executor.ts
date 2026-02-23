/**
 * Linear Executor
 *
 * Sequential pipeline execution where steps are executed in
 * the order they are defined (no graph edges).
 *
 * Uses the Strategy pattern for step execution.
 */

import { Logger } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition, StepType } from '../../types/index';
import { StepType as StepTypeEnum, RunStatus } from '../../constants/enums';
import {
    RecordObject,
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
import { StepLogCallback } from './types';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    safePublish,
} from './step-strategies';
import { ExtractStepStrategy } from './step-strategies/extract-step.strategy';
import {
    TransformStepStrategy,
    ValidateStepStrategy,
    EnrichStepStrategy,
    RouteStepStrategy,
} from './step-strategies/transform-step.strategy';
import { LoadStepStrategy, LoadWithThroughputFn, ApplyIdempotencyFn } from './step-strategies/load-step.strategy';
import { ExportStepStrategy } from './step-strategies/export-step.strategy';
import { FeedStepStrategy } from './step-strategies/feed-step.strategy';
import { SinkStepStrategy } from './step-strategies/sink-step.strategy';
import { GateStepStrategy } from './step-strategies/gate-step.strategy';
import { getErrorMessage } from '../../utils/error.utils';

const logger = new Logger('DataHub:LinearExecutor');

/**
 * Linear execution result
 */
export interface LinearExecutionResult {
    processed: number;
    succeeded: number;
    failed: number;
    details: Array<import('../../types/index').JsonObject>;
    counters: Record<string, number>;
    /** True when pipeline paused at a GATE step awaiting approval */
    paused?: boolean;
    /** The step key where the pipeline paused */
    pausedAtStep?: string;
}

/**
 * Parameters for linear executor
 */
export interface LinearExecutorParams {
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
    loadWithThroughput: LoadWithThroughputFn;
    applyIdempotency: ApplyIdempotencyFn;
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    runId?: ID;
    stepLog?: StepLogCallback;
}

/**
 * Strategy registry for step types
 */
class StepStrategyRegistry {
    private strategies: Map<string, StepStrategy> = new Map();

    register(stepType: string, strategy: StepStrategy): void {
        this.strategies.set(stepType, strategy);
    }

    get(stepType: string): StepStrategy | undefined {
        return this.strategies.get(stepType);
    }

    has(stepType: string): boolean {
        return this.strategies.has(stepType);
    }
}

/**
 * Build strategy registry from executors.
 *
 * Note: This maps step types to concrete strategy objects for execution, which is
 * fundamentally different from the adapter-type mapping in STEP_TYPE_TO_ADAPTER_TYPE
 * (src/constants/adapters.ts). That mapping resolves step types to adapter registry
 * categories for validation. This registry routes to execution strategies, including
 * step types (VALIDATE, ROUTE, GATE) that have no adapter type.
 */
function buildStrategyRegistry(params: LinearExecutorParams): StepStrategyRegistry {
    const registry = new StepStrategyRegistry();

    registry.register(StepType.EXTRACT, new ExtractStepStrategy(params.extractExecutor));
    registry.register(StepType.TRANSFORM, new TransformStepStrategy(params.transformExecutor));
    registry.register(StepType.VALIDATE, new ValidateStepStrategy(params.transformExecutor));
    registry.register(StepType.ENRICH, new EnrichStepStrategy(params.transformExecutor));
    registry.register(StepType.ROUTE, new RouteStepStrategy(params.transformExecutor));
    registry.register(StepType.LOAD, new LoadStepStrategy(params.loadWithThroughput, params.applyIdempotency));
    registry.register(StepType.EXPORT, new ExportStepStrategy(params.exportExecutor));
    registry.register(StepType.FEED, new FeedStepStrategy(params.feedExecutor));
    registry.register(StepType.SINK, new SinkStepStrategy(params.sinkExecutor));
    registry.register(StepType.GATE, new GateStepStrategy(params.gateExecutor));

    return registry;
}

/**
 * Execution state for pipeline run
 */
interface ExecutionState {
    records: RecordObject[];
    processed: number;
    succeeded: number;
    failed: number;
    details: Array<import('../../types/index').JsonObject>;
    counters: Record<string, number>;
    cancelled: boolean;
    /** True when pipeline is paused at a GATE step */
    paused: boolean;
    /** The step key where the pipeline paused */
    pausedAtStep?: string;
}

/**
 * Create initial execution state
 */
function createInitialState(): ExecutionState {
    return {
        records: [],
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
        cancelled: false,
        paused: false,
    };
}

/**
 * Build step execution context
 */
function buildStepContext(
    params: LinearExecutorParams,
    step: PipelineStepDefinition,
    records: RecordObject[],
): StepExecutionContext {
    return {
        ctx: params.ctx,
        definition: params.definition,
        step,
        records,
        executorCtx: params.executorCtx,
        hookService: params.hookService,
        domainEvents: params.domainEvents,
        pipelineId: params.pipelineId,
        runId: params.runId,
        stepLog: params.stepLog,
        onRecordError: params.onRecordError,
    };
}

/**
 * Check if cancellation was requested
 */
async function checkCancellation(
    params: LinearExecutorParams,
    state: ExecutionState,
    step: PipelineStepDefinition,
): Promise<boolean> {
    if (!params.onCancelRequested) return false;
    if (!(await params.onCancelRequested())) return false;

    state.cancelled = true;
    state.details.push({
        stepKey: step.key,
        type: step.type,
        status: RunStatus.CANCELLED,
        durationMs: 0,
    });

    publishCancellationEvents(params.domainEvents, params.pipelineId, step.key);
    return true;
}

/**
 * Publish cancellation events
 */
function publishCancellationEvents(
    domainEvents: DomainEventsService,
    pipelineId: ID | undefined,
    stepKey: string,
): void {
    safePublish(domainEvents, 'PipelineRunCancelled', {
        pipelineId,
        stepKey,
        cancelledAt: new Date().toISOString(),
    }, logger);

    safePublish(domainEvents, 'PipelineStepSkipped', {
        pipelineId,
        stepKey,
        reason: 'cancelled',
    }, logger);
}

/**
 * Handle TRIGGER step (skip)
 */
function handleTriggerStep(
    domainEvents: DomainEventsService,
    pipelineId: ID | undefined,
    step: PipelineStepDefinition,
    state: ExecutionState,
): void {
    state.details.push({
        stepKey: step.key,
        type: StepTypeEnum.TRIGGER,
        skipped: true,
        durationMs: 0,
    });

    safePublish(domainEvents, 'PipelineStepSkipped', {
        pipelineId,
        stepKey: step.key,
        reason: 'trigger-step',
    }, logger);
}

/**
 * Handle unsupported step type
 */
function handleUnsupportedStep(
    domainEvents: DomainEventsService,
    pipelineId: ID | undefined,
    step: PipelineStepDefinition,
    state: ExecutionState,
): void {
    state.details.push({
        stepKey: step.key,
        type: step.type,
        skipped: true,
        durationMs: 0,
    });

    safePublish(domainEvents, 'PipelineStepSkipped', {
        pipelineId,
        stepKey: step.key,
        reason: 'unsupported-step',
    }, logger);
}

/**
 * Apply strategy result to execution state
 */
function applyResultToState(state: ExecutionState, result: StepStrategyResult): void {
    state.records = result.records;
    state.processed += result.processed;
    state.succeeded += result.succeeded;
    state.failed += result.failed;
    state.details.push(result.detail);

    for (const [key, value] of Object.entries(result.counters)) {
        state.counters[key] = (state.counters[key] ?? 0) + value;
    }
}

/**
 * Execute a single step using strategy pattern
 */
async function executeStep(
    params: LinearExecutorParams,
    registry: StepStrategyRegistry,
    step: PipelineStepDefinition,
    state: ExecutionState,
): Promise<void> {
    // Handle TRIGGER steps specially
    if (step.type === StepType.TRIGGER) {
        handleTriggerStep(params.domainEvents, params.pipelineId, step, state);
        return;
    }

    // Get strategy for step type
    const strategy = registry.get(step.type);
    if (!strategy) {
        handleUnsupportedStep(params.domainEvents, params.pipelineId, step, state);
        return;
    }

    const pipelineIdStr = params.pipelineId?.toString();
    const runIdStr = params.runId?.toString();

    // Publish StepStarted event (typed helper already wraps in try/catch)
    params.domainEvents.publishStepStarted(pipelineIdStr, runIdStr, step.key, step.type);

    try {
        // Build context and execute strategy
        const context = buildStepContext(params, step, state.records);
        const result = await strategy.execute(context);

        // Apply result to state
        applyResultToState(state, result);

        // Publish record-level domain event (e.g. RECORD_EXTRACTED, RECORD_TRANSFORMED)
        if (result.event) {
            safePublish(params.domainEvents, result.event.type, result.event.data, logger);
        }

        // Publish StepCompleted event (typed helper already wraps in try/catch)
        params.domainEvents.publishStepCompleted(pipelineIdStr, runIdStr, step.key, step.type, result.processed);
    } catch (error) {
        // Publish StepFailed event (typed helper already wraps in try/catch)
        params.domainEvents.publishStepFailed(pipelineIdStr, runIdStr, step.key, step.type, getErrorMessage(error));
        throw error;
    }
}

/**
 * Check if a step result indicates the pipeline should pause (GATE step with shouldPause)
 */
function checkGatePause(
    step: PipelineStepDefinition,
    state: ExecutionState,
    params: LinearExecutorParams,
): boolean {
    if (step.type !== StepType.GATE) return false;

    // The most recent detail entry is the one just pushed by the GATE step
    const lastDetail = state.details[state.details.length - 1];
    if (lastDetail && lastDetail['shouldPause'] === true) {
        state.paused = true;
        state.pausedAtStep = step.key;

        logger.log(`Pipeline paused at GATE step "${step.key}" - awaiting approval`);

        safePublish(params.domainEvents, 'PipelinePaused', {
            pipelineId: params.pipelineId,
            runId: params.runId,
            stepKey: step.key,
            pausedAt: new Date().toISOString(),
        }, logger);

        return true;
    }
    return false;
}

/**
 * Publish run progress event after each step completes
 */
function publishRunProgress(
    params: LinearExecutorParams,
    state: ExecutionState,
    completedStepIndex: number,
    totalSteps: number,
    currentStepKey: string,
): void {
    if (!params.runId) return;

    const progressPercent = totalSteps > 0
        ? Math.round(((completedStepIndex + 1) / totalSteps) * 100)
        : 0;

    try {
        params.domainEvents.publishRunProgress(
            String(params.runId),
            params.definition.name ?? '',
            progressPercent,
            `Completed step ${completedStepIndex + 1}/${totalSteps}: ${currentStepKey}`,
            state.processed,
            state.failed,
            currentStepKey,
        );
    } catch (error) {
        logger.warn(`Failed to publish PipelineRunProgress event: ${getErrorMessage(error)}`);
    }
}

/**
 * Main orchestration loop
 */
async function executeSteps(
    params: LinearExecutorParams,
    registry: StepStrategyRegistry,
    state: ExecutionState,
): Promise<void> {
    const totalSteps = params.definition.steps.length;

    for (let i = 0; i < params.definition.steps.length; i++) {
        const step = params.definition.steps[i];
        // Check for cancellation
        if (await checkCancellation(params, state, step)) {
            break;
        }

        // Execute the step
        await executeStep(params, registry, step, state);

        // Publish run progress after each step
        publishRunProgress(params, state, i, totalSteps, step.key);

        // Check if a GATE step requested a pause
        if (checkGatePause(step, state, params)) {
            break;
        }
    }
}

/**
 * Publish pipeline started event
 */
async function publishPipelineStarted(params: LinearExecutorParams): Promise<void> {
    await params.hookService.run(params.ctx, params.definition, 'PIPELINE_STARTED');
    safePublish(params.domainEvents, 'PIPELINE_STARTED', { pipelineId: params.pipelineId }, logger);
}

/**
 * Publish pipeline cancelled event
 */
function publishPipelineCancelled(params: LinearExecutorParams): void {
    safePublish(params.domainEvents, 'PipelineRunCancelled', {
        pipelineId: params.pipelineId,
        cancelledAt: new Date().toISOString(),
    }, logger);
}

/**
 * Executes a linear pipeline (sequential steps)
 */
export async function executeLinear(params: LinearExecutorParams): Promise<LinearExecutionResult> {
    // Initialize state
    const state = createInitialState();

    // Build strategy registry
    const registry = buildStrategyRegistry(params);

    // Publish pipeline started
    await publishPipelineStarted(params);

    // Execute all steps
    await executeSteps(params, registry, state);

    // Handle cancellation
    if (state.cancelled) {
        publishPipelineCancelled(params);
    }

    return {
        processed: state.processed,
        succeeded: state.succeeded,
        failed: state.failed,
        details: state.details,
        counters: state.counters,
        paused: state.paused ? true : undefined,
        pausedAtStep: state.pausedAtStep,
    };
}

/**
 * Parameters for seeded execution
 */
export interface SeededExecutionParams {
    ctx: RequestContext;
    definition: PipelineDefinition;
    seed: RecordObject[];
    executorCtx: ExecutorContext;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
}

/**
 * Seeded execution state
 */
interface SeededExecutionState {
    records: RecordObject[];
    processed: number;
    succeeded: number;
    failed: number;
}

/**
 * Step execution result for metrics collection
 */
interface StepExecutionMetrics {
    ok: number;
    fail: number;
    recordCount: number;
}

/**
 * Prepare initial state for seeded execution
 */
function prepareSeededExecution(seed: RecordObject[]): SeededExecutionState {
    return {
        records: [...seed],
        processed: 0,
        succeeded: 0,
        failed: 0,
    };
}

/**
 * Collect and apply step metrics to execution state
 */
function collectStepMetrics(
    state: SeededExecutionState,
    metrics: StepExecutionMetrics,
): void {
    state.succeeded += metrics.ok;
    state.failed += metrics.fail;
    state.processed += metrics.recordCount;
}

/**
 * Execute a transform-type step (TRANSFORM, ENRICH, VALIDATE, ROUTE)
 */
async function executeTransformStep(
    params: SeededExecutionParams,
    step: PipelineStepDefinition,
    state: SeededExecutionState,
): Promise<void> {
    const { ctx, executorCtx, transformExecutor, onRecordError } = params;

    switch (step.type) {
        case StepType.TRANSFORM:
            state.records = await transformExecutor.executeOperator(ctx, step, state.records, executorCtx);
            break;
        case StepType.ENRICH:
            state.records = await transformExecutor.executeEnrich(ctx, step, state.records, executorCtx);
            break;
        case StepType.VALIDATE:
            state.records = await transformExecutor.executeValidate(ctx, step, state.records, onRecordError);
            break;
        case StepType.ROUTE:
            state.records = await transformExecutor.executeRoute(ctx, step, state.records, onRecordError);
            break;
    }
}

/**
 * Execute a load-type step (LOAD, EXPORT, FEED, SINK)
 */
async function executeLoadStep(
    params: SeededExecutionParams,
    step: PipelineStepDefinition,
    state: SeededExecutionState,
): Promise<void> {
    const { ctx, loadExecutor, exportExecutor, feedExecutor, sinkExecutor, onRecordError } = params;
    let result: { ok: number; fail: number };

    switch (step.type) {
        case StepType.LOAD:
            result = await loadExecutor.execute(ctx, step, state.records, onRecordError);
            break;
        case StepType.EXPORT:
            result = await exportExecutor.execute(ctx, step, state.records, onRecordError);
            break;
        case StepType.FEED:
            result = await feedExecutor.execute(ctx, step, state.records, onRecordError);
            break;
        case StepType.SINK:
            result = await sinkExecutor.execute(ctx, step, state.records, onRecordError);
            break;
        default:
            return;
    }

    collectStepMetrics(state, { ok: result.ok, fail: result.fail, recordCount: state.records.length });
}

/**
 * Execute a single step with error recovery in seeded execution
 */
async function executeStepWithRecovery(
    params: SeededExecutionParams,
    step: PipelineStepDefinition,
    state: SeededExecutionState,
): Promise<void> {
    // Skip trigger, extract, and gate steps - using seed records
    if (step.type === StepType.TRIGGER || step.type === StepType.EXTRACT || step.type === StepType.GATE) {
        return;
    }

    // Handle transform-type steps
    if ([StepType.TRANSFORM, StepType.ENRICH, StepType.VALIDATE, StepType.ROUTE].includes(step.type as StepType)) {
        await executeTransformStep(params, step, state);
        return;
    }

    // Handle load-type steps
    if ([StepType.LOAD, StepType.EXPORT, StepType.FEED, StepType.SINK].includes(step.type as StepType)) {
        await executeLoadStep(params, step, state);
        return;
    }

    // Unhandled step type
    logger.warn(`executeWithSeed: Unhandled step type "${step.type}" for step "${step.key}" - passing through ${state.records.length} records`);
}

/**
 * Execute pipeline with seed records (skip extract steps)
 */
export async function executeWithSeed(
    params: SeededExecutionParams,
): Promise<{ processed: number; succeeded: number; failed: number }> {
    const { definition, onCancelRequested } = params;

    // Prepare initial execution state with seed data
    const state = prepareSeededExecution(params.seed);

    // Execute each step sequentially
    for (const step of definition.steps) {
        // Check for cancellation before each step
        if (onCancelRequested && (await onCancelRequested())) {
            break;
        }

        await executeStepWithRecovery(params, step, state);
    }

    return {
        processed: state.processed,
        succeeded: state.succeeded,
        failed: state.failed,
    };
}
