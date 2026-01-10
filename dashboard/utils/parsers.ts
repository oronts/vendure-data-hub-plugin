/**
 * Parsers Utility
 * Functions for parsing CSV, JSON, and other data formats
 */

// =============================================================================
// CSV PARSING
// =============================================================================

/**
 * Parse a single CSV line respecting quoted values
 */
export function parseCSVLine(line: string, delimiter = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Parse CSV content to an array of objects
 */
export function parseCSV(content: string, options: {
    delimiter?: string;
    hasHeaders?: boolean;
    trimValues?: boolean;
} = {}): Record<string, any>[] {
    const {
        delimiter = ',',
        hasHeaders = true,
        trimValues = true,
    } = options;

    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = hasHeaders
        ? parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, ''))
        : parseCSVLine(lines[0], delimiter).map((_, i) => `column_${i + 1}`);

    const dataLines = hasHeaders ? lines.slice(1) : lines;
    const rows: Record<string, any>[] = [];

    for (const line of dataLines) {
        const values = parseCSVLine(line, delimiter);
        const row: Record<string, any> = {};

        headers.forEach((header, idx) => {
            let value = values[idx] ?? '';
            if (trimValues) {
                value = value.trim().replace(/^"|"$/g, '');
            }
            row[header] = value;
        });

        rows.push(row);
    }

    return rows;
}

/**
 * Convert an array of objects to CSV string
 */
export function toCSV(data: Record<string, any>[], options: {
    delimiter?: string;
    includeHeaders?: boolean;
    quoteAll?: boolean;
} = {}): string {
    const {
        delimiter = ',',
        includeHeaders = true,
        quoteAll = false,
    } = options;

    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const lines: string[] = [];

    const escapeValue = (value: any): string => {
        const str = value === null || value === undefined ? '' : String(value);
        const needsQuotes = quoteAll || str.includes(delimiter) || str.includes('"') || str.includes('\n');

        if (needsQuotes) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    if (includeHeaders) {
        lines.push(headers.map(escapeValue).join(delimiter));
    }

    for (const row of data) {
        const values = headers.map(h => escapeValue(row[h]));
        lines.push(values.join(delimiter));
    }

    return lines.join('\n');
}

// =============================================================================
// JSON PARSING
// =============================================================================

/**
 * Safely parse JSON with error handling
 */
export function safeParseJSON<T = any>(content: string, defaultValue?: T): T | undefined {
    try {
        return JSON.parse(content) as T;
    } catch {
        return defaultValue;
    }
}

/**
 * Parse JSON content to an array of objects
 * Handles both array and single object inputs
 */
export function parseJSON(content: string): Record<string, any>[] {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Pretty print JSON
 */
export function prettyJSON(data: any, indent = 2): string {
    return JSON.stringify(data, null, indent);
}

// =============================================================================
// NDJSON (Newline Delimited JSON) PARSING
// =============================================================================

/**
 * Parse NDJSON (newline-delimited JSON) content
 */
export function parseNDJSON(content: string): Record<string, any>[] {
    return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
}

/**
 * Convert an array of objects to NDJSON string
 */
export function toNDJSON(data: Record<string, any>[]): string {
    return data.map(item => JSON.stringify(item)).join('\n');
}

// =============================================================================
// XML PARSING (Basic)
// =============================================================================

/**
 * Simple XML to object parser using DOMParser
 */
export function parseXML(content: string): Record<string, any>[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Invalid XML: ' + parserError.textContent);
    }

    const root = doc.documentElement;
    const items: Record<string, any>[] = [];

    // Try to find repeated elements (common pattern: root > items)
    const children = Array.from(root.children);

    if (children.length === 0) {
        // Single item
        items.push(xmlElementToObject(root));
    } else {
        // Check if all children have the same tag name (array of items)
        const firstTagName = children[0].tagName;
        const allSameTag = children.every(child => child.tagName === firstTagName);

        if (allSameTag && children.length > 1) {
            // Array of items
            for (const child of children) {
                items.push(xmlElementToObject(child));
            }
        } else {
            // Single object with multiple properties
            items.push(xmlElementToObject(root));
        }
    }

    return items;
}

function xmlElementToObject(element: Element): Record<string, any> {
    const obj: Record<string, any> = {};

    // Handle attributes
    for (const attr of Array.from(element.attributes)) {
        obj[`@${attr.name}`] = attr.value;
    }

    // Handle children
    const children = Array.from(element.children);

    if (children.length === 0) {
        // Text content
        const text = element.textContent?.trim();
        if (text) {
            if (Object.keys(obj).length === 0) {
                return text as any;
            }
            obj['#text'] = text;
        }
    } else {
        // Process child elements
        for (const child of children) {
            const tagName = child.tagName;
            const childValue = xmlElementToObject(child);

            if (obj[tagName] !== undefined) {
                // Convert to array if duplicate keys
                if (!Array.isArray(obj[tagName])) {
                    obj[tagName] = [obj[tagName]];
                }
                obj[tagName].push(childValue);
            } else {
                obj[tagName] = childValue;
            }
        }
    }

    return obj;
}

// =============================================================================
// TYPE COERCION
// =============================================================================

/**
 * Try to coerce a string value to its appropriate type
 */
export function coerceValue(value: string): string | number | boolean | null {
    if (value === '' || value === 'null' || value === 'NULL') return null;

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') return num;

    return value;
}

/**
 * Coerce all values in an object
 */
export function coerceRecord(record: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
        result[key] = coerceValue(value);
    }
    return result;
}
