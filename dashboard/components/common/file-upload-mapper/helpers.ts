import type { ParsedColumn, SchemaField, FieldMapping } from './types';

// =============================================================================
// CSV PARSER (Browser-based)
// =============================================================================

export function parseCSV(content: string, delimiter = ','): Record<string, any>[] {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0], delimiter);
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter);
        const row: Record<string, any> = {};
        headers.forEach((header, idx) => {
            row[header.trim()] = values[idx]?.trim() ?? '';
        });
        rows.push(row);
    }

    return rows;
}

export function parseCSVLine(line: string, delimiter: string): string[] {
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
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// =============================================================================
// TYPE DETECTION
// =============================================================================

export function detectColumnType(values: any[]): ParsedColumn['type'] {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNullValues.length === 0) return 'unknown';

    let numCount = 0;
    let boolCount = 0;
    let dateCount = 0;

    for (const val of nonNullValues) {
        const str = String(val).trim().toLowerCase();

        // Boolean check
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(str)) {
            boolCount++;
            continue;
        }

        // Number check
        if (!isNaN(Number(val)) && str !== '') {
            numCount++;
            continue;
        }

        // Date check
        const date = new Date(val);
        if (!isNaN(date.getTime()) && str.length > 4) {
            dateCount++;
        }
    }

    const total = nonNullValues.length;
    if (numCount / total > 0.8) return 'number';
    if (boolCount / total > 0.8) return 'boolean';
    if (dateCount / total > 0.8) return 'date';
    return 'string';
}

export function analyzeColumns(data: Record<string, any>[]): ParsedColumn[] {
    if (data.length === 0) return [];

    const columns: ParsedColumn[] = [];
    const firstRow = data[0];

    for (const key of Object.keys(firstRow)) {
        const values = data.map(row => row[key]);
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
        const uniqueValues = new Set(nonNullValues);

        columns.push({
            name: key,
            type: detectColumnType(values),
            sampleValues: nonNullValues.slice(0, 5),
            nullCount: values.length - nonNullValues.length,
            uniqueCount: uniqueValues.size,
        });
    }

    return columns;
}

// =============================================================================
// AUTO MAPPING
// =============================================================================

export function autoMap(sourceColumns: ParsedColumn[], targetSchema: SchemaField[]): FieldMapping[] {
    const mappings: FieldMapping[] = [];

    for (const target of targetSchema) {
        // Try exact match first
        const exactMatch = sourceColumns.find(
            s => s.name.toLowerCase() === target.name.toLowerCase()
        );
        if (exactMatch) {
            mappings.push({ sourceField: exactMatch.name, targetField: target.name });
            continue;
        }

        // Try fuzzy match (contains, common variations)
        const fuzzyMatch = sourceColumns.find(s => {
            const src = s.name.toLowerCase().replace(/[_\-\s]/g, '');
            const tgt = target.name.toLowerCase().replace(/[_\-\s]/g, '');
            return src.includes(tgt) || tgt.includes(src);
        });
        if (fuzzyMatch && !mappings.some(m => m.sourceField === fuzzyMatch.name)) {
            mappings.push({ sourceField: fuzzyMatch.name, targetField: target.name });
            continue;
        }

        // Add required fields as unmapped
        if (target.required) {
            mappings.push({ sourceField: '', targetField: target.name });
        }
    }

    return mappings;
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

export function formatCellValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    const str = String(value);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
}

export function getFileType(fileName: string): 'csv' | 'excel' | 'json' | null {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    if (ext === 'json') return 'json';
    return null;
}
