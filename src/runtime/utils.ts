import * as fs from 'fs';
import * as path from 'path';
import { JsonObject, JsonValue } from '../types/index';
import { RecordObject } from './executor-types';
import { UNIT_CONVERSIONS } from '../constants/units';
import { VALIDATION_PATTERNS } from '../constants/validation';
import { slugify } from '../operators/helpers';
import { evaluateCondition } from '../operators/logic/helpers';
import { ComparisonOperator } from '../../shared/types';
import { getErrorMessage } from '../utils/error.utils';
import { validateRegexSafety } from '../utils/safe-regex.utils';
import { getPath as getPathValue } from './path.utils';
import {
    setNestedValue,
    removeNestedValue,
    deepClone as deepCloneUtil,
} from '../utils/object-path.utils';
import { parseCsvLine } from '../parsers/formats/csv.parser';
import { escapeXml } from '../parsers/formats/xml.parser';

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
 * Splits a single CSV line into an array of values, respecting quoted fields.
 * Delegates to the canonical parseCsvLine from parsers/formats/csv.parser.ts.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
    return parseCsvLine(line, delimiter);
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
 * Convenience alias for {@link setNestedValue} from object-path.utils.
 * Kept to avoid renaming 79+ call sites across executors/strategies.
 */
export function setPath(obj: JsonObject, pathStr: string, value: JsonValue): void {
    setNestedValue(obj, pathStr, value);
}

/**
 * Convenience alias for {@link removeNestedValue} from object-path.utils.
 * Kept to avoid renaming call sites across executors/strategies.
 */
export function removePath(obj: JsonObject, pathStr: string): void {
    removeNestedValue(obj, pathStr);
}

/**
 * Convenience alias for {@link getNestedValue} from object-path.utils.
 * Kept to avoid renaming 79+ call sites across executors/strategies.
 */
export function getPath(obj: JsonObject, pathStr: string): JsonValue {
    return getPathValue(obj, pathStr);
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
    error?: string;
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
        const firstFieldError = errors.length;
        const value = getPath(rec, key);
        if (spec.required && (value === undefined || value === null || value === '')) {
            errors.push(spec.error || `${key} is required`);
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
                const safetyCheck = validateRegexSafety(spec.pattern);
                if (!safetyCheck.safe) {
                    errors.push(`${key} has unsafe regex pattern: ${safetyCheck.reason}`);
                } else {
                    try {
                        const re = new RegExp(spec.pattern);
                        if (!re.test(value)) errors.push(`${key} does not match pattern`);
                    } catch (error) {
                        errors.push(`${key} has invalid regex pattern: ${getErrorMessage(error)}`);
                    }
                }
            }
        }
        if (spec.error && errors.length > firstFieldError) {
            errors.splice(firstFieldError, errors.length - firstFieldError, spec.error);
        }
    }
    return errors;
}

export { chunk } from '../utils/array.utils';
export { sleep } from '../utils/retry.utils';

/** Re-exported from object-path.utils for runtime module convenience */
export { deepCloneUtil as deepClone };

/**
 * Escapes a value for CSV output
 */
export function csvEscape(val: string, delimiter: string, forceQuote = false): string {
    if (forceQuote || val.includes(delimiter) || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

/**
 * Escapes a value for XML output.
 * Re-exported from parsers/formats/xml.parser.ts (canonical implementation).
 */
export const xmlEscape = escapeXml;

/**
 * Converts an array of records to CSV format
 */
export type CsvFormulaMode = 'SPREADSHEET_SAFE' | 'PRESERVE';

const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r\n＝＋－＠]/;

function serializeCsvCell(value: string, delimiter: string, formulaMode: CsvFormulaMode): string {
    if (formulaMode === 'SPREADSHEET_SAFE' && CSV_FORMULA_PREFIX_PATTERN.test(value)) {
        return csvEscape(`\t${value}`, delimiter, true);
    }
    return csvEscape(value, delimiter);
}

export function recordsToCsv(
    records: RecordObject[],
    delimiter: string,
    includeHeader: boolean,
    formulaMode: CsvFormulaMode = 'PRESERVE',
): string {
    if (records.length === 0) return '';
    const keys = Object.keys(records[0]);
    const lines: string[] = [];
    if (includeHeader) {
        lines.push(keys.map(k => serializeCsvCell(k, delimiter, formulaMode)).join(delimiter));
    }
    for (const rec of records) {
        const vals = keys.map(k => {
            const v = rec[k];
            if (v === null || v === undefined) return serializeCsvCell('', delimiter, formulaMode);
            if (typeof v === 'object') return serializeCsvCell(JSON.stringify(v), delimiter, formulaMode);
            return serializeCsvCell(String(v), delimiter, formulaMode);
        });
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

export function assertXmlElementName(value: string, optionName: string): string {
    if (!VALIDATION_PATTERNS.XML_ELEMENT_NAME.test(value)) {
        throw new Error(`${optionName} must be a valid XML element name`);
    }
    return value;
}

/**
 * Converts an array of records to XML format
 */
export function recordsToXml(
    records: JsonObject[],
    rootElement: string,
    itemElement: string,
    declaration: boolean = true,
): string {
    const safeRootElement = assertXmlElementName(rootElement, 'rootElement');
    const safeItemElement = assertXmlElementName(itemElement, 'itemElement');
    let xml = declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
    xml += `<${safeRootElement}>\n`;
    for (const rec of records) {
        xml += `  <${safeItemElement}>\n`;
        for (const [k, v] of Object.entries(rec)) {
            const tag = toXmlElementName(k);
            const textValue = (v != null && typeof v === 'object') ? JSON.stringify(v) : String(v ?? '');
            xml += `    <${tag}>${xmlEscape(textValue)}</${tag}>\n`;
        }
        xml += `  </${safeItemElement}>\n`;
    }
    xml += `</${safeRootElement}>`;
    return xml;
}
