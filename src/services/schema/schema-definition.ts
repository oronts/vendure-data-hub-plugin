import type { JsonObject } from '../../types';
import { SCHEMA_REGISTRY } from '../../constants';
import { createSafeRegex } from '../../utils/safe-regex.utils';
import {
    isJsonPrimitive,
    isPlainObject,
    numericConstraint,
} from './schema-json';
import type { SchemaNode } from './schema-json';

export {
    formatSchemaValidationIssues,
    validateSchemaRecord,
} from './schema-record-validation';
export type { SchemaValidationIssue } from './schema-record-validation';

const DATA_HUB_TYPES = new Set([
    'array',
    'boolean',
    'decimal',
    'enum',
    'float',
    'integer',
    'json',
    'null',
    'number',
    'object',
    'string',
    'text',
]);

const ROOT_KEYS = new Set([
    '$id',
    '$version',
    'description',
    'fields',
    'label',
]);

const FIELD_KEYS = new Set([
    'description',
    'enum',
    'example',
    'fields',
    'items',
    'label',
    'nullable',
    'required',
    'type',
    'validation',
]);

const STRING_VALIDATION_KEYS = new Set(['maxLength', 'minLength', 'pattern']);
const NUMBER_VALIDATION_KEYS = new Set(['max', 'min']);
const ARRAY_VALIDATION_KEYS = new Set(['maxItems', 'minItems']);

export interface SchemaDefinitionIdentity {
    readonly schemaId: string;
    readonly version: string;
}

interface BoundedJsonObjectOptions {
    readonly label: string;
    readonly maxBytes: number;
    readonly maxDepth: number;
}

export function assertBoundedJsonObject(
    value: JsonObject,
    options: BoundedJsonObjectOptions,
): void {
    if (!isPlainObject(value)) {
        throw new Error(`${options.label} must be a JSON object`);
    }
    const stack: Array<{ value: object; depth: number; exiting: boolean }> = [{
        value,
        depth: 1,
        exiting: false,
    }];
    const ancestors = new WeakSet<object>();
    while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) break;
        if (frame.exiting) {
            ancestors.delete(frame.value);
            continue;
        }
        if (frame.depth > options.maxDepth) {
            throw new Error(
                `${options.label} cannot exceed ${options.maxDepth} nested levels`,
            );
        }
        if (ancestors.has(frame.value)) {
            throw new Error(`${options.label} must not contain circular references`);
        }
        if (!Array.isArray(frame.value) && !isPlainObject(frame.value)) {
            throw new Error(`${options.label} must contain only plain JSON values`);
        }
        ancestors.add(frame.value);
        stack.push({ ...frame, exiting: true });
        for (const child of Object.values(frame.value)) {
            if (child !== null && typeof child === 'object') {
                stack.push({
                    value: child,
                    depth: frame.depth + 1,
                    exiting: false,
                });
            } else if (!isJsonPrimitive(child)) {
                throw new Error(`${options.label} must contain only finite JSON values`);
            }
        }
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > options.maxBytes) {
        throw new Error(`${options.label} cannot exceed ${options.maxBytes} bytes`);
    }
}

export function assertSchemaDefinition(
    definition: JsonObject,
    identity?: SchemaDefinitionIdentity,
): void {
    if (!isPlainObject(definition)) {
        throw new Error('Schema definition must be a JSON object');
    }
    assertBoundedJsonObject(definition, {
        label: 'Schema definition',
        maxBytes: SCHEMA_REGISTRY.MAX_DEFINITION_BYTES,
        maxDepth: SCHEMA_REGISTRY.MAX_DEFINITION_DEPTH,
    });
    assertAllowedKeys(definition, ROOT_KEYS, '$');
    if (!isPlainObject(definition.fields)) {
        throw new Error('Schema definition must contain a Data Hub fields object');
    }
    if (definition.$id !== undefined) {
        assertOptionalString(definition.$id, '$.$id');
        if (identity && definition.$id !== identity.schemaId) {
            throw new Error('Schema definition $id must match the registry schemaId');
        }
    }
    if (definition.$version !== undefined) {
        assertOptionalString(definition.$version, '$.$version');
        if (identity && definition.$version !== identity.version) {
            throw new Error('Schema definition $version must match the registry version');
        }
    }
    assertOptionalString(definition.label, '$.label');
    assertOptionalString(definition.description, '$.description');
    validateSchemaNodes(definition.fields, 'fields');
}

function validateSchemaNodes(fields: SchemaNode, path: string): void {
    for (const [fieldName, value] of Object.entries(fields)) {
        if (!isPlainObject(value)) {
            throw new Error(`${path}.${fieldName} must be an object`);
        }
        validateDataHubSchemaNode(value, `${path}.${fieldName}`);
    }
}

function validateDataHubSchemaNode(node: SchemaNode, path: string): void {
    assertAllowedKeys(node, FIELD_KEYS, path);
    if (typeof node.type !== 'string' || !DATA_HUB_TYPES.has(node.type)) {
        throw new Error(
            `${path}.type is not supported by registry validation; use string, text, number, integer, float, decimal, boolean, null, json, object, array, or enum`,
        );
    }
    if (node.required !== undefined && typeof node.required !== 'boolean') {
        throw new Error(`${path}.required must be a boolean`);
    }
    if (node.nullable !== undefined && typeof node.nullable !== 'boolean') {
        throw new Error(`${path}.nullable must be a boolean`);
    }
    assertOptionalString(node.label, `${path}.label`);
    assertOptionalString(node.description, `${path}.description`);
    validateFieldConstraints(node, path);
    if (node.fields !== undefined) {
        if (node.type !== 'object') {
            throw new Error(`${path}.fields is only valid for object fields`);
        }
        if (!isPlainObject(node.fields)) throw new Error(`${path}.fields must be an object`);
        validateSchemaNodes(node.fields, `${path}.fields`);
    } else if (node.type === 'object') {
        throw new Error(`${path}.fields is required for object fields`);
    }
    if (node.items !== undefined) {
        if (node.type !== 'array') {
            throw new Error(`${path}.items is only valid for array fields`);
        }
        if (!isPlainObject(node.items)) throw new Error(`${path}.items must be an object`);
        validateDataHubSchemaNode(node.items, `${path}.items`);
    } else if (node.type === 'array') {
        throw new Error(`${path}.items is required for array fields`);
    }
    if (node.type === 'enum') {
        if (!Array.isArray(node.enum) || node.enum.length === 0) {
            throw new Error(`${path}.enum must be a non-empty array for enum fields`);
        }
        for (const value of node.enum) {
            if (!isJsonPrimitive(value)) {
                throw new Error(`${path}.enum must contain only primitive JSON values`);
            }
        }
    } else if (node.enum !== undefined) {
        throw new Error(`${path}.enum is only valid for enum fields`);
    }
}

function validateFieldConstraints(node: SchemaNode, path: string): void {
    if (node.validation === undefined) return;
    if (!isPlainObject(node.validation)) {
        throw new Error(`${path}.validation must be an object`);
    }
    const allowed = node.type === 'string' || node.type === 'text'
        ? STRING_VALIDATION_KEYS
        : node.type === 'number'
            || node.type === 'integer'
            || node.type === 'float'
            || node.type === 'decimal'
            ? NUMBER_VALIDATION_KEYS
            : node.type === 'array'
                ? ARRAY_VALIDATION_KEYS
                : new Set<string>();
    assertAllowedKeys(node.validation, allowed, `${path}.validation`);
    for (const [key, value] of Object.entries(node.validation)) {
        if (key === 'pattern') continue;
        if (
            typeof value !== 'number'
            || !Number.isFinite(value)
            || key !== 'min' && key !== 'max' && (!Number.isInteger(value) || value < 0)
        ) {
            throw new Error(`${path}.validation.${key} must be a valid numeric constraint`);
        }
    }
    assertSafePattern(node.validation, `${path}.validation.pattern`);
    assertConstraintOrder(node.validation, 'min', 'max', path);
    assertConstraintOrder(node.validation, 'minLength', 'maxLength', path);
    assertConstraintOrder(node.validation, 'minItems', 'maxItems', path);
}

function assertSafePattern(container: unknown, path: string): void {
    if (!isPlainObject(container) || container.pattern === undefined) return;
    if (typeof container.pattern !== 'string') {
        throw new Error(`${path} must be a string`);
    }
    createSafeRegex(container.pattern);
}

function assertConstraintOrder(
    validation: SchemaNode,
    minimumKey: string,
    maximumKey: string,
    path: string,
): void {
    const minimum = numericConstraint(validation[minimumKey]);
    const maximum = numericConstraint(validation[maximumKey]);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new Error(
            `${path}.validation.${minimumKey} cannot exceed ${maximumKey}`,
        );
    }
}

function assertAllowedKeys(
    value: SchemaNode,
    allowed: ReadonlySet<string>,
    path: string,
): void {
    const unsupported = Object.keys(value).find(key => !allowed.has(key));
    if (unsupported) {
        throw new Error(`${path}.${unsupported} is not supported by registry validation`);
    }
}

function assertOptionalString(value: unknown, path: string): void {
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
        throw new Error(`${path} must be a non-empty string`);
    }
}
