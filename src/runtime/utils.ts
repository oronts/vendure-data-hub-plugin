import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { JsonObject, JsonValue } from '../types/index';
import { RecordObject } from './executor-types';
import { UNIT_CONVERSIONS, TRANSFORM_LIMITS } from '../constants/index';

/**
 * Ensures the directory for the given file path exists.
 * Creates it recursively if needed.
 */
export function ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Converts an input string to a URL-friendly slug
 */
export function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

/**
 * Parses CSV text into an array of record objects
 */
export function parseCsv(text: string, delimiter = ',', hasHeader = true): RecordObject[] {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return [] as any;
    const rows = lines.map(l => splitCsvLine(l, delimiter));
    if (!hasHeader) {
        return rows.map(r => ({ row: r })) as any;
    }
    const header = rows[0];
    return rows.slice(1).map(r => arrayToObject(header, r)) as any;
}

/**
 * Splits a single CSV line into an array of values, respecting quoted fields
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

/**
 * Converts parallel arrays of keys and values into an object
 */
export function arrayToObject(keys: string[], values: any[]): Record<string, any> {
    const o: Record<string, any> = {};
    for (let i = 0; i < keys.length; i++) {
        o[keys[i]] = values[i];
    }
    return o;
}

/**
 * Converts a value to string or returns undefined if empty
 */
export function strOrUndefined(v: any): string | undefined {
    if (v == null) return undefined;
    const s = String(v);
    return s.length ? s : undefined;
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
export function safeJson(v: any): any {
    if (v == null) return undefined;
    try {
        if (typeof v === 'string') return JSON.parse(v);
        return v;
    } catch {
        return undefined;
    }
}

/**
 * Evaluates a condition against a record
 */
export function evalCondition(rec: any, cond: { field: string; cmp: string; value: any }): boolean {
    const { field, cmp, value } = cond || ({} as any);
    const cur = getPath(rec, field);
    switch (cmp) {
        case 'eq': return cur === value;
        case 'ne': return cur !== value;
        case 'gt': return Number(cur) > Number(value);
        case 'lt': return Number(cur) < Number(value);
        case 'in': return Array.isArray(value) ? value.includes(cur) : false;
        case 'contains': return typeof cur === 'string' && String(cur).includes(String(value));
        default: return false;
    }
}

/**
 * Picks specific paths from an object for hashing, or excludes specific paths
 */
export function pickForHash(obj: any, includePaths: string[], excludePaths: string[]): any {
    try {
        if (includePaths && includePaths.length) {
            const out: any = {};
            for (const p of includePaths) {
                setPath(out, p, getPath(obj, p));
            }
            return out;
        }
        if (excludePaths && excludePaths.length) {
            const clone = deepClone(obj);
            for (const p of excludePaths) removePath(clone, p);
            return clone;
        }
        return obj;
    } catch { return obj; }
}

/**
 * Sets a value at a dot-notation path in an object
 */
export function setPath(obj: any, path: string, value: any): void {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
        cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
}

/**
 * Removes a value at a dot-notation path from an object
 */
export function removePath(obj: any, path: string): void {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (cur == null) return; cur = cur[parts[i]]; }
    if (cur) delete cur[parts[parts.length - 1]];
}

/**
 * Creates a stable SHA1 hash of an object
 */
export function hashStable(value: any): string {
    const json = stableStringify(value);
    return crypto.createHash('sha1').update(json).digest('hex');
}

/**
 * Creates a stable JSON string representation of a value
 */
export function stableStringify(value: any): string {
    if (value == null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(v => stableStringify(v)).join(',')}]`;
    const keys = Object.keys(value).sort();
    const entries = keys.map(k => `"${k}":${stableStringify(value[k])}`);
    return `{${entries.join(',')}}`;
}

/**
 * Gets a value at a dot-notation path from an object
 */
export function getPath(obj: any, path: string): any {
    const parts = String(path ?? '').split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

/**
 * Validates a record against a simple field specification
 */
export function validateAgainstSimpleSpec(
    rec: any,
    fields: Record<string, { required?: boolean; type?: string; enum?: any[]; min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string }>,
): string[] {
    const errors: string[] = [];
    for (const [key, spec] of Object.entries(fields)) {
        const v = getPath(rec, key);
        if (spec.required && (v === undefined || v === null || v === '')) {
            errors.push(`${key} is required`);
            continue;
        }
        if (v != null && spec.type) {
            const t = typeof v;
            if (spec.type === 'number' && t !== 'number') errors.push(`${key} must be number`);
            if (spec.type === 'string' && t !== 'string') errors.push(`${key} must be string`);
            if (spec.type === 'boolean' && t !== 'boolean') errors.push(`${key} must be boolean`);
        }
        if (v != null && Array.isArray(spec.enum) && spec.enum.length > 0) {
            if (!spec.enum.includes(v)) errors.push(`${key} must be one of [${spec.enum.join(', ')}]`);
        }
        if (v != null && typeof v === 'number') {
            if (typeof spec.min === 'number' && v < spec.min) errors.push(`${key} must be >= ${spec.min}`);
            if (typeof spec.max === 'number' && v > spec.max) errors.push(`${key} must be <= ${spec.max}`);
        }
        if (v != null && typeof v === 'string') {
            if (typeof spec.minLength === 'number' && v.length < spec.minLength) errors.push(`${key} length must be >= ${spec.minLength}`);
            if (typeof spec.maxLength === 'number' && v.length > spec.maxLength) errors.push(`${key} length must be <= ${spec.maxLength}`);
            if (spec.pattern) {
                try {
                    const re = new RegExp(spec.pattern);
                    if (!re.test(v)) errors.push(`${key} does not match pattern`);
                } catch {}
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

/**
 * Returns a promise that resolves after the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a deep clone of an object using JSON serialization.
 * Handles most common data types but does NOT preserve:
 * - Functions
 * - Symbols
 * - undefined values (converted to null)
 * - Date objects (converted to ISO strings)
 * - Map/Set (converted to arrays/objects)
 * - Circular references (will throw)
 *
 * For simple data records (which is the primary use case in pipelines),
 * this is efficient and safe.
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj !== 'object') {
        return obj;
    }
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch {
        return obj;
    }
}

/**
 * Escapes a value for CSV output
 */
export function csvEscape(val: string, delimiter: string): string {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

/**
 * Escapes a value for XML output
 */
export function xmlEscape(val: string): string {
    return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        const vals = keys.map(k => csvEscape(String((rec as any)[k] ?? ''), delimiter));
        lines.push(vals.join(delimiter));
    }
    return lines.join('\n');
}

/**
 * Converts an array of records to XML format
 */
export function recordsToXml(records: any[], rootElement: string, itemElement: string): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootElement}>\n`;
    for (const rec of records) {
        xml += `  <${itemElement}>\n`;
        for (const [k, v] of Object.entries(rec)) {
            xml += `    <${k}>${xmlEscape(String(v ?? ''))}</${k}>\n`;
        }
        xml += `  </${itemElement}>\n`;
    }
    xml += `</${rootElement}>`;
    return xml;
}
