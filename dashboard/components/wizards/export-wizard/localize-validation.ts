import type {
    DestinationSchema,
    TypedOptionValue,
} from '../../../hooks/api/use-config-options';
import type { FormValidationResult } from '../../../utils/form-validation';
import type { ExportConfiguration } from './types';

export interface ExportWizardValidationMessages {
    sourceRequired: string;
    duplicateOutputNames: (names: string) => string;
    selectField: string;
    outputName: string;
    formatRequired: string;
    nameRequired: string;
    unsupportedDestination: (type: string) => string;
    invalidUrl: string;
    required: (field: string) => string;
}

interface ValidationContext {
    stepId: string;
    config: Partial<ExportConfiguration>;
    destinationSchemas: DestinationSchema[];
    triggerSchemas: TypedOptionValue[];
}

function getSchemaFieldLabel(
    fieldKey: string,
    { stepId, config, destinationSchemas, triggerSchemas }: ValidationContext,
): string | undefined {
    if (stepId === 'destination') {
        return destinationSchemas
            .find(schema => schema.type === config.destination?.type)
            ?.fields.find(field => field.key === fieldKey)
            ?.label;
    }
    if (stepId === 'trigger') {
        return triggerSchemas
            .find(schema => schema.value === config.trigger?.type)
            ?.fields.find(field => field.key === fieldKey)
            ?.label;
    }
    return undefined;
}

function getDuplicateOutputNames(config: Partial<ExportConfiguration>): string {
    const names = (config.fields ?? [])
        .filter(field => field.include)
        .map(field => field.outputName.trim())
        .filter(Boolean);
    return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].join(', ');
}

function localizeValidationMessage(
    error: FormValidationResult['errors'][number],
    context: ValidationContext,
    messages: ExportWizardValidationMessages,
): string {
    const { stepId, config } = context;

    if (stepId === 'source') {
        return messages.sourceRequired;
    }
    if (stepId === 'fields' && error.field === 'fields') {
        const names = getDuplicateOutputNames(config);
        return names
            ? messages.duplicateOutputNames(names)
            : messages.selectField;
    }
    if (stepId === 'fields' && error.field.endsWith('.outputName')) {
        return messages.outputName;
    }
    if (stepId === 'format') {
        return messages.formatRequired;
    }
    if (stepId === 'review' && error.field === 'Name') {
        return messages.nameRequired;
    }
    if (error.field === 'destinationType') {
        return messages.unsupportedDestination(config.destination?.type ?? '');
    }
    if (error.type === 'format') {
        return messages.invalidUrl;
    }
    if (error.type === 'required') {
        const field = getSchemaFieldLabel(error.field, context) ?? error.field;
        return messages.required(field);
    }
    return error.message;
}

export function localizeExportWizardValidation(
    result: FormValidationResult,
    context: ValidationContext,
    messages: ExportWizardValidationMessages,
): FormValidationResult {
    const errors = result.errors.map(error => ({
        ...error,
        message: localizeValidationMessage(error, context, messages),
    }));
    const errorsByField = Object.fromEntries(
        errors.map(error => [error.field, error.message]),
    );

    return {
        isValid: result.isValid,
        errors,
        errorsByField,
    };
}
