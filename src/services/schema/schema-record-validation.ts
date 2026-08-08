import type {
    JsonObject,
    JsonValue,
    SchemaCompatibility,
} from '../../types';
import { SCHEMA_REGISTRY } from '../../constants';
import { createSafeRegex } from '../../utils/safe-regex.utils';
import {
    isPlainObject,
    numericConstraint,
} from './schema-json';
import type { SchemaNode } from './schema-json';

export interface SchemaValidationIssue {
    readonly path: string;
    readonly message: string;
}

export function formatSchemaValidationIssues(
    issues: readonly SchemaValidationIssue[],
): string {
    return issues.map(issue => `${issue.path} ${issue.message}`).join('; ');
}

export function validateSchemaRecord(
    definition: JsonObject,
    record: JsonObject,
    compatibility: SchemaCompatibility,
): SchemaValidationIssue[] {
    const issues: SchemaValidationIssue[] = [];
    validateObjectFields(
        record,
        definition.fields as SchemaNode,
        compatibility,
        '$',
        issues,
    );
    return issues;
}

function validateObjectFields(
    value: JsonObject,
    fields: SchemaNode,
    compatibility: SchemaCompatibility,
    path: string,
    issues: SchemaValidationIssue[],
): void {
    for (const [fieldName, rawSchema] of Object.entries(fields)) {
        if (!isPlainObject(rawSchema)) continue;
        const required = rawSchema.required === true;
        const fieldValue = value[fieldName];
        const fieldPath = `${path}.${fieldName}`;
        if (fieldValue === undefined) {
            if (required) addIssue(issues, fieldPath, 'is required');
            continue;
        }
        validateValue(fieldValue, rawSchema, compatibility, fieldPath, issues);
    }

    if (compatibility === 'STRICT') {
        for (const fieldName of Object.keys(value)) {
            if (!(fieldName in fields)) {
                addIssue(issues, `${path}.${fieldName}`, 'is not declared by the schema');
            }
        }
    }
}

function validateValue(
    value: JsonValue,
    schema: SchemaNode,
    compatibility: SchemaCompatibility,
    path: string,
    issues: SchemaValidationIssue[],
): void {
    if (issues.length >= SCHEMA_REGISTRY.MAX_VALIDATION_ISSUES_PER_RECORD) return;
    if (value === null) {
        const nullable = schema.nullable === true || schema.type === 'null';
        if (!nullable) addIssue(issues, path, 'must not be null');
        return;
    }

    const expectedType = typeof schema.type === 'string' ? schema.type : undefined;
    if (expectedType && !matchesType(value, expectedType, schema)) {
        addIssue(issues, path, `must be ${expectedType}`);
        return;
    }
    validateEnum(value, schema, path, issues);
    validateScalarConstraints(value, schema, path, issues);

    if (Array.isArray(value)) {
        const itemSchema = isPlainObject(schema.items) ? schema.items : undefined;
        if (itemSchema) {
            for (let index = 0; index < value.length; index += 1) {
                validateValue(
                    value[index],
                    itemSchema,
                    compatibility,
                    `${path}[${index}]`,
                    issues,
                );
                if (issues.length >= SCHEMA_REGISTRY.MAX_VALIDATION_ISSUES_PER_RECORD) break;
            }
        }
        validateArrayConstraints(value, schema, path, issues);
        return;
    }
    if (!isPlainObject(value) || !isPlainObject(schema.fields)) return;
    validateObjectFields(value as JsonObject, schema.fields, compatibility, path, issues);
}

function validateEnum(
    value: JsonValue,
    schema: SchemaNode,
    path: string,
    issues: SchemaValidationIssue[],
): void {
    if (!Array.isArray(schema.enum)) return;
    if (!schema.enum.some(candidate => Object.is(candidate, value))) {
        addIssue(issues, path, 'must be one of the declared enum values');
    }
}

function validateScalarConstraints(
    value: JsonValue,
    schema: SchemaNode,
    path: string,
    issues: SchemaValidationIssue[],
): void {
    const validation = isPlainObject(schema.validation) ? schema.validation : {};
    if (typeof value === 'string') {
        const minLength = numericConstraint(validation.minLength);
        const maxLength = numericConstraint(validation.maxLength);
        if (minLength !== undefined && value.length < minLength) {
            addIssue(issues, path, `must contain at least ${minLength} characters`);
        }
        if (maxLength !== undefined && value.length > maxLength) {
            addIssue(issues, path, `must contain at most ${maxLength} characters`);
        }
        if (typeof validation.pattern === 'string') {
            const pattern = createSafeRegex(validation.pattern);
            if (!pattern.test(value)) addIssue(issues, path, 'does not match the required pattern');
        }
    }
    if (typeof value === 'number') {
        const minimum = numericConstraint(validation.min);
        const maximum = numericConstraint(validation.max);
        if (minimum !== undefined && value < minimum) {
            addIssue(issues, path, `must be at least ${minimum}`);
        }
        if (maximum !== undefined && value > maximum) {
            addIssue(issues, path, `must be at most ${maximum}`);
        }
    }
}

function validateArrayConstraints(
    value: JsonValue[],
    schema: SchemaNode,
    path: string,
    issues: SchemaValidationIssue[],
): void {
    const validation = isPlainObject(schema.validation) ? schema.validation : {};
    const minItems = numericConstraint(validation.minItems);
    const maxItems = numericConstraint(validation.maxItems);
    if (minItems !== undefined && value.length < minItems) {
        addIssue(issues, path, `must contain at least ${minItems} items`);
    }
    if (maxItems !== undefined && value.length > maxItems) {
        addIssue(issues, path, `must contain at most ${maxItems} items`);
    }
}

function matchesType(value: JsonValue, type: string, schema: SchemaNode): boolean {
    if (type === 'json') return true;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return isPlainObject(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number' || type === 'float') return typeof value === 'number';
    if (type === 'decimal') {
        return typeof value === 'number'
            || typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
    }
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'null') return value === null;
    if (type === 'enum') {
        return Array.isArray(schema.enum)
            && schema.enum.some(candidate => Object.is(candidate, value));
    }
    return typeof value === 'string';
}

function addIssue(
    issues: SchemaValidationIssue[],
    path: string,
    message: string,
): void {
    if (issues.length >= SCHEMA_REGISTRY.MAX_VALIDATION_ISSUES_PER_RECORD) return;
    issues.push({ path, message });
}
