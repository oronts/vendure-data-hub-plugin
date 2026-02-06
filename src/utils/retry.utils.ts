import { HTTP, WEBHOOK } from '../constants/index';

export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterFactor?: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: HTTP.MAX_RETRIES,
    initialDelayMs: HTTP.RETRY_DELAY_MS,
    maxDelayMs: HTTP.RETRY_MAX_DELAY_MS,
    backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
    jitterFactor: 0.1,
};

export const WEBHOOK_RETRY_CONFIG: RetryConfig = {
    maxAttempts: WEBHOOK.MAX_ATTEMPTS,
    initialDelayMs: WEBHOOK.INITIAL_DELAY_MS,
    maxDelayMs: WEBHOOK.MAX_DELAY_MS,
    backoffMultiplier: WEBHOOK.BACKOFF_MULTIPLIER,
    jitterFactor: 0.1,
};

export function calculateBackoff(attempt: number, config: RetryConfig): number {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitterFactor = config.jitterFactor ?? 0.1;
    const jitter = baseDelay * (Math.random() * jitterFactor);
    return Math.min(baseDelay + jitter, config.maxDelayMs);
}

export function calculateBackoffDeterministic(attempt: number, config: RetryConfig): number {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(baseDelay, config.maxDelayMs);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- T reserved for future typed retry result
export interface ExecuteWithRetryOptions<T = unknown> {
    config: RetryConfig;
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
    options: ExecuteWithRetryOptions<T>,
): Promise<T> {
    const { config, onRetry, isRetryable = isRetryableError, logger, context } = options;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

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

export function isRetryableStatus(status: number): boolean {
    if (status === 429) return true;
    if (status >= 500 && status !== 501) return true;
    if (status === 408) return true;
    return false;
}

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

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function shouldRetry(attempt: number, config: RetryConfig): boolean {
    return attempt < config.maxAttempts;
}
