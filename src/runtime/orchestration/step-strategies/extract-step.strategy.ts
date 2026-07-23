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
import { StepType as StepTypeEnum, DomainEventType, HookStage } from '../../../constants/enums';

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
        const validated = step.schemaRef
            ? await this.extractExecutor.validateExtractedRecords(
                context.ctx,
                step,
                afterAfterHook,
                context.onRecordError,
            )
            : afterAfterHook;
        const failedCount = afterAfterHook.length - validated.length;

        await this.logExtractData(context, adapterCode, validated);
        await this.logStepComplete(
            context,
            adapterCode,
            validated.length,
            failedCount,
            durationMs,
            validated,
        );

        return {
            records: validated,
            processed: failedCount,
            succeeded: 0,
            failed: failedCount,
            detail: createStepDetail(
                step,
                { out: validated.length, failed: failedCount },
                durationMs,
            ),
            counters: { extracted: validated.length },
            event: { type: DomainEventType.RECORD_EXTRACTED, data: { stepKey: step.key, count: validated.length } },
        };
    }

    private async logStepStart(context: StepExecutionContext): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepStart) {
            await stepLog.onStepStart(ctx, step.key, StepTypeEnum.EXTRACT, 0);
        }
    }

    private async runBeforeHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, HookStage.BEFORE_EXTRACT, records, runId, pipelineId);
        return result.records;
    }

    private async executeExtract(context: StepExecutionContext): Promise<RecordObject[]> {
        const { ctx, step, executorCtx, onRecordError, pipelineId, runId, records, seedMode } = context;
        const sourceRecords = seedMode === 'SOURCE_REFERENCES' ? records : undefined;
        return this.extractExecutor.execute(
            ctx,
            step,
            executorCtx,
            onRecordError,
            pipelineId,
            runId,
            sourceRecords,
        );
    }

    private async runAfterHook(context: StepExecutionContext, records: RecordObject[]): Promise<RecordObject[]> {
        const { ctx, definition, hookService, runId, pipelineId } = context;
        const result = await hookService.runInterceptors(ctx, definition, HookStage.AFTER_EXTRACT, records, runId, pipelineId);
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
        failed: number,
        durationMs: number,
        extractedRecords: RecordObject[],
    ): Promise<void> {
        const { ctx, step, stepLog } = context;
        if (stepLog?.onStepComplete) {
            await stepLog.onStepComplete(ctx, {
                stepKey: step.key,
                stepType: StepTypeEnum.EXTRACT,
                adapterCode,
                recordsIn: 0,
                recordsOut: count,
                succeeded: count,
                failed,
                durationMs,
                sampleOutput: extractedRecords[0] as RecordObject | undefined,
            });
        }
    }
}
