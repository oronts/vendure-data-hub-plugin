import { JsonObject, JsonValue } from '../../types/index';
import { DatabaseQueryResult } from './connection-pool';

export interface ParsedRecord {
    data: JsonObject;
    meta: {
        rowIndex: number;
        sourceTable?: string;
    };
}

export function parseQueryResults(
    result: DatabaseQueryResult,
    _options?: {
        includeMetadata?: boolean;
        sourceId?: string;
    },
): ParsedRecord[] {
    const records: ParsedRecord[] = [];

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const data = normalizeRow(row);

        records.push({
            data,
            meta: {
                rowIndex: i,
            },
        });
    }

    return records;
}

export function normalizeRow(row: Record<string, unknown>): JsonObject {
    const normalized: JsonObject = {};

    for (const [key, value] of Object.entries(row)) {
        normalized[key] = normalizeValue(value);
    }

    return normalized;
}

export function normalizeValue(value: unknown): JsonValue {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('base64');
    }

    if (Array.isArray(value)) {
        return value.map(normalizeValue);
    }

    if (typeof value === 'object') {
        const obj: JsonObject = {};
        for (const [k, v] of Object.entries(value)) {
            obj[k] = normalizeValue(v);
        }
        return obj;
    }

    return String(value);
}

export function getColumnValue(row: Record<string, unknown>, column: string): JsonValue {
    const value = row[column];
    return normalizeValue(value);
}

export function extractIncrementalValue(
    rows: Record<string, unknown>[],
    column: string,
): JsonValue | undefined {
    if (rows.length === 0) return undefined;

    const lastRow = rows[rows.length - 1];
    return getColumnValue(lastRow, column);
}

export function extractCursorValue(
    rows: Record<string, unknown>[],
    cursorColumn: string,
): JsonValue | undefined {
    if (rows.length === 0) return undefined;

    const lastRow = rows[rows.length - 1];
    return getColumnValue(lastRow, cursorColumn);
}

export function transformFieldMetadata(
    fields: Array<{ name: string; type: string }> | undefined,
): Array<{ name: string; type: string }> {
    if (!fields) return [];

    return fields.map(field => ({
        name: field.name,
        type: mapDatabaseType(field.type),
    }));
}

function mapDatabaseType(dbType: string): string {
    const typeMapping: Record<string, string> = {
        // PostgreSQL types
        'int4': 'integer',
        'int8': 'bigint',
        'int2': 'smallint',
        'float4': 'float',
        'float8': 'double',
        'numeric': 'decimal',
        'varchar': 'string',
        'text': 'string',
        'bool': 'boolean',
        'timestamp': 'datetime',
        'timestamptz': 'datetime',
        'date': 'date',
        'time': 'time',
        'json': 'json',
        'jsonb': 'json',
        'uuid': 'uuid',
        'bytea': 'binary',

        // MySQL types
        'INT': 'integer',
        'BIGINT': 'bigint',
        'SMALLINT': 'smallint',
        'TINYINT': 'smallint',
        'FLOAT': 'float',
        'DOUBLE': 'double',
        'DECIMAL': 'decimal',
        'VARCHAR': 'string',
        'CHAR': 'string',
        'DATETIME': 'datetime',
        'BLOB': 'binary',
        'JSON': 'json',
        'INTEGER': 'integer',
        'REAL': 'float',
        'TEXT': 'string',
    };

    return typeMapping[dbType] || 'unknown';
}

export function estimateResultSize(rows: Record<string, unknown>[]): number {
    if (rows.length === 0) return 0;

    const firstRow = rows[0];
    const rowSize = JSON.stringify(firstRow).length * 2; // Account for overhead

    return rowSize * rows.length;
}
