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
import { StepType as StepTypeEnum, DomainEventType, HookStage } from '../../../constants/enums';

export class SinkStepStrategy implements StepStrategy {
    constructor(private readonly sinkExecutor: SinkExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { step, records, pipelineId, runId } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);

        // Run BEFORE_SINK hook (observation only, SINK is terminal)
        await this.runBeforeHook(context, records);

        const { ok, fail } = await this.executeSink(context);
        const durationMs = Date.now() - t0;

        // Run AFTER_SINK hook (observation only, SINK is terminal)
        await this.runAfterHook(context, records);

        await this.logStepComplete(context, adapterCode, recordsIn, ok, fail, durationMs);

        return {
            records,
            processed: recordsIn,
            succeeded: ok,
            failed: fail,
            detail: createStepDetail(step, { ok, fail }, durationMs),
            counters: {},
            event: {
                type: DomainEventType.RECORD_INDEXED,
                data: {
                    stepKey: step.key,
                    ok,
                    fail,
                    pipelineId: pipelineId ? String(pipelineId) : undefined,
                    runId: runId ? String(runId) : undefined
                }
            },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, StepTypeEnum.SINK, recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: import('../../executor-types').RecordObject[]): Promise<void> {
        const { ctx, definition, hookService, runId } = context;
        await hookService.run(ctx, definition, HookStage.BEFORE_SINK, records, undefined, runId);
    }

    private async executeSink(context: StepExecutionContext): Promise<{ ok: number; fail: number }> {
        const { ctx, step, records, onRecordError } = context;
        return this.sinkExecutor.execute(ctx, step, records, onRecordError);
    }

    private async runAfterHook(context: StepExecutionContext, records: import('../../executor-types').RecordObject[]): Promise<void> {
        const { ctx, definition, hookService, runId } = context;
        await hookService.run(ctx, definition, HookStage.AFTER_SINK, records, undefined, runId);
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
                stepType: StepTypeEnum.SINK,
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
