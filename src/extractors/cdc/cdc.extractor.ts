import { Injectable } from '@nestjs/common';
import {
    JsonObject,
    ConnectionConfig,
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    ExtractorCategory,
} from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { DatabaseType, TRANSFORM_LIMITS } from '../../constants/index';
import { CdcExtractorConfig, CDC_DEFAULTS, CdcOperation } from './types';
import { CDC_EXTRACTOR_SCHEMA } from './schema';
import {
    createDatabaseClient,
    DatabaseClient,
} from '../database/connection-pool';
import { DatabaseExtractorConfig, DATABASE_TEST_QUERIES } from '../database/types';
import {
    escapeSqlIdentifier,
    escapeSqlTableIdentifier,
    validateColumnName,
    validateTableName,
} from '../../utils/sql-security.utils';

type CdcCursorValue = string | number;

interface CdcCursor {
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

function readRowCursor(
    row: Record<string, unknown>,
    valueColumn: string,
    primaryKeyColumn: string,
): CdcCursor {
    return {
        value: normalizeCursorValue(row[valueColumn], valueColumn),
        primaryKey: normalizeCursorValue(row[primaryKeyColumn], primaryKeyColumn),
    };
}

function readCheckpointCursor(
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

/**
 * Build a minimal DatabaseExtractorConfig from CDC config + resolved connection,
 * just enough for createDatabaseClient to open a connection.
 */
function toDatabaseConfig(
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

/**
 * Validate all identifier names in the CDC config to prevent SQL injection.
 */
function validateIdentifiers(config: CdcExtractorConfig): void {
    validateTableName(config.table);
    validateColumnName(config.primaryKey);
    validateColumnName(config.trackingColumn);
    if (config.deleteColumn) {
        validateColumnName(config.deleteColumn);
    }
    if (config.columns) {
        for (const col of config.columns) {
            validateColumnName(col);
        }
    }
}

/**
 * Build the column list for the SELECT clause.
 */
function getIdentifierQuote(databaseType: CdcExtractorConfig['databaseType']): '"' | '`' {
    return databaseType === 'MYSQL' ? '`' : '"';
}

function adaptParameterizedQuery(
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

function buildColumnList(config: CdcExtractorConfig, quote: '"' | '`'): string {
    if (config.columns && config.columns.length > 0) {
        const columnSet = new Set(config.columns);
        columnSet.add(config.primaryKey);
        columnSet.add(config.trackingColumn);
        if (config.deleteColumn) columnSet.add(config.deleteColumn);
        return Array.from(columnSet)
            .map(column => escapeSqlIdentifier(column, quote))
            .join(', ');
    }
    return '*';
}

@Injectable()
export class CdcExtractor implements DataExtractor<CdcExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'cdc';
    readonly name = 'CDC Extractor';
    readonly category: ExtractorCategory = 'DATABASE';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema = CDC_EXTRACTOR_SCHEMA;

    async *extract(
        context: ExtractorContext,
        config: CdcExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const batchSize = config.batchSize ?? CDC_DEFAULTS.batchSize;

        context.logger.info('Starting CDC extraction', {
            table: config.table,
            trackingColumn: config.trackingColumn,
            trackingType: config.trackingType,
        });

        // Validate all identifiers before building any SQL
        validateIdentifiers(config);

        // Resolve connection
        const connection = await context.connections.getRequired(config.connectionCode);
        const dbConfig = toDatabaseConfig(config, connection);
        let client: DatabaseClient | null = null;

        try {
            client = await createDatabaseClient(context, dbConfig);

            const lastTrackingCursor = readCheckpointCursor(
                context.checkpoint?.data,
                'lastTrackingValue',
                'lastTrackingPrimaryKey',
            );

            const identifierQuote = getIdentifierQuote(config.databaseType);
            const columnList = buildColumnList(config, identifierQuote);
            const escapedTable = escapeSqlTableIdentifier(config.table, identifierQuote);
            const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn, identifierQuote);
            const escapedPrimaryKey = escapeSqlIdentifier(config.primaryKey, identifierQuote);
            const escapedDeleteCol = config.includeDeletes && config.deleteColumn
                ? escapeSqlIdentifier(config.deleteColumn, identifierQuote)
                : undefined;

            // Query for INSERT/UPDATE changes
            let changeQuery: string;
            let changeParams: unknown[];

            if (lastTrackingCursor) {
                const activeRowFilter = escapedDeleteCol ? `${escapedDeleteCol} IS NULL AND ` : '';
                changeQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${activeRowFilter}(${escapedTrackingCol} > $1 OR (${escapedTrackingCol} = $1 AND ${escapedPrimaryKey} > $2)) ORDER BY ${escapedTrackingCol} ASC, ${escapedPrimaryKey} ASC LIMIT $3`;
                changeParams = [
                    lastTrackingCursor.value,
                    lastTrackingCursor.primaryKey,
                    batchSize,
                ];
            } else {
                const activeRowFilter = escapedDeleteCol ? ` AND ${escapedDeleteCol} IS NULL` : '';
                changeQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${escapedTrackingCol} IS NOT NULL${activeRowFilter} ORDER BY ${escapedTrackingCol} ASC, ${escapedPrimaryKey} ASC LIMIT $1`;
                changeParams = [batchSize];
            }

            ({
                query: changeQuery,
                parameters: changeParams,
            } = adaptParameterizedQuery(changeQuery, changeParams, config.databaseType));

            context.logger.debug('Executing CDC change query', {
                hasCheckpoint: lastTrackingCursor !== undefined,
            });

            let changeResult: Awaited<ReturnType<DatabaseClient['query']>>;
            try {
                changeResult = await client.query(changeQuery, changeParams);
            } catch (queryError) {
                context.logger.error('CDC change query failed', {
                    table: config.table,
                    trackingColumn: config.trackingColumn,
                    error: getErrorMessage(queryError),
                });
                throw new Error(`CDC change query failed for table "${config.table}": ${getErrorMessage(queryError)}`);
            }

            let latestTrackingCursor = lastTrackingCursor;
            let totalRecords = 0;

            for (const row of changeResult.rows) {
                if (await context.isCancelled()) {
                    context.logger.info('CDC extraction cancelled');
                    break;
                }

                totalRecords++;

                latestTrackingCursor = readRowCursor(
                    row,
                    config.trackingColumn,
                    config.primaryKey,
                );

                // Determine operation type for downstream loaders.
                // On first run (no checkpoint / no tracking value), we use UPSERT because
                // the records may already exist in Vendure. We cannot assume they are all new
                // INSERTs. UPSERT lets the loader decide whether to create or update each record.
                // On subsequent runs (tracking value present), all rows returned by the
                // incremental query are known modifications, so UPDATE is appropriate.
                const operation: CdcOperation = lastTrackingCursor === undefined ? 'UPSERT' : 'UPDATE';

                yield {
                    data: row as JsonObject,
                    meta: {
                        sourceId: `cdc://${config.databaseType}/${config.table}`,
                        extractedAt: new Date().toISOString(),
                        _cdc_operation: operation,
                        _cdc_timestamp: new Date().toISOString(),
                    },
                };
            }

            // Query for DELETE changes (soft-deletes)
            if (config.includeDeletes && config.deleteColumn && escapedDeleteCol) {
                let deleteQuery: string;
                let deleteParams: unknown[];

                const lastDeleteCursor = readCheckpointCursor(
                    context.checkpoint?.data,
                    'lastDeleteValue',
                    'lastDeletePrimaryKey',
                );

                if (lastDeleteCursor) {
                    deleteQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE (${escapedDeleteCol} > $1 OR (${escapedDeleteCol} = $1 AND ${escapedPrimaryKey} > $2)) ORDER BY ${escapedDeleteCol} ASC, ${escapedPrimaryKey} ASC LIMIT $3`;
                    deleteParams = [
                        lastDeleteCursor.value,
                        lastDeleteCursor.primaryKey,
                        batchSize,
                    ];
                } else {
                    deleteQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${escapedDeleteCol} IS NOT NULL ORDER BY ${escapedDeleteCol} ASC, ${escapedPrimaryKey} ASC LIMIT $1`;
                    deleteParams = [batchSize];
                }

                ({
                    query: deleteQuery,
                    parameters: deleteParams,
                } = adaptParameterizedQuery(deleteQuery, deleteParams, config.databaseType));

                context.logger.debug('Executing CDC delete query');

                let deleteResult: Awaited<ReturnType<DatabaseClient['query']>>;
                try {
                    deleteResult = await client.query(deleteQuery, deleteParams);
                } catch (queryError) {
                    context.logger.error('CDC delete query failed', {
                        table: config.table,
                        deleteColumn: config.deleteColumn,
                        error: getErrorMessage(queryError),
                    });
                    throw new Error(`CDC delete query failed for table "${config.table}": ${getErrorMessage(queryError)}`);
                }

                let latestDeleteCursor = lastDeleteCursor;

                for (const row of deleteResult.rows) {
                    if (await context.isCancelled()) {
                        context.logger.info('CDC extraction cancelled during delete scan');
                        break;
                    }

                    totalRecords++;

                    latestDeleteCursor = readRowCursor(
                        row,
                        config.deleteColumn,
                        config.primaryKey,
                    );

                    yield {
                        data: row as JsonObject,
                        meta: {
                            sourceId: `cdc://${config.databaseType}/${config.table}`,
                            extractedAt: new Date().toISOString(),
                            _cdc_operation: 'DELETE' as CdcOperation,
                            _cdc_timestamp: new Date().toISOString(),
                        },
                    };
                }

                if (latestTrackingCursor || latestDeleteCursor) {
                    const checkpointData: JsonObject = {};
                    if (latestTrackingCursor) {
                        checkpointData.lastTrackingValue = latestTrackingCursor.value;
                        checkpointData.lastTrackingPrimaryKey = latestTrackingCursor.primaryKey;
                    }
                    if (latestDeleteCursor) {
                        checkpointData.lastDeleteValue = latestDeleteCursor.value;
                        checkpointData.lastDeletePrimaryKey = latestDeleteCursor.primaryKey;
                    }
                    context.setCheckpoint(checkpointData);
                }
            } else {
                if (latestTrackingCursor) {
                    context.setCheckpoint({
                        lastTrackingValue: latestTrackingCursor.value,
                        lastTrackingPrimaryKey: latestTrackingCursor.primaryKey,
                    });
                }
            }

            context.logger.info('CDC extraction completed', {
                totalRecords,
                table: config.table,
            });
        } finally {
            if (client) {
                await client.close();
            }
        }
    }

    async validate(
        _context: ExtractorContext,
        config: CdcExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.databaseType) {
            errors.push({ field: 'databaseType', message: 'Database type is required' });
        } else if (!['POSTGRESQL', 'MYSQL'].includes(config.databaseType)) {
            errors.push({ field: 'databaseType', message: 'Only POSTGRESQL and MYSQL are supported' });
        }

        if (!config.connectionCode) {
            errors.push({ field: 'connectionCode', message: 'Connection code is required' });
        }

        if (!config.table) {
            errors.push({ field: 'table', message: 'Table name is required' });
        } else {
            try {
                validateTableName(config.table);
            } catch {
                errors.push({ field: 'table', message: 'Invalid table name' });
            }
        }

        if (!config.trackingColumn) {
            errors.push({ field: 'trackingColumn', message: 'Tracking column is required' });
        } else {
            try {
                validateColumnName(config.trackingColumn);
            } catch {
                errors.push({ field: 'trackingColumn', message: 'Invalid tracking column name' });
            }
        }

        if (!config.trackingType) {
            errors.push({ field: 'trackingType', message: 'Tracking type is required' });
        } else if (!['TIMESTAMP', 'VERSION'].includes(config.trackingType)) {
            errors.push({ field: 'trackingType', message: 'Tracking type must be TIMESTAMP or VERSION' });
        }

        if (!config.primaryKey) {
            errors.push({ field: 'primaryKey', message: 'Primary key column is required' });
        } else {
            try {
                validateColumnName(config.primaryKey);
            } catch {
                errors.push({ field: 'primaryKey', message: 'Invalid primary key column name' });
            }
        }

        if (config.includeDeletes && !config.deleteColumn) {
            errors.push({ field: 'deleteColumn', message: 'Delete column is required when tracking deletes' });
        }

        if (config.deleteColumn) {
            try {
                validateColumnName(config.deleteColumn);
            } catch {
                errors.push({ field: 'deleteColumn', message: 'Invalid delete column name' });
            }
        }

        if (config.columns) {
            for (const col of config.columns) {
                try {
                    validateColumnName(col);
                } catch {
                    errors.push({ field: 'columns', message: `Invalid column name: "${col}"` });
                }
            }
        }

        if (config.batchSize !== undefined && config.batchSize <= 0) {
            errors.push({ field: 'batchSize', message: 'Batch size must be positive' });
        }

        if (config.trackingType === 'VERSION') {
            warnings.push({
                message: 'VERSION tracking assumes the column is monotonically increasing. Ensure no gaps or resets occur.',
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: CdcExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        let client: Awaited<ReturnType<typeof createDatabaseClient>> | null = null;
        try {
            const connection = await context.connections.getRequired(config.connectionCode);
            const dbConfig = toDatabaseConfig(config, connection);
            const testQuery = DATABASE_TEST_QUERIES[config.databaseType as DatabaseType] || 'SELECT 1';

            client = await createDatabaseClient(context, dbConfig);
            await client.query(testQuery);

            return {
                success: true,
                latencyMs: Date.now() - startTime,
                details: {
                    databaseType: config.databaseType,
                    table: config.table,
                    trackingColumn: config.trackingColumn,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error),
                details: {
                    databaseType: config.databaseType,
                    table: config.table,
                },
            };
        } finally {
            if (client) await client.close().catch(() => {});
        }
    }

    async preview(
        context: ExtractorContext,
        config: CdcExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            validateIdentifiers(config);

            const connection = await context.connections.getRequired(config.connectionCode);
            const dbConfig = toDatabaseConfig(config, connection);
            const client = await createDatabaseClient(context, dbConfig);

            try {
                const safeLimit = Math.max(1, Math.min(Math.floor(limit), TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT));

                const identifierQuote = getIdentifierQuote(config.databaseType);
                const columnList = buildColumnList(config, identifierQuote);
                const escapedTable = escapeSqlTableIdentifier(config.table, identifierQuote);
                const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn, identifierQuote);
                const escapedPrimaryKey = escapeSqlIdentifier(config.primaryKey, identifierQuote);

                let previewQuery = `SELECT ${columnList} FROM ${escapedTable} ORDER BY ${escapedTrackingCol} DESC, ${escapedPrimaryKey} DESC LIMIT $1`;
                let previewParams: unknown[] = [safeLimit];
                ({
                    query: previewQuery,
                    parameters: previewParams,
                } = adaptParameterizedQuery(previewQuery, previewParams, config.databaseType));

                const result = await client.query(previewQuery, previewParams);

                const records: RecordEnvelope[] = result.rows.slice(0, safeLimit).map(row => ({
                    data: row as JsonObject,
                    meta: {
                        sourceId: `cdc://${config.databaseType}/${config.table}`,
                    },
                }));

                return {
                    records,
                    totalAvailable: result.rowCount,
                    metadata: {
                        databaseType: config.databaseType,
                        table: config.table,
                        trackingColumn: config.trackingColumn,
                    },
                };
            } finally {
                await client.close();
            }
        } catch (error) {
            // Error details included in metadata for caller visibility
            return {
                records: [],
                totalAvailable: 0,
                metadata: {
                    error: getErrorMessage(error),
                    databaseType: config.databaseType,
                    table: config.table,
                },
            };
        }
    }
}
