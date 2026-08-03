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
import {
    DatabasePaginationType,
    PAGINATION,
    TRANSFORM_LIMITS,
} from '../../constants/index';
import { DATABASE_EXTRACTOR_SCHEMA } from './schema';
import {
    DatabaseCursorValue,
    DatabaseExtractorConfig,
} from './types';
import {
    createDatabaseClient,
    getDefaultPort,
    testDatabaseConnection,
    DatabaseClient,
} from './connection-pool';
import {
    buildPreviewQuery,
    buildPaginatedQuery,
} from './query-builder';
import { resolveDatabaseExtractorConfig } from './database-config.resolver';
import { validateDatabaseExtractorConfig } from './database-config.validation';
import {
    assertCursorBoundaryValue,
    createIncrementalCheckpoint,
    createInitialPaginationState,
} from './database-extraction-state';
import { resolveBoundedLimit } from '../shared/pagination.utils';

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
        config = await resolveDatabaseExtractorConfig(context, config);
        context.logger.info('Starting database extraction', {
            databaseType: config.databaseType,
            host: config.host ?? null,
            database: config.database ?? null,
        });

        let client: DatabaseClient | null = null;

        try {
            client = await createDatabaseClient(context, config);

            const paginationState = createInitialPaginationState(
                config,
                context.checkpoint?.data,
            );
            const paginationEnabled = config.pagination?.enabled === true;
            const maxPages = config.pagination?.maxPages ?? PAGINATION.MAX_PAGES;
            const pageSize = config.pagination?.pageSize ?? PAGINATION.DATABASE_PAGE_SIZE;
            let pageCount = 0;
            let totalRecords = 0;

            while (pageCount < maxPages) {
                if (await context.isCancelled()) {
                    context.logger.info('Database extraction cancelled');
                    break;
                }

                const paginatedQuery = buildPaginatedQuery(
                    config.query,
                    config.pagination,
                    paginationState,
                    config.databaseType,
                );

                context.logger.debug('Executing database query', {
                    page: pageCount + 1,
                    offset: paginationState.offset,
                    cursor: paginationState.cursor as JsonValue,
                    cursorTieBreaker: paginationState.cursorTieBreaker as JsonValue,
                });

                const result = await client.query(paginatedQuery, config.parameters as unknown[]);

                if (result.rows.length === 0) {
                    context.logger.debug('No more records to fetch');
                    break;
                }

                let nextCursor: DatabaseCursorValue | undefined;
                let nextCursorTieBreaker: DatabaseCursorValue | undefined;
                if (
                    config.pagination?.type === DatabasePaginationType.CURSOR &&
                    config.pagination.cursorColumn &&
                    config.pagination.cursorTieBreakerColumn
                ) {
                    const lastRow = result.rows[result.rows.length - 1];
                    const cursor = lastRow[config.pagination.cursorColumn];
                    const cursorTieBreaker = lastRow[config.pagination.cursorTieBreakerColumn];

                    assertCursorBoundaryValue(cursor, config.pagination.cursorColumn);
                    assertCursorBoundaryValue(
                        cursorTieBreaker,
                        config.pagination.cursorTieBreakerColumn,
                    );
                    nextCursor = cursor;
                    nextCursorTieBreaker = cursorTieBreaker;
                }

                for (const row of result.rows) {
                    totalRecords++;

                    yield {
                        data: row as JsonObject,
                        meta: {
                            sourceId: `${config.databaseType}://${config.host ?? 'local'}/${config.database ?? 'db'}`,
                            extractedAt: new Date().toISOString(),
                        },
                    };
                }

                pageCount++;

                if (!paginationEnabled) {
                    break;
                }

                if (
                    config.pagination?.type === DatabasePaginationType.CURSOR &&
                    config.pagination.cursorColumn &&
                    config.pagination.cursorTieBreakerColumn
                ) {
                    paginationState.cursor = nextCursor;
                    paginationState.cursorTieBreaker = nextCursorTieBreaker;
                } else {
                    paginationState.offset += result.rows.length;
                }

                if (result.rows.length < pageSize) {
                    break;
                }
            }

            const incrementalCheckpoint = createIncrementalCheckpoint(
                config,
                paginationState,
            );
            if (incrementalCheckpoint) {
                context.setCheckpoint(incrementalCheckpoint);
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
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        config = await resolveDatabaseExtractorConfig(context, config);
        return validateDatabaseExtractorConfig(config);
    }

    async testConnection(
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
    ): Promise<ConnectionTestResult> {
        config = await resolveDatabaseExtractorConfig(context, config);
        const result = await testDatabaseConnection(context, config);
        return {
            ...result,
            details: {
                databaseType: config.databaseType,
                host: config.host ?? null,
                port: config.port || getDefaultPort(config.databaseType),
                database: config.database ?? null,
            },
        };
    }

    async preview(
        context: ExtractorContext,
        config: DatabaseExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            config = await resolveDatabaseExtractorConfig(context, config);
            const client = await createDatabaseClient(context, config);
            const records: RecordEnvelope[] = [];

            try {
                const safeLimit = resolveBoundedLimit(
                    limit,
                    10,
                    TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
                );
                const previewQuery = buildPreviewQuery(config.query, safeLimit);

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
