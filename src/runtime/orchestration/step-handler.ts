/**
 * Step Handler
 *
 * Shared step execution logic used by both linear and graph executors.
 * This module consolidates the common step type handling.
 */

import { Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineDefinition, StepType, PipelineStepDefinition } from '../../types/index';
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
} from '../executors';
// Direct import to avoid circular dependencies
import { HookService } from '../../services/events/hook.service';

/**
 * Result from executing a single step
 */
export interface StepResult {
    /** Output records or branch output */
    output: RecordObject[] | BranchOutput;
    /** Step execution details */
    detail: Record<string, unknown>;
    /** Number of records processed */
    processed: number;
    /** Number of successful operations */
    succeeded: number;
    /** Number of failed operations */
    failed: number;
    /** Counter updates */
    counters: Record<string, number>;
    /** Optional event to emit */
    event?: { type: string; data: Record<string, unknown> };
}

/**
 * Dependencies needed for step execution
 */
export interface StepExecutorDeps {
    extractExecutor: ExtractExecutor;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    hookService: HookService;
}

/**
 * Parameters for executing a single step
 */
export interface ExecuteStepParams {
    ctx: RequestContext;
    definition: PipelineDefinition;
    step: PipelineStepDefinition;
    input: RecordObject[];
    executorCtx: ExecutorContext;
    deps: StepExecutorDeps;
    loadWithThroughput?: (
        ctx: RequestContext,
        step: PipelineStepDefinition,
        batch: RecordObject[],
        definition: PipelineDefinition,
        onRecordError?: OnRecordErrorCallback,
    ) => Promise<{ ok: number; fail: number }>;
    applyIdempotency?: (records: RecordObject[], definition: PipelineDefinition) => RecordObject[];
    onRecordError?: OnRecordErrorCallback;
}

/**
 * Create empty step result
 */
function createEmptyResult(stepKey: string, type: string): StepResult {
    return {
        output: [],
        detail: { stepKey, type },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: {},
    };
}

/**
 * Execute a trigger step (no-op)
 */
function executeTrigger(stepKey: string): StepResult {
    return createEmptyResult(stepKey, 'TRIGGER');
}

/**
 * Execute an extract step
 */
async function executeExtract(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, executorCtx, deps, onRecordError } = params;

    await deps.hookService.run(ctx, definition, 'beforeExtract');
    const out = await deps.extractExecutor.execute(ctx, step, executorCtx, onRecordError);
    await deps.hookService.run(ctx, definition, 'afterExtract', out as RecordObject[]);

    return {
        output: out,
        detail: {
            stepKey: step.key,
            type: 'EXTRACT',
            adapterCode: step.config?.adapterCode,
            out: out.length,
        },
        processed: out.length,
        succeeded: out.length,
        failed: 0,
        counters: { extracted: out.length },
        event: { type: 'RecordExtracted', data: { stepKey: step.key, count: out.length } },
    };
}

/**
 * Execute a transform step
 */
async function executeTransform(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, input, executorCtx, deps } = params;

    await deps.hookService.run(ctx, definition, 'beforeTransform', input as RecordObject[]);
    const out = await deps.transformExecutor.executeOperator(ctx, step, input, executorCtx);
    await deps.hookService.run(ctx, definition, 'afterTransform', out as RecordObject[]);

    return {
        output: out,
        detail: {
            stepKey: step.key,
            type: 'TRANSFORM',
            adapterCode: step.config?.adapterCode,
            out: out.length,
        },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: { transformed: out.length },
        event: { type: 'RecordTransformed', data: { stepKey: step.key, count: out.length } },
    };
}

/**
 * Execute a validate step
 */
async function executeValidate(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, input, deps, onRecordError } = params;

    await deps.hookService.run(ctx, definition, 'beforeValidate', input as RecordObject[]);
    const out = await deps.transformExecutor.executeValidate(ctx, step, input, onRecordError);
    await deps.hookService.run(ctx, definition, 'afterValidate', out as RecordObject[]);

    return {
        output: out,
        detail: {
            stepKey: step.key,
            type: 'VALIDATE',
            adapterCode: step.config?.adapterCode,
            out: out.length,
        },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: { validated: out.length },
        event: { type: 'RecordValidated', data: { stepKey: step.key, count: out.length } },
    };
}

/**
 * Execute an enrich step
 */
async function executeEnrich(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, input, executorCtx, deps } = params;

    await deps.hookService.run(ctx, definition, 'beforeEnrich', input as RecordObject[]);
    const out = await deps.transformExecutor.executeOperator(ctx, step, input, executorCtx);
    await deps.hookService.run(ctx, definition, 'afterEnrich', out as RecordObject[]);

    return {
        output: out,
        detail: {
            stepKey: step.key,
            type: 'ENRICH',
            adapterCode: step.config?.adapterCode,
            out: out.length,
        },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: { enriched: out.length },
        event: { type: 'RecordTransformed', data: { stepKey: step.key, count: out.length, stage: 'ENRICH' } },
    };
}

/**
 * Execute a route step (returns branches)
 */
async function executeRoute(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, input, deps } = params;

    await deps.hookService.run(ctx, definition, 'beforeRoute', input as RecordObject[]);
    const out = await deps.transformExecutor.executeRouteBranches(ctx, step, input);
    const total = Object.values(out.branches).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
    const aggregated = ([] as RecordObject[]).concat(...Object.values(out.branches));
    await deps.hookService.run(ctx, definition, 'afterRoute', aggregated as RecordObject[]);

    return {
        output: out,
        detail: {
            stepKey: step.key,
            type: 'ROUTE',
            adapterCode: step.config?.adapterCode,
            out: total,
            branches: Object.keys(out.branches),
        },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: { routed: total },
    };
}

/**
 * Execute a load step
 */
async function executeLoad(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, definition, step, input, deps, loadWithThroughput, applyIdempotency, onRecordError } = params;

    await deps.hookService.run(ctx, definition, 'beforeLoad', input as RecordObject[]);
    const batch = applyIdempotency ? applyIdempotency(input, definition) : input;

    let ok: number;
    let fail: number;

    if (loadWithThroughput) {
        const result = await loadWithThroughput(ctx, step, batch, definition, onRecordError);
        ok = result.ok;
        fail = result.fail;
    } else {
        const result = await deps.loadExecutor.execute(ctx, step, batch, onRecordError);
        ok = result.ok;
        fail = result.fail;
    }

    await deps.hookService.run(ctx, definition, 'afterLoad', input as RecordObject[]);

    return {
        output: [],
        detail: {
            stepKey: step.key,
            type: 'LOAD',
            adapterCode: step.config?.adapterCode,
            ok,
            fail,
        },
        processed: 0,
        succeeded: ok,
        failed: fail,
        counters: { loaded: ok, rejected: fail },
        event: { type: 'RecordLoaded', data: { stepKey: step.key, ok, fail } },
    };
}

/**
 * Execute an export step
 */
async function executeExport(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, step, input, deps, onRecordError } = params;

    const { ok, fail } = await deps.exportExecutor.execute(ctx, step, input, onRecordError);

    return {
        output: [],
        detail: {
            stepKey: step.key,
            type: 'EXPORT',
            adapterCode: step.config?.adapterCode,
            ok,
            fail,
        },
        processed: 0,
        succeeded: ok,
        failed: fail,
        counters: {},
        event: { type: 'RecordExported', data: { stepKey: step.key, ok, fail } },
    };
}

/**
 * Execute a feed step
 */
async function executeFeed(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, step, input, deps, onRecordError } = params;

    const { ok, fail, outputPath } = await deps.feedExecutor.execute(ctx, step, input, onRecordError);

    return {
        output: [],
        detail: {
            stepKey: step.key,
            type: 'FEED',
            adapterCode: step.config?.adapterCode,
            ok,
            fail,
            outputPath,
        },
        processed: 0,
        succeeded: ok,
        failed: fail,
        counters: {},
        event: { type: 'FeedGenerated', data: { stepKey: step.key, ok, fail, outputPath } },
    };
}

/**
 * Execute a sink step
 */
async function executeSink(params: ExecuteStepParams): Promise<StepResult> {
    const { ctx, step, input, deps, onRecordError } = params;

    const { ok, fail } = await deps.sinkExecutor.execute(ctx, step, input, onRecordError);

    return {
        output: [],
        detail: {
            stepKey: step.key,
            type: 'SINK',
            adapterCode: step.config?.adapterCode,
            ok,
            fail,
        },
        processed: 0,
        succeeded: ok,
        failed: fail,
        counters: {},
        event: { type: 'RecordIndexed', data: { stepKey: step.key, ok, fail } },
    };
}

const logger = new Logger('DataHub:StepHandler');

/**
 * Execute a step of unknown type (passthrough with warning)
 * This handles future step types that may be added to StepType enum
 */
function executeUnknown(stepKey: string, stepType: string, input: RecordObject[]): StepResult {
    logger.warn(`Unhandled step type "${stepType}" for step "${stepKey}" - passing through ${input.length} records`);
    return {
        output: input,
        detail: { stepKey, type: stepType, unhandled: true },
        processed: 0,
        succeeded: 0,
        failed: 0,
        counters: {},
    };
}

/**
 * Execute a single pipeline step based on its type
 */
export async function executeStep(params: ExecuteStepParams): Promise<StepResult> {
    const { step, input } = params;

    switch (step.type) {
        case StepType.TRIGGER:
            return executeTrigger(step.key);

        case StepType.EXTRACT:
            return executeExtract(params);

        case StepType.TRANSFORM:
            return executeTransform(params);

        case StepType.VALIDATE:
            return executeValidate(params);

        case StepType.ENRICH:
            return executeEnrich(params);

        case StepType.ROUTE:
            return executeRoute(params);

        case StepType.LOAD:
            return executeLoad(params);

        case StepType.EXPORT:
            return executeExport(params);

        case StepType.FEED:
            return executeFeed(params);

        case StepType.SINK:
            return executeSink(params);

        default:
            return executeUnknown(step.key, step.type, input);
    }
}

/**
 * Initialize empty counters for pipeline execution
 */
export function createInitialCounters(): Record<string, number> {
    return {
        extracted: 0,
        transformed: 0,
        validated: 0,
        enriched: 0,
        routed: 0,
        loaded: 0,
        rejected: 0,
    };
}

/**
 * Merge step counters into total counters
 */
export function mergeCounters(
    total: Record<string, number>,
    step: Record<string, number>,
): void {
    for (const [k, v] of Object.entries(step)) {
        total[k] = (total[k] ?? 0) + v;
    }
}
