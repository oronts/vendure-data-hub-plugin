import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { JsonObject, JsonValue } from '../types/index';
import { RecordObject } from './executor-types';
import { UNIT_CONVERSIONS } from '../constants/index';
import { slugify } from '../operators/helpers';
import { evaluateCondition } from '../operators/logic/helpers';
import { ComparisonOperator } from '../../shared/types';
import { getErrorMessage } from '../utils/error.utils';
import {
    getNestedValue,
    setNestedValue,
    removeNestedValue,
    deepClone as deepCloneUtil,
} from '../utils/object-path.utils';

export function ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/** Async version of ensureDirectoryExists */
export async function ensureDirectoryExistsAsync(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
}

export { slugify };

/**
 * Parses CSV text into an array of record objects
 */
export function parseCsv(text: string, delimiter = ',', hasHeader = true): RecordObject[] {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return [];
    const rows = lines.map(l => splitCsvLine(l, delimiter));
    if (!hasHeader) {
        return rows.map(r => ({ row: r as JsonValue }));
    }
    const header = rows[0];
    return rows.slice(1).map(r => arrayToObject(header, r));
}

/**
 * Splits a single CSV line into an array of values, respecting quoted fields
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
    const out: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                currentValue += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            out.push(currentValue);
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    out.push(currentValue);
    return out.map(s => s.trim());
}

/**
 * Converts parallel arrays of keys and values into an object
 */
export function arrayToObject(keys: string[], values: JsonValue[]): JsonObject {
    const result: JsonObject = {};
    for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = values[i];
    }
    return result;
}

/**
 * Converts a value to string or returns undefined if empty
 */
export function toStringOrUndefined(v: unknown): string | undefined {
    if (v == null) return undefined;
    const str = String(v);
    return str.length ? str : undefined;
}

/**
 * Returns a conversion factor between two units of measurement
 * Uses the UNIT_CONVERSIONS constant from constants/units.ts
 */
export function unitFactor(from: string, to: string): number {
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    const conversions = UNIT_CONVERSIONS[fromLower];
    if (!conversions) return 1;

    const factor = conversions[toLower];
    if (factor === undefined) return 1;

    return factor;
}

/**
 * Safely parses a JSON value
 */
export function safeJson(v: unknown): JsonValue | undefined {
    if (v == null) return undefined;
    try {
        if (typeof v === 'string') return JSON.parse(v) as JsonValue;
        return v as JsonValue;
    } catch {
        // JSON parse failed - return undefined as fallback
        return undefined;
    }
}

/** Condition specification for evalCondition */
export interface EvalConditionSpec {
    field: string;
    cmp: string;
    value: JsonValue;
}

/**
 * Evaluates a condition against a record.
 *
 * Delegates to {@link evaluateCondition} from operators/logic/helpers.ts which
 * supports the full set of 14+ comparison operators (eq, ne, gt, lt, gte, lte,
 * in, notIn, contains, notContains, startsWith, endsWith, regex, exists, isNull).
 */
export function evalCondition(rec: JsonObject, cond: EvalConditionSpec | null | undefined): boolean {
    if (!cond || !cond.field) return false;
    return evaluateCondition(rec, { field: cond.field, cmp: cond.cmp as ComparisonOperator, value: cond.value });
}

/**
 * Picks specific paths from an object for hashing, or excludes specific paths
 */
export function pickForHash(obj: JsonObject, includePaths: string[], excludePaths: string[]): JsonObject {
    try {
        if (includePaths && includePaths.length) {
            const out: JsonObject = {};
            for (const p of includePaths) {
                setPath(out, p, getPath(obj, p));
            }
            return out;
        }
        if (excludePaths && excludePaths.length) {
            const clone = deepCloneUtil(obj);
            for (const p of excludePaths) removePath(clone, p);
            return clone;
        }
        return obj;
    } catch {
        // Path manipulation failed - return original object
        return obj;
    }
}

/**
 * Sets a value at a dot-notation path in an object.
 * Uses the canonical implementation from object-path.utils.
 */
export function setPath(obj: JsonObject, pathStr: string, value: JsonValue): void {
    setNestedValue(obj, pathStr, value);
}

/**
 * Removes a value at a dot-notation path from an object.
 * Uses the canonical implementation from object-path.utils.
 */
export function removePath(obj: JsonObject, pathStr: string): void {
    removeNestedValue(obj, pathStr);
}

/**
 * Creates a stable SHA1 hash of an object
 */
export function hashStable(value: JsonValue): string {
    const json = stableStringify(value);
    return crypto.createHash('sha1').update(json).digest('hex');
}

/**
 * Creates a stable JSON string representation of a value
 */
export function stableStringify(value: JsonValue): string {
    if (value == null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(v => stableStringify(v)).join(',')}]`;
    const keys = Object.keys(value).sort();
    const entries = keys.map(k => `"${k}":${stableStringify((value as JsonObject)[k])}`);
    return `{${entries.join(',')}}`;
}

/**
 * Gets a value at a dot-notation path from an object.
 * Uses the canonical implementation from object-path.utils.
 */
export function getPath(obj: JsonObject, pathStr: string): JsonValue {
    return getNestedValue(obj, pathStr ?? '') as JsonValue;
}

/** Field specification for validateAgainstSimpleSpec */
export interface FieldSpec {
    required?: boolean;
    type?: string;
    enum?: JsonValue[];
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}

/**
 * Validates a record against a simple field specification
 */
export function validateAgainstSimpleSpec(
    rec: JsonObject,
    fields: Record<string, FieldSpec>,
): string[] {
    const errors: string[] = [];
    for (const [key, spec] of Object.entries(fields)) {
        const value = getPath(rec, key);
        if (spec.required && (value === undefined || value === null || value === '')) {
            errors.push(`${key} is required`);
            continue;
        }
        if (value != null && spec.type) {
            const valueType = typeof value;
            if (spec.type === 'number' && valueType !== 'number') errors.push(`${key} must be number`);
            if (spec.type === 'string' && valueType !== 'string') errors.push(`${key} must be string`);
            if (spec.type === 'boolean' && valueType !== 'boolean') errors.push(`${key} must be boolean`);
        }
        if (value != null && Array.isArray(spec.enum) && spec.enum.length > 0) {
            if (!spec.enum.includes(value)) errors.push(`${key} must be one of [${spec.enum.join(', ')}]`);
        }
        if (value != null && typeof value === 'number') {
            if (typeof spec.min === 'number' && value < spec.min) errors.push(`${key} must be >= ${spec.min}`);
            if (typeof spec.max === 'number' && value > spec.max) errors.push(`${key} must be <= ${spec.max}`);
        }
        if (value != null && typeof value === 'string') {
            if (typeof spec.minLength === 'number' && value.length < spec.minLength) errors.push(`${key} length must be >= ${spec.minLength}`);
            if (typeof spec.maxLength === 'number' && value.length > spec.maxLength) errors.push(`${key} length must be <= ${spec.maxLength}`);
            if (spec.pattern) {
                try {
                    const re = new RegExp(spec.pattern);
                    if (!re.test(value)) errors.push(`${key} does not match pattern`);
                } catch (error) {
                    errors.push(`${key} has invalid regex pattern: ${getErrorMessage(error)}`);
                }
            }
        }
    }
    return errors;
}

/**
 * Splits an array into chunks of a given size
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

export { sleep } from '../utils/retry.utils';

export { deepCloneUtil as deepClone };

/**
 * Escapes a value for CSV output
 */
export function csvEscape(val: string, delimiter: string): string {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

/**
 * Escapes a value for XML output
 */
export function xmlEscape(val: string): string {
    return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Converts an array of records to CSV format
 */
export function recordsToCsv(records: RecordObject[], delimiter: string, includeHeader: boolean): string {
    if (records.length === 0) return '';
    const keys = Object.keys(records[0]);
    const lines: string[] = [];
    if (includeHeader) {
        lines.push(keys.map(k => csvEscape(k, delimiter)).join(delimiter));
    }
    for (const rec of records) {
        const vals = keys.map(k => csvEscape(String(rec[k] ?? ''), delimiter));
        lines.push(vals.join(delimiter));
    }
    return lines.join('\n');
}

/**
 * Sanitizes a string to be a valid XML element name.
 */
function toXmlElementName(key: string): string {
    let name = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (/^[^a-zA-Z_]/.test(name)) {
        name = '_' + name;
    }
    return name || '_field';
}

/**
 * Converts an array of records to XML format
 */
export function recordsToXml(records: JsonObject[], rootElement: string, itemElement: string): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${toXmlElementName(rootElement)}>\n`;
    for (const rec of records) {
        xml += `  <${toXmlElementName(itemElement)}>\n`;
        for (const [k, v] of Object.entries(rec)) {
            const tag = toXmlElementName(k);
            xml += `    <${tag}>${xmlEscape(String(v ?? ''))}</${tag}>\n`;
        }
        xml += `  </${toXmlElementName(itemElement)}>\n`;
    }
    xml += `</${toXmlElementName(rootElement)}>`;
    return xml;
}
