import type { ExportField } from './types';

interface ReconcileSourceFieldsOptions {
    currentFields: ExportField[];
    fieldNames: readonly string[];
    preserveCurrentFields?: boolean;
}

export function reconcileSourceFields({
    currentFields,
    fieldNames,
    preserveCurrentFields = false,
}: ReconcileSourceFieldsOptions): ExportField[] {
    const availableFields = new Set(fieldNames);
    if (preserveCurrentFields) {
        const validCurrentFields = currentFields
            .filter(field => availableFields.has(field.sourceField))
            .map(field => ({
                ...field,
                outputName: field.outputName || field.sourceField,
            }));
        if (validCurrentFields.length > 0) return validCurrentFields;
    }

    return fieldNames.map(name => ({
        sourceField: name,
        outputName: name,
        include: true,
    }));
}
