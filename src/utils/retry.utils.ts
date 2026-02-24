import { HTTP } from '../../shared/constants';
import { WEBHOOK } from '../constants/defaults/webhook-defaults';
import { getErrorMessage, ensureError } from './error.utils';
import type { RetryConfig } from '../../shared/types';

export type { RetryConfig };

/**
 * RetryConfig with all core fields resolved (non-optional).
 * Used internally by retry utilities after merging with defaults.
 */
export type ResolvedRetryConfig = Required<Pick<RetryConfig, 'maxAttempts' | 'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier'>> & Pick<RetryConfig, 'jitterFactor' | 'retryableStatusCodes'>;

export const DEFAULT_RETRY_CONFIG: ResolvedRetryConfig = {
    maxAttempts: HTTP.MAX_RETRIES,
    initialDelayMs: HTTP.RETRY_DELAY_MS,
    maxDelayMs: HTTP.RETRY_MAX_DELAY_MS,
    backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
    jitterFactor: 0.1,
};

export function calculateBackoff(attempt: number, config: ResolvedRetryConfig): number {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitterFactor = config.jitterFactor ?? 0.1;
    const jitter = baseDelay * (Math.random() * jitterFactor);
    return Math.min(baseDelay + jitter, config.maxDelayMs);
}

/**
 * Calculate simple exponential backoff delay without jitter.
 * Used for webhook/sink retry scenarios where deterministic delays are preferred.
 *
 * @param attempt - Current retry attempt (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Calculated delay in milliseconds (baseDelayMs * 2^attempt)
 */
export function calculateSimpleBackoff(attempt: number, baseDelayMs: number): number {
    return Math.pow(2, attempt) * baseDelayMs;
}

interface ExecuteWithRetryOptions {
    config: ResolvedRetryConfig;
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
    isRetryable?: (error: unknown) => boolean;
    logger?: {
        warn: (message: string, meta?: Record<string, unknown>) => void;
        debug: (message: string, meta?: Record<string, unknown>) => void;
    };
    context?: Record<string, unknown>;
}

export async function executeWithRetry<T>(
    fn: () => Promise<T>,
    options: ExecuteWithRetryOptions,
): Promise<T> {
    const { config, onRetry, isRetryable = isRetryableError, logger, context } = options;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = ensureError(error);

            if (attempt >= config.maxAttempts || !isRetryable(error)) {
                break;
            }

            const delayMs = calculateBackoff(attempt, config);

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

            await sleep(delayMs);
        }
    }

    throw lastError ?? new Error('Retry failed with unknown error');
}

export function isRetryableError(error: unknown): boolean {
    if (!error) return false;

    const message = getErrorMessage(error).toLowerCase();

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

export function createRetryConfig(
    partial?: Partial<RetryConfig>,
    defaults: ResolvedRetryConfig = DEFAULT_RETRY_CONFIG,
): ResolvedRetryConfig {
    return {
        maxAttempts: partial?.maxAttempts ?? defaults.maxAttempts,
        initialDelayMs: partial?.initialDelayMs ?? defaults.initialDelayMs,
        maxDelayMs: partial?.maxDelayMs ?? defaults.maxDelayMs,
        backoffMultiplier: partial?.backoffMultiplier ?? defaults.backoffMultiplier,
        jitterFactor: partial?.jitterFactor ?? defaults.jitterFactor,
    };
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

