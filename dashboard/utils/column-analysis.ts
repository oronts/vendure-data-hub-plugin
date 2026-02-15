import type { JsonValue, JsonObject } from '../../shared/types';
import { FILE_FORMAT } from '../constants/wizard-options';
import { UI_LIMITS } from '../constants/ui-config';

export type FileType = 'CSV' | 'JSON' | 'XLSX' | 'XML' | null;

export interface ParsedColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
    sampleValues: JsonValue[];
    nullCount: number;
    uniqueCount: number;
}

function detectColumnType(values: JsonValue[]): ParsedColumn['type'] {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNullValues.length === 0) return 'unknown';

    let numberCount = 0;
    let booleanCount = 0;
    let dateCount = 0;

    for (const val of nonNullValues) {
        const str = String(val).trim().toLowerCase();

        if (['true', 'false', '1', '0', 'yes', 'no'].includes(str)) {
            booleanCount++;
            continue;
        }

        if (!isNaN(Number(val)) && str !== '') {
            numberCount++;
            continue;
        }

        const date = new Date(val as string | number);
        if (!isNaN(date.getTime()) && str.length > 4) {
            dateCount++;
        }
    }

    const total = nonNullValues.length;
    if (numberCount / total > 0.8) return 'number';
    if (booleanCount / total > 0.8) return 'boolean';
    if (dateCount / total > 0.8) return 'date';
    return 'string';
}

export function analyzeColumns(data: JsonObject[]): ParsedColumn[] {
    if (data.length === 0) return [];

    const columns: ParsedColumn[] = [];
    const firstRow = data[0];

    for (const key of Object.keys(firstRow)) {
        const values = data.map(row => row[key] as JsonValue);
        const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
        const uniqueValues = new Set(nonNullValues.map(v => JSON.stringify(v)));

        columns.push({
            name: key,
            type: detectColumnType(values),
            sampleValues: nonNullValues.slice(0, UI_LIMITS.COLUMN_SAMPLE_VALUES),
            nullCount: values.length - nonNullValues.length,
            uniqueCount: uniqueValues.size,
        });
    }

    return columns;
}

export function getFileType(fileName: string): FileType {
    const ext = fileName.toLowerCase().split('.').pop()?.toUpperCase();
    if (ext === FILE_FORMAT.CSV) return FILE_FORMAT.CSV;
    if (ext === FILE_FORMAT.XLSX || ext === 'XLS') return FILE_FORMAT.XLSX;
    if (ext === FILE_FORMAT.JSON) return FILE_FORMAT.JSON;
    if (ext === FILE_FORMAT.XML) return FILE_FORMAT.XML;
    return null;
}
