/**
 * Extract Step Strategy
 *
 * EXTRACT step execution in linear pipelines.
 */

import { ExtractExecutor } from '../../executors';
import { RecordObject } from '../../executor-types';
import {
    StepStrategy,
    StepExecutionContext,
    StepStrategyResult,
    createStepDetail,
} from './step-strategy.interface';
import { getAdapterCode } from '../../../types/step-configs';

export class ExtractStepStrategy implements StepStrategy {
    constructor(private readonly extractExecutor: ExtractExecutor) {}

    async execute(context: StepExecutionContext): Promise<StepStrategyResult> {
        const { step, records } = context;
        const adapterCode = getAdapterCode(step);
        const t0 = Date.now();

        await this.logStepStart(context);
        // EXTRACT is a source step with no input records to modify.
        // Hook runs for side effects only (logging, metrics, authorization checks).
        await this.runBeforeHook(context, records);

        const out = await this.executeExtract(context);
        const durationMs = Date.now() - t0;

        const afterAfterHook = await this.runAfterHook(context, out);

        await this.logExtractData(context, adapterCode, out);
        await this.logStepComplete(context, adapterCode, out.length, durationMs);

        return {
            records: afterAfterHook,
            processed: out.length,
            succeeded: out.length,
            failed: 0,
            detail: createStepDetail(step, { out: out.length }, durationMs),
            counters: { extracted: out.length },
            event: { type: 'RECORD_EXTRACTED', data: { stepKey: step.key, count: out.length } },
        };
    }

    private async logStepStart(context: StepExecutionContext): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, 'EXTRACT', 0);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'BEFORE_EXTRACT', records, runId, pipelineId);
        return result.records;
    }

    private async executeExtract(context: StepExecutionContext): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError } = context;
        return this.extractExecutor.execute(ctx, step, executorCtx, onRecordError);
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, 'AFTER_EXTRACT', records, runId, pipelineId);
        return result.records;
    }

    private async logExtractData(context: StepExecutionContext, adapterCode: string, records: RecordObject[]): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onExtractData) {
            await stepLog.onExtractData(ctx, step.key, adapterCode, records);
        }
    }

    private async logStepComplete(
        context: StepExecutionContext,
        adapterCode: string,
        count: number,
        durationMs: number,
    ): Promise<void> {
        const { ctx, step, stepLog, records } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: 'EXTRACT',
                adapterCode,
                recordsIn: 0,
                recordsOut: count,
                succeeded: count,
                failed: 0,
                durationMs,
                sampleOutput: records[0] as RecordObject | undefined,
            });
        }
    }
}
