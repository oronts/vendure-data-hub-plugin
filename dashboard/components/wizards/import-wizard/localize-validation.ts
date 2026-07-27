import { SOURCE_TYPE } from '../../../constants';
import { IMPORT_WIZARD_TRANSLATION_IDS } from '../../../constants';
import type { TypedOptionValue } from '../../../hooks/api/use-config-options';
import type { FormValidationResult } from '../../../utils/form-validation';
import type { ImportConfiguration } from './types';

type TranslationValues = Record<string, string | number>;
type Translate = (id: string, values?: TranslationValues) => string;

interface AdapterSchema {
    code: string;
    schema?: {
        fields: Array<{
            key: string;
            label?: string | null;
        }>;
    };
}

interface ValidationContext {
    stepId: string;
    config: Partial<ImportConfiguration>;
    adapterSchemas?: AdapterSchema[];
    triggerSchemas?: TypedOptionValue[];
}

function getSourceFieldLabel(
    fieldKey: string,
    context: ValidationContext,
): string | undefined {
    const sourceType = context.config.source?.type;
    if (!sourceType) return undefined;
    const adapterCode = sourceType === SOURCE_TYPE.API
        ? 'httpApi'
        : context.adapterSchemas?.find(
            adapter => adapter.code.toUpperCase() === sourceType.toUpperCase(),
        )?.code ?? sourceType.toLowerCase();
    return context.adapterSchemas
        ?.find(adapter => adapter.code === adapterCode)
        ?.schema?.fields.find(field => field.key === fieldKey)
        ?.label ?? undefined;
}

function getTriggerFieldLabel(
    fieldKey: string,
    context: ValidationContext,
): string | undefined {
    return context.triggerSchemas
        ?.find(schema => schema.value === context.config.trigger?.type)
        ?.fields.find(field => field.key === fieldKey)
        ?.label;
}

function getRequiredUnmappedFields(config: Partial<ImportConfiguration>): string {
    return (config.mappings ?? [])
        .filter(mapping => mapping.required && !mapping.sourceField)
        .map(mapping => mapping.targetField)
        .filter(Boolean)
        .join(', ');
}

function localizeValidationMessage(
    error: FormValidationResult['errors'][number],
    context: ValidationContext,
    translate: Translate,
): string {
    if (context.stepId === 'source') {
        if (error.field === 'file') {
            return translate(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_UPLOAD_FILE);
        }
        if (error.field === 'adapterCode') {
            return translate(
                IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_UNKNOWN_SOURCE_ADAPTER,
                { adapter: context.config.source?.type ?? '' },
            );
        }
        if (error.field.endsWith('Config')) {
            return translate(
                IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_SOURCE_CONFIGURATION_REQUIRED,
            );
        }
    }
    if (context.stepId === 'target') {
        return translate(
            IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_TARGET_ENTITY_REQUIRED,
        );
    }
    if (context.stepId === 'mapping') {
        const fields = getRequiredUnmappedFields(context.config);
        return fields
            ? translate(
                IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_REQUIRED_FIELDS_MAPPED,
                { fields },
            )
            : translate(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_MAPPING_REQUIRED);
    }
    if (context.stepId === 'strategy' && error.field === 'existingRecords') {
        return translate(
            IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_EXISTING_RECORDS_STRATEGY,
        );
    }
    if (context.stepId === 'strategy' && error.field === 'lookupFields') {
        return translate(
            IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_LOOKUP_FIELD_REQUIRED,
        );
    }
    if (context.stepId === 'review') {
        return translate(IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_NAME_REQUIRED);
    }
    if (error.type === 'format') {
        return translate(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_INVALID_URL);
    }
    if (error.type === 'required') {
        const field = context.stepId === 'trigger'
            ? getTriggerFieldLabel(error.field, context)
            : getSourceFieldLabel(error.field, context);
        return translate(
            IMPORT_WIZARD_TRANSLATION_IDS.VALIDATION_REQUIRED,
            { field: field ?? error.field },
        );
    }
    return error.message;
}

export function localizeImportWizardValidation(
    result: FormValidationResult,
    context: ValidationContext,
    translate: Translate,
): FormValidationResult {
    const errors = result.errors.map(error => ({
        ...error,
        message: localizeValidationMessage(error, context, translate),
    }));
    return {
        isValid: result.isValid,
        errors,
        errorsByField: Object.fromEntries(
            errors.map(error => [error.field, error.message]),
        ),
    };
}
