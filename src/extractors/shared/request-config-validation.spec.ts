import { describe, expect, it } from 'vitest';
import { HTTP } from '../../../shared/constants';
import { PAGINATION } from '../../constants/defaults/ui-defaults';
import { validateRemoteRequestConfig } from './request-config-validation';

describe('remote extractor request limits', () => {
    it('accepts bounded request controls', () => {
        expect(validateRemoteRequestConfig({
            timeoutMs: HTTP.TIMEOUT_MS,
            pagination: { type: 'PAGE', limit: 500, maxPages: 20 },
            retry: {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 1_000,
                backoffMultiplier: 2,
                jitterFactor: 0.2,
                retryableStatusCodes: [408, 429, 503],
            },
            rateLimit: { requestsPerSecond: 100 },
        })).toEqual([]);
    });

    it('rejects non-finite, fractional, and excessive controls', () => {
        const fields = validateRemoteRequestConfig({
            timeoutMs: Number.POSITIVE_INFINITY,
            pagination: {
                type: 'PAGE',
                limit: PAGINATION.MAX_REMOTE_PAGE_SIZE + 1,
                maxPages: 1.5,
            },
            retry: {
                maxAttempts: HTTP.MAX_RETRY_ATTEMPTS + 1,
                retryableStatusCodes: [200],
            },
            rateLimit: { requestsPerSecond: 0 },
        }).map(error => error.field);

        expect(fields).toEqual([
            'timeoutMs',
            'pagination.limit',
            'pagination.maxPages',
            'retry.maxAttempts',
            'rateLimit.requestsPerSecond',
            'retry.retryableStatusCodes',
        ]);
    });
});
