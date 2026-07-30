import { Injectable } from '@nestjs/common';
import {
    JsonObject,
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
import { CdcExtractorConfig, CdcOperation } from './types';
import { CDC_EXTRACTOR_SCHEMA } from './schema';
import {
    createDatabaseClient,
    DatabaseClient,
} from '../database/connection-pool';
import { DATABASE_TEST_QUERIES } from '../database/types';
import {
    escapeSqlIdentifier,
    escapeSqlTableIdentifier,
} from '../../utils/sql-security.utils';
import {
    adaptCdcParameterizedQuery,
    buildCdcColumnList,
    createCdcCheckpoint,
    getCdcIdentifierQuote,
    readCdcCheckpointCursor,
    readCdcRowCursor,
    toCdcDatabaseConfig,
    validateCdcIdentifiers,
} from './cdc-query';
import {
    resolveCdcBatchSize,
    validateCdcConfig,
} from './cdc-config.validation';
import { resolveBoundedLimit } from '../shared/pagination.utils';

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
        const batchSize = resolveCdcBatchSize(config);

        context.logger.info('Starting CDC extraction', {
            table: config.table,
            trackingColumn: config.trackingColumn,
            trackingType: config.trackingType,
        });

        validateCdcIdentifiers(config);
        if (await context.isCancelled()) {
            context.logger.info('CDC extraction cancelled before connection');
            return;
        }

        const connection = await context.connections.getRequired(config.connectionCode);
        const dbConfig = toCdcDatabaseConfig(config, connection);
        let client: DatabaseClient | null = null;

        try {
            client = await createDatabaseClient(context, dbConfig);

            const lastTrackingCursor = readCdcCheckpointCursor(
                context.checkpoint?.data,
                'lastTrackingValue',
                'lastTrackingPrimaryKey',
            );
            const lastDeleteCursor = config.includeDeletes && config.deleteColumn
                ? readCdcCheckpointCursor(
                    context.checkpoint?.data,
                    'lastDeleteValue',
                    'lastDeletePrimaryKey',
                )
                : undefined;

            const identifierQuote = getCdcIdentifierQuote(config.databaseType);
            const columnList = buildCdcColumnList(config, identifierQuote);
            const escapedTable = escapeSqlTableIdentifier(config.table, identifierQuote);
            const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn, identifierQuote);
            const escapedPrimaryKey = escapeSqlIdentifier(config.primaryKey, identifierQuote);
            const escapedDeleteCol = config.includeDeletes && config.deleteColumn
                ? escapeSqlIdentifier(config.deleteColumn, identifierQuote)
                : undefined;

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
            } = adaptCdcParameterizedQuery(changeQuery, changeParams, config.databaseType));

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
            let latestDeleteCursor = lastDeleteCursor;
            let totalRecords = 0;
            let cancelled = false;

            for (const row of changeResult.rows) {
                if (await context.isCancelled()) {
                    context.logger.info('CDC extraction cancelled');
                    cancelled = true;
                    break;
                }

                totalRecords++;

                latestTrackingCursor = readCdcRowCursor(
                    row,
                    config.trackingColumn,
                    config.primaryKey,
                );

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

            if (!cancelled && config.includeDeletes && config.deleteColumn && escapedDeleteCol) {
                let deleteQuery: string;
                let deleteParams: unknown[];

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
                } = adaptCdcParameterizedQuery(deleteQuery, deleteParams, config.databaseType));

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

                for (const row of deleteResult.rows) {
                    if (await context.isCancelled()) {
                        context.logger.info('CDC extraction cancelled during delete scan');
                        cancelled = true;
                        break;
                    }

                    totalRecords++;

                    latestDeleteCursor = readCdcRowCursor(
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

            }

            const checkpoint = createCdcCheckpoint(
                latestTrackingCursor,
                latestDeleteCursor,
            );
            if (checkpoint) context.setCheckpoint(checkpoint);

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
        return validateCdcConfig(config);
    }

    async testConnection(
        context: ExtractorContext,
        config: CdcExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        let client: Awaited<ReturnType<typeof createDatabaseClient>> | null = null;
        try {
            const connection = await context.connections.getRequired(config.connectionCode);
            const dbConfig = toCdcDatabaseConfig(config, connection);
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
            validateCdcIdentifiers(config);

            const connection = await context.connections.getRequired(config.connectionCode);
            const dbConfig = toCdcDatabaseConfig(config, connection);
            const client = await createDatabaseClient(context, dbConfig);

            try {
                const safeLimit = resolveBoundedLimit(
                    limit,
                    10,
                    TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
                );

                const identifierQuote = getCdcIdentifierQuote(config.databaseType);
                const columnList = buildCdcColumnList(config, identifierQuote);
                const escapedTable = escapeSqlTableIdentifier(config.table, identifierQuote);
                const escapedTrackingCol = escapeSqlIdentifier(config.trackingColumn, identifierQuote);
                const escapedPrimaryKey = escapeSqlIdentifier(config.primaryKey, identifierQuote);

                let previewQuery = `SELECT ${columnList} FROM ${escapedTable} ORDER BY ${escapedTrackingCol} DESC, ${escapedPrimaryKey} DESC LIMIT $1`;
                let previewParams: unknown[] = [safeLimit];
                ({
                    query: previewQuery,
                    parameters: previewParams,
                } = adaptCdcParameterizedQuery(previewQuery, previewParams, config.databaseType));

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
