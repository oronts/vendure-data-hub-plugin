import type { JsonValue } from '../../shared/types';

export type FileType = 'CSV' | 'JSON' | 'XLSX' | 'XML' | 'NDJSON' | null;

export interface ParsedColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
    sampleValues: JsonValue[];
    nullCount: number;
    uniqueCount: number;
}
