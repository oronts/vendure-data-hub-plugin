import { describe, expect, it } from 'vitest';
import { IMPORT_WIZARD_TRANSLATION_IDS } from '../../../constants';
import type { FormValidationResult } from '../../../utils/form-validation';
import { localizeImportWizardValidation } from './localize-validation';

const translate = (
    id: string,
    values?: Record<string, string | number>,
): string => values ? `${id}:${JSON.stringify(values)}` : id;

function result(
    field: string,
    message: string,
    type: FormValidationResult['errors'][number]['type'],
): FormValidationResult {
    return {
        isValid: false,
        errors: [{ field, message, type }],
        errorsByField: { [field]: message },
    };
}

describe('localizeImportWizardValidation', () => {
    it('uses backend trigger field labels in translated required errors', () => {
        const localized = localizeImportWizardValidation(
            result('cron', 'Cron expression is required', 'required'),
            {
                stepId: 'trigger',
                config: { trigger: { type: 'SCHEDULE' } },
                triggerSchemas: [{
                    value: 'SCHEDULE',
                    label: 'Schedule',
                    fields: [{
                        key: 'cron',
                        label: 'Cron expression',
                        type: 'text',
                        required: true,
                    }],
                }],
            },
            translate,
        );

        expect(localized.errors[0]?.message).toBe(
            `${IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_REQUIRED}:{"field":"Cron expression"}`,
        );
        expect(localized.errorsByField.cron).toBe(localized.errors[0]?.message);
    });

    it('derives required mapping names from configuration', () => {
        const localized = localizeImportWizardValidation(
            result('mappings', 'Required fields must be mapped: sku', 'required'),
            {
                stepId: 'mapping',
                config: {
                    mappings: [{
                        sourceField: '',
                        targetField: 'sku',
                        required: true,
                        preview: [],
                    }],
                },
            },
            translate,
        );

        expect(localized.errors[0]?.message).toBe(
            `${IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_REQUIRED_FIELDS_MAPPED}:{"fields":"sku"}`,
        );
    });

    it('preserves unknown custom errors verbatim', () => {
        const localized = localizeImportWizardValidation(
            result('custom', 'Backend-provided diagnostic', 'custom'),
            { stepId: 'source', config: {} },
            translate,
        );

        expect(localized.errors[0]?.message).toBe('Backend-provided diagnostic');
    });
});
