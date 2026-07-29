import { getNestedValue, isEmpty, isValidUrl } from '../../shared';
import { CODE_PATTERN } from '../../shared';
import { SOURCE_TYPE } from '../constants';
import type { DestinationSchema, TypedOptionValue } from '../hooks/api/use-config-options';
import { isImportExistingRecordStrategy } from './wizard-strategies';
import { SHARED_UI_TRANSLATION_IDS } from '../constants/shared-ui-labels';
import {
    createValidationResult,
    localizedMessage,
    type FieldValidationError,
    type FormValidationResult,
    type FormValidationTranslate,
} from './form-validation-helpers';

export type {
    FieldValidationError,
    FormValidationResult,
    FormValidationTranslate,
} from './form-validation-helpers';

export { CODE_PATTERN };

function validateRequired(
    value: unknown,
    fieldName: string,
    translate?: FormValidationTranslate,
): FieldValidationError | null {
    if (isEmpty(value)) {
        return {
            field: fieldName,
            message: localizedMessage(
                translate,
                SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED,
                `${fieldName} is required`,
                { field: fieldName },
            ),
            type: 'required',
        };
    }
    return null;
}

export function validateUrl(
    value: string,
    fieldName: string = 'URL',
    translate?: FormValidationTranslate,
): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!isValidUrl(value)) {
        return {
            field: fieldName,
            message: localizedMessage(
                translate,
                SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_URL,
                'Please enter a valid URL (e.g., https://example.com)',
            ),
            type: 'format',
        };
    }
    return null;
}

const HOSTNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function validateHostname(
    value: string,
    fieldName: string = 'Hostname',
    translate?: FormValidationTranslate,
): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!HOSTNAME_PATTERN.test(value)) {
        return {
            field: fieldName,
            message: localizedMessage(
                translate,
                SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_HOSTNAME,
                'Please enter a valid hostname',
            ),
            type: 'format',
        };
    }
    return null;
}

export function validatePort(
    value: string | number,
    fieldName: string = 'Port',
    translate?: FormValidationTranslate,
): FieldValidationError | null {
    if (isEmpty(value)) return null;

    const portNum = typeof value === 'string' ? parseInt(value, 10) : value;
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        return {
            field: fieldName,
            message: localizedMessage(
                translate,
                SHARED_UI_TRANSLATION_IDS.VALIDATION_INVALID_PORT,
                'Please enter a valid port number (1-65535)',
            ),
            type: 'format',
        };
    }
    return null;
}

export function validateTriggerConfig(
    trigger?: { type?: string },
    triggerSchemas?: TypedOptionValue[],
    translate?: FormValidationTranslate,
): FieldValidationError[] {
    if (!trigger?.type) return [];
    const errors: FieldValidationError[] = [];
    const triggerRecord: Record<string, unknown> = { ...trigger };

    // Schema-driven validation: validate required fields from schema
    if (triggerSchemas?.length) {
        const schema = triggerSchemas.find(s => s.value === trigger.type);
        if (schema) {
            for (const field of schema.fields) {
                if (field.required) {
                    const value = triggerRecord[field.key];
                    if (value === undefined || value === null || value === '') {
                        errors.push({
                            field: field.key,
                            message: localizedMessage(
                                translate,
                                SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED,
                                `${field.label} is required`,
                                { field: field.label },
                            ),
                            type: 'required',
                        });
                    }
                }
            }
        }
    }

    return errors;
}

function validateReviewStep(
    name?: string,
    translate?: FormValidationTranslate,
): FieldValidationError[] {
    const err = validateRequired(name, 'Name', translate);
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
    if (sourceType === SOURCE_TYPE.API) return 'httpApi';
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
        trigger?: { type?: string };
        targetEntity?: string;
        mappings?: Array<{ sourceField?: string; targetField?: string; required?: boolean }>;
        strategies?: { lookupFields?: string[]; existingRecords?: unknown };
    },
    uploadedFile?: File | null,
    adapterSchemas?: Array<{
        code: string;
        schema?: {
            fields: Array<{
                key: string;
                label?: string | null;
                required?: boolean | null;
                defaultValue?: unknown;
            }>;
        };
    }>,
    triggerSchemas?: TypedOptionValue[],
    translate?: FormValidationTranslate,
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    switch (step) {
        case 'source':
            if (config.source?.type === SOURCE_TYPE.FILE && !uploadedFile) {
                errors.push({
                    field: 'file',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_UPLOAD_FILE,
                        'Please upload a file',
                    ),
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
                        message: localizedMessage(
                            translate,
                            SHARED_UI_TRANSLATION_IDS.VALIDATION_SOURCE_CONFIG,
                            'Source configuration is required',
                        ),
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
                            const fieldValue = getNestedValue(cfgObj, field.key);
                            const effectiveValue = fieldValue ?? field.defaultValue;
                            if (field.required && isEmpty(effectiveValue)) {
                                errors.push({
                                    field: field.key,
                                    message: localizedMessage(
                                        translate,
                                        SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED,
                                        `${field.label ?? field.key} is required`,
                                        { field: field.label ?? field.key },
                                    ),
                                    type: 'required',
                                });
                            }
                            // Validate URL format for URL-typed fields
                            if (/url/i.test(field.key) && !isEmpty(effectiveValue)) {
                                const urlError = validateUrl(
                                    String(effectiveValue),
                                    field.label ?? field.key,
                                    translate,
                                );
                                if (urlError) errors.push(urlError);
                            }
                        }
                    } else if (!adapter) {
                        // Adapter schemas loaded but this specific adapter was not found
                        errors.push({
                            field: 'adapterCode',
                            message: localizedMessage(
                                translate,
                                SHARED_UI_TRANSLATION_IDS.VALIDATION_UNKNOWN_SOURCE_ADAPTER,
                                `Unknown source adapter: ${adapterCode}`,
                                { adapter: adapterCode },
                            ),
                            type: 'custom',
                        });
                    }
                }
            }
            break;

        case 'target': {
            const targetError = validateRequired(config.targetEntity, 'Target Entity', translate);
            if (targetError) errors.push(targetError);
            break;
        }

        case 'mapping': {
            const mappedFields = config.mappings?.filter(m => m.sourceField && m.targetField) ?? [];
            if (mappedFields.length === 0) {
                errors.push({
                    field: 'mappings',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_MAPPING_REQUIRED,
                        'At least one field mapping is required',
                    ),
                    type: 'required',
                });
            }
            const requiredUnmapped = config.mappings?.filter(m => m.required && !m.sourceField) ?? [];
            if (requiredUnmapped.length > 0) {
                errors.push({
                    field: 'mappings',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED_FIELDS_MAPPED,
                        `Required fields must be mapped: ${requiredUnmapped.map(m => m.targetField).join(', ')}`,
                        { fields: requiredUnmapped.map(m => m.targetField).join(', ') },
                    ),
                    type: 'required',
                });
            }
            break;
        }

        case 'strategy':
            if (!isImportExistingRecordStrategy(config.strategies?.existingRecords)) {
                errors.push({
                    field: 'existingRecords',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_EXISTING_STRATEGY,
                        'Choose Skip, Update, Replace, or Error for existing records',
                    ),
                    type: 'custom',
                });
            }
            if ((config.strategies?.lookupFields?.length ?? 0) === 0) {
                errors.push({
                    field: 'lookupFields',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_LOOKUP_FIELD,
                        'At least one lookup field is required to identify existing records',
                    ),
                    type: 'required',
                });
            }
            break;

        case 'trigger':
            errors.push(...validateTriggerConfig(config.trigger, triggerSchemas, translate));
            break;

        case 'review':
            errors.push(...validateReviewStep(config.name, translate));
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
    destination: { type?: string },
    schemas: DestinationSchema[],
    translate?: FormValidationTranslate,
): FieldValidationError[] {
    if (!destination.type) return [];
    const schema = schemas.find(s => s.type === destination.type);
    if (!schema) {
        return [{
            field: 'destinationType',
            message: localizedMessage(
                translate,
                SHARED_UI_TRANSLATION_IDS.VALIDATION_UNSUPPORTED_DESTINATION,
                `Unsupported export destination: ${destination.type}`,
                { type: destination.type },
            ),
            type: 'custom',
        }];
    }

    const destinationRecord: Record<string, unknown> = { ...destination };
    const configObj = (destinationRecord[schema.configKey] ?? {}) as Record<string, unknown>;
    const errors: FieldValidationError[] = [];

    for (const field of schema.fields) {
        const value = getNestedValue(configObj, field.key);
        const effectiveValue = value ?? field.defaultValue;
        if (field.required && isEmpty(effectiveValue)) {
            errors.push({
                field: field.key,
                message: localizedMessage(
                    translate,
                    SHARED_UI_TRANSLATION_IDS.VALIDATION_REQUIRED,
                    `${field.label} is required`,
                    { field: field.label },
                ),
                type: 'required',
            });
        }
        // Validate URL format for URL-typed fields
        if (/url/i.test(field.key) && !isEmpty(effectiveValue)) {
            const urlError = validateUrl(String(effectiveValue), field.label, translate);
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
        fields?: Array<{ include?: boolean; outputName?: string }>;
        format?: { type?: string };
        trigger?: { type?: string };
        destination?: { type?: string };
    },
    destinationSchemas?: DestinationSchema[],
    triggerSchemas?: TypedOptionValue[],
    translate?: FormValidationTranslate,
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    switch (step) {
        case 'source': {
            const entityError = validateRequired(config.sourceEntity, 'Source Entity', translate);
            if (entityError) errors.push(entityError);
            break;
        }

        case 'fields': {
            const includedFields = config.fields?.filter(f => f.include) ?? [];
            if (includedFields.length === 0) {
                errors.push({
                    field: 'fields',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_FIELD_SELECTED,
                        'At least one field must be selected for export',
                    ),
                    type: 'required',
                });
            }
            // Validate each included field has a non-empty outputName
            for (let i = 0; i < includedFields.length; i++) {
                const field = includedFields[i];
                if (!field.outputName || field.outputName.trim() === '') {
                    errors.push({
                        field: `fields[${i}].outputName`,
                        message: localizedMessage(
                            translate,
                            SHARED_UI_TRANSLATION_IDS.VALIDATION_OUTPUT_NAME,
                            'Output name is required for all included fields',
                        ),
                        type: 'required',
                    });
                }
            }
            // Check for duplicate outputName values
            const outputNames = includedFields
                .map(f => f.outputName?.trim())
                .filter((name): name is string => Boolean(name));
            const duplicates = outputNames.filter((name, index) => outputNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
                errors.push({
                    field: 'fields',
                    message: localizedMessage(
                        translate,
                        SHARED_UI_TRANSLATION_IDS.VALIDATION_DUPLICATE_OUTPUT_NAMES,
                        `Duplicate output names found: ${[...new Set(duplicates)].join(', ')}`,
                        { names: [...new Set(duplicates)].join(', ') },
                    ),
                    type: 'custom',
                });
            }
            break;
        }

        case 'format': {
            const formatError = validateRequired(config.format?.type, 'Export Format', translate);
            if (formatError) errors.push(formatError);
            break;
        }

        case 'destination':
            if (config.destination && destinationSchemas) {
                errors.push(...validateDestinationFromSchema(
                    config.destination,
                    destinationSchemas,
                    translate,
                ));
            }
            break;

        case 'trigger':
            errors.push(...validateTriggerConfig(config.trigger, triggerSchemas, translate));
            break;

        case 'review':
            errors.push(...validateReviewStep(config.name, translate));
            break;
    }

    return createValidationResult(errors);
}
