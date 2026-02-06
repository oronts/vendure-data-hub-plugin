/**
 * Job Processor Utilities
 *
 * Common utilities for job processing, error handling, and logging.
 */

import { LOGGER_CONTEXTS, HTTP, TIME_UNITS } from '../../constants/index';
import { JobResult, JobContext } from '../types';
import { DataHubLogger } from '../../services/logger';
import {
    executeWithRetry as executeWithRetryShared,
    calculateBackoff,
    createRetryConfig,
    sleep,
    DEFAULT_RETRY_CONFIG,
    isRetryableError as isRetryableErrorBase,
} from '../../utils/retry.utils';
import { getErrorMessage } from '../../utils/error.utils';

const logger = new DataHubLogger(LOGGER_CONTEXTS.JOB_PROCESSOR);

/**
 * Create a job context for tracking
 *
 * @param jobId - Unique job identifier
 * @param attempt - Current attempt number
 * @param maxAttempts - Maximum attempts allowed
 */
export function createJobContext(
    jobId: string,
    attempt: number = 1,
    maxAttempts: number = HTTP.MAX_RETRIES,
): JobContext {
    return {
        jobId,
        attempt,
        maxAttempts,
        createdAt: new Date(),
    };
}

/**
 * Create a successful job result
 *
 * @param durationMs - Execution duration in milliseconds
 * @param metadata - Additional metadata
 */
export function createSuccessResult(
    durationMs?: number,
    metadata?: Record<string, unknown>,
): JobResult {
    return {
        success: true,
        durationMs,
        metadata,
    };
}

/**
 * Create a failed job result
 *
 * @param error - Error message or Error object
 * @param durationMs - Execution duration in milliseconds
 * @param metadata - Additional metadata
 */
export function createFailureResult(
    error: string | Error,
    durationMs?: number,
    metadata?: Record<string, unknown>,
): JobResult {
    return {
        success: false,
        error: error instanceof Error ? error.message : error,
        durationMs,
        metadata,
    };
}

/**
 * Wrap a job processor function with error handling and timing
 *
 * @param name - Name of the job for logging
 * @param processor - The processor function to wrap
 * @returns Wrapped processor function
 */
export function withJobProcessing<T, R>(
    name: string,
    processor: (data: T) => Promise<R>,
): (data: T) => Promise<JobResult> {
    return async (data: T): Promise<JobResult> => {
        const startTime = Date.now();

        try {
            logger.debug(`Starting job: ${name}`);
            await processor(data);
            const durationMs = Date.now() - startTime;

            logger.debug(`Job completed: ${name}`, { durationMs });

            return createSuccessResult(durationMs);
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = getErrorMessage(error);

            logger.error(`Job failed: ${name}`, error instanceof Error ? error : undefined, { durationMs });

            return createFailureResult(errorMessage, durationMs);
        }
    };
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
        backoffMultiplier?: number;
        onRetry?: (attempt: number, error: Error) => void;
    } = {},
): Promise<T> {
    const {
        maxAttempts = HTTP.MAX_RETRIES,
        baseDelayMs = HTTP.RETRY_DELAY_MS,
        maxDelayMs = HTTP.RETRY_MAX_DELAY_MS,
        backoffMultiplier = DEFAULT_RETRY_CONFIG.backoffMultiplier,
        onRetry,
    } = options;

    const config = createRetryConfig({
        maxAttempts,
        initialDelayMs: baseDelayMs,
        maxDelayMs,
        backoffMultiplier,
    });

    return executeWithRetryShared(fn, {
        config,
        onRetry: onRetry ? (attempt, error) => onRetry(attempt, error) : undefined,
        logger: {
            warn: (msg, meta) => logger.warn(msg, meta),
            debug: (msg, meta) => logger.debug(msg, meta),
        },
    });
}

export { sleep };

/**
 * Calculate exponential backoff delay
 *
 * @param attempt - Current attempt number (1-based)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @param multiplier - Backoff multiplier
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number = HTTP.RETRY_DELAY_MS,
    maxDelayMs: number = HTTP.RETRY_MAX_DELAY_MS,
    multiplier: number = DEFAULT_RETRY_CONFIG.backoffMultiplier,
): number {
    return calculateBackoff(attempt, {
        maxAttempts: 1,
        initialDelayMs: baseDelayMs,
        maxDelayMs,
        backoffMultiplier: multiplier,
        jitterFactor: 0,
    });
}

/**
 * Check if an error is retryable
 *
 * Uses the base implementation from retry.utils and allows additional patterns.
 *
 * @param error - Error to check
 * @param additionalPatterns - Additional patterns to check beyond defaults
 * @returns True if the error is retryable
 */
export function isRetryableError(
    error: Error,
    additionalPatterns: (string | RegExp)[] = [],
): boolean {
    // Check base patterns from retry.utils
    if (isRetryableErrorBase(error)) {
        return true;
    }

    // Check additional patterns if provided
    if (additionalPatterns.length > 0) {
        const message = error.message.toLowerCase();
        for (const pattern of additionalPatterns) {
            if (typeof pattern === 'string') {
                if (message.includes(pattern.toLowerCase())) {
                    return true;
                }
            } else {
                if (pattern.test(message)) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Format job duration for display
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(durationMs: number): string {
    if (durationMs < TIME_UNITS.SECOND) {
        return `${durationMs}ms`;
    }
    if (durationMs < TIME_UNITS.MINUTE) {
        return `${(durationMs / TIME_UNITS.SECOND).toFixed(1)}s`;
    }
    const minutes = Math.floor(durationMs / TIME_UNITS.MINUTE);
    const seconds = Math.round((durationMs % TIME_UNITS.MINUTE) / TIME_UNITS.SECOND);
    return `${minutes}m ${seconds}s`;
}
