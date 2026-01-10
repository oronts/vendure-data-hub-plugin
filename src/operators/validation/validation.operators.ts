import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
import {
    ValidateRequiredOperatorConfig,
    ValidateFormatOperatorConfig,
} from './types';
import {
    validateRequired,
    validateFormat,
    applyValidationErrors,
} from './helpers';
import { deepClone } from '../helpers';
import { VALIDATION_FIELDS } from '../../constants/index';

export const VALIDATE_REQUIRED_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'validateRequired',
    description: 'Mark records as invalid if required fields are missing.',
    pure: true,
    schema: {
        fields: [
            { key: 'fields', label: 'Required fields (JSON array)', type: 'json', required: true },
            { key: 'errorField', label: 'Error output field', type: 'string', description: 'Field to store validation errors' },
        ],
    },
};

export const VALIDATE_FORMAT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'validateFormat',
    description: 'Validate field format using regex.',
    pure: true,
    schema: {
        fields: [
            { key: 'field', label: 'Field path', type: 'string', required: true },
            { key: 'pattern', label: 'Regex pattern', type: 'string', required: true },
            { key: 'errorField', label: 'Error output field', type: 'string' },
            { key: 'errorMessage', label: 'Error message', type: 'string' },
        ],
    },
};

export function validateRequiredOperator(
    records: readonly JsonObject[],
    config: ValidateRequiredOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.fields || !Array.isArray(config.fields)) {
        return { records: [...records] };
    }

    const errorField = config.errorField || VALIDATION_FIELDS.DEFAULT_ERROR_FIELD;
    const results = records.map(record => {
        const errors = validateRequired(record, config.fields);
        if (errors.length > 0) {
            return applyValidationErrors(record, errors, errorField);
        }
        return deepClone(record);
    });

    return { records: results };
}

export function validateFormatOperator(
    records: readonly JsonObject[],
    config: ValidateFormatOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.field || !config.pattern) {
        return { records: [...records] };
    }

    const errorField = config.errorField || VALIDATION_FIELDS.DEFAULT_ERROR_FIELD;
    const results = records.map(record => {
        const error = validateFormat(
            record,
            config.field,
            config.pattern,
            config.errorMessage,
        );
        if (error) {
            return applyValidationErrors(record, [error], errorField);
        }
        return deepClone(record);
    });

    return { records: results };
}
