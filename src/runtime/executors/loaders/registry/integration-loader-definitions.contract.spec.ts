import { describe, expect, it } from 'vitest';
import { FIELD_LIMITS } from '../../../../constants/validation';
import { HTTP } from '../../../../../shared/constants';
import { INTEGRATION_LOADER_DEFINITIONS } from './integration-loader-definitions';

describe('HTTP loader registry contract', () => {
    it.each(['restPost', 'graphqlMutation'])('%s exposes bounded delivery controls', code => {
        const entry = INTEGRATION_LOADER_DEFINITIONS.find(([entryCode]) => entryCode === code)?.[1];
        const fields = new Map(entry?.definition.schema.fields.map(field => [field.key, field]));

        expect(fields.get('maxBatchSize')).toEqual(expect.objectContaining({
            defaultValue: 0,
            validation: { min: 0, max: FIELD_LIMITS.BATCH_SIZE_MAX },
        }));
        expect(fields.get('retries')).toEqual(expect.objectContaining({
            defaultValue: 0,
            validation: { min: 0, max: HTTP.MAX_RETRY_ATTEMPTS },
        }));
        expect(fields.get('timeoutMs')).toEqual(expect.objectContaining({
            defaultValue: HTTP.TIMEOUT_MS,
            validation: { min: 1, max: HTTP.MAX_TIMEOUT_MS },
        }));
        expect(fields.has('maxRetryDelayMs')).toBe(true);
        expect(fields.has('backoffMultiplier')).toBe(true);
    });
});
