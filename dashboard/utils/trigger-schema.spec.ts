import { describe, expect, it } from 'vitest';
import {
    applyTriggerSchemaDefaults,
    isTriggerSchemaFieldVisible,
    resolveTriggerFieldOptions,
} from './trigger-schema';

describe('trigger schema helpers', () => {
    it('resolves dynamic optionsRef values', () => {
        expect(resolveTriggerFieldOptions(
            { key: 'event', label: 'Event', type: 'select', optionsRef: 'vendureEvents' },
            { vendureEvents: [{ value: 'ProductEvent', label: 'Product event' }] },
        )).toEqual([{ value: 'ProductEvent', label: 'Product event' }]);
    });

    it('shows only fields for the selected webhook authentication mode', () => {
        const hmacField = { key: 'hmacAlgorithm', label: 'HMAC', type: 'select' };
        const jwtField = { key: 'jwtSecretCode', label: 'JWT', type: 'secret' };
        expect(isTriggerSchemaFieldVisible(hmacField, { authentication: 'HMAC' })).toBe(true);
        expect(isTriggerSchemaFieldVisible(jwtField, { authentication: 'HMAC' })).toBe(false);
        expect(isTriggerSchemaFieldVisible(jwtField, { authentication: 'JWT' })).toBe(true);
    });

    it('hydrates field and schema defaults without overwriting user values', () => {
        const result = applyTriggerSchemaDefaults(
            { authentication: 'NONE', nested: { preserved: true } },
            'WEBHOOK',
            {
                value: 'WEBHOOK',
                label: 'Webhook',
                fields: [
                    { key: 'authentication', label: 'Auth', type: 'select', defaultValue: 'HMAC' },
                    { key: 'rate.limit', label: 'Limit', type: 'number', defaultValue: 100 },
                ],
                defaultValues: { enabled: true },
            },
        );
        expect(result).toEqual({
            type: 'WEBHOOK',
            authentication: 'NONE',
            enabled: true,
            rate: { limit: 100 },
            nested: { preserved: true },
        });
    });
});
