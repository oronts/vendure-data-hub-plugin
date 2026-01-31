import type { JsonObject } from '../../shared/types';

export function parseCSVLine(line: string, delimiter = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
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

export function parseCSV(content: string, options: {
    delimiter?: string;
    hasHeaders?: boolean;
    trimValues?: boolean;
} = {}): JsonObject[] {
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
    const rows: JsonObject[] = [];

    for (const line of dataLines) {
        const values = parseCSVLine(line, delimiter);
        const row: JsonObject = {};

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
