import { describe, expect, it } from 'vitest';
import { HTTP, PIPELINE_RETRY } from '../../../../shared/constants';
import {
    resolveGraphqlBatchMode,
    resolveHttpRetryConfig,
    resolveRestBatchMode,
    resolveRestWriteMethod,
} from './shared-http-client';

describe('resolveHttpRetryConfig', () => {
    it('uses the no-retry pipeline defaults', () => {
        expect(resolveHttpRetryConfig({})).toMatchObject({
            retries: PIPELINE_RETRY.DEFAULT_MAX_RETRIES,
            retryDelayMs: PIPELINE_RETRY.DEFAULT_DELAY_MS,
            maxRetryDelayMs: PIPELINE_RETRY.DEFAULT_MAX_DELAY_MS,
            backoffMultiplier: PIPELINE_RETRY.DEFAULT_BACKOFF_MULTIPLIER,
            timeoutMs: HTTP.TIMEOUT_MS,
            maxBatchSize: 0,
        });
    });

    it.each([
        ['retries', Number.POSITIVE_INFINITY],
        ['retries', 1.5],
        ['retryDelayMs', -1],
        ['maxRetryDelayMs', PIPELINE_RETRY.MAX_DELAY_MS + 1],
        ['backoffMultiplier', 0],
        ['timeoutMs', 0],
        ['timeoutMs', Number.NaN],
        ['maxBatchSize', -1],
        ['maxBatchSize', 1.5],
        ['maxBatchSize', 10_001],
    ])('rejects invalid runtime %s', (field, value) => {
        expect(() => resolveHttpRetryConfig({ [field]: value } as never))
            .toThrow(`HTTP loader ${field}`);
    });

    it('rejects a maximum retry delay below the initial delay', () => {
        expect(() => resolveHttpRetryConfig({
            retryDelayMs: 1_000,
            maxRetryDelayMs: 999,
        })).toThrow('HTTP loader maxRetryDelayMs cannot be less than retryDelayMs');
    });

    it('prefers step values over pipeline retry values', () => {
        expect(resolveHttpRetryConfig(
            { retries: 2, retryDelayMs: 25 },
            { maxRetries: 5, retryDelayMs: 100 },
        )).toMatchObject({ retries: 2, retryDelayMs: 25 });
    });
});

describe('HTTP loader enum contracts', () => {
    it('normalizes supported REST write methods', () => {
        expect(resolveRestWriteMethod(undefined)).toBe('POST');
        expect(resolveRestWriteMethod('post')).toBe('POST');
        expect(resolveRestWriteMethod('PUT')).toBe('PUT');
    });

    it.each(['PATCH', 'DELETE', '', null, 42, {}])('rejects invalid REST method %s', value => {
        expect(() => resolveRestWriteMethod(value)).toThrow('REST loader method must be POST or PUT');
    });

    it.each(['single', 'array'])('accepts REST batch mode %s', value => {
        expect(resolveRestBatchMode(value)).toBe(value);
    });

    it.each(['batch', '', null, 42, {}])('rejects invalid REST batch mode %s', value => {
        expect(() => resolveRestBatchMode(value)).toThrow('REST loader batchMode must be single or array');
    });

    it.each(['single', 'batch'])('accepts GraphQL batch mode %s', value => {
        expect(resolveGraphqlBatchMode(value)).toBe(value);
    });

    it.each(['array', '', null, 42, {}])('rejects invalid GraphQL batch mode %s', value => {
        expect(() => resolveGraphqlBatchMode(value)).toThrow('GraphQL loader batchMode must be single or batch');
    });
});
