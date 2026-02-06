/**
 * Feed Step Strategy
 *
 * FEED step execution in linear pipelines.
 */

import { FeedExecutor } from '../../executors';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';

export class FeedStepStrategy implements StepStrategy {
    constructor(private readonly feedExecutor: FeedExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { step, records } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);

        const { ok, fail, outputPath } = await this.executeFeed(context);
        const durationMs = Date.now() - t0;

        await this.logStepComplete(context, adapterCode, recordsIn, ok, fail, durationMs);

        return {
            records,
            processed: recordsIn,
            succeeded: ok,
            failed: fail,
            detail: createStepDetail(step, { ok, fail, outputPath: outputPath ?? null }, durationMs),
            counters: {},
            event: { type: 'FEED_GENERATED', data: { stepKey: step.key, ok, fail, outputPath } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'FEED', recordsIn);
        }
    }

    private async executeFeed(context: StepExecutionContext): Promise<{ ok: number; fail: number; outputPath?: string }> {
        const { ctx, step, records, onRecordError } = context;
        return this.feedExecutor.execute(ctx, step, records, onRecordError);
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        recordsIn: number,
        ok: number,
        fail: number,
        durationMs: number,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'FEED',
                adapterCode,
                recordsIn,
                recordsOut: ok,
                succeeded: ok,
                failed: fail,
                durationMs,
            });
        }
    }
}
