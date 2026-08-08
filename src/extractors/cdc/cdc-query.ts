import type { ConnectionConfig, JsonObject } from '../../types';
import { DatabaseType } from '../../constants';
import {
    escapeSqlIdentifier,
    validateColumnName,
    validateTableName,
} from '../../utils/sql-security.utils';
import type { DatabaseExtractorConfig } from '../database/types';
import type { CdcExtractorConfig } from './types';

export type CdcCursorValue = string | number;

export interface CdcCursor {
    value: CdcCursorValue;
    primaryKey: CdcCursorValue;
}

function normalizeCursorValue(value: unknown, column: string): CdcCursorValue {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    throw new Error(`CDC cursor column "${column}" must contain a non-null string or number`);
}

export function readCdcRowCursor(
    row: Record<string, unknown>,
    valueColumn: string,
    primaryKeyColumn: string,
): CdcCursor {
    return {
        value: normalizeCursorValue(row[valueColumn], valueColumn),
        primaryKey: normalizeCursorValue(row[primaryKeyColumn], primaryKeyColumn),
    };
}

export function readCdcCheckpointCursor(
    data: JsonObject | undefined,
    valueKey: 'lastTrackingValue' | 'lastDeleteValue',
    primaryKeyKey: 'lastTrackingPrimaryKey' | 'lastDeletePrimaryKey',
): CdcCursor | undefined {
    const value = data?.[valueKey];
    const primaryKey = data?.[primaryKeyKey];
    if (value === undefined && primaryKey === undefined) return undefined;
    if (value === undefined || primaryKey === undefined) {
        throw new Error(
            `CDC checkpoint requires both "${valueKey}" and "${primaryKeyKey}"`,
        );
    }
    return {
        value: normalizeCursorValue(value, valueKey),
        primaryKey: normalizeCursorValue(primaryKey, primaryKeyKey),
    };
}

export function createCdcCheckpoint(
    trackingCursor: CdcCursor | undefined,
    deleteCursor: CdcCursor | undefined,
): JsonObject | undefined {
    if (!trackingCursor && !deleteCursor) return undefined;

    const checkpoint: JsonObject = {};
    if (trackingCursor) {
        checkpoint.lastTrackingValue = trackingCursor.value;
        checkpoint.lastTrackingPrimaryKey = trackingCursor.primaryKey;
    }
    if (deleteCursor) {
        checkpoint.lastDeleteValue = deleteCursor.value;
        checkpoint.lastDeletePrimaryKey = deleteCursor.primaryKey;
    }
    return checkpoint;
}

export function toCdcDatabaseConfig(
    config: CdcExtractorConfig,
    connection: ConnectionConfig,
): DatabaseExtractorConfig {
    const getString = (key: string): string | undefined => {
        const value = connection.config[key];
        if (value === undefined) return undefined;
        if (typeof value !== 'string') {
            throw new Error(`Database connection field "${key}" must be a string`);
        }
        return value;
    };
    const getNumber = (key: string): number | undefined => {
        const value = connection.config[key];
        if (value === undefined) return undefined;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`Database connection field "${key}" must be a finite number`);
        }
        return value;
    };
    return {
        adapterCode: 'database',
        databaseType: config.databaseType as DatabaseType,
        host: getString('host'),
        port: getNumber('port'),
        database: getString('database'),
        username: getString('username'),
        passwordSecretCode: getString('passwordSecretCode'),
        connectionStringSecretCode: getString('connectionStringSecretCode'),
        query: '',
    };
}

export function validateCdcIdentifiers(config: CdcExtractorConfig): void {
    validateTableName(config.table);
    validateColumnName(config.primaryKey);
    validateColumnName(config.trackingColumn);
    if (config.deleteColumn) validateColumnName(config.deleteColumn);
    for (const column of config.columns ?? []) validateColumnName(column);
}

export function getCdcIdentifierQuote(
    databaseType: CdcExtractorConfig['databaseType'],
): '"' | '`' {
    return databaseType === 'MYSQL' ? '`' : '"';
}

export function adaptCdcParameterizedQuery(
    query: string,
    parameters: unknown[],
    databaseType: CdcExtractorConfig['databaseType'],
): { query: string; parameters: unknown[] } {
    if (databaseType !== 'MYSQL') return { query, parameters };

    const mysqlParameters: unknown[] = [];
    const mysqlQuery = query.replace(/\$(\d+)/g, (_placeholder, position: string) => {
        const parameterIndex = Number(position) - 1;
        if (parameterIndex < 0 || parameterIndex >= parameters.length) {
            throw new Error(`Missing CDC query parameter $${position}`);
        }
        mysqlParameters.push(parameters[parameterIndex]);
        return '?';
    });
    return { query: mysqlQuery, parameters: mysqlParameters };
}

export function buildCdcColumnList(
    config: CdcExtractorConfig,
    quote: '"' | '`',
): string {
    if (!config.columns?.length) return '*';

    const columns = new Set(config.columns);
    columns.add(config.primaryKey);
    columns.add(config.trackingColumn);
    if (config.deleteColumn) columns.add(config.deleteColumn);
    return Array.from(columns)
        .map(column => escapeSqlIdentifier(column, quote))
        .join(', ');
}
