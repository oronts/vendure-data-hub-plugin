import type {
    ExtractorConfig,
    ExtractorValidationError,
} from '../../types';
import { HTTP } from '../../../shared/constants';
import { PAGINATION } from '../../constants/defaults/ui-defaults';

interface RemoteRequestConfig extends ExtractorConfig {
    pagination?: {
        type?: unknown;
        limit?: number;
        maxPages?: number;
    };
}

function addNumberRangeError(
    errors: ExtractorValidationError[],
    field: string,
    value: unknown,
    minimum: number,
    maximum: number,
    integer = false,
): void {
    if (value === undefined) {
        return;
    }
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum ||
        (integer && !Number.isInteger(value))
    ) {
        errors.push({
            field,
            message: `${field} must be ${integer ? 'an integer' : 'a number'} between ${minimum} and ${maximum}`,
        });
    }
}

export function validateRemoteRequestConfig(
    config: RemoteRequestConfig,
): ExtractorValidationError[] {
    const errors: ExtractorValidationError[] = [];

    addNumberRangeError(errors, 'timeoutMs', config.timeoutMs, 1, HTTP.MAX_TIMEOUT_MS, true);
    addNumberRangeError(
        errors,
        'pagination.limit',
        config.pagination?.limit,
        1,
        PAGINATION.MAX_REMOTE_PAGE_SIZE,
        true,
    );
    addNumberRangeError(
        errors,
        'pagination.maxPages',
        config.pagination?.maxPages,
        1,
        PAGINATION.MAX_PAGES,
        true,
    );
    addNumberRangeError(
        errors,
        'retry.maxAttempts',
        config.retry?.maxAttempts,
        1,
        HTTP.MAX_RETRY_ATTEMPTS,
        true,
    );
    addNumberRangeError(
        errors,
        'retry.initialDelayMs',
        config.retry?.initialDelayMs,
        0,
        HTTP.MAX_TIMEOUT_MS,
        true,
    );
    addNumberRangeError(
        errors,
        'retry.maxDelayMs',
        config.retry?.maxDelayMs,
        0,
        HTTP.MAX_TIMEOUT_MS,
        true,
    );
    addNumberRangeError(
        errors,
        'retry.backoffMultiplier',
        config.retry?.backoffMultiplier,
        1,
        HTTP.MAX_BACKOFF_MULTIPLIER,
    );
    addNumberRangeError(errors, 'retry.jitterFactor', config.retry?.jitterFactor, 0, 1);
    addNumberRangeError(
        errors,
        'rateLimit.requestsPerSecond',
        config.rateLimit?.requestsPerSecond,
        1,
        HTTP.MAX_REQUESTS_PER_SECOND,
    );

    if (config.retry?.retryableStatusCodes?.some(
        status => !Number.isInteger(status) || status < 400 || status > 599,
    )) {
        errors.push({
            field: 'retry.retryableStatusCodes',
            message: 'retry.retryableStatusCodes must contain only HTTP error status codes from 400 to 599',
        });
    }

    return errors;
}
