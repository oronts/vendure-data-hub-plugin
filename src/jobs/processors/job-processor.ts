/**
 * Job Processor Utilities
 *
 * Common utilities for job processing, error handling, and logging.
 */

import { Logger } from '@vendure/core';
import { LOGGER_CTX, DEFAULTS, HTTP, TIME_UNITS } from '../../constants/index';
import { JobResult, JobContext } from '../types';

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
    maxAttempts: number = DEFAULTS.MAX_RETRIES,
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
            Logger.debug(`Starting job: ${name}`, LOGGER_CTX);
            await processor(data);
            const durationMs = Date.now() - startTime;

            Logger.debug(
                `Job completed: ${name} (${durationMs}ms)`,
                LOGGER_CTX,
            );

            return createSuccessResult(durationMs);
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            Logger.error(
                `Job failed: ${name} - ${errorMessage}`,
                LOGGER_CTX,
            );

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
        maxAttempts = DEFAULTS.MAX_RETRIES,
        baseDelayMs = HTTP.RETRY_DELAY_MS,
        maxDelayMs = HTTP.RETRY_MAX_DELAY_MS,
        backoffMultiplier = DEFAULTS.WEBHOOK_BACKOFF_MULTIPLIER,
        onRetry,
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxAttempts) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
                maxDelayMs,
            );

            onRetry?.(attempt, lastError);

            Logger.debug(
                `Retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
                LOGGER_CTX,
            );

            await sleep(delay);
        }
    }

    throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    multiplier: number = DEFAULTS.WEBHOOK_BACKOFF_MULTIPLIER,
): number {
    const delay = baseDelayMs * Math.pow(multiplier, attempt - 1);
    return Math.min(delay, maxDelayMs);
}

/**
 * Check if an error is retryable
 *
 * @param error - Error to check
 * @param retryableErrors - List of retryable error types or messages
 * @returns True if the error is retryable
 */
export function isRetryableError(
    error: Error,
    retryableErrors: (string | RegExp)[] = [],
): boolean {
    const message = error.message.toLowerCase();

    // Default retryable errors
    const defaultRetryable = [
        /timeout/i,
        /network/i,
        /connection/i,
        /econnreset/i,
        /econnrefused/i,
        /socket/i,
        /temporary/i,
        /rate limit/i,
        /too many requests/i,
    ];

    const allPatterns = [...defaultRetryable, ...retryableErrors];

    for (const pattern of allPatterns) {
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
