import { getNestedValue, setNestedValue } from '../../../../../shared';
import type { OperatorSchemaField } from '../OperatorFieldInput';
import type { JsonRecord, RuleCondition } from './types';

export const MAP_SAMPLE = '[\n  { "name": "Alice", "price": 10, "category": { "code": "A" } }\n]';
export const TEMPLATE_SAMPLE = '{ "name": "Alice", "sku": "A-1" }';
const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function isJsonRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRuleCondition(value: unknown): value is RuleCondition {
    return isJsonRecord(value) && !('rules' in value);
}

export function collectPaths(record: JsonRecord, prefix = ''): string[] {
    const paths: string[] = [];
    for (const key of Object.keys(record)) {
        const value = record[key];
        const path = prefix ? `${prefix}.${key}` : key;
        if (isJsonRecord(value)) {
            paths.push(...collectPaths(value, path));
        } else {
            paths.push(path);
        }
    }
    return paths.sort();
}

export function stringifyJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? '';
    } catch {
        return '';
    }
}

export function isSafeObjectPath(path: string): boolean {
    const segments = path.split('.');
    return segments.length > 0 && segments.every(
        segment => segment.length > 0 && !DANGEROUS_PATH_SEGMENTS.has(segment),
    );
}

export function parseMapping(text: string): Record<string, string> | null {
    try {
        const value: unknown = JSON.parse(text);
        if (!isJsonRecord(value) || !Object.entries(value).every(
            ([target, source]) => (
                typeof source === 'string'
                && isSafeObjectPath(target)
                && isSafeObjectPath(source)
            ),
        )) {
            return null;
        }
        return value as Record<string, string>;
    } catch {
        return null;
    }
}

export function parseRecord(text: string): JsonRecord | null {
    try {
        const value: unknown = JSON.parse(text);
        return isJsonRecord(value) ? value : null;
    } catch {
        return null;
    }
}

export function parseRecordArray(text: string): JsonRecord[] | null {
    try {
        const value: unknown = JSON.parse(text);
        return Array.isArray(value) && value.every(isJsonRecord) ? value : null;
    } catch {
        return null;
    }
}

export function parseJsonArray(text: string): unknown[] | null {
    try {
        const value: unknown = JSON.parse(text);
        return Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

export function cloneEditorValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(item => cloneEditorValue(item)) as T;
    }
    if (isJsonRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, cloneEditorValue(item)]),
        ) as T;
    }
    return value;
}

export function previewMapping(
    records: JsonRecord[],
    mapping: Record<string, string>,
    passthrough: boolean,
): JsonRecord[] {
    return records.map(record => {
        let result = passthrough ? cloneEditorValue(record) : {};
        for (const [target, source] of Object.entries(mapping)) {
            const value = getNestedValue(record, source);
            if (value !== undefined) {
                result = setNestedValue(result, target, cloneEditorValue(value));
            }
        }
        return result;
    });
}

export function renderTemplate(
    record: JsonRecord,
    template: string,
    missingAsEmpty: boolean,
): string {
    return template.replace(/\$\{([^}]+)\}/g, (placeholder, path: string) => {
        const value = getNestedValue(record, path);
        if (value === undefined || value === null) {
            return missingAsEmpty ? '' : placeholder;
        }
        return String(value);
    });
}

export function parseLooseJsonValue(text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

export function formatConditionValue(value: unknown): string {
    return Array.isArray(value) ? stringifyJson(value) : String(value ?? '');
}

export function buildInitialOperatorArgs(
    fields: readonly OperatorSchemaField[] | undefined,
): Record<string, unknown> {
    const args: Record<string, unknown> = {};
    for (const field of fields ?? []) {
        if (field.defaultValue !== undefined) {
            args[field.key] = cloneEditorValue(field.defaultValue);
        } else if (field.required) {
            args[field.key] = '';
        }
    }
    return args;
}
