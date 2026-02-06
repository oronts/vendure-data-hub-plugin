import { RequestContext, ID } from '@vendure/core';
import { JsonObject } from '../../types/index';
import { ExecutionLogger } from '../../services/logger';
import { StepLogCallback, StepLogInfo } from '../orchestration';
import { RecordObject } from '../executor-types';

/**
 * Creates step logging callbacks for database persistence
 */
export function createStepLogCallback(
    executionLogger: ExecutionLogger,
    pipelineId?: ID,
    runId?: ID,
): StepLogCallback {
    const options = { pipelineId, runId };

    return {
        onStepStart: async (ctx: RequestContext, stepKey: string, stepType: string, recordsIn: number) => {
            await executionLogger.logStepStart(ctx, stepKey, stepType, {
                ...options,
                recordsProcessed: recordsIn,
            });
        },
        onStepComplete: async (ctx: RequestContext, info: StepLogInfo) => {
            await executionLogger.logStepExecution(ctx, {
                stepKey: info.stepKey,
                stepType: info.stepType,
                adapterCode: info.adapterCode,
                recordsIn: info.recordsIn,
                recordsOut: info.recordsOut,
                succeeded: info.succeeded,
                failed: info.failed,
                durationMs: info.durationMs,
                sampleRecord: info.sampleOutput as JsonObject | undefined,
            }, options);
        },
        onStepFailed: async (ctx: RequestContext, stepKey: string, stepType: string, error: Error, durationMs: number) => {
            await executionLogger.logStepFailed(ctx, stepKey, stepType, error, {
                ...options,
                durationMs,
            });
        },
        onExtractData: async (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => {
            await executionLogger.logExtractedData(ctx, stepKey, adapterCode, records as Record<string, unknown>[], options);
        },
        onLoadData: async (ctx: RequestContext, stepKey: string, adapterCode: string, records: RecordObject[]) => {
            await executionLogger.logLoadTargetData(ctx, stepKey, adapterCode, records as Record<string, unknown>[], options);
        },
        onTransformMapping: async (ctx: RequestContext, stepKey: string, adapterCode: string, inputRecord: RecordObject, outputRecord: RecordObject) => {
            await executionLogger.logFieldMappings(ctx, stepKey, adapterCode, inputRecord as Record<string, unknown>, outputRecord as Record<string, unknown>, options);
        },
    };
}
