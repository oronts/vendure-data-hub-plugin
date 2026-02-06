/**
 * Transform Step Strategy
 *
 * TRANSFORM, VALIDATE, ENRICH, and ROUTE step execution in linear pipelines.
 */

import { TransformExecutor } from '../../executors';
import { RecordObject } from '../../executor-types';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';

/**
 * Strategy for TRANSFORM steps
 */
export class TransformStepStrategy implements StepStrategy {
    constructor(private readonly transformExecutor: TransformExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { ctx, step, records, executorCtx } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const sampleInput = records[0] as RecordObject | undefined;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        const out = await this.transformExecutor.executeOperator(ctx, step, afterBeforeHook, executorCtx);
        const durationMs = Date.now() - t0;

        const afterAfterHook = await this.runAfterHook(context, out);

        await this.logTransformMapping(context, adapterCode, sampleInput, out[0]);
        await this.logStepComplete(context, adapterCode, recordsIn, out.length, durationMs, sampleInput, out[0]);

        return {
            records: afterAfterHook,
            processed: 0,
            succeeded: 0,
            failed: 0,
            detail: createStepDetail(step, { out: out.length }, durationMs),
            counters: { transformed: out.length },
            event: { type: 'RECORD_TRANSFORMED', data: { stepKey: step.key, count: out.length } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'TRANSFORM', recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_TRANSFORM', records, runId, pipelineId);
        return result.records;
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_TRANSFORM', records, runId, pipelineId);
        return result.records;
    }

    private async logTransformMapping(
        context: StepExecutionContext,
        adapterCode: string,
        input: RecordObject | undefined,
        output: RecordObject | undefined,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onTransformMapping && input && output) {
            await stepLog.onTransformMapping(ctx, step.key, adapterCode, input, output);
        }
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
        sampleInput?: RecordObject,
        sampleOutput?: RecordObject,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'TRANSFORM',
                adapterCode,
                recordsIn,
                recordsOut,
                succeeded: recordsOut,
                failed: 0,
                durationMs,
                sampleInput,
                sampleOutput,
            });
        }
    }
}

/**
 * Strategy for VALIDATE steps
 */
export class ValidateStepStrategy implements StepStrategy {
    constructor(private readonly transformExecutor: TransformExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { ctx, step, records, onRecordError } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        const out = await this.transformExecutor.executeValidate(ctx, step, afterBeforeHook, onRecordError);
        const durationMs = Date.now() - t0;
        const failedCount = recordsIn - out.length;

        const afterAfterHook = await this.runAfterHook(context, out);

        await this.logStepComplete(context, adapterCode, recordsIn, out.length, failedCount, durationMs);

        return {
            records: afterAfterHook,
            processed: 0,
            succeeded: 0,
            failed: 0,
            detail: createStepDetail(step, { out: out.length }, durationMs),
            counters: { validated: out.length },
            event: { type: 'RECORD_VALIDATED', data: { stepKey: step.key, count: out.length } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'VALIDATE', recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_VALIDATE', records, runId, pipelineId);
        return result.records;
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_VALIDATE', records, runId, pipelineId);
        return result.records;
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        recordsIn: number,
        recordsOut: number,
        failedCount: number,
        durationMs: number,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'VALIDATE',
                adapterCode,
                recordsIn,
                recordsOut,
                succeeded: recordsOut,
                failed: failedCount,
                durationMs,
            });
        }
    }
}

/**
 * Strategy for ENRICH steps
 * Uses executeEnrich which handles both built-in enrichment config (defaults, computed, sourceType)
 * and custom enricher adapters via adapterCode.
 */
export class EnrichStepStrategy implements StepStrategy {
    constructor(private readonly transformExecutor: TransformExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { ctx, step, records, executorCtx } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        // Use executeEnrich which handles both built-in config and custom adapters
        const out = await this.transformExecutor.executeEnrich(ctx, step, afterBeforeHook, executorCtx);
        const durationMs = Date.now() - t0;

        const afterAfterHook = await this.runAfterHook(context, out);

        await this.logStepComplete(context, adapterCode, recordsIn, out.length, durationMs);

        return {
            records: afterAfterHook,
            processed: 0,
            succeeded: 0,
            failed: 0,
            detail: createStepDetail(step, { out: out.length }, durationMs),
            counters: { enriched: out.length },
            event: { type: 'RECORD_TRANSFORMED', data: { stepKey: step.key, count: out.length, stage: 'ENRICH' } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'ENRICH', recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_ENRICH', records, runId, pipelineId);
        return result.records;
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_ENRICH', records, runId, pipelineId);
        return result.records;
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'ENRICH',
                adapterCode,
                recordsIn,
                recordsOut,
                succeeded: recordsOut,
                failed: 0,
                durationMs,
            });
        }
    }
}

/**
 * Strategy for ROUTE steps (returns branched output for graph execution)
 */
export class RouteStepStrategy implements StepStrategy {
    constructor(private readonly transformExecutor: TransformExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { ctx, step, records } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        const out = await this.transformExecutor.executeRouteBranches(ctx, step, afterBeforeHook);
        const total = Object.values(out.branches).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
        const durationMs = Date.now() - t0;

        // Run after hook on aggregated records
        const aggregated = ([] as RecordObject[]).concat(...Object.values(out.branches));
        await this.runAfterHook(context, aggregated);

        await this.logStepComplete(context, adapterCode, recordsIn, total, durationMs, Object.keys(out.branches));

        return {
            records: aggregated,
            processed: 0,
            succeeded: 0,
            failed: 0,
            detail: createStepDetail(step, { out: total, branches: Object.keys(out.branches) }, durationMs),
            counters: { routed: total },
            // No event for ROUTE - branches are internal routing
        };
    }

    /**
     * Execute with branched output (for graph execution)
     */
    async executeWithBranches(context: StepExecutionContext): Promise<{
        result: StepStrategyResult;
        branchOutput: import('../../executor-types').BranchOutput;
    }> {
        const { ctx, step, records } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        const out = await this.transformExecutor.executeRouteBranches(ctx, step, afterBeforeHook);
        const total = Object.values(out.branches).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
        const durationMs = Date.now() - t0;

        // Run after hook on aggregated records
        const aggregated = ([] as RecordObject[]).concat(...Object.values(out.branches));
        await this.runAfterHook(context, aggregated);

        await this.logStepComplete(context, adapterCode, recordsIn, total, durationMs, Object.keys(out.branches));

        return {
            result: {
                records: aggregated,
                processed: 0,
                succeeded: 0,
                failed: 0,
                detail: createStepDetail(step, { out: total, branches: Object.keys(out.branches) }, durationMs),
                counters: { routed: total },
            },
            branchOutput: out,
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'ROUTE', recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_ROUTE', records, runId, pipelineId);
        return result.records;
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_ROUTE', records, runId, pipelineId);
        return result.records;
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        recordsIn: number,
        recordsOut: number,
        durationMs: number,
        branches: string[],
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'ROUTE',
                adapterCode,
                recordsIn,
                recordsOut,
                succeeded: recordsOut,
                failed: 0,
                durationMs,
            });
        }
    }
}

