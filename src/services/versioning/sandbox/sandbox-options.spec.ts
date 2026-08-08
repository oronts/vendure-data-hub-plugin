import { describe, expect, it } from 'vitest';
import { SANDBOX } from '../../../constants';
import { normalizeSandboxOptions } from './sandbox-options';

describe('normalizeSandboxOptions', () => {
    it('applies bounded defaults', () => {
        expect(normalizeSandboxOptions()).toEqual({
            maxRecords: SANDBOX.MAX_RECORDS,
            maxSamplesPerStep: SANDBOX.MAX_SAMPLES_PER_STEP,
            includeLineage: true,
            seedData: [],
            stopOnError: false,
            timeoutMs: SANDBOX.DEFAULT_TIMEOUT_MS,
            skipSteps: [],
            startFromStep: '',
        });
    });

    it.each([
        ['maxRecords', { maxRecords: 0 }],
        ['maxRecords', { maxRecords: 101 }],
        ['maxSamplesPerStep', { maxSamplesPerStep: 11 }],
        ['timeoutMs', { timeoutMs: Number.POSITIVE_INFINITY }],
        ['timeoutMs', { timeoutMs: SANDBOX.MAX_TIMEOUT_MS + 1 }],
    ] as const)('rejects an invalid %s', (_name, options) => {
        expect(() => normalizeSandboxOptions(options)).toThrow();
    });

    it('caps seed data to the requested record limit and deduplicates skipped steps', () => {
        const seedData = [{ id: 1 }, { id: 2 }];

        expect(normalizeSandboxOptions({
            maxRecords: 1,
            seedData,
            skipSteps: ['transform', 'transform'],
        })).toMatchObject({
            seedData: [{ id: 1 }],
            skipSteps: ['transform'],
        });
    });

    it('rejects invalid seed records and blank step keys', () => {
        expect(() => normalizeSandboxOptions({
            seedData: [null as never],
        })).toThrow('seedData must contain JSON objects');
        expect(() => normalizeSandboxOptions({
            skipSteps: [' '],
        })).toThrow('skipSteps must contain non-empty step keys');
        expect(() => normalizeSandboxOptions({
            startFromStep: ' ',
        })).toThrow('startFromStep must be a non-empty step key');
    });
});
