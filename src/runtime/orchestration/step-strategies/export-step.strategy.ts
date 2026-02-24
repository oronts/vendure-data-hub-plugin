/**
 * Export Step Strategy
 *
 * EXPORT step execution in linear pipelines.
 */

import { ExportExecutor } from '../../executors';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';
import { StepType as StepTypeEnum, DomainEventType, HookStage } from '../../../constants/enums';

export class ExportStepStrategy implements StepStrategy {
    constructor(private readonly exportExecutor: ExportExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { step, records, pipelineId, runId } = context;
        const adapterCode = getAdapterCode(step);
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);

        // Run BEFORE_EXPORT hook (observation only, EXPORT is terminal)
        await this.runBeforeHook(context, records);

        const { ok, fail } = await this.executeExport(context);
        const durationMs = Date.now() - t0;

        // Run AFTER_EXPORT hook (observation only, EXPORT is terminal)
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
                type: DomainEventType.RECORD_EXPORTED,
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
            await stepLog.onStepStart(ctx, step.key, StepTypeEnum.EXPORT, recordsIn);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: import('../../executor-types').RecordObject[]): Promise<void> {
        const { ctx, definition, hookService, runId } = context;
        await hookService.run(ctx, definition, HookStage.BEFORE_EXPORT, records, undefined, runId);
    }

    private async executeExport(context: StepExecutionContext): Promise<{ ok: number; fail: number }> {
        const { ctx, step, records, onRecordError } = context;
        return this.exportExecutor.execute(ctx, step, records, onRecordError);
    }

    private async runAfterHook(context: StepExecutionContext, records: import('../../executor-types').RecordObject[]): Promise<void> {
        const { ctx, definition, hookService, runId } = context;
        await hookService.run(ctx, definition, HookStage.AFTER_EXPORT, records, undefined, runId);
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
                stepType: StepTypeEnum.EXPORT,
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
