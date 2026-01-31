/**
 * Load Step Strategy
 *
 * Handles LOAD step execution in linear pipelines.
 */

import { RequestContext } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback } from '../../executor-types';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';

/**
 * Function type for loading with throughput control
 */
export type LoadWithThroughputFn = (
    ctx: RequestContext,
    step: PipelineStepDefinition,
    batch: RecordObject[],
    definition: PipelineDefinition,
    onRecordError?: OnRecordErrorCallback,
) => Promise<{ ok: number; fail: number }>;

/**
 * Function type for applying idempotency filtering
 */
export type ApplyIdempotencyFn = (
    records: RecordObject[],
    definition: PipelineDefinition,
) => RecordObject[];

export class LoadStepStrategy implements StepStrategy {
    constructor(
        private readonly loadWithThroughput: LoadWithThroughputFn,
        private readonly applyIdempotency: ApplyIdempotencyFn,
    ) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { definition, step, records } = context;
        const adapterCode = getAdapterCode(step);
        const t0 = Date.now();

        await this.logStepStart(context, records.length);
        const afterBeforeHook = await this.runBeforeHook(context, records);

        const batch = this.applyIdempotency(afterBeforeHook, definition);
        await this.logLoadData(context, adapterCode, batch);

        const { ok, fail } = await this.executeLoad(context, batch);
        const durationMs = Date.now() - t0;

        await this.runAfterHook(context, afterBeforeHook);

        await this.logStepComplete(context, adapterCode, batch.length, ok, fail, durationMs, batch[0]);

        return {
            records: afterBeforeHook,
            processed: 0,
            succeeded: ok,
            failed: fail,
            detail: createStepDetail(step, { ok, fail }, durationMs),
            counters: { loaded: ok, rejected: fail },
            event: { type: 'RECORD_LOADED', data: { stepKey: step.key, ok, fail } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'LOAD', recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_LOAD', records, runId, pipelineId);
        return result.records;
    }

    private async logLoadData(context: StepExecutionContext, adapterCode: string, batch: RecordObject[]): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onLoadData) {
            await stepLog.onLoadData(ctx, step.key, adapterCode, batch);
        }
    }

    private async executeLoad(context: StepExecutionContext, batch: RecordObject[]): Promise<{ ok: number; fail: number }> {
        const { ctx, definition, step, onRecordError } = context;
        return this.loadWithThroughput(ctx, step, batch, definition, onRecordError);
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_LOAD', records, runId, pipelineId);
        return result.records;
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        batchSize: number,
        ok: number,
        fail: number,
        durationMs: number,
        sampleInput?: RecordObject,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'LOAD',
                adapterCode,
                recordsIn: batchSize,
                recordsOut: ok,
                succeeded: ok,
                failed: fail,
                durationMs,
                sampleInput,
            });
        }
    }
}
