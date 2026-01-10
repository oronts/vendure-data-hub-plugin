/**
 * Base Adapter
 *
 * Abstract base class and common utilities for adapters.
 * Provides consistent error handling and result formatting.
 */

import { RecordObject } from '../../runtime/executor-types';
import {
    AdapterDefinition,
    AdapterResult,
    AdapterError,
    AdapterStats,
    AdapterConfigSchema,
} from '../types';

// RESULT BUILDERS

/**
 * Create a successful adapter result
 */
export function createSuccessResult(
    records: RecordObject[],
    stats?: Partial<AdapterStats>,
): AdapterResult {
    return {
        success: true,
        records,
        stats: {
            processed: stats?.processed ?? records.length,
            created: stats?.created,
            updated: stats?.updated,
            skipped: stats?.skipped,
            failed: stats?.failed,
        },
    };
}

/**
 * Create a failed adapter result
 */
export function createErrorResult(
    records: RecordObject[],
    errors: AdapterError[],
    stats?: Partial<AdapterStats>,
): AdapterResult {
    return {
        success: false,
        records,
        errors,
        stats: {
            processed: stats?.processed ?? records.length,
            failed: stats?.failed ?? errors.length,
            created: stats?.created,
            updated: stats?.updated,
            skipped: stats?.skipped,
        },
    };
}

/**
 * Create an adapter error object
 */
export function createAdapterError(
    message: string,
    options?: { index?: number; field?: string; code?: string },
): AdapterError {
    return {
        message,
        index: options?.index,
        field: options?.field,
        code: options?.code,
    };
}

// STATS HELPERS

/**
 * Create initial stats object
 */
export function createInitialStats(): AdapterStats {
    return {
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
    };
}

/**
 * Increment a stats counter
 */
export function incrementStat(
    stats: AdapterStats,
    field: keyof AdapterStats,
): void {
    if (stats[field] !== undefined) {
        (stats[field] as number)++;
    }
}

// ADAPTER BUILDER HELPER

/**
 * Helper to create adapter definitions with proper typing
 */
export function defineAdapter(options: {
    code: string;
    name: string;
    type: 'extractor' | 'transformer' | 'loader' | 'exporter' | 'validator';
    description: string;
    configSchema?: AdapterConfigSchema;
    process: AdapterDefinition['process'];
}): AdapterDefinition {
    return {
        code: options.code,
        name: options.name,
        type: options.type,
        description: options.description,
        configSchema: options.configSchema,
        process: options.process,
    };
}

// ERROR HANDLING

/**
 * Extract error message from unknown error type
 */
export function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
}

/**
 * Wrap adapter process function with error handling
 */
export function withErrorHandling<T extends unknown[]>(
    fn: (...args: T) => Promise<AdapterResult>,
): (...args: T) => Promise<AdapterResult> {
    return async (...args: T): Promise<AdapterResult> => {
        try {
            return await fn(...args);
        } catch (error) {
            return createErrorResult(
                [],
                [createAdapterError(extractErrorMessage(error), { code: 'ADAPTER_ERROR' })],
            );
        }
    };
}
