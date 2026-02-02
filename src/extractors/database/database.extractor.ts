import { Injectable } from '@nestjs/common';
import {
    JsonObject,
    JsonValue,
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import { DatabaseType, DatabasePaginationType, PAGINATION, HTTP, CONNECTION_POOL, LOGGER_CONTEXTS } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import {
    DatabaseExtractorConfig,
    DATABASE_TEST_QUERIES,
} from './types';
import {
    createDatabaseClient,
    getDefaultPort,
    DatabaseClient,
} from './connection-pool';
import {
    validateQuery,
    hasLimitClause,
    buildPaginatedQuery,
    appendIncrementalFilter,
} from './query-builder';
import { PaginationState } from './types';

@Injectable()
export class DatabaseExtractor implements DataExtractor<DatabaseExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'database';
    readonly name = 'Database Extractor';
    readonly description = 'Extract data from SQL databases (PostgreSQL, MySQL, SQLite, etc.)';
    readonly category: ExtractorCategory = 'DATABASE';
    readonly version = '1.0.0';
    readonly icon = 'database';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    private readonly _logger: DataHubLogger;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.DATABASE_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'connection', label: 'Connection', description: 'Database connection settings' },
            { id: 'query', label: 'Query', description: 'SQL query configuration' },
            { id: 'pagination', label: 'Pagination', description: 'Pagination settings' },
            { id: 'incremental', label: 'Incremental', description: 'Incremental extraction settings' },
            { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
        ],
        fields: [
            // Connection
            {
                key: 'connectionCode',
                label: 'Connection',
                description: 'Use a saved database connection',
                type: 'connection',
                group: 'connection',
            },
            {
                key: 'databaseType',
                label: 'Database Type',
                type: 'select',
                required: true,
                options: [
                    { value: DatabaseType.POSTGRESQL, label: 'PostgreSQL' },
                    { value: DatabaseType.MYSQL, label: 'MySQL / MariaDB' },
                    { value: DatabaseType.SQLITE, label: 'SQLite' },
                    { value: DatabaseType.MSSQL, label: 'SQL Server' },
                    { value: DatabaseType.ORACLE, label: 'Oracle' },
                ],
                group: 'connection',
            },
            {
                key: 'host',
                label: 'Host',
                description: 'Database server hostname or IP',
                type: 'string',
                placeholder: 'localhost',
                group: 'connection',
            },
            {
                key: 'port',
                label: 'Port',
                description: 'Database server port',
                type: 'number',
                group: 'connection',
            },
            {
                key: 'database',
                label: 'Database',
                description: 'Database name',
                type: 'string',
                placeholder: 'mydb',
                group: 'connection',
            },
            {
                key: 'username',
                label: 'Username',
                type: 'string',
                group: 'connection',
            },
            {
                key: 'passwordSecretCode',
                label: 'Password',
                description: 'Secret code for database password',
                type: 'secret',
                group: 'connection',
            },
            {
                key: 'connectionStringSecretCode',
                label: 'Connection String',
                description: 'Secret code for full connection string (alternative to host/port/etc.)',
                type: 'secret',
                group: 'connection',
            },
            {
                key: 'ssl.enabled',
                label: 'Use SSL',
                description: 'Enable SSL/TLS connection',
                type: 'boolean',
                defaultValue: false,
                group: 'connection',
            },
            {
                key: 'ssl.rejectUnauthorized',
                label: 'Verify SSL Certificate',
                description: 'Reject connections with invalid SSL certificates',
                type: 'boolean',
                defaultValue: true,
                group: 'connection',
                dependsOn: { field: 'ssl.enabled', value: true },
            },
            // Query
            {
                key: 'query',
                label: 'SQL Query',
                description: 'SQL SELECT query to execute. Use $1, $2 for parameters (PostgreSQL) or ?, ? for others.',
                type: 'string',
                required: true,
                placeholder: 'SELECT * FROM products WHERE updated_at > $1',
                group: 'query',
            },
            {
                key: 'parameters',
                label: 'Query Parameters',
                description: 'Parameters for the query (JSON array)',
                type: 'json',
                placeholder: '["2024-01-01"]',
                group: 'query',
            },
            {
                key: 'schema',
                label: 'Schema',
                description: 'Database schema/namespace',
                type: 'string',
                placeholder: 'public',
                group: 'query',
            },
            // Pagination
            {
                key: 'pagination.enabled',
                label: 'Enable Pagination',
                description: 'Paginate query results',
                type: 'boolean',
                defaultValue: true,
                group: 'pagination',
            },
            {
                key: 'pagination.type',
                label: 'Pagination Type',
                type: 'select',
                options: [
                    { value: DatabasePaginationType.OFFSET, label: 'Offset (LIMIT/OFFSET)' },
                    { value: DatabasePaginationType.CURSOR, label: 'Cursor (WHERE column > cursor)' },
                ],
                defaultValue: DatabasePaginationType.OFFSET,
                group: 'pagination',
                dependsOn: { field: 'pagination.enabled', value: true },
            },
            {
                key: 'pagination.pageSize',
                label: 'Page Size',
                description: 'Number of rows per page',
                type: 'number',
                defaultValue: PAGINATION.DATABASE_PAGE_SIZE,
                group: 'pagination',
                dependsOn: { field: 'pagination.enabled', value: true },
            },
            {
                key: 'pagination.cursorColumn',
                label: 'Cursor Column',
                description: 'Column to use for cursor-based pagination (usually primary key)',
                type: 'string',
                placeholder: 'id',
                group: 'pagination',
                dependsOn: { field: 'pagination.type', value: DatabasePaginationType.CURSOR },
            },
            {
                key: 'pagination.maxPages',
                label: 'Max Pages',
                description: 'Maximum pages to fetch (safety limit)',
                type: 'number',
                defaultValue: PAGINATION.MAX_PAGES,
                group: 'pagination',
                dependsOn: { field: 'pagination.enabled', value: true },
            },
            // Incremental
            {
                key: 'incremental.enabled',
                label: 'Enable Incremental',
                description: 'Only fetch new/updated records since last run',
                type: 'boolean',
                defaultValue: false,
                group: 'incremental',
            },
            {
                key: 'incremental.column',
                label: 'Incremental Column',
                description: 'Column to track for incremental extraction',
                type: 'string',
                placeholder: 'updated_at',
                group: 'incremental',
                dependsOn: { field: 'incremental.enabled', value: true },
            },
            {
                key: 'incremental.type',
                label: 'Column Type',
                type: 'select',
                options: [
                    { value: 'timestamp', label: 'Timestamp' },
                    { value: 'sequence', label: 'Sequence/Numeric' },
                    { value: 'id', label: 'Auto-increment ID' },
                ],
                defaultValue: 'timestamp',
                group: 'incremental',
                dependsOn: { field: 'incremental.enabled', value: true },
            },
            // Advanced
            {
                key: 'queryTimeoutMs',
                label: 'Query Timeout (ms)',
                description: 'Maximum time to wait for query execution',
                type: 'number',
                defaultValue: HTTP.TIMEOUT_MS,
                group: 'advanced',
            },
            {
                key: 'pool.min',
                label: 'Min Pool Size',
                description: 'Minimum connections in pool',
                type: 'number',
                defaultValue: 1,
                group: 'advanced',
            },
            {
                key: 'pool.max',
                label: 'Max Pool Size',
                description: 'Maximum connections in pool',
                type: 'number',
                defaultValue: CONNECTION_POOL.MAX,
                group: 'advanced',
            },
            {
                key: 'includeQueryMetadata',
                label: 'Include Metadata',
                description: 'Include query metadata (column types, row count) in results',
                type: 'boolean',
                defaultValue: false,
                group: 'advanced',
            },
        ],
    };

    async *extract(
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        context.logger.info('Starting database extraction', {
            databaseType: config.databaseType,
            host: config.host ?? null,
            database: config.database ?? null,
        });

        let client: DatabaseClient | null = null;

        try {
            client = await createDatabaseClient(context, config);

            // Get incremental state from checkpoint if enabled
            let lastIncrementalValue: JsonValue | undefined = undefined;
            if (config.incremental?.enabled && context.checkpoint?.data) {
                lastIncrementalValue = context.checkpoint.data.lastIncrementalValue;
            }

            // Apply incremental filter to base query
            let baseQuery = config.query;
            if (config.incremental?.enabled && lastIncrementalValue !== undefined) {
                baseQuery = appendIncrementalFilter(baseQuery, config, lastIncrementalValue);
            }

            // Initialize pagination state
            const paginationState: PaginationState = { offset: 0, cursor: undefined };
            const maxPages = config.pagination?.maxPages ?? PAGINATION.MAX_PAGES;
            const pageSize = config.pagination?.pageSize ?? PAGINATION.DATABASE_PAGE_SIZE;
            let pageCount = 0;
            let totalRecords = 0;
            let latestIncrementalValue: JsonValue | undefined = lastIncrementalValue;

            // Iterate through pages
            while (pageCount < maxPages) {
                // Check for cancellation
                if (await context.isCancelled()) {
                    context.logger.info('Database extraction cancelled');
                    break;
                }

                // Build paginated query
                const paginatedQuery = buildPaginatedQuery(baseQuery, config.pagination, paginationState);

                context.logger.debug('Executing database query', {
                    page: pageCount + 1,
                    offset: paginationState.offset,
                    cursor: paginationState.cursor as JsonValue,
                });

                // Execute query
                const result = await client.query(paginatedQuery, config.parameters as unknown[]);

                if (result.rows.length === 0) {
                    context.logger.debug('No more records to fetch');
                    break;
                }

                // Yield records
                for (const row of result.rows) {
                    totalRecords++;

                    // Track incremental value
                    if (config.incremental?.enabled && config.incremental.column) {
                        const incrementalValue = row[config.incremental.column];
                        if (incrementalValue !== undefined && incrementalValue !== null) {
                            if (latestIncrementalValue === undefined ||
                                (incrementalValue as string | number) > (latestIncrementalValue as string | number)) {
                                latestIncrementalValue = incrementalValue as JsonValue;
                            }
                        }
                    }

                    yield {
                        data: row as JsonObject,
                        meta: {
                            sourceId: `${config.databaseType}://${config.host ?? 'local'}/${config.database ?? 'db'}`,
                            extractedAt: new Date().toISOString(),
                        },
                    };
                }

                // Update pagination state
                pageCount++;

                if (config.pagination?.type === DatabasePaginationType.CURSOR && config.pagination.cursorColumn) {
                    // For cursor pagination, get the last row's cursor value
                    const lastRow = result.rows[result.rows.length - 1];
                    paginationState.cursor = lastRow[config.pagination.cursorColumn] as JsonValue;
                } else {
                    // For offset pagination
                    paginationState.offset += result.rows.length;
                }

                // If we got fewer rows than page size, we're done
                if (result.rows.length < pageSize) {
                    break;
                }
            }

            // Save incremental state to checkpoint
            if (config.incremental?.enabled && latestIncrementalValue !== undefined) {
                context.setCheckpoint({ lastIncrementalValue: latestIncrementalValue });
            }

            context.logger.info('Database extraction completed', {
                totalRecords,
                pages: pageCount,
                databaseType: config.databaseType,
            });
        } finally {
            if (client) {
                await client.close();
            }
        }
    }

    async validate(
        _context: ExtractorContext,
        config: DatabaseExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.databaseType) {
            errors.push({ field: 'databaseType', message: 'Database type is required' });
        }

        if (!config.query) {
            errors.push({ field: 'query', message: 'SQL query is required' });
        } else {
            // Validate query
            const queryValidation = validateQuery(config.query);
            for (const err of queryValidation.errors) {
                errors.push({ field: 'query', message: err, code: 'INVALID_QUERY' });
            }

            if (config.pagination?.enabled && hasLimitClause(config.query)) {
                warnings.push({
                    field: 'query',
                    message: 'Query contains LIMIT clause which may conflict with pagination settings',
                });
            }
        }

        if (!config.connectionCode && !config.connectionStringSecretCode) {
            if (!config.host && config.databaseType !== DatabaseType.SQLITE) {
                errors.push({ field: 'host', message: 'Host is required' });
            }
            if (!config.database && config.databaseType !== DatabaseType.SQLITE) {
                errors.push({ field: 'database', message: 'Database name is required' });
            }
        }

        if (config.port !== undefined) {
            if (config.port <= 0 || config.port > 65535) {
                errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
            }
        }

        if (config.pagination?.enabled) {
            if (config.pagination.type === DatabasePaginationType.CURSOR && !config.pagination.cursorColumn) {
                errors.push({
                    field: 'pagination.cursorColumn',
                    message: 'Cursor column is required for cursor-based pagination',
                });
            }
            if (config.pagination.pageSize <= 0) {
                errors.push({ field: 'pagination.pageSize', message: 'Page size must be positive' });
            }
        }

        if (config.incremental?.enabled && !config.incremental.column) {
            errors.push({
                field: 'incremental.column',
                message: 'Incremental column is required when incremental extraction is enabled',
            });
        }

        // Add warning for unsupported database types
        if (config.databaseType && ![DatabaseType.POSTGRESQL, DatabaseType.MYSQL].includes(config.databaseType)) {
            warnings.push({
                message: `${config.databaseType} requires additional driver installation. See documentation.`,
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const testQuery = DATABASE_TEST_QUERIES[config.databaseType] || 'SELECT 1';
        const startTime = Date.now();

        try {
            const client = await createDatabaseClient(context, config);
            await client.query(testQuery);
            await client.close();

            return {
                success: true,
                latencyMs: Date.now() - startTime,
                details: {
                    databaseType: config.databaseType,
                    host: config.host ?? null,
                    port: config.port || getDefaultPort(config.databaseType),
                    database: config.database ?? null,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                details: {
                    databaseType: config.databaseType,
                    host: config.host ?? null,
                    port: config.port || getDefaultPort(config.databaseType),
                    database: config.database ?? null,
                },
            };
        }
    }

    async preview(
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            const client = await createDatabaseClient(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const previewQuery = hasLimitClause(config.query)
                    ? config.query
                    : `${config.query} LIMIT ${limit}`;

                const result = await client.query(previewQuery, config.parameters as unknown[]);

                for (const row of result.rows.slice(0, limit)) {
                    records.push({
                        data: row as JsonObject,
                        meta: {
                            sourceId: `${config.databaseType}://${config.host}/${config.database}`,
                        },
                    });
                }

                return {
                    records,
                    totalAvailable: result.rowCount,
                    metadata: {
                        databaseType: config.databaseType,
                        host: config.host ?? null,
                        database: config.database ?? null,
                        query: config.query,
                    },
                };
            } finally {
                await client.close();
            }
        } catch (error) {
            return {
                records: [],
                totalAvailable: 0,
                metadata: {
                    error: error instanceof Error ? error.message : 'Preview failed',
                    databaseType: config.databaseType,
                    host: config.host ?? null,
                    database: config.database ?? null,
                },
            };
        }
    }
}
