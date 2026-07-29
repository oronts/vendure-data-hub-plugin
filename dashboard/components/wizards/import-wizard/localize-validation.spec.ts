import { describe, expect, it } from 'vitest';
import type { FormValidationResult } from '../../../utils/form-validation';
import {
    type ImportWizardValidationMessages,
    localizeImportWizardValidation,
} from './localize-validation';

const messages: ImportWizardValidationMessages = {
    uploadFile: 'Upload a file to continue',
    unknownSourceAdapter: adapter => `Unknown source adapter: ${adapter}`,
    sourceConfigurationRequired: 'Source configuration is required',
    targetEntityRequired: 'Select a target entity',
    requiredFieldsMapped: fields => `Map all required fields: ${fields}`,
    mappingRequired: 'Add at least one field mapping',
    existingRecordsStrategy: 'Select a strategy for existing records',
    lookupFieldRequired: 'Select at least one lookup field',
    nameRequired: 'Name is required',
    invalidUrl: 'Enter a valid URL',
    required: field => `${field} is required`,
};

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
            messages,
        );

        expect(localized.errors[0]?.message).toBe(
            'Cron expression is required',
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
            messages,
        );

        expect(localized.errors[0]?.message).toBe(
            'Map all required fields: sku',
        );
    });

    it('preserves unknown custom errors verbatim', () => {
        const localized = localizeImportWizardValidation(
            result('custom', 'Backend-provided diagnostic', 'custom'),
            { stepId: 'source', config: {} },
            messages,
        );

        expect(localized.errors[0]?.message).toBe('Backend-provided diagnostic');
    });
});
