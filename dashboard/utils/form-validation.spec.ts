import { describe, expect, it } from 'vitest';
import {
    validateHostname,
    validateImportWizardStep,
    validatePort,
    validateUrl,
} from './form-validation';
import { SHARED_UI_TRANSLATION_IDS } from '../constants/shared-ui-labels';

describe('validateImportWizardStep source schemas', () => {
    const extractors = [{
        code: 'httpApi',
        schema: {
            fields: [
                { key: 'url', label: 'URL', required: true },
                { key: 'method', label: 'Method', required: true, defaultValue: 'GET' },
            ],
        },
    }];

    it('maps the API wizard source to the canonical httpApi adapter', () => {
        const result = validateImportWizardStep('source', {
            source: { type: 'API', apiConfig: { url: 'https://example.com' } },
        }, null, extractors);

        expect(result).toEqual(expect.objectContaining({ isValid: true, errors: [] }));
    });

    it('uses schema defaults when validating required fields', () => {
        const result = validateImportWizardStep('source', {
            source: { type: 'API', apiConfig: { url: '' } },
        }, null, extractors);

        expect(result.errorsByField).toEqual({ url: 'URL is required' });
        expect(result.errorsByField).not.toHaveProperty('method');
    });
});

describe('localized form validation', () => {
    const translate = (id: string, values?: Record<string, string | number>) => {
        const messages: Record<string, string> = {
            [SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_URL]: 'Bitte geben Sie eine gültige URL ein (z. B. https://example.com)',
            [SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_HOSTNAME]: 'Bitte geben Sie einen gültigen Hostnamen ein',
            [SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_PORT]: 'Bitte geben Sie eine gültige Portnummer ein (1–65535)',
            [SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED]: '{field} ist erforderlich',
        };
        return (messages[id] ?? id).replace(
            /\{(\w+)\}/g,
            (_match, key: string) => String(values?.[key] ?? ''),
        );
    };

    it('localizes URL, hostname, port, and schema-required errors', () => {
        expect(validateUrl('invalid', 'URL', translate)?.message).toBe(
            'Bitte geben Sie eine gültige URL ein (z. B. https://example.com)',
        );
        expect(validateHostname('-invalid', 'Hostname', translate)?.message).toBe(
            'Bitte geben Sie einen gültigen Hostnamen ein',
        );
        expect(validatePort(0, 'Port', translate)?.message).toBe(
            'Bitte geben Sie eine gültige Portnummer ein (1–65535)',
        );
        expect(validateImportWizardStep(
            'source',
            { source: { type: 'API', apiConfig: { url: '' } } },
            null,
            [{ code: 'httpApi', schema: { fields: [{ key: 'url', label: 'URL', required: true }] } }],
            undefined,
            translate,
        ).errorsByField).toEqual({ url: 'URL ist erforderlich' });
    });
});
