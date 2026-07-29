import { describe, expect, it } from 'vitest';
import { PIPELINE_RETRY } from '../../../../shared/constants';
import { resolveHttpRetryConfig } from './shared-http-client';

describe('resolveHttpRetryConfig', () => {
    it('uses the no-retry pipeline defaults', () => {
        expect(resolveHttpRetryConfig({})).toMatchObject({
            retries: PIPELINE_RETRY.DEFAULT_MAX_RETRIES,
            retryDelayMs: PIPELINE_RETRY.DEFAULT_DELAY_MS,
            maxRetryDelayMs: PIPELINE_RETRY.DEFAULT_MAX_DELAY_MS,
            backoffMultiplier: PIPELINE_RETRY.DEFAULT_BACKOFF_MULTIPLIER,
        });
    });

    it('bounds raw runtime values defensively', () => {
        expect(resolveHttpRetryConfig({
            retries: Number.POSITIVE_INFINITY,
            retryDelayMs: -10,
            maxRetryDelayMs: PIPELINE_RETRY.MAX_DELAY_MS + 1,
            backoffMultiplier: 0,
        })).toMatchObject({
            retries: PIPELINE_RETRY.DEFAULT_MAX_RETRIES,
            retryDelayMs: 0,
            maxRetryDelayMs: PIPELINE_RETRY.MAX_DELAY_MS,
            backoffMultiplier: 1,
        });
    });

    it('prefers step values over pipeline retry values', () => {
        expect(resolveHttpRetryConfig(
            { retries: 2, retryDelayMs: 25 },
            { maxRetries: 5, retryDelayMs: 100 },
        )).toMatchObject({ retries: 2, retryDelayMs: 25 });
    });
});
