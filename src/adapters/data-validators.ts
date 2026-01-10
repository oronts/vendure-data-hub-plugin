/**
 * Data Validators
 *
 * Adapters for validating data records.
 */

import { RecordObject } from '../runtime/executor-types';
import { AdapterDefinition, AdapterError } from './types';
import { getFieldValue, isCompatibleType } from './utils';

/**
 * Schema Validator
 */
export const schemaValidator: AdapterDefinition = {
    code: 'schema-validator',
    name: 'Schema Validator',
    type: 'validator',
    description: 'Validate records against a field schema',
    configSchema: {
        properties: {
            requiredFields: { type: 'array', label: 'Required Fields' },
            fieldTypes: { type: 'object', label: 'Field Types', description: 'Field name to type mapping' },
            mode: { type: 'select', label: 'Mode', default: 'reject', options: [
                { value: 'reject', label: 'Reject Invalid' },
                { value: 'warn', label: 'Warn Only' },
                { value: 'fix', label: 'Fix and Continue' },
            ]},
        },
    },
    async process(_ctx, records, config) {
        const requiredFields = config.requiredFields as string[] || [];
        const fieldTypes = config.fieldTypes as Record<string, string> || {};
        const mode = config.mode as 'reject' | 'warn' | 'fix';

        const results: RecordObject[] = [];
        const errors: AdapterError[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const recordErrors: AdapterError[] = [];

            // Check required fields
            for (const field of requiredFields) {
                const value = getFieldValue(record, field);
                if (value === undefined || value === null || value === '') {
                    recordErrors.push({ index: i, field, message: `Required field "${field}" is missing` });
                }
            }

            // Check field types
            for (const [field, expectedType] of Object.entries(fieldTypes)) {
                const value = getFieldValue(record, field);
                if (value !== undefined && value !== null) {
                    const actualType = typeof value;
                    if (!isCompatibleType(actualType, expectedType)) {
                        recordErrors.push({ index: i, field, message: `Field "${field}" expected ${expectedType}, got ${actualType}` });
                    }
                }
            }

            if (recordErrors.length === 0 || mode === 'warn') {
                results.push(record);
            }

            errors.push(...recordErrors);
        }

        return {
            success: mode !== 'reject' || errors.length === 0,
            records: results,
            errors,
            stats: {
                processed: records.length,
                failed: records.length - results.length,
            },
        };
    },
};

/**
 * Collection of all validators
 */
export const validators = {
    schema: schemaValidator,
};
