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
    ExtractorCategory,
} from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { DatabaseType, DatabasePaginationType, PAGINATION, TRANSFORM_LIMITS } from '../../constants/index';
import { DATABASE_EXTRACTOR_SCHEMA } from './schema';
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
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'database';
    readonly name = 'Database Extractor';
    readonly category: ExtractorCategory = 'DATABASE';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema = DATABASE_EXTRACTOR_SCHEMA;

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
                            // Validate types match before comparing to avoid mixed-type > comparison
                            const canCompare = latestIncrementalValue === undefined ||
                                typeof incrementalValue === typeof latestIncrementalValue;
                            if (canCompare && (latestIncrementalValue === undefined ||
                                (incrementalValue as string | number) > (latestIncrementalValue as string | number))) {
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

        let client: Awaited<ReturnType<typeof createDatabaseClient>> | null = null;
        try {
            client = await createDatabaseClient(context, config);
            await client.query(testQuery);

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
                error: getErrorMessage(error),
                details: {
                    databaseType: config.databaseType,
                    host: config.host ?? null,
                    port: config.port || getDefaultPort(config.databaseType),
                    database: config.database ?? null,
                },
            };
        } finally {
            if (client) await client.close().catch(() => {});
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
                const safeLimit = Math.max(1, Math.min(Math.floor(limit), TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT));
                const previewQuery = hasLimitClause(config.query)
                    ? config.query
                    : `${config.query} LIMIT ${safeLimit}`;

                const result = await client.query(previewQuery, config.parameters as unknown[]);

                for (const row of result.rows.slice(0, safeLimit)) {
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
                    error: getErrorMessage(error),
                    databaseType: config.databaseType,
                    host: config.host ?? null,
                    database: config.database ?? null,
                },
            };
        }
    }
}
