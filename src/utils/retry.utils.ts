/**
 * Retry Utilities
 *
 * Unified retry logic with exponential backoff and jitter for the data-hub plugin.
 * This module consolidates all retry patterns used across extractors, loaders,
 * webhooks, and job processors.
 */

import { HTTP, WEBHOOK } from '../constants/index';

/**
 * Configuration for retry behavior with exponential backoff
 */
export interface RetryConfig {
    /** Maximum number of attempts (including initial attempt) */
    maxAttempts: number;
    /** Initial delay in milliseconds before first retry */
    initialDelayMs: number;
    /** Maximum delay in milliseconds (cap for exponential growth) */
    maxDelayMs: number;
    /** Multiplier for exponential backoff (e.g., 2 = double each time) */
    backoffMultiplier: number;
    /** Jitter factor (0-1) to add randomness to delays, default 0.1 (10%) */
    jitterFactor?: number;
}

/**
 * Default retry configuration suitable for most HTTP operations
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: HTTP.MAX_RETRIES,
    initialDelayMs: HTTP.RETRY_DELAY_MS,
    maxDelayMs: HTTP.RETRY_MAX_DELAY_MS,
    backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
    jitterFactor: 0.1,
};

/**
 * Webhook-specific retry configuration with longer delays
 */
export const WEBHOOK_RETRY_CONFIG: RetryConfig = {
    maxAttempts: WEBHOOK.MAX_ATTEMPTS,
    initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
    maxDelayMs: WEBHOOK.MAX_DELAY_MS,
    backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
    jitterFactor: 0.1,
};

/**
 * Calculate exponential backoff delay with optional jitter
 *
 * @param attempt - Current attempt number (1-based, so first retry is attempt 1)
 * @param config - Retry configuration
 * @returns Delay in milliseconds before the next retry
 *
 * @example
 * // With default config (initialDelayMs=1000, multiplier=2):
 * // attempt 1: ~1000ms, attempt 2: ~2000ms, attempt 3: ~4000ms
 * const delay = calculateBackoff(1, DEFAULT_RETRY_CONFIG);
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitterFactor = config.jitterFactor ?? 0.1;
    const jitter = baseDelay * (Math.random() * jitterFactor);
    return Math.min(baseDelay + jitter, config.maxDelayMs);
}

/**
 * Calculate backoff delay without jitter (deterministic)
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDeterministic(attempt: number, config: RetryConfig): number {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(baseDelay, config.maxDelayMs);
}

/**
 * Options for executeWithRetry function
 */
export interface ExecuteWithRetryOptions<T> {
    /** Retry configuration */
    config: RetryConfig;
    /** Callback when a retry is about to happen */
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
    /** Custom function to determine if an error is retryable */
    isRetryable?: (error: unknown) => boolean;
    /** Logger for retry events */
    logger?: {
        warn: (message: string, meta?: Record<string, unknown>) => void;
        debug: (message: string, meta?: Record<string, unknown>) => void;
    };
    /** Context information for logging */
    context?: Record<string, unknown>;
}

/**
 * Execute a function with automatic retry on failure
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries are exhausted
 *
 * @example
 * const result = await executeWithRetry(
 *   () => fetch(url),
 *   {
 *     config: DEFAULT_RETRY_CONFIG,
 *     logger: myLogger,
 *     context: { url },
 *   }
 * );
 */
export async function executeWithRetry<T>(
    fn: () => Promise<T>,
    options: ExecuteWithRetryOptions<T>,
): Promise<T> {
    const { config, onRetry, isRetryable = isRetryableError, logger, context } = options;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if we should retry
            if (attempt >= config.maxAttempts || !isRetryable(error)) {
                break;
            }

            const delayMs = calculateBackoff(attempt, config);

            // Notify about retry
            if (onRetry) {
                onRetry(attempt, lastError, delayMs);
            }

            if (logger) {
                logger.warn('Retry attempt failed, will retry', {
                    attempt,
                    maxAttempts: config.maxAttempts,
                    delayMs,
                    error: lastError.message,
                    ...context,
                });
            }

            // Wait before next attempt
            await sleep(delayMs);
        }
    }

    throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Execute a function with retry, returning null on failure instead of throwing
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Result of the function or null if all retries fail
 */
export async function executeWithRetryOrNull<T>(
    fn: () => Promise<T>,
    options: ExecuteWithRetryOptions<T>,
): Promise<T | null> {
    try {
        return await executeWithRetry(fn, options);
    } catch {
        return null;
    }
}

/**
 * Check if an error is retryable based on common patterns
 *
 * Considers errors retryable if they match:
 * - Network errors (timeout, connection, socket)
 * - Rate limiting (429 Too Many Requests)
 * - Temporary/transient errors
 * - Service unavailable (503)
 *
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
    if (!error) return false;

    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    const retryablePatterns = [
        /timeout/i,
        /network/i,
        /connection/i,
        /econnreset/i,
        /econnrefused/i,
        /enotfound/i,
        /socket/i,
        /temporary/i,
        /transient/i,
        /rate.?limit/i,
        /too.?many.?requests/i,
        /429/,
        /503/,
        /service.?unavailable/i,
        /fetch.?failed/i,
        /aborted/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(message));
}

/**
 * Check if an HTTP status code indicates a retryable error
 *
 * @param status - HTTP status code
 * @returns True if the status indicates a retryable error
 */
export function isRetryableStatus(status: number): boolean {
    // 429 Too Many Requests
    if (status === 429) return true;
    // 5xx Server Errors (except 501 Not Implemented)
    if (status >= 500 && status !== 501) return true;
    // 408 Request Timeout
    if (status === 408) return true;
    return false;
}

/**
 * Create a retry configuration from partial options with defaults
 *
 * @param partial - Partial configuration options
 * @param defaults - Default configuration to use (defaults to DEFAULT_RETRY_CONFIG)
 * @returns Complete retry configuration
 */
export function createRetryConfig(
    partial?: Partial<RetryConfig>,
    defaults: RetryConfig = DEFAULT_RETRY_CONFIG,
): RetryConfig {
    return {
        maxAttempts: partial?.maxAttempts ?? defaults.maxAttempts,
        initialDelayMs: partial?.initialDelayMs ?? defaults.initialDelayMs,
        maxDelayMs: partial?.maxDelayMs ?? defaults.maxDelayMs,
        backoffMultiplier: partial?.backoffMultiplier ?? defaults.backoffMultiplier,
        jitterFactor: partial?.jitterFactor ?? defaults.jitterFactor,
    };
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an attempt should be retried based on config
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns True if another retry should be attempted
 */
export function shouldRetry(attempt: number, config: RetryConfig): boolean {
    return attempt < config.maxAttempts;
}
