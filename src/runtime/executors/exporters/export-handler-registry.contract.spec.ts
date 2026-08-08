import { describe, expect, it } from 'vitest';
import { FIELD_LIMITS } from '../../../constants/validation';
import { BATCH, HTTP } from '../../../../shared/constants';
import { EXPORT_HANDLER_REGISTRY } from './export-handler-registry';
import { httpExportHandler } from './http-export.handler';

describe('HTTP exporter registry contract', () => {
    it.each(['restPostExport', 'webhookExport'])('%s exposes its runtime delivery controls', code => {
        const entry = EXPORT_HANDLER_REGISTRY.get(code);
        expect(entry?.handler).toBe(httpExportHandler);
        const fields = new Map(entry?.definition.schema.fields.map(field => [field.key, field]));

        expect(fields.get('batchSize')).toEqual(expect.objectContaining({
            defaultValue: BATCH.BULK_SIZE,
            validation: {
                min: FIELD_LIMITS.BATCH_SIZE_MIN,
                max: FIELD_LIMITS.BATCH_SIZE_MAX,
            },
        }));
        expect(fields.get('timeoutMs')).toEqual(expect.objectContaining({
            defaultValue: HTTP.TIMEOUT_MS,
            validation: { min: 1, max: HTTP.MAX_TIMEOUT_MS },
        }));
        expect(fields.get('retryCount')).toEqual(expect.objectContaining({
            defaultValue: 0,
            validation: { min: 0, max: HTTP.MAX_RETRY_ATTEMPTS },
        }));
        expect(fields.has('retryDelayMs')).toBe(true);
        expect(fields.has('maxRetryDelayMs')).toBe(true);
        expect(fields.has('backoffMultiplier')).toBe(true);
        expect(fields.has('bearerTokenSecretCode')).toBe(true);
        expect(fields.has('basicSecretCode')).toBe(true);
        expect(fields.has('headerSecretCodes')).toBe(true);
    });
});
