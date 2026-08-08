import type { RequestContext } from '@vendure/core';

import { LogPersistenceLevel } from '../../constants/enums';
import { TRUNCATION, calculateThroughput } from '../../constants/index';
import type { JsonObject, JsonValue } from '../../types/index';
import type { PipelineLogService } from '../pipeline/pipeline-log.service';
import type { DataHubLogger } from './datahub-logger';
import type { ExecutionLogPersistencePolicy } from './execution-log-persistence-policy';
import type {
    FieldMappingInfo,
    LogEventOptions,
    LogEventType,
    StepExecutionInfo,
} from './execution-logger.types';
import { sanitizeRecord } from './sanitizer';
import {
    sanitizeExecutionLogMessage,
    sanitizeExecutionLogObject,
} from './execution-log-safety';

const MAX_SAMPLE_SIZE = TRUNCATION.SAMPLE_VALUES_LIMIT;
const MAX_MAPPINGS_LOG = 50;
const MAX_FIELDS_LOG = 20;

function truncateValue(value: unknown): JsonValue {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        return value.length > TRUNCATION.MAX_FIELD_VALUE_LENGTH
            ? `${value.substring(0, TRUNCATION.MAX_FIELD_VALUE_LENGTH)}...`
            : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'object') {
        try {
            const serialized = JSON.stringify(value);
            return serialized.length > TRUNCATION.MAX_FIELD_VALUE_LENGTH
                ? `${serialized.substring(0, TRUNCATION.MAX_FIELD_VALUE_LENGTH)}...`
                : value as JsonValue;
        } catch {
            return '[Object]';
        }
    }
    return String(value);
}

function truncateSample(record: Record<string, unknown>): JsonObject {
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(sanitizeRecord(record)).slice(0, MAX_FIELDS_LOG)) {
        result[key] = truncateValue(value);
    }
    return result;
}

function buildFieldMappings(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
): FieldMappingInfo[] {
    const inputFields = Object.keys(input).slice(0, MAX_MAPPINGS_LOG);
    return Object.keys(output).slice(0, MAX_MAPPINGS_LOG).map(targetField => {
        const targetValue = output[targetField];
        let sourceField = targetField;
        if (!(targetField in input)) {
            sourceField = inputFields.find(field => input[field] === targetValue) ?? targetField;
        }
        return {
            sourceField,
            targetField,
            sampleSourceValue: truncateValue(input[sourceField]),
            sampleTargetValue: truncateValue(targetValue),
        };
    });
}

type DataSampleKind = 'extract' | 'load';

export class ExecutionLogDetailWriter {
    constructor(
        private readonly pipelineLogService: PipelineLogService,
        private readonly consoleLogger: DataHubLogger,
        private readonly persistencePolicy: ExecutionLogPersistencePolicy,
    ) {}

    private async persist(
        eventType: LogEventType,
        write: (level: LogPersistenceLevel) => Promise<void>,
    ): Promise<void> {
        await this.persistencePolicy.persist(eventType, write, error => {
            this.consoleLogger.warn('Execution log detail persistence failed', {
                eventType,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }

    async logStepExecution(
        ctx: RequestContext,
        info: StepExecutionInfo,
        options: LogEventOptions,
    ): Promise<void> {
        const throughput = calculateThroughput(info.recordsIn, info.durationMs);
        const skippedSummary = info.skipped ? `, ${info.skipped} skipped` : '';
        const message = `Step "${info.stepKey}" (${info.stepType}) completed: ${info.recordsIn} in → ${info.recordsOut} out, ${info.succeeded} ok, ${info.failed} failed${skippedSummary} [${info.durationMs}ms, ${throughput} rec/s]`;

        this.consoleLogger.info(message, {
            stepKey: info.stepKey,
            stepType: info.stepType,
            adapterCode: info.adapterCode,
            recordsIn: info.recordsIn,
            recordsOut: info.recordsOut,
            succeeded: info.succeeded,
            failed: info.failed,
            skipped: info.skipped ?? 0,
            durationMs: info.durationMs,
            throughput,
        });

        await this.persist('step.complete', async level => {
            await this.pipelineLogService.info(ctx, sanitizeExecutionLogMessage(message), {
            pipelineId: options.pipelineId,
            runId: options.runId,
            stepKey: info.stepKey,
            durationMs: info.durationMs,
            recordsProcessed: info.recordsIn,
            recordsFailed: info.failed,
            context: sanitizeExecutionLogObject({
                stepType: info.stepType,
                adapterCode: info.adapterCode ?? null,
                recordsOut: info.recordsOut,
                succeeded: info.succeeded,
                skipped: info.skipped ?? 0,
                throughput,
            }),
            metadata: level === LogPersistenceLevel.DEBUG ? sanitizeExecutionLogObject({
                sampleRecord: info.sampleRecord ? truncateSample(info.sampleRecord) : null,
                fieldMappings: info.fieldMappings?.slice(0, MAX_MAPPINGS_LOG) ?? null,
            }) : undefined,
            });
        });
    }

    async logExtractedData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        await this.logDataSample(ctx, 'extract', stepKey, adapterCode, records, options);
    }

    async logLoadTargetData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        await this.logDataSample(ctx, 'load', stepKey, adapterCode, records, options);
    }

    private async logDataSample(
        ctx: RequestContext,
        kind: DataSampleKind,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        const sampleRecords = records.slice(0, MAX_SAMPLE_SIZE).map(truncateSample);
        const fieldNames = records.length > 0 ? Object.keys(records[0]) : [];
        const message = kind === 'extract'
            ? `Extract "${stepKey}" (${adapterCode}): ${records.length} records with ${fieldNames.length} fields`
            : `Load "${stepKey}" (${adapterCode}): ${records.length} records to load with ${fieldNames.length} fields`;

        this.consoleLogger.debug(message, {
            stepKey,
            adapterCode,
            recordCount: records.length,
            fieldCount: fieldNames.length,
            fields: fieldNames.slice(0, MAX_FIELDS_LOG),
        });

        const eventType = kind === 'extract' ? 'extract.source' : 'load.target';
        await this.persist(eventType, async () => {
            await this.pipelineLogService.debug(ctx, sanitizeExecutionLogMessage(message), {
            pipelineId: options.pipelineId,
            runId: options.runId,
            stepKey,
            context: sanitizeExecutionLogObject({
                adapterCode,
                recordCount: records.length,
                fieldCount: fieldNames.length,
            }),
            metadata: sanitizeExecutionLogObject({
                fields: fieldNames.slice(0, MAX_FIELDS_LOG),
                sampleRecords: sampleRecords as JsonValue,
            }),
            });
        });
    }

    async logFieldMappings(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        inputRecord: Record<string, unknown>,
        outputRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        const sanitizedInput = sanitizeRecord(inputRecord);
        const sanitizedOutput = sanitizeRecord(outputRecord);
        const inputFields = Object.keys(sanitizedInput);
        const outputFields = Object.keys(sanitizedOutput);
        const mappings = buildFieldMappings(sanitizedInput, sanitizedOutput);
        const message = `Transform "${stepKey}" (${adapterCode}): ${inputFields.length} input fields → ${outputFields.length} output fields`;

        this.consoleLogger.debug(message, {
            stepKey,
            adapterCode,
            inputFieldCount: inputFields.length,
            outputFieldCount: outputFields.length,
        });

        await this.persist('transform.mapping', async () => {
            await this.pipelineLogService.debug(ctx, sanitizeExecutionLogMessage(message), {
            pipelineId: options.pipelineId,
            runId: options.runId,
            stepKey,
            context: sanitizeExecutionLogObject({
                adapterCode,
                inputFieldCount: inputFields.length,
                outputFieldCount: outputFields.length,
            }),
            metadata: sanitizeExecutionLogObject({
                inputFields: inputFields.slice(0, MAX_FIELDS_LOG),
                outputFields: outputFields.slice(0, MAX_FIELDS_LOG),
                mappings,
            }),
            });
        });
    }

    async logRecordTransformation(
        ctx: RequestContext,
        stepKey: string,
        recordIndex: number,
        sourceRecord: Record<string, unknown>,
        targetRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Record #${recordIndex} transformation in "${stepKey}"`;
        this.consoleLogger.debug(message, {
            stepKey,
            recordIndex,
            sourceFields: Object.keys(sourceRecord).length,
            targetFields: Object.keys(targetRecord).length,
        });

        await this.persist('debug', async () => {
            await this.pipelineLogService.debug(ctx, sanitizeExecutionLogMessage(message), {
            pipelineId: options.pipelineId,
            runId: options.runId,
            stepKey,
            context: sanitizeExecutionLogObject({ recordIndex }),
            metadata: sanitizeExecutionLogObject({
                source: truncateSample(sourceRecord),
                target: truncateSample(targetRecord),
            }),
            });
        });
    }
}
