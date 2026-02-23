/**
 * Gate Step Strategy
 *
 * Strategy for executing GATE steps in both linear and graph pipelines.
 * Delegates to GateExecutor and converts the result to StepStrategyResult format.
 */

import { GateExecutor } from '../../executors/gate.executor';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { StepType as StepTypeEnum } from '../../../constants/enums';

/**
 * Strategy for GATE steps (human-in-the-loop approval)
 *
 * When a GATE step is reached, this strategy captures the current records
 * and returns them as the step output. The pipeline runner is responsible
 * for checking the GateResult metadata to decide whether to pause.
 */
export class GateStepStrategy implements StepStrategy {
    constructor(private readonly gateExecutor: GateExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { ctx, step, records, executorCtx } = context;
        const recordsIn = records.length;
        const t0 = Date.now();

        await this.logStepStart(context, recordsIn);

        const gateResult = await this.gateExecutor.execute(ctx, step, records, executorCtx);
        const durationMs = Date.now() - t0;

        await this.logStepComplete(context, recordsIn, durationMs);

        // Publish GateApprovalRequested event when gate pauses
        if (gateResult.paused) {
            try {
                context.domainEvents.publishGateApprovalRequested(
                    context.pipelineId?.toString(),
                    context.runId?.toString(),
                    step.key,
                );
            } catch {
                // Gate events are non-critical - don't disrupt pipeline flow
            }
        }

        return {
            records: gateResult.pendingRecords,
            processed: recordsIn,
            succeeded: recordsIn,
            failed: 0,
            detail: createStepDetail(step, {
                out: gateResult.pendingRecords.length,
                paused: gateResult.paused,
                shouldPause: gateResult.paused,
                approvalType: gateResult.config.approvalType,
                previewCount: gateResult.previewRecords.length,
            }, durationMs),
            counters: { gated: recordsIn },
        };
    }

    private async logStepStart(context: StepExecutionContext, recordsIn: number): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, StepTypeEnum.GATE, recordsIn);
        }
    }

    private async logStepComplete(
        context: StepExecutionContext,
        recordsIn: number,
        durationMs: number,
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: StepTypeEnum.GATE,
                adapterCode: '',
                recordsIn,
                recordsOut: recordsIn,
                succeeded: recordsIn,
                failed: 0,
                durationMs,
            });
        }
    }
}
