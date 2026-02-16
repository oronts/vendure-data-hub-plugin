import { Injectable } from '@nestjs/common';
import {
    JsonObject,
    JsonValue,
    ConnectionConfig,
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { DatabaseType, TRANSFORM_LIMITS } from '../../constants/index';
import { CdcExtractorConfig, CDC_DEFAULTS, CdcOperation } from './types';
import {
    createDatabaseClient,
    DatabaseClient,
} from '../database/connection-pool';
import { DatabaseExtractorConfig, DATABASE_TEST_QUERIES } from '../database/types';
import { validateTableName, validateColumnName, escapeSqlIdentifier } from '../../utils/sql-security.utils';

/**
 * Compare two tracking values correctly, handling numeric strings.
 * Returns negative if a < b, zero if equal, positive if a > b.
 */
function compareTrackingValues(a: unknown, b: unknown): number {
    // If both are numbers, compare numerically
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    // If both are strings that look like numbers, compare numerically
    const numA = typeof a === 'string' ? Number(a) : NaN;
    const numB = typeof b === 'string' ? Number(b) : NaN;
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    // Otherwise compare as strings
    return String(a).localeCompare(String(b));
}

/**
 * Build a minimal DatabaseExtractorConfig from CDC config + resolved connection,
 * just enough for createDatabaseClient to open a connection.
 */
function toDatabaseConfig(
    config: CdcExtractorConfig,
    connection: ConnectionConfig,
): DatabaseExtractorConfig {
    const connConfig = (connection.config ?? {}) as JsonObject;
    return {
        adapterCode: 'database',
        databaseType: config.databaseType as DatabaseType,
        host: connConfig.host as string | undefined,
        port: connConfig.port as number | undefined,
        database: connConfig.database as string | undefined,
        username: connConfig.username as string | undefined,
        passwordSecretCode: connConfig.passwordSecretCode as string | undefined,
        connectionStringSecretCode: connConfig.connectionStringSecretCode as string | undefined,
        query: '', // not used directly
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
function buildColumnList(config: CdcExtractorConfig): string {
    if (config.columns && config.columns.length > 0) {
        // Always include the primary key and tracking column
        const columnSet = new Set(config.columns);
        columnSet.add(config.primaryKey);
        columnSet.add(config.trackingColumn);
        return Array.from(columnSet).map(escapeSqlIdentifier).join(', ');
    }
    return '*';
}

@Injectable()
export class CdcExtractor implements DataExtractor<CdcExtractorConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'cdc';
    readonly name = 'CDC Extractor';
    readonly description = 'Poll a database table for changes using a timestamp or version column (Change Data Capture)';
    readonly category: ExtractorCategory = 'DATABASE';
    readonly version = '1.0.0';
    readonly icon = 'refresh-cw';
    readonly supportsPagination = false;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'connection', label: 'Connection', description: 'Database connection settings' },
            { id: 'tracking', label: 'Change Tracking', description: 'How changes are detected' },
            { id: 'columns', label: 'Columns', description: 'Which columns to extract' },
            { id: 'deletes', label: 'Deletes', description: 'Soft-delete tracking' },
            { id: 'advanced', label: 'Advanced', description: 'Batch size and polling' },
        ],
        fields: [
            {
                key: 'connectionCode',
                label: 'Connection',
                description: 'Saved database connection',
                type: 'connection',
                required: true,
                group: 'connection',
            },
            {
                key: 'databaseType',
                label: 'Database Type',
                type: 'select',
                required: true,
                options: [
                    { value: 'POSTGRESQL', label: 'PostgreSQL' },
                    { value: 'MYSQL', label: 'MySQL / MariaDB' },
                ],
                group: 'connection',
            },
            {
                key: 'table',
                label: 'Table',
                description: 'Table to poll for changes',
                type: 'string',
                required: true,
                placeholder: 'products',
                group: 'tracking',
            },
            {
                key: 'primaryKey',
                label: 'Primary Key Column',
                description: 'Primary key column of the table',
                type: 'string',
                required: true,
                placeholder: 'id',
                group: 'tracking',
            },
            {
                key: 'trackingColumn',
                label: 'Tracking Column',
                description: 'Column used to detect changes (e.g., updated_at, version)',
                type: 'string',
                required: true,
                placeholder: 'updated_at',
                group: 'tracking',
            },
            {
                key: 'trackingType',
                label: 'Tracking Type',
                type: 'select',
                required: true,
                options: [
                    { value: 'TIMESTAMP', label: 'Timestamp' },
                    { value: 'VERSION', label: 'Version / Sequence Number' },
                ],
                group: 'tracking',
            },
            {
                key: 'columns',
                label: 'Columns',
                description: 'Specific columns to select (comma-separated). Leave empty for all columns.',
                type: 'string',
                group: 'columns',
            },
            {
                key: 'includeDeletes',
                label: 'Track Deletes',
                description: 'Query a soft-delete column for deleted rows',
                type: 'boolean',
                defaultValue: false,
                group: 'deletes',
            },
            {
                key: 'deleteColumn',
                label: 'Delete Column',
                description: 'Timestamp column that indicates when a row was deleted',
                type: 'string',
                placeholder: 'deleted_at',
                group: 'deletes',
                dependsOn: { field: 'includeDeletes', value: true },
            },
            {
                key: 'batchSize',
                label: 'Batch Size',
                description: 'Maximum rows per extraction',
                type: 'number',
                defaultValue: CDC_DEFAULTS.batchSize,
                group: 'advanced',
            },
            {
                key: 'pollIntervalMs',
                label: 'Poll Interval (ms)',
                description: 'Milliseconds between polls (used by scheduler)',
                type: 'number',
                defaultValue: CDC_DEFAULTS.pollIntervalMs,
                group: 'advanced',
            },
        ],
    };

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

            // Read checkpoint from previous run
            let lastTrackingValue: JsonValue | undefined;
            if (context.checkpoint?.data) {
                lastTrackingValue = context.checkpoint.data.lastTrackingValue;
            }

            const columnList = buildColumnList(config);
            const escapedTable = escapeSqlIdentifier(config.table);
            const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn);

            // -- Query for INSERT/UPDATE changes --
            let changeQuery: string;
            let changeParams: unknown[];

            if (lastTrackingValue !== undefined) {
                changeQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${escapedTrackingCol} > $1 ORDER BY ${escapedTrackingCol} ASC LIMIT $2`;
                changeParams = [lastTrackingValue, batchSize];
            } else {
                // First run: fetch all existing rows (up to batchSize)
                changeQuery = `SELECT ${columnList} FROM ${escapedTable} ORDER BY ${escapedTrackingCol} ASC LIMIT $1`;
                changeParams = [batchSize];
            }

            // Adapt parameterized placeholders for MySQL
            if (config.databaseType === 'MYSQL') {
                changeQuery = changeQuery.replace(/\$1/g, '?').replace(/\$2/g, '?');
            }

            context.logger.debug('Executing CDC change query', {
                hasCheckpoint: lastTrackingValue !== undefined,
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

            let latestTrackingValue: JsonValue | undefined = lastTrackingValue;
            let totalRecords = 0;

            for (const row of changeResult.rows) {
                if (await context.isCancelled()) {
                    context.logger.info('CDC extraction cancelled');
                    break;
                }

                totalRecords++;

                // Track the latest value for checkpointing
                const trackingValue = row[config.trackingColumn];
                if (trackingValue !== undefined && trackingValue !== null) {
                    if (
                        latestTrackingValue === undefined ||
                        compareTrackingValues(trackingValue, latestTrackingValue) > 0
                    ) {
                        latestTrackingValue = trackingValue as JsonValue;
                    }
                }

                // Determine operation: first run = INSERT, subsequent = UPDATE
                const operation: CdcOperation = lastTrackingValue === undefined ? 'INSERT' : 'UPDATE';

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

            // -- Query for DELETE changes (soft-deletes) --
            if (config.includeDeletes && config.deleteColumn) {
                const escapedDeleteCol = escapeSqlIdentifier(config.deleteColumn);

                let deleteQuery: string;
                let deleteParams: unknown[];

                let lastDeleteValue: JsonValue | undefined;
                if (context.checkpoint?.data) {
                    lastDeleteValue = context.checkpoint.data.lastDeleteValue;
                }

                if (lastDeleteValue !== undefined) {
                    deleteQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${escapedDeleteCol} > $1 ORDER BY ${escapedDeleteCol} ASC LIMIT $2`;
                    deleteParams = [lastDeleteValue, batchSize];
                } else {
                    deleteQuery = `SELECT ${columnList} FROM ${escapedTable} WHERE ${escapedDeleteCol} IS NOT NULL ORDER BY ${escapedDeleteCol} ASC LIMIT $1`;
                    deleteParams = [batchSize];
                }

                if (config.databaseType === 'MYSQL') {
                    deleteQuery = deleteQuery.replace(/\$1/g, '?').replace(/\$2/g, '?');
                }

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

                let latestDeleteValue: JsonValue | undefined = lastDeleteValue;

                for (const row of deleteResult.rows) {
                    if (await context.isCancelled()) {
                        context.logger.info('CDC extraction cancelled during delete scan');
                        break;
                    }

                    totalRecords++;

                    const deleteValue = row[config.deleteColumn];
                    if (deleteValue !== undefined && deleteValue !== null) {
                        if (
                            latestDeleteValue === undefined ||
                            compareTrackingValues(deleteValue, latestDeleteValue) > 0
                        ) {
                            latestDeleteValue = deleteValue as JsonValue;
                        }
                    }

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

                // Save both tracking values
                if (latestTrackingValue !== undefined || latestDeleteValue !== undefined) {
                    const checkpointData: JsonObject = {};
                    if (latestTrackingValue !== undefined) {
                        checkpointData.lastTrackingValue = latestTrackingValue;
                    }
                    if (latestDeleteValue !== undefined) {
                        checkpointData.lastDeleteValue = latestDeleteValue;
                    }
                    context.setCheckpoint(checkpointData);
                }
            } else {
                // Save tracking value only
                if (latestTrackingValue !== undefined) {
                    context.setCheckpoint({ lastTrackingValue: latestTrackingValue });
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

        try {
            const connection = await context.connections.getRequired(config.connectionCode);
            const dbConfig = toDatabaseConfig(config, connection);
            const testQuery = DATABASE_TEST_QUERIES[config.databaseType as DatabaseType] || 'SELECT 1';

            const client = await createDatabaseClient(context, dbConfig);
            await client.query(testQuery);
            await client.close();

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

                const columnList = buildColumnList(config);
                const escapedTable = escapeSqlIdentifier(config.table);
                const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn);

                let previewQuery = `SELECT ${columnList} FROM ${escapedTable} ORDER BY ${escapedTrackingCol} DESC LIMIT $1`;
                if (config.databaseType === 'MYSQL') {
                    previewQuery = previewQuery.replace(/\$1/g, '?');
                }

                const result = await client.query(previewQuery, [safeLimit]);

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
