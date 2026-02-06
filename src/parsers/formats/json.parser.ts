/**
 * DataHub Parsers - JSON Parser
 *
 * Parses JSON files with support for nested paths, array extraction,
 * and streaming large files.
 */

import { ParseResult, ParseError, JsonParseOptions } from '../types';
import { FileFormat } from '../../constants/enums';
import { CODE_SECURITY } from '../../constants';
import { extractFields } from '../helpers/field-extraction';

/**
 * Maximum path length to prevent performance issues
 */
const MAX_PATH_LENGTH = CODE_SECURITY.MAX_CONDITION_LENGTH;

/**
 * Maximum path depth to prevent stack issues
 */
const MAX_PATH_DEPTH = 50;

/**
 * Navigate to a nested path in an object
 *
 * @param data - Object to navigate
 * @param path - Dot-notation path (e.g., "data.items")
 * @returns Value at path or undefined
 */
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

export { extractFields } from '../helpers/field-extraction';

/**
 * Flatten a nested object into a single-level object
 *
 * @param obj - Object to flatten
 * @param prefix - Key prefix for nested properties
 * @param delimiter - Delimiter between nested keys (default: ".")
 * @returns Flattened object
 */
export function flattenObject(
    obj: Record<string, unknown>,
    prefix: string = '',
    delimiter: string = '.',
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}${delimiter}${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenObject(value as Record<string, unknown>, newKey, delimiter));
        } else {
            result[newKey] = value;
        }
    }

    return result;
}

/**
 * Parse JSON content
 *
 * @param content - JSON content as string
 * @param options - JSON parse options
 * @returns Parse result with records
 */
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
                    format: FileFormat.JSON,
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
                    format: FileFormat.JSON,
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
            format: FileFormat.JSON,
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
            format: FileFormat.JSON,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [{ message }],
            warnings: [],
        };
    }
}

/**
 * Parse JSON Lines (NDJSON) format
 * Each line is a separate JSON object
 *
 * @param content - NDJSON content
 * @returns Parse result with records
 */
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
                message: err instanceof Error ? err.message : 'Invalid JSON',
            });
        }
    }

    const fields = extractFields(records);

    return {
        success: errors.length === 0,
        format: FileFormat.JSON,
        records,
        fields,
        totalRows: records.length,
        errors,
        warnings,
    };
}

/**
 * Detect if content is JSON Lines format
 *
 * @param content - Content to check
 * @returns True if content appears to be JSON Lines
 */
export function isJsonLines(content: string): boolean {
    const lines = content.trim().split('\n').slice(0, 3);

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

/**
 * Generate JSON string from records
 *
 * @param records - Records to convert
 * @param options - Generation options
 * @returns JSON string
 */
export function generateJson(
    records: Record<string, unknown>[],
    options: { pretty?: boolean; indent?: number } = {},
): string {
    const indent = options.pretty ? (options.indent ?? 2) : undefined;
    return JSON.stringify(records, null, indent);
}

/**
 * Generate JSON Lines string from records
 *
 * @param records - Records to convert
 * @returns NDJSON string
 */
export function generateJsonLines(records: Record<string, unknown>[]): string {
    return records.map(r => JSON.stringify(r)).join('\n');
}

export { getNestedValue } from '../../utils/object-path.utils';

/**
 * Set nested property using dot notation
 *
 * @param obj - Object to modify
 * @param path - Dot-notation path
 * @param value - Value to set
 */
export function setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
}
