/**
 * Sink Step Strategy
 *
 * SINK step execution in linear pipelines.
 */

import { SinkExecutor } from '../../executors';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';

export class SinkStepStrategy implements StepStrategy {
    constructor(private readonly sinkExecutor: SinkExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { step, records } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);

        const { ok, fail } = await this.executeSink(context);
        const durationMs = Date.now() - t0;

        await this.logStepComplete(context, adapterCode, recordsIn, ok, fail, durationMs);

        return {
            records,
            processed: recordsIn,
            succeeded: ok,
            failed: fail,
            detail: createStepDetail(step, { ok, fail }, durationMs),
            counters: {},
            event: { type: 'RECORD_INDEXED', data: { stepKey: step.key, ok, fail } },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'SINK', recordsIn);
        }
    }

    private async executeSink(context: StepExecutionContext): Promise<{ ok: number; fail: number }> {
        const { ctx, step, records, onRecordError } = context;
        return this.sinkExecutor.execute(ctx, step, records, onRecordError);
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
                stepType: 'SINK',
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
