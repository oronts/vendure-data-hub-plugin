import { ParseResult, ParseError, JsonParseOptions } from '../types';
import { CODE_SECURITY } from '../../constants';
import { extractFields } from '../helpers/field-extraction';
import { getErrorMessage } from '../../utils/error.utils';

const MAX_PATH_LENGTH = CODE_SECURITY.MAX_CONDITION_LENGTH;
const MAX_PATH_DEPTH = 50;
const MAX_FLATTEN_DEPTH = 50;
const JSONLINES_SAMPLE_LINES = 3;

/** `navigatePath(data, 'items.0.name')` - Dot-notation with array index support */
export function navigatePath(data: unknown, path: string): unknown {
    if (!path || !data || typeof data !== 'object') {
        return data;
    }

    // Validate path length to prevent performance issues
    if (path.length > MAX_PATH_LENGTH) {
        return undefined;
    }

    const parts = path.split('.');

    // Validate path depth
    if (parts.length > MAX_PATH_DEPTH) {
        return undefined;
    }

    let current: unknown = data;

    for (const part of parts) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }

        // Handle array index notation like "items[0]"
        // Using a simple check instead of regex for better performance
        const bracketIdx = part.indexOf('[');
        if (bracketIdx > 0 && part.endsWith(']')) {
            const key = part.slice(0, bracketIdx);
            const indexStr = part.slice(bracketIdx + 1, -1);
            const index = parseInt(indexStr, 10);

            if (isNaN(index) || index < 0) {
                return undefined;
            }

            const obj = current as Record<string, unknown>;
            const arr = obj[key];
            if (Array.isArray(arr)) {
                current = arr[index];
            } else {
                return undefined;
            }
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }

    return current;
}

/** `flattenObject({a: {b: 1}})` -> `{'a.b': 1}` */
export function flattenObject(
    obj: Record<string, unknown>,
    prefix: string = '',
    delimiter: string = '.',
    depth: number = 0,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}${delimiter}${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            if (depth >= MAX_FLATTEN_DEPTH) {
                // Stop recursion at max depth - store the nested object as-is
                result[newKey] = value;
            } else {
                Object.assign(result, flattenObject(value as Record<string, unknown>, newKey, delimiter, depth + 1));
            }
        } else {
            result[newKey] = value;
        }
    }

    return result;
}

export function parseJson(
    content: string,
    options: JsonParseOptions = {},
): ParseResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
        let data = JSON.parse(content);

        // Navigate to data path if specified
        if (options.path) {
            const navigated = navigatePath(data, options.path);

            if (navigated === undefined) {
                return {
                    success: false,
                    format: 'JSON' as const,
                    records: [],
                    fields: [],
                    totalRows: 0,
                    errors: [{ message: `Path "${options.path}" not found in JSON` }],
                    warnings: [],
                };
            }

            data = navigated;
        }

        // Ensure data is an array
        if (!Array.isArray(data)) {
            if (typeof data === 'object' && data !== null) {
                data = [data];
                warnings.push('JSON root is an object, wrapped in array');
            } else {
                return {
                    success: false,
                    format: 'JSON' as const,
                    records: [],
                    fields: [],
                    totalRows: 0,
                    errors: [{ message: 'JSON must be an array of objects or a single object' }],
                    warnings: [],
                };
            }
        }

        // Validate records are objects
        const validRecords: Record<string, unknown>[] = [];
        let invalidCount = 0;

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                validRecords.push(item as Record<string, unknown>);
            } else {
                invalidCount++;
                if (invalidCount <= 3) {
                    errors.push({
                        row: i + 1,
                        message: `Item is not an object: ${typeof item}`,
                    });
                }
            }
        }

        if (invalidCount > 3) {
            warnings.push(`${invalidCount - 3} more items were not valid objects`);
        }

        const fields = extractFields(validRecords);

        return {
            success: errors.length === 0,
            format: 'JSON' as const,
            records: validRecords,
            fields,
            totalRows: validRecords.length,
            errors,
            warnings,
        };
    } catch (err) {
        // Try to provide helpful error context
        const error = err as SyntaxError;
        let message = error.message || 'Failed to parse JSON';

        // Add position info if available
        if (error.message.includes('position')) {
            const posMatch = error.message.match(/position (\d+)/);
            if (posMatch) {
                const pos = parseInt(posMatch[1], 10);
                const context = content.slice(Math.max(0, pos - 20), pos + 20);
                message += ` near: "...${context}..."`;
            }
        }

        return {
            success: false,
            format: 'JSON' as const,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [{ message }],
            warnings: [],
        };
    }
}

/** Parse NDJSON - each line is a separate JSON object */
export function parseJsonLines(content: string): ParseResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];
    const records: Record<string, unknown>[] = [];

    const lines = content.split('\n').filter(line => line.trim());

    for (let i = 0; i < lines.length; i++) {
        try {
            const parsed = JSON.parse(lines[i]);
            if (typeof parsed === 'object' && parsed !== null) {
                records.push(parsed as Record<string, unknown>);
            } else {
                errors.push({
                    row: i + 1,
                    message: 'Line is not a JSON object',
                });
            }
        } catch (err) {
            errors.push({
                row: i + 1,
                message: getErrorMessage(err),
            });
        }
    }

    const fields = extractFields(records);

    return {
        success: errors.length === 0,
        format: 'JSON' as const,
        records,
        fields,
        totalRows: records.length,
        errors,
        warnings,
    };
}

export function isJsonLines(content: string): boolean {
    const lines = content.trim().split('\n').slice(0, JSONLINES_SAMPLE_LINES);

    if (lines.length <= 1) {
        return false;
    }

    // Each line should be a valid JSON object
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                return false;
            }
        } catch {
            // JSON parse failed - not valid NDJSON line
            return false;
        }
    }

    return true;
}

export function generateJson(
    records: Record<string, unknown>[],
    options: { pretty?: boolean; indent?: number } = {},
): string {
    const indent = options.pretty ? (options.indent ?? 2) : undefined;
    return JSON.stringify(records, null, indent);
}

export function generateJsonLines(records: Record<string, unknown>[]): string {
    return records.map(r => JSON.stringify(r)).join('\n');
}

