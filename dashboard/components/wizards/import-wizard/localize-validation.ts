import { SOURCE_TYPE } from '../../../constants';
import type { TypedOptionValue } from '../../../hooks/api/use-config-options';
import type { FormValidationResult } from '../../../utils/form-validation';
import type { ImportConfiguration } from './types';

export interface ImportWizardValidationMessages {
    uploadFile: string;
    unknownSourceAdapter: (adapter: string) => string;
    sourceConfigurationRequired: string;
    targetEntityRequired: string;
    requiredFieldsMapped: (fields: string) => string;
    mappingRequired: string;
    existingRecordsStrategy: string;
    lookupFieldRequired: string;
    nameRequired: string;
    invalidUrl: string;
    required: (field: string) => string;
}

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
    messages: ImportWizardValidationMessages,
): string {
    if (context.stepId === 'source') {
        if (error.field === 'file') {
            return messages.uploadFile;
        }
        if (error.field === 'adapterCode') {
            return messages.unknownSourceAdapter(context.config.source?.type ?? '');
        }
        if (error.field.endsWith('Config')) {
            return messages.sourceConfigurationRequired;
        }
    }
    if (context.stepId === 'target') {
        return messages.targetEntityRequired;
    }
    if (context.stepId === 'mapping') {
        const fields = getRequiredUnmappedFields(context.config);
        return fields
            ? messages.requiredFieldsMapped(fields)
            : messages.mappingRequired;
    }
    if (context.stepId === 'strategy' && error.field === 'existingRecords') {
        return messages.existingRecordsStrategy;
    }
    if (context.stepId === 'strategy' && error.field === 'lookupFields') {
        return messages.lookupFieldRequired;
    }
    if (context.stepId === 'review') {
        return messages.nameRequired;
    }
    if (error.type === 'format') {
        return messages.invalidUrl;
    }
    if (error.type === 'required') {
        const field = context.stepId === 'trigger'
            ? getTriggerFieldLabel(error.field, context)
            : getSourceFieldLabel(error.field, context);
        return messages.required(field ?? error.field);
    }
    return error.message;
}

export function localizeImportWizardValidation(
    result: FormValidationResult,
    context: ValidationContext,
    messages: ImportWizardValidationMessages,
): FormValidationResult {
    const errors = result.errors.map(error => ({
        ...error,
        message: localizeValidationMessage(error, context, messages),
    }));
    return {
        isValid: result.isValid,
        errors,
        errorsByField: Object.fromEntries(
            errors.map(error => [error.field, error.message]),
        ),
    };
}
