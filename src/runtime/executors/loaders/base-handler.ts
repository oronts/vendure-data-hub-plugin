/**
 * Base Handler Abstract Class
 *
 * Common functionality for all loader handlers to eliminate
 * duplicate code patterns across handler implementations.
 *
 * @module runtime/executors/loaders
 */

import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { DataHubLogger } from '../../../services/logger';

/**
 * Configuration for a step extracted from step.config
 */
export interface LoaderStepConfig {
    [key: string]: unknown;
}

/**
 * Result of processing a single record
 */
export type RecordProcessingResult =
    | { success: true }
    | { success: false; error: string; recoverable?: boolean };

/**
 * Abstract base class for loader handlers.
 *
 * Consolidates the common execute() loop pattern:
 * - Iterating through records
 * - Try/catch per record
 * - Counting ok/fail
 * - Calling onRecordError callback
 *
 * Subclasses implement:
 * - processRecord() - the actual per-record logic
 * - validateRequired() - check if record has required fields
 */
export abstract class BaseLoaderHandler implements LoaderHandler {
    protected abstract readonly logger: DataHubLogger;

    /**
     * Execute the loader for the given records using a standardized loop.
     */
    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;

        for (const rec of input) {
            try {
                // Validate required fields first
                const validationError = this.validateRequired(rec, step.config as LoaderStepConfig);
                if (validationError) {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, validationError, rec);
                    }
                    continue;
                }

                // Process the record
                const result = await this.processRecord(ctx, step, rec, errorHandling);

                if (result.success) {
                    ok++;
                } else {
                    fail++;
                    if (onRecordError) {
                        await onRecordError(step.key, result.error, rec);
                    }
                }
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                if (onRecordError) {
                    await onRecordError(step.key, errorMessage, rec);
                }
                fail++;
            }
        }

        return { ok, fail };
    }

    /**
     * Validate that required fields are present in the record.
     * Returns an error message if validation fails, or null if valid.
     */
    protected abstract validateRequired(rec: RecordObject, config: LoaderStepConfig): string | null;

    /**
     * Process a single record.
     */
    protected abstract processRecord(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        rec: RecordObject,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<RecordProcessingResult>;

    /**
     * Get a field value from a record using configurable field name
     */
    protected getFieldValue<T = unknown>(
        rec: RecordObject,
        config: LoaderStepConfig,
        configKey: string,
        defaultKey: string,
    ): T | undefined {
        const fieldName = (config[configKey] as string) ?? defaultKey;
        return rec[fieldName] as T | undefined;
    }

    /**
     * Get a string field value, converting to string if needed
     */
    protected getStringField(
        rec: RecordObject,
        config: LoaderStepConfig,
        configKey: string,
        defaultKey: string,
    ): string | undefined {
        const value = this.getFieldValue(rec, config, configKey, defaultKey);
        if (value === null || value === undefined) return undefined;
        const str = String(value);
        return str === '' ? undefined : str;
    }

    /**
     * Get a numeric field value, parsing strings if needed
     */
    protected getNumberField(
        rec: RecordObject,
        config: LoaderStepConfig,
        configKey: string,
        defaultKey: string,
    ): number | undefined {
        const value = this.getFieldValue(rec, config, configKey, defaultKey);
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'number') return value;
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
    }

    /**
     * Get a boolean field value
     */
    protected getBooleanField(
        rec: RecordObject,
        config: LoaderStepConfig,
        configKey: string,
        defaultKey: string,
        defaultValue?: boolean,
    ): boolean {
        const value = this.getFieldValue(rec, config, configKey, defaultKey);
        if (value === null || value === undefined) return defaultValue ?? false;
        if (typeof value === 'boolean') return value;
        const str = String(value).toLowerCase();
        return str === 'true' || str === '1' || str === 'yes';
    }

    /**
     * Get an array field value
     */
    protected getArrayField<T = unknown>(
        rec: RecordObject,
        config: LoaderStepConfig,
        configKey: string,
        defaultKey: string,
    ): T[] | undefined {
        const value = this.getFieldValue(rec, config, configKey, defaultKey);
        if (!value) return undefined;
        return Array.isArray(value) ? (value as T[]) : undefined;
    }

    /**
     * Log a warning with consistent formatting
     */
    protected logWarning(message: string, context: Record<string, unknown>): void {
        this.logger.warn(message, context);
    }

    /**
     * Log an error with consistent formatting
     */
    protected logError(message: string, error?: Error): void {
        this.logger.error(message, error);
    }
}

/**
 * Create a simple success result
 */
export function successResult(): RecordProcessingResult {
    return { success: true };
}

/**
 * Create a failure result
 */
export function failureResult(error: string, recoverable = false): RecordProcessingResult {
    return { success: false, error, recoverable };
}
