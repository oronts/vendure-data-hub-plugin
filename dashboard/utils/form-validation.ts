import { isEmpty, isEmail as checkIsEmail, isURL as checkIsURL } from './field-validators';
import { RETENTION } from '../constants/defaults';
import { EMAIL_REGEX } from '../constants/validation-patterns';
import { SOURCE_TYPE, DESTINATION_TYPE } from '../constants/wizard-options';
import { TRIGGER_TYPES, QUEUE_TYPES } from '../constants';
import { SECRET_PROVIDER } from '../constants/ui-types';
import { CONNECTION_TYPE } from '../constants/connection-types';
import { CODE_PATTERN } from '../../shared/utils/validation';

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
export const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const EMAIL_PATTERN = EMAIL_REGEX;
export const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
export const CRON_PATTERN = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
export const HOSTNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
export const PORT_PATTERN = /^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/;

export const ERROR_MESSAGES = {
    required: (field: string) => `${field} is required`,
    invalidCode: 'Must start with a letter and contain only letters, numbers, hyphens, and underscores',
    invalidEmail: 'Please enter a valid email address',
    invalidUrl: 'Please enter a valid URL (e.g., https://example.com)',
    invalidCron: 'Please enter a valid cron expression (e.g., 0 * * * *)',
    invalidHostname: 'Please enter a valid hostname',
    invalidPort: 'Please enter a valid port number (1-65535)',
    invalidNumber: 'Please enter a valid number',
    invalidJson: 'Please enter valid JSON',
    minLength: (min: number) => `Must be at least ${min} characters`,
    maxLength: (max: number) => `Must be no more than ${max} characters`,
    minValue: (min: number) => `Must be at least ${min}`,
    maxValue: (max: number) => `Must be no more than ${max}`,
    codeTaken: 'This code is already in use',
    passwordMismatch: 'Passwords do not match',
    invalidSelection: 'Please select a valid option',
};

export function createValidationResult(errors: FieldValidationError[]): FormValidationResult {
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

export function validateRequired(value: unknown, fieldName: string): FieldValidationError | null {
    if (isEmpty(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.required(fieldName),
            type: 'required',
        };
    }
    return null;
}

export function validateCode(value: string, fieldName: string = 'Code'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!CODE_PATTERN.test(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidCode,
            type: 'format',
        };
    }
    return null;
}

export function validateEmail(value: string, fieldName: string = 'Email'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!checkIsEmail(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidEmail,
            type: 'format',
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

export function validateCron(value: string, fieldName: string = 'Cron expression'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidCron,
            type: 'format',
        };
    }

    const ranges = [
        { min: 0, max: 59 },
        { min: 0, max: 23 },
        { min: 1, max: 31 },
        { min: 1, max: 12 },
        { min: 0, max: 7 },
    ];

    for (let i = 0; i < 5; i++) {
        const part = parts[i];
        if (!isValidCronPart(part, ranges[i].min, ranges[i].max)) {
            return {
                field: fieldName,
                message: ERROR_MESSAGES.invalidCron,
                type: 'format',
            };
        }
    }

    return null;
}

function isValidCronPart(part: string, min: number, max: number): boolean {
    if (part === '*') return true;

    if (part.startsWith('*/')) {
        const step = parseInt(part.slice(2), 10);
        return !isNaN(step) && step > 0 && step <= max;
    }

    const elements = part.split(',');
    for (const element of elements) {
        if (element.includes('-')) {
            const [start, end] = element.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
                return false;
            }
        } else if (element.includes('/')) {
            const [range, step] = element.split('/');
            const stepNum = parseInt(step, 10);
            if (isNaN(stepNum) || stepNum <= 0) return false;
            if (range !== '*') {
                const rangeNum = parseInt(range, 10);
                if (isNaN(rangeNum) || rangeNum < min || rangeNum > max) return false;
            }
        } else {
            const num = parseInt(element, 10);
            if (isNaN(num) || num < min || num > max) {
                return false;
            }
        }
    }

    return true;
}

export function validateHostname(value: string, fieldName: string = 'Hostname'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (!HOSTNAME_PATTERN.test(value)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidHostname,
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
            message: ERROR_MESSAGES.invalidPort,
            type: 'format',
        };
    }
    return null;
}

export function validateNumber(
    value: unknown,
    fieldName: string = 'Value',
    options?: { min?: number; max?: number }
): FieldValidationError | null {
    if (isEmpty(value)) return null;

    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (typeof num !== 'number' || isNaN(num)) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidNumber,
            type: 'format',
        };
    }

    if (options?.min !== undefined && num < options.min) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.minValue(options.min),
            type: 'range',
        };
    }

    if (options?.max !== undefined && num > options.max) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.maxValue(options.max),
            type: 'range',
        };
    }

    return null;
}

export function validateLength(
    value: string,
    fieldName: string = 'Value',
    options: { min?: number; max?: number }
): FieldValidationError | null {
    if (isEmpty(value)) return null;

    if (options.min !== undefined && value.length < options.min) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.minLength(options.min),
            type: 'range',
        };
    }

    if (options.max !== undefined && value.length > options.max) {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.maxLength(options.max),
            type: 'range',
        };
    }

    return null;
}

export function validateJson(value: string, fieldName: string = 'JSON'): FieldValidationError | null {
    if (isEmpty(value)) return null;

    try {
        JSON.parse(value);
        return null;
    } catch {
        return {
            field: fieldName,
            message: ERROR_MESSAGES.invalidJson,
            type: 'format',
        };
    }
}

type ValidatorFn = (value: unknown) => FieldValidationError | null;

export function composeValidators(...validators: ValidatorFn[]): ValidatorFn {
    return (value: unknown) => {
        for (const validator of validators) {
            const error = validator(value);
            if (error) return error;
        }
        return null;
    };
}

export function validateForm(
    data: Record<string, unknown>,
    validators: Record<string, ValidatorFn>
): FormValidationResult {
    const errors: FieldValidationError[] = [];

    for (const [field, validator] of Object.entries(validators)) {
        const error = validator(data[field]);
        if (error) {
            errors.push({ ...error, field });
        }
    }

    return createValidationResult(errors);
}

export function validatePipelineForm(data: {
    code?: string;
    name?: string;
}): FormValidationResult {
    const errors: FieldValidationError[] = [];

    const nameError = validateRequired(data.name, 'Name');
    if (nameError) errors.push(nameError);

    const codeRequiredError = validateRequired(data.code, 'Code');
    if (codeRequiredError) {
        errors.push(codeRequiredError);
    } else {
        const codeFormatError = validateCode(data.code ?? '', 'Code');
        if (codeFormatError) errors.push(codeFormatError);
    }

    return createValidationResult(errors);
}

export function validateConnectionForm(data: {
    code?: string;
    type?: string;
    config?: Record<string, unknown>;
}): FormValidationResult {
    const errors: FieldValidationError[] = [];

    const codeRequiredError = validateRequired(data.code, 'Code');
    if (codeRequiredError) {
        errors.push(codeRequiredError);
    } else {
        const codeFormatError = validateCode(data.code ?? '', 'Code');
        if (codeFormatError) errors.push(codeFormatError);
    }

    if (data.type === CONNECTION_TYPE.HTTP && data.config) {
        const baseUrl = data.config.baseUrl as string | undefined;
        if (baseUrl) {
            const urlError = validateUrl(baseUrl, 'Base URL');
            if (urlError) errors.push(urlError);
        }
    }

    if ([CONNECTION_TYPE.POSTGRES, CONNECTION_TYPE.MYSQL, CONNECTION_TYPE.MONGO, 'REDIS', 'ELASTICSEARCH'].includes(data.type ?? '')) {
        const config = data.config ?? {};

        if ([CONNECTION_TYPE.POSTGRES, CONNECTION_TYPE.MYSQL, 'REDIS'].includes(data.type ?? '')) {
            const hostError = validateRequired(config.host, 'Host');
            if (hostError) errors.push(hostError);

            const portValue = config.port;
            if (portValue !== undefined && portValue !== null && portValue !== '') {
                const portError = validatePort(portValue as string | number, 'Port');
                if (portError) errors.push(portError);
            }
        }
    }

    return createValidationResult(errors);
}

export function validateSecretForm(data: {
    code?: string;
    provider?: string;
    value?: string;
}, isCreating: boolean): FormValidationResult {
    const errors: FieldValidationError[] = [];

    const codeRequiredError = validateRequired(data.code, 'Code');
    if (codeRequiredError) {
        errors.push(codeRequiredError);
    } else {
        const codeFormatError = validateCode(data.code ?? '', 'Code');
        if (codeFormatError) errors.push(codeFormatError);
    }

    if (data.provider === SECRET_PROVIDER.ENV) {
        const valueError = validateRequired(data.value, 'Environment Variable Name');
        if (valueError) errors.push(valueError);
    }

    if (isCreating && data.provider === SECRET_PROVIDER.INLINE) {
        const valueError = validateRequired(data.value, 'Secret Value');
        if (valueError) errors.push(valueError);
    }

    return createValidationResult(errors);
}

export function validateSettingsForm(data: {
    retentionDaysRuns?: string;
    retentionDaysErrors?: string;
    retentionDaysLogs?: string;
}): FormValidationResult {
    const errors: FieldValidationError[] = [];

    const fields = [
        { key: 'retentionDaysRuns', label: 'Pipeline Run History' },
        { key: 'retentionDaysErrors', label: 'Error Records' },
        { key: 'retentionDaysLogs', label: 'Log Retention' },
    ] as const;

    for (const { key, label } of fields) {
        const value = data[key];
        if (value !== undefined && value !== '') {
            const numError = validateNumber(value, label, { min: RETENTION.MIN_DAYS, max: RETENTION.MAX_DAYS });
            if (numError) errors.push(numError);
        }
    }

    return createValidationResult(errors);
}

export function validateTriggerConfig(trigger: {
    type: string;
    cron?: string;
    path?: string;
    eventType?: string;
    message?: {
        queueType?: string;
        connectionCode?: string;
        queueName?: string;
        batchSize?: number;
    };
}): FormValidationResult {
    const errors: FieldValidationError[] = [];

    if (trigger.type === TRIGGER_TYPES.SCHEDULE) {
        const cronError = validateRequired(trigger.cron, 'Schedule');
        if (cronError) {
            errors.push(cronError);
        } else {
            const cronFormatError = validateCron(trigger.cron ?? '', 'Schedule');
            if (cronFormatError) errors.push(cronFormatError);
        }
    }

    if (trigger.type === TRIGGER_TYPES.WEBHOOK) {
        const pathError = validateRequired(trigger.path, 'Webhook Path');
        if (pathError) {
            errors.push(pathError);
        } else {
            const pathFormatError = validateCode(trigger.path ?? '', 'Webhook Path');
            if (pathFormatError) errors.push(pathFormatError);
        }
    }

    if (trigger.type === TRIGGER_TYPES.EVENT) {
        const eventError = validateRequired(trigger.eventType, 'Event Type');
        if (eventError) errors.push(eventError);
    }

    if (trigger.type === TRIGGER_TYPES.MESSAGE) {
        const msgConfig = trigger.message;

        // Queue type is required
        const queueTypeError = validateRequired(msgConfig?.queueType, 'Queue Type');
        if (queueTypeError) errors.push(queueTypeError);

        // Connection code is required (except for internal queue)
        if (msgConfig?.queueType !== QUEUE_TYPES.INTERNAL) {
            const connectionError = validateRequired(msgConfig?.connectionCode, 'Connection');
            if (connectionError) errors.push(connectionError);
        }

        // Queue name is required
        const queueNameError = validateRequired(msgConfig?.queueName, 'Queue Name');
        if (queueNameError) errors.push(queueNameError);

        // Batch size must be in valid range
        if (msgConfig?.batchSize !== undefined) {
            const batchSizeError = validateNumber(msgConfig.batchSize, 'Batch Size', { min: 1, max: 100 });
            if (batchSizeError) errors.push(batchSizeError);
        }
    }

    return createValidationResult(errors);
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
