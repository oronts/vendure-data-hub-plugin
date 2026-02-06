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
