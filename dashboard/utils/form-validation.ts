import { isEmpty, isValidUrl } from '../../shared';
import { CODE_PATTERN } from '../../shared';
import { SOURCE_TYPE } from '../constants';
import type { DestinationSchema, TypedOptionValue } from '../hooks/api/use-config-options';

export { CODE_PATTERN };

interface FieldValidationError {
    field: string;
    message: string;
    type: 'required' | 'format' | 'range' | 'custom';
}

export interface FormValidationResult {
    isValid: boolean;
    errors: FieldValidationError[];
    errorsByField: Record<string, string>;
}

const ERROR_MESSAGES = {
    required: (field: string) => `${field} is required`,
    invalidUrl: 'Please enter a valid URL (e.g., https://example.com)',
};

function createValidationResult(errors: FieldValidationError[]): FormValidationResult {
    const errorsByField: Record<string, string> = {};
    for (const error of errors) {
        errorsByField[error.field] = error.message;
    }
    return {
        isValid: errors.length === 0,
        errors,
        errorsByField,
    };
}

function validateRequired(value: unknown, fieldName: string): FieldValidationError | null {
    if (isEmpty(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.required(fieldName),
            type: 'required',
        };
    }
    return null;
}

export function validateUrl(value: string, fieldName: string = 'URL'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!isValidUrl(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidUrl,
            type: 'format',
        };
    }
    return null;
}

const HOSTNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

export function validateHostname(value: string, fieldName: string = 'Hostname'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!HOSTNAME_PATTERN.test(value)) {
        return {
            field: fieldName,
            message: 'Please enter a valid hostname',
            type: 'format',
        };
    }
    return null;
}

export function validatePort(value: string | number, fieldName: string = 'Port'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    const portNum = typeof value === 'string' ? parseInt(value, 10) : value;
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return {
            field: fieldName,
            message: 'Please enter a valid port number (1-65535)',
            type: 'format',
        };
    }
    return null;
}

export function validateTriggerConfig(
    trigger?: { type?: string; [key: string]: unknown },
    triggerSchemas?: TypedOptionValue[],
): FieldValidationError[] {
    if (!trigger?.type) return [];
    const errors: FieldValidationError[] = [];

    // Schema-driven validation: validate required fields from schema
    if (triggerSchemas?.length) {
        const schema = triggerSchemas.find(s => s.value === trigger.type);
        if (schema) {
            for (const field of schema.fields) {
                if (field.required) {
                    const value = trigger[field.key];
                    if (value === undefined || value === null || value === '') {
                        errors.push({
                            field: field.key,
                            message: `${field.label} is required`,
                            type: 'required',
                        });
                    }
                }
            }
        }
    }

    return errors;
}

function validateReviewStep(name?: string): FieldValidationError[] {
    const err = validateRequired(name, 'Name');
    return err ? [err] : [];
}

/**
 * Resolve the backend adapter code for a wizard source type.
 * Searches provided adapter schemas first (case-insensitive match),
 * then falls back to lowercase convention.
 */
function getAdapterCodeForType(
    sourceType: string,
    adapterSchemas?: Array<{ code: string }>,
): string {
    const match = adapterSchemas?.find(a => a.code.toUpperCase() === sourceType.toUpperCase());
    if (match) return match.code;
    return sourceType.toLowerCase();
}

export function validateImportWizardStep(
    step: string,
    config: {
        name?: string;
        source?: {
            type?: string;
            [key: string]: unknown;
        };
        trigger?: { type?: string; [key: string]: unknown };
        targetEntity?: string;
        mappings?: Array<{ sourceField?: string; targetField?: string; required?: boolean }>;
        strategies?: { lookupFields?: string[] };
    },
    uploadedFile?: File | null,
    adapterSchemas?: Array<{ code: string; schema?: { fields: Array<{ key: string; required?: boolean }> } }>,
    triggerSchemas?: TypedOptionValue[],
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    switch (step) {
        case 'source':
            if (config.source?.type === SOURCE_TYPE.FILE && !uploadedFile) {
                errors.push({
                    field: 'file',
                    message: 'Please upload a file',
                    type: 'required',
                });
            }
            // Generic validation for all schema-driven sources (API, DATABASE, WEBHOOK, CDC, and dynamic types)
            if (config.source?.type
                && config.source.type !== SOURCE_TYPE.FILE) {
                const configKey = `${config.source.type.toLowerCase()}Config`;
                const sourceConfig = (config.source as Record<string, unknown>)[configKey];
                if (!sourceConfig || typeof sourceConfig !== 'object') {
                    errors.push({
                        field: configKey,
                        message: 'Source configuration is required',
                        type: 'required',
                    });
                }
                // When adapter schemas are provided, validate required fields from the schema
                if (adapterSchemas) {
                    const adapterCode = getAdapterCodeForType(config.source.type, adapterSchemas);
                    const adapter = adapterSchemas.find(a => a.code === adapterCode);
                    if (adapter?.schema?.fields) {
                        const cfgObj = ((sourceConfig ?? {}) as Record<string, unknown>);
                        for (const field of adapter.schema.fields) {
                            if (field.required && isEmpty(cfgObj[field.key])) {
                                errors.push({
                                    field: field.key,
                                    message: `${field.key} is required`,
                                    type: 'required',
                                });
                            }
                            // Validate URL format for URL-typed fields
                            if (/url/i.test(field.key) && !isEmpty(cfgObj[field.key])) {
                                const urlError = validateUrl(String(cfgObj[field.key]), field.key);
                                if (urlError) errors.push(urlError);
                            }
                        }
                    } else if (!adapter) {
                        // Adapter schemas loaded but this specific adapter was not found
                        errors.push({
                            field: 'adapterCode',
                            message: `Unknown source adapter: ${adapterCode}`,
                            type: 'custom',
                        });
                    }
                }
            }
            break;

        case 'target': {
            const targetError = validateRequired(config.targetEntity, 'Target Entity');
            if (targetError) errors.push(targetError);
            break;
        }

        case 'mapping': {
            const mappedFields = config.mappings?.filter(m => m.sourceField && m.targetField) ?? [];
            if (mappedFields.length === 0) {
                errors.push({
                    field: 'mappings',
                    message: 'At least one field mapping is required',
                    type: 'required',
                });
            }
            const requiredUnmapped = config.mappings?.filter(m => m.required && !m.sourceField) ?? [];
            if (requiredUnmapped.length > 0) {
                errors.push({
                    field: 'mappings',
                    message: `Required fields must be mapped: ${requiredUnmapped.map(m => m.targetField).join(', ')}`,
                    type: 'required',
                });
            }
            break;
        }

        case 'strategy':
            if ((config.strategies?.lookupFields?.length ?? 0) === 0) {
                errors.push({
                    field: 'lookupFields',
                    message: 'At least one lookup field is required to identify existing records',
                    type: 'required',
                });
            }
            break;

        case 'trigger':
            errors.push(...validateTriggerConfig(config.trigger, triggerSchemas));
            break;

        case 'review':
            errors.push(...validateReviewStep(config.name));
            break;
    }

    return createValidationResult(errors);
}

/**
 * Validate destination fields using backend destination schemas.
 * Loops over schema-defined required fields instead of hardcoding per-type validation.
 * For URL-typed fields (key contains 'url', case-insensitive), also validates format.
 */
function validateDestinationFromSchema(
    destination: { type?: string; [key: string]: unknown },
    schemas: DestinationSchema[],
): FieldValidationError[] {
    if (!destination.type) return [];
    const schema = schemas.find(s => s.type === destination.type);
    if (!schema || schema.fields.length === 0) return [];

    const configObj = (destination[schema.configKey] ?? {}) as Record<string, unknown>;
    const errors: FieldValidationError[] = [];

    for (const field of schema.fields) {
        const value = configObj[field.key];
        if (field.required && isEmpty(value)) {
            errors.push({
                field: field.key,
                message: `${field.label} is required`,
                type: 'required',
            });
        }
        // Validate URL format for URL-typed fields
        if (/url/i.test(field.key) && !isEmpty(value)) {
            const urlError = validateUrl(String(value), field.label);
            if (urlError) errors.push(urlError);
        }
    }

    return errors;
}

export function validateExportWizardStep(
    step: string,
    config: {
        name?: string;
        sourceEntity?: string;
        fields?: Array<{ include?: boolean }>;
        format?: { type?: string };
        trigger?: { type?: string; [key: string]: unknown };
        destination?: { type?: string; [key: string]: unknown };
    },
    destinationSchemas?: DestinationSchema[],
    triggerSchemas?: TypedOptionValue[],
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    switch (step) {
        case 'source': {
            const entityError = validateRequired(config.sourceEntity, 'Source Entity');
            if (entityError) errors.push(entityError);
            break;
        }

        case 'fields': {
            const includedFields = config.fields?.filter(f => f.include) ?? [];
            if (includedFields.length === 0) {
                errors.push({
                    field: 'fields',
                    message: 'At least one field must be selected for export',
                    type: 'required',
                });
            }
            // Validate each included field has a non-empty outputName
            for (let i = 0; i < includedFields.length; i++) {
                const field = includedFields[i] as { outputName?: string };
                if (!field.outputName || field.outputName.trim() === '') {
                    errors.push({
                        field: `fields[${i}].outputName`,
                        message: 'Output name is required for all included fields',
                        type: 'required',
                    });
                }
            }
            // Check for duplicate outputName values
            const outputNames = includedFields
                .map((f: { outputName?: string }) => f.outputName?.trim())
                .filter((name): name is string => Boolean(name));
            const duplicates = outputNames.filter((name, index) => outputNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
                errors.push({
                    field: 'fields',
                    message: `Duplicate output names found: ${[...new Set(duplicates)].join(', ')}`,
                    type: 'custom',
                });
            }
            break;
        }

        case 'format': {
            const formatError = validateRequired(config.format?.type, 'Export Format');
            if (formatError) errors.push(formatError);
            break;
        }

        case 'destination':
            if (config.destination && destinationSchemas) {
                errors.push(...validateDestinationFromSchema(config.destination, destinationSchemas));
            }
            break;

        case 'trigger':
            errors.push(...validateTriggerConfig(config.trigger, triggerSchemas));
            break;

        case 'review':
            errors.push(...validateReviewStep(config.name));
            break;
    }

    return createValidationResult(errors);
}

