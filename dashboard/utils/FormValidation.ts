import { isEmpty, isURL as checkIsURL } from './FieldValidators';
import { SOURCE_TYPE, DESTINATION_TYPE } from '../constants/WizardOptions';
import { CODE_PATTERN } from '../../shared';

export { CODE_PATTERN };

interface FieldValidationError {
    field: string;
    message: string;
    type: 'required' | 'format' | 'range' | 'custom';
}

interface FormValidationResult {
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

    if (!checkIsURL(value)) {
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

export function validateImportWizardStep(
    step: string,
    config: {
        name?: string;
        source?: { type?: string; apiConfig?: { url?: string } };
        targetEntity?: string;
        mappings?: Array<{ sourceField?: string; targetField?: string; required?: boolean }>;
        strategies?: { lookupFields?: string[] };
    },
    uploadedFile?: File | null
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
            if (config.source?.type === SOURCE_TYPE.API) {
                const urlError = validateRequired(config.source.apiConfig?.url, 'API URL');
                if (urlError) errors.push(urlError);
                else {
                    const urlFormatError = validateUrl(config.source.apiConfig?.url ?? '', 'API URL');
                    if (urlFormatError) errors.push(urlFormatError);
                }
            }
            break;

        case 'target':
            const targetError = validateRequired(config.targetEntity, 'Target Entity');
            if (targetError) errors.push(targetError);
            break;

        case 'mapping':
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

        case 'strategy':
            if ((config.strategies?.lookupFields?.length ?? 0) === 0) {
                errors.push({
                    field: 'lookupFields',
                    message: 'At least one lookup field is required to identify existing records',
                    type: 'required',
                });
            }
            break;

        case 'review':
            const nameError = validateRequired(config.name, 'Name');
            if (nameError) errors.push(nameError);
            break;
    }

    return createValidationResult(errors);
}

export function validateExportWizardStep(
    step: string,
    config: {
        name?: string;
        sourceEntity?: string;
        fields?: Array<{ include?: boolean }>;
        format?: { type?: string };
        destination?: {
            type?: string;
            fileConfig?: { filename?: string };
            sftpConfig?: { host?: string };
            httpConfig?: { url?: string };
        };
    }
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    switch (step) {
        case 'source':
            const entityError = validateRequired(config.sourceEntity, 'Source Entity');
            if (entityError) errors.push(entityError);
            break;

        case 'fields':
            const includedFields = config.fields?.filter(f => f.include) ?? [];
            if (includedFields.length === 0) {
                errors.push({
                    field: 'fields',
                    message: 'At least one field must be selected for export',
                    type: 'required',
                });
            }
            break;

        case 'format':
            const formatError = validateRequired(config.format?.type, 'Export Format');
            if (formatError) errors.push(formatError);
            break;

        case 'destination':
            if (config.destination?.type === DESTINATION_TYPE.FILE) {
                const filenameError = validateRequired(config.destination.fileConfig?.filename, 'Filename');
                if (filenameError) errors.push(filenameError);
            }
            if (config.destination?.type === DESTINATION_TYPE.SFTP) {
                const hostError = validateRequired(config.destination.sftpConfig?.host, 'SFTP Host');
                if (hostError) errors.push(hostError);
            }
            if (config.destination?.type === DESTINATION_TYPE.HTTP) {
                const urlError = validateRequired(config.destination.httpConfig?.url, 'HTTP URL');
                if (urlError) errors.push(urlError);
                else {
                    const urlFormatError = validateUrl(config.destination.httpConfig?.url ?? '', 'HTTP URL');
                    if (urlFormatError) errors.push(urlFormatError);
                }
            }
            break;

        case 'review':
            const nameError = validateRequired(config.name, 'Name');
            if (nameError) errors.push(nameError);
            break;
    }

    return createValidationResult(errors);
}
