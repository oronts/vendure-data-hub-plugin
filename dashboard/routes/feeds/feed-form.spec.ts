import { describe, expect, it } from 'vitest';
import { DataHubFeedFormat } from '../../gql/graphql';
import { FEED_TRANSLATION_IDS } from '../../constants/feed-labels';
import {
    DEFAULT_FEED_FORM_VALUES,
    feedFormToInput,
    feedToFormValues,
    validateFeedForm,
} from './feed-form';

describe('feed form', () => {
    const translate = (id: string) => id;

    it('normalizes a persisted feed into editable values', () => {
        const values = feedToFormValues({
            id: '1',
            createdAt: '2026-07-16T00:00:00.000Z',
            updatedAt: '2026-07-16T00:00:00.000Z',
            code: 'google-de',
            name: 'Google DE',
            format: DataHubFeedFormat.GOOGLE_SHOPPING,
            filters: { inStock: true },
            options: { currency: 'EUR' },
            schedule: { enabled: true, cron: '0 4 * * *', timezone: 'Europe/Berlin' },
        });

        expect(values.filters).toBe('{\n  "inStock": true\n}');
        expect(values.options).toBe('{\n  "currency": "EUR"\n}');
        expect(values.scheduleEnabled).toBe(true);
        expect(values.scheduleTimezone).toBe('Europe/Berlin');
    });

    it('builds a replacement input and omits disabled or irrelevant fields', () => {
        expect(feedFormToInput({
            ...DEFAULT_FEED_FORM_VALUES,
            code: 'catalog',
            name: 'Catalog',
            format: DataHubFeedFormat.CSV,
            customGeneratorCode: 'ignored',
            filters: '{"minPrice": 10}',
        })).toEqual({
            code: 'catalog',
            name: 'Catalog',
            format: DataHubFeedFormat.CSV,
            customGeneratorCode: undefined,
            filters: { minPrice: 10 },
            fieldMappings: undefined,
            options: undefined,
            schedule: undefined,
        });
    });

    it('validates custom generators, JSON objects, cron expressions, and timezones', () => {
        const errors = validateFeedForm({
            ...DEFAULT_FEED_FORM_VALUES,
            code: 'Bad_code',
            name: '',
            format: DataHubFeedFormat.CUSTOM,
            filters: '{"minPrice": 20, "maxPrice": 10}',
            fieldMappings: '{',
            options: '{"baseUrl": "not-a-url"}',
            scheduleEnabled: true,
            scheduleCron: '0 4 * *',
            scheduleTimezone: 'Invalid/Timezone',
        }, translate);

        expect(errors.code).toBeDefined();
        expect(errors.name).toBeDefined();
        expect(errors.customGeneratorCode).toBeDefined();
        expect(errors.filters).toBe(FEED_TRANSLATION_IDS.VALIDATION_PRICE_RANGE);
        expect(errors.fieldMappings).toBe(FEED_TRANSLATION_IDS.VALIDATION_INVALID_JSON);
        expect(errors.options).toBe(FEED_TRANSLATION_IDS.VALIDATION_BASE_URL);
        expect(errors.scheduleCron).toBeDefined();
        expect(errors.scheduleTimezone).toBeDefined();
    });

    it('requires a base URL for built-in generators but not custom generators', () => {
        const builtInErrors = validateFeedForm({
            ...DEFAULT_FEED_FORM_VALUES,
            code: 'catalog',
            name: 'Catalog',
            format: DataHubFeedFormat.CSV,
        }, translate);
        const customErrors = validateFeedForm({
            ...DEFAULT_FEED_FORM_VALUES,
            code: 'custom-catalog',
            name: 'Custom catalog',
            format: DataHubFeedFormat.CUSTOM,
            customGeneratorCode: 'custom-generator',
        }, translate);

        expect(builtInErrors.options).toBe(FEED_TRANSLATION_IDS.VALIDATION_BASE_URL);
        expect(customErrors.options).toBeUndefined();
    });
});
