/**
 * Centralized database logging with configurable persistence levels.
 * Respects LogPersistenceLevel to control what gets persisted while
 * always maintaining full console logging.
 */

import { Injectable } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { LogPersistenceLevel } from '../../constants/enums';
import { LOGGER_CONTEXTS, CACHE, TRUNCATION, calculateThroughput } from '../../constants/index';
import { PipelineLogService } from '../pipeline/pipeline-log.service';
import { DataHubSettingsService } from '../config/settings.service';
import { DataHubLogger, DataHubLoggerFactory } from './datahub-logger';
import { sanitizeRecord, sanitizeForLog } from './sanitizer';
import type { JsonObject, JsonValue } from '../../types/index';

/** Log event types for categorization */
export type LogEventType =
    | 'pipeline.start'
    | 'pipeline.complete'
    | 'pipeline.fail'
    | 'step.start'
    | 'step.complete'
    | 'step.fail'
    | 'record.error'
    | 'transform.mapping'
    | 'extract.source'
    | 'load.target'
    | 'debug';

/** Options for logging an event */
export interface LogEventOptions {
    pipelineId?: ID;
    runId?: ID;
    stepKey?: string;
    durationMs?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
    recordsIn?: number;
    recordsOut?: number;
    context?: JsonObject;
    metadata?: JsonObject;
}

/** Source/target mapping info for debugging */
export interface FieldMappingInfo {
    sourceField: string;
    targetField: string;
    transformType?: string;
    sampleSourceValue?: JsonValue;
    sampleTargetValue?: JsonValue;
}

/** Step execution info for detailed logging */
export interface StepExecutionInfo {
    stepKey: string;
    stepType: string;
    adapterCode?: string;
    recordsIn: number;
    recordsOut: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    sampleRecord?: JsonObject;
    fieldMappings?: FieldMappingInfo[];
}

/**
 * Determines which persistence level is required for each event type
 */
const EVENT_LEVEL_MAP: Record<LogEventType, LogPersistenceLevel> = {
    'pipeline.start': LogPersistenceLevel.PIPELINE,
    'pipeline.complete': LogPersistenceLevel.PIPELINE,
    'pipeline.fail': LogPersistenceLevel.ERROR_ONLY,
    'step.start': LogPersistenceLevel.STEP,
    'step.complete': LogPersistenceLevel.STEP,
    'step.fail': LogPersistenceLevel.ERROR_ONLY,
    'record.error': LogPersistenceLevel.ERROR_ONLY,
    'transform.mapping': LogPersistenceLevel.DEBUG,
    'extract.source': LogPersistenceLevel.DEBUG,
    'load.target': LogPersistenceLevel.DEBUG,
    'debug': LogPersistenceLevel.DEBUG,
};

/**
 * Persistence level hierarchy (higher includes lower)
 */
const LEVEL_HIERARCHY: Record<LogPersistenceLevel, number> = {
    [LogPersistenceLevel.ERROR_ONLY]: 1,
    [LogPersistenceLevel.PIPELINE]: 2,
    [LogPersistenceLevel.STEP]: 3,
    [LogPersistenceLevel.DEBUG]: 4,
};

/** Maximum sample record size for logging */
const MAX_SAMPLE_SIZE = TRUNCATION.SAMPLE_VALUES_LIMIT;

@Injectable()
export class ExecutionLogger {
    private readonly consoleLogger: DataHubLogger;
    private cachedLevel: LogPersistenceLevel | null = null;
    private cacheTime = 0;
    private readonly cacheTtlMs = CACHE.SETTINGS_TTL_MS;

    constructor(
        private pipelineLogService: PipelineLogService,
        private settingsService: DataHubSettingsService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.consoleLogger = loggerFactory.createLogger(LOGGER_CONTEXTS.EXECUTION_LOGGER);
    }

    /**
     * Get the current persistence level (with caching)
     */
    private async getPersistenceLevel(): Promise<LogPersistenceLevel> {
        const now = Date.now();
        if (this.cachedLevel && now - this.cacheTime < this.cacheTtlMs) {
            return this.cachedLevel;
        }
        this.cachedLevel = await this.settingsService.getLogPersistenceLevel();
        this.cacheTime = now;
        return this.cachedLevel;
    }

    /**
     * Check if an event should be persisted to database
     */
    private shouldPersist(eventType: LogEventType, currentLevel: LogPersistenceLevel): boolean {
        const requiredLevel = EVENT_LEVEL_MAP[eventType];
        return LEVEL_HIERARCHY[currentLevel] >= LEVEL_HIERARCHY[requiredLevel];
    }

    /**
     * Log a pipeline start event
     */
    async logPipelineStart(
        ctx: RequestContext,
        pipelineCode: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution started`;

        // Always log to console
        this.consoleLogger.info(message, { pipelineCode, ...options.context });

        // Persist to database based on level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('pipeline.start', level)) {
            await this.pipelineLogService.info(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                context: { pipelineCode, ...options.context },
            });
        }
    }

    /**
     * Log a pipeline completion event
     */
    async logPipelineComplete(
        ctx: RequestContext,
        pipelineCode: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution completed`;

        // Always log to console
        this.consoleLogger.info(message, {
            pipelineCode,
            durationMs: options.durationMs,
            recordsProcessed: options.recordsProcessed,
            recordsFailed: options.recordsFailed,
            ...options.context,
        });

        // Persist to database based on level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('pipeline.complete', level)) {
            await this.pipelineLogService.info(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                durationMs: options.durationMs,
                recordsProcessed: options.recordsProcessed,
                recordsFailed: options.recordsFailed,
                context: { pipelineCode, ...options.context },
                metadata: options.metadata,
            });
        }
    }

    /**
     * Log a pipeline failure event
     */
    async logPipelineFailed(
        ctx: RequestContext,
        pipelineCode: string,
        error: Error,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Pipeline "${pipelineCode}" execution failed: ${error.message}`;

        // Always log to console
        this.consoleLogger.error(message, error, {
            pipelineCode,
            durationMs: options.durationMs,
            ...options.context,
        });

        // Always persist errors (ERROR_ONLY is minimum level)
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('pipeline.fail', level)) {
            await this.pipelineLogService.error(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                durationMs: options.durationMs,
                context: { pipelineCode, error: error.message, ...options.context },
                metadata: { stack: error.stack ?? null, ...options.metadata },
            });
        }
    }

    /**
     * Log a step start event
     */
    async logStepStart(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) started`;

        // Always log to console
        this.consoleLogger.debug(message, { stepKey, stepType, ...options.context });

        // Persist to database based on level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('step.start', level)) {
            await this.pipelineLogService.info(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: { stepType, ...options.context },
            });
        }
    }

    /**
     * Log a step completion event
     */
    async logStepComplete(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) completed`;

        // Always log to console
        this.consoleLogger.debug(message, {
            stepKey,
            stepType,
            durationMs: options.durationMs,
            recordsProcessed: options.recordsProcessed,
            recordsFailed: options.recordsFailed,
            ...options.context,
        });

        // Persist to database based on level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('step.complete', level)) {
            await this.pipelineLogService.info(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                durationMs: options.durationMs,
                recordsProcessed: options.recordsProcessed,
                recordsFailed: options.recordsFailed,
                context: { stepType, ...options.context },
                metadata: options.metadata,
            });
        }
    }

    /**
     * Log a step failure event
     */
    async logStepFailed(
        ctx: RequestContext,
        stepKey: string,
        stepType: string,
        error: Error,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Step "${stepKey}" (${stepType}) failed: ${error.message}`;

        // Always log to console
        this.consoleLogger.error(message, error, {
            stepKey,
            stepType,
            durationMs: options.durationMs,
            ...options.context,
        });

        // Always persist errors
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('step.fail', level)) {
            await this.pipelineLogService.error(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                durationMs: options.durationMs,
                context: { stepType, error: error.message, ...options.context },
                metadata: { stack: error.stack ?? null, ...options.metadata },
            });
        }
    }

    /**
     * Log a record-level error
     */
    async logRecordError(
        ctx: RequestContext,
        stepKey: string,
        errorMessage: string,
        payload: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Record error in step "${stepKey}": ${errorMessage}`;

        // Always log to console
        this.consoleLogger.warn(message, {
            stepKey,
            error: errorMessage,
            ...options.context,
        });

        // Always persist record errors (with sanitized payload)
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('record.error', level)) {
            await this.pipelineLogService.warn(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: { error: errorMessage, ...options.context },
                metadata: sanitizeRecord(payload) as JsonObject,
            });
        }
    }

    /**
     * Log a debug event (only persisted at DEBUG level)
     */
    async logDebug(
        ctx: RequestContext,
        message: string,
        options: LogEventOptions,
    ): Promise<void> {
        // Always log to console
        this.consoleLogger.debug(message, options.context);

        // Only persist at DEBUG level (with sanitized metadata)
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('debug', level)) {
            await this.pipelineLogService.debug(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey: options.stepKey,
                context: options.context ? sanitizeForLog(options.context) as JsonObject : undefined,
                metadata: options.metadata ? sanitizeForLog(options.metadata) as JsonObject : undefined,
            });
        }
    }

    /**
     * Log detailed step execution info (STEP level)
     */
    async logStepExecution(
        ctx: RequestContext,
        info: StepExecutionInfo,
        options: LogEventOptions,
    ): Promise<void> {
        const throughput = calculateThroughput(info.recordsIn, info.durationMs);

        const message = `Step "${info.stepKey}" (${info.stepType}) completed: ${info.recordsIn} in → ${info.recordsOut} out, ${info.succeeded} ok, ${info.failed} failed [${info.durationMs}ms, ${throughput} rec/s]`;

        // Always log to console with full details
        this.consoleLogger.info(message, {
            stepKey: info.stepKey,
            stepType: info.stepType,
            adapterCode: info.adapterCode,
            recordsIn: info.recordsIn,
            recordsOut: info.recordsOut,
            succeeded: info.succeeded,
            failed: info.failed,
            durationMs: info.durationMs,
            throughput,
        });

        // Persist to database based on level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('step.complete', level)) {
            await this.pipelineLogService.info(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey: info.stepKey,
                durationMs: info.durationMs,
                recordsProcessed: info.recordsIn,
                recordsFailed: info.failed,
                context: {
                    stepType: info.stepType,
                    adapterCode: info.adapterCode ?? null,
                    recordsOut: info.recordsOut,
                    succeeded: info.succeeded,
                    throughput,
                },
                metadata: level === LogPersistenceLevel.DEBUG ? {
                    sampleRecord: info.sampleRecord ? this.truncateSample(info.sampleRecord) : null,
                    fieldMappings: info.fieldMappings as unknown as JsonValue ?? null,
                } : undefined,
            });
        }
    }

    /**
     * Log extracted source data (DEBUG level)
     */
    async logExtractedData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        const sampleRecords = records.slice(0, MAX_SAMPLE_SIZE).map(r => this.truncateSample(r));
        const fieldNames = records.length > 0 ? Object.keys(records[0]) : [];

        const message = `Extract "${stepKey}" (${adapterCode}): ${records.length} records with ${fieldNames.length} fields`;

        // Always log to console
        this.consoleLogger.debug(message, {
            stepKey,
            adapterCode,
            recordCount: records.length,
            fieldCount: fieldNames.length,
            fields: fieldNames.slice(0, 20),
        });

        // Persist at DEBUG level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('extract.source', level)) {
            await this.pipelineLogService.debug(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: {
                    adapterCode,
                    recordCount: records.length,
                    fieldCount: fieldNames.length,
                },
                metadata: {
                    fields: fieldNames,
                    sampleRecords: sampleRecords as JsonValue,
                },
            });
        }
    }

    /**
     * Log data before loading to target (DEBUG level)
     */
    async logLoadTargetData(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        records: Record<string, unknown>[],
        options: LogEventOptions,
    ): Promise<void> {
        const sampleRecords = records.slice(0, MAX_SAMPLE_SIZE).map(r => this.truncateSample(r));
        const fieldNames = records.length > 0 ? Object.keys(records[0]) : [];

        const message = `Load "${stepKey}" (${adapterCode}): ${records.length} records to load with ${fieldNames.length} fields`;

        // Always log to console
        this.consoleLogger.debug(message, {
            stepKey,
            adapterCode,
            recordCount: records.length,
            fieldCount: fieldNames.length,
            fields: fieldNames.slice(0, 20),
        });

        // Persist at DEBUG level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('load.target', level)) {
            await this.pipelineLogService.debug(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: {
                    adapterCode,
                    recordCount: records.length,
                    fieldCount: fieldNames.length,
                },
                metadata: {
                    fields: fieldNames,
                    sampleRecords: sampleRecords as JsonValue,
                },
            });
        }
    }

    /**
     * Log field mappings from transform step (DEBUG level)
     * Sample values are sanitized to remove sensitive data.
     */
    async logFieldMappings(
        ctx: RequestContext,
        stepKey: string,
        adapterCode: string,
        inputRecord: Record<string, unknown>,
        outputRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        // Sanitize input/output records before processing
        const sanitizedInput = sanitizeRecord(inputRecord);
        const sanitizedOutput = sanitizeRecord(outputRecord);

        const inputFields = Object.keys(sanitizedInput);
        const outputFields = Object.keys(sanitizedOutput);

        // Build mapping info by comparing input and output
        const mappings: FieldMappingInfo[] = [];
        for (const outField of outputFields) {
            const outValue = sanitizedOutput[outField];
            // Try to find matching source field
            let sourceField = outField;
            if (!(outField in sanitizedInput)) {
                // Check if value matches any input value
                for (const inField of inputFields) {
                    if (sanitizedInput[inField] === outValue) {
                        sourceField = inField;
                        break;
                    }
                }
            }
            mappings.push({
                sourceField,
                targetField: outField,
                sampleSourceValue: this.truncateValue(sanitizedInput[sourceField]),
                sampleTargetValue: this.truncateValue(outValue),
            });
        }

        const message = `Transform "${stepKey}" (${adapterCode}): ${inputFields.length} input fields → ${outputFields.length} output fields`;

        // Always log to console
        this.consoleLogger.debug(message, {
            stepKey,
            adapterCode,
            inputFieldCount: inputFields.length,
            outputFieldCount: outputFields.length,
        });

        // Persist at DEBUG level
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('transform.mapping', level)) {
            await this.pipelineLogService.debug(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: {
                    adapterCode,
                    inputFieldCount: inputFields.length,
                    outputFieldCount: outputFields.length,
                },
                metadata: {
                    inputFields,
                    outputFields,
                    mappings: mappings.slice(0, 50) as unknown as JsonValue, // Limit to 50 mappings
                },
            });
        }
    }

    /**
     * Log a comparison between source and target for a record (DEBUG level)
     * Records are automatically sanitized to remove sensitive data.
     */
    async logRecordTransformation(
        ctx: RequestContext,
        stepKey: string,
        recordIndex: number,
        sourceRecord: Record<string, unknown>,
        targetRecord: Record<string, unknown>,
        options: LogEventOptions,
    ): Promise<void> {
        const message = `Record #${recordIndex} transformation in "${stepKey}"`;

        // Always log to console at debug
        this.consoleLogger.debug(message, {
            stepKey,
            recordIndex,
            sourceFields: Object.keys(sourceRecord).length,
            targetFields: Object.keys(targetRecord).length,
        });

        // Persist at DEBUG level (records are sanitized via truncateSample)
        const level = await this.getPersistenceLevel();
        if (this.shouldPersist('debug', level)) {
            await this.pipelineLogService.debug(ctx, message, {
                pipelineId: options.pipelineId,
                runId: options.runId,
                stepKey,
                context: { recordIndex },
                metadata: {
                    source: this.truncateSample(sourceRecord),
                    target: this.truncateSample(targetRecord),
                },
            });
        }
    }

    /**
     * Truncate and sanitize a sample record for safe logging.
     * Removes sensitive fields and masks PII (emails, phone numbers).
     */
    private truncateSample(record: Record<string, unknown>): JsonObject {
        // First sanitize to remove/mask sensitive data
        const sanitized = sanitizeRecord(record);
        // Then truncate long values
        const result: JsonObject = {};
        for (const [key, value] of Object.entries(sanitized)) {
            result[key] = this.truncateValue(value);
        }
        return result;
    }

    /**
     * Truncate a value for safe logging
     */
    private truncateValue(value: unknown): JsonValue {
        if (value === null) return null;
        if (value === undefined) return null;
        if (typeof value === 'string') {
            return value.length > TRUNCATION.MAX_FIELD_VALUE_LENGTH
                ? value.substring(0, TRUNCATION.MAX_FIELD_VALUE_LENGTH) + '...'
                : value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'object') {
            try {
                const str = JSON.stringify(value);
                if (str.length > TRUNCATION.MAX_FIELD_VALUE_LENGTH) {
                    return str.substring(0, TRUNCATION.MAX_FIELD_VALUE_LENGTH) + '...';
                }
                return value as JsonValue;
            } catch {
                // JSON stringify failed (circular reference etc.) - return placeholder
                return '[Object]';
            }
        }
        return String(value);
    }

    /**
     * Invalidate the cached persistence level (call when settings change)
     */
    invalidateCache(): void {
        this.cachedLevel = null;
        this.cacheTime = 0;
    }

    /**
     * Get current persistence level (for external checks)
     */
    async getCurrentLevel(): Promise<LogPersistenceLevel> {
        return this.getPersistenceLevel();
    }
}
