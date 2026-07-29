import { RequestContext, ID } from '@vendure/core';
import {
    JsonObject,
    PipelineDefinition,
    PipelineStepDefinition,
    StepType,
} from '../../types/index';
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
import { LOGGER_CONTEXTS } from '../../constants/core';
import { DataHubLoggerFactory } from '../../services/logger';
import { resolveEffectiveStepContext } from './effective-context';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.LINEAR_EXECUTOR);

export interface LinearExecutionResult {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    details: JsonObject[];
    counters: Record<string, number>;
    /** True when pipeline paused at a GATE step awaiting approval */
    paused?: boolean;
    /** The step key where the pipeline paused */
    pausedAtStep?: string;
    /** True when pipeline was cancelled by user */
    cancelled?: boolean;
}

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
    pipelineCode?: string;
    runId?: ID;
    stepLog?: StepLogCallback;
}

class StepStrategyRegistry {
    private strategies: Map<string, StepStrategy> = new Map();

    register(stepType: string, strategy: StepStrategy): void {
        this.strategies.set(stepType, strategy);
    }

    get(stepType: string): StepStrategy | undefined {
        return this.strategies.get(stepType);
    }
}

/**
 * Build strategy registry from executors.
 *
 * This routes step types to concrete strategy objects for execution, which is
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

interface ExecutionState {
    records: RecordObject[];
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    details: JsonObject[];
    counters: Record<string, number>;
    cancelled: boolean;
    cancelledAtStep?: string;
    /** True when pipeline is paused at a GATE step */
    paused: boolean;
    /** The step key where the pipeline paused */
    pausedAtStep?: string;
}

function createInitialState(): ExecutionState {
    return {
        records: [],
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
        cancelled: false,
        paused: false,
    };
}

function buildStepContext(
    params: LinearExecutorParams,
    step: PipelineStepDefinition,
    records: RecordObject[],
): StepExecutionContext {
    return {
        ctx: params.ctx,
        definition: params.definition,
        step,
        pipelineContext: resolveEffectiveStepContext(
            params.ctx,
            params.definition.context,
            step.context,
        ),
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

async function checkCancellation(
    params: LinearExecutorParams,
    state: ExecutionState,
    step: PipelineStepDefinition,
    stepSkipped: boolean,
): Promise<boolean> {
    if (!params.onCancelRequested) return false;
    if (!(await params.onCancelRequested())) return false;

    state.cancelled = true;
    state.cancelledAtStep = step.key;
    state.details.push({
        stepKey: step.key,
        type: step.type,
        status: RunStatus.CANCELLED,
        durationMs: 0,
    });

    if (stepSkipped) {
        safePublish(params.domainEvents, 'PipelineStepSkipped', {
            pipelineId: params.pipelineId,
            stepKey: step.key,
            reason: 'cancelled',
        }, logger);
    }
    return true;
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

function applyResultToState(state: ExecutionState, result: StepStrategyResult): void {
    state.records = result.records;
    state.processed += result.processed;
    state.succeeded += result.succeeded;
    state.failed += result.failed;
    state.skipped += result.skipped ?? 0;
    state.details.push(result.detail);

    for (const [key, value] of Object.entries(result.counters)) {
        state.counters[key] = (state.counters[key] ?? 0) + value;
    }
}

async function executeStep(
    params: LinearExecutorParams,
    registry: StepStrategyRegistry,
    step: PipelineStepDefinition,
    state: ExecutionState,
): Promise<StepStrategyResult | undefined> {
    const pipelineIdStr = params.pipelineId?.toString();
    const runIdStr = params.runId?.toString();
    const startedAt = Date.now();
    params.domainEvents.publishStepStarted(pipelineIdStr, runIdStr, step.key, step.type);

    try {
        if (step.type === StepType.TRIGGER) {
            handleTriggerStep(params.domainEvents, params.pipelineId, step, state);
            params.domainEvents.publishStepCompleted(
                pipelineIdStr,
                runIdStr,
                step.key,
                step.type,
                0,
            );
            return undefined;
        }

        const strategy = registry.get(step.type);
        if (!strategy) {
            throw new Error(
                `Unsupported step type "${String(step.type)}" for step "${step.key}"`,
            );
        }

        const context = buildStepContext(params, step, state.records);
        const result = await strategy.execute(context);
        applyResultToState(state, result);

        if (result.event) {
            safePublish(params.domainEvents, result.event.type, result.event.data, logger);
        }

        params.domainEvents.publishStepCompleted(pipelineIdStr, runIdStr, step.key, step.type, result.processed);
        return result;
    } catch (error) {
        const executionError = error instanceof Error
            ? error
            : new Error(getErrorMessage(error));
        params.domainEvents.publishStepFailed(
            pipelineIdStr,
            runIdStr,
            step.key,
            step.type,
            executionError.message,
        );
        try {
            await params.stepLog?.onStepFailed?.(
                params.ctx,
                step.key,
                step.type,
                executionError,
                Date.now() - startedAt,
            );
        } catch (loggingError) {
            logger.warn(
                `Failed to persist failure log for step "${step.key}": ${getErrorMessage(loggingError)}`,
            );
        }
        throw executionError;
    }
}

/**
 * Check if a step result indicates the pipeline should pause (GATE step with shouldPause)
 */
function checkGatePause(
    step: PipelineStepDefinition,
    result: StepStrategyResult | undefined,
    state: ExecutionState,
    params: LinearExecutorParams,
): boolean {
    if (step.type !== StepType.GATE) return false;

    if (result?.detail['shouldPause'] === true) {
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
            params.pipelineCode ?? params.definition.name ?? '',
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

async function executeSteps(
    params: LinearExecutorParams,
    registry: StepStrategyRegistry,
    state: ExecutionState,
): Promise<void> {
    const totalSteps = params.definition.steps.length;

    for (let i = 0; i < params.definition.steps.length; i++) {
        const step = params.definition.steps[i];
        if (await checkCancellation(params, state, step, true)) {
            break;
        }

        const result = await executeStep(params, registry, step, state);

        publishRunProgress(params, state, i, totalSteps, step.key);

        if (await checkCancellation(params, state, step, false)) {
            break;
        }

        if (checkGatePause(step, result, state, params)) {
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
function publishPipelineCancelled(
    params: LinearExecutorParams,
    state: ExecutionState,
): void {
    safePublish(params.domainEvents, 'PipelineRunCancelled', {
        pipelineId: params.pipelineId,
        runId: params.runId,
        stepKey: state.cancelledAtStep,
        cancelledAt: new Date().toISOString(),
    }, logger);
}

/**
 * Executes a linear pipeline (sequential steps)
 */
export async function executeLinear(params: LinearExecutorParams): Promise<LinearExecutionResult> {
    const state = createInitialState();
    const registry = buildStrategyRegistry(params);

    await publishPipelineStarted(params);
    await executeSteps(params, registry, state);

    if (state.cancelled) {
        publishPipelineCancelled(params, state);
    }

    return {
        processed: state.processed,
        succeeded: state.succeeded,
        failed: state.failed,
        skipped: state.skipped,
        details: state.details,
        counters: state.counters,
        paused: state.paused ? true : undefined,
        pausedAtStep: state.pausedAtStep,
        cancelled: state.cancelled ? true : undefined,
    };
}
