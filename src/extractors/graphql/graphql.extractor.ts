import { Injectable } from '@nestjs/common';
import { LOGGER_CONTEXTS, DEFAULTS, GraphQLPaginationType } from '../../constants/index';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import {
    GraphQLExtractorConfig,
    GraphQLResponse,
    GRAPHQL_DEFAULTS,
} from './types';
import {
    buildUrl,
    buildHeaders,
    extractRecords,
    buildPaginatedVariables,
    initPaginationState,
    updatePaginationState,
    isValidGraphQLUrl,
    isValidGraphQLQuery,
    getNestedValue,
} from './helpers';

/**
 * GraphQL Extractor
 *
 * Extracts data from GraphQL APIs with support for:
 * - Multiple pagination strategies (offset, cursor, Relay connections)
 * - Variable substitution
 * - Authentication (Bearer, Basic, API Key)
 * - Connection reuse
 * - Error handling and retries
 *
 * @example
 * ```typescript
 * const config: GraphQLExtractorConfig = {
 *   url: 'https://api.example.com/graphql',
 *   query: `
 *     query GetProducts($skip: Int, $take: Int) {
 *       products(skip: $skip, take: $take) {
 *         items { id name price }
 *         totalItems
 *       }
 *     }
 *   `,
 *   dataPath: 'data.products.items',
 *   pagination: {
 *     type: 'offset',
 *     limit: 100,
 *   },
 * };
 * ```
 */
@Injectable()
export class GraphQLExtractor implements DataExtractor<GraphQLExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'graphql';
    readonly name = 'GraphQL Extractor';
    readonly description = 'Extract data from GraphQL APIs with pagination support';
    readonly category: ExtractorCategory = 'API';
    readonly version = '1.0.0';
    readonly icon = 'code';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    private readonly _logger: DataHubLogger;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this._logger = loggerFactory.createLogger(LOGGER_CONTEXTS.GRAPHQL_EXTRACTOR);
    }

    readonly schema: StepConfigSchema = {
        groups: [
            { id: 'connection', label: 'Connection', description: 'GraphQL endpoint configuration' },
            { id: 'query', label: 'Query', description: 'GraphQL query settings' },
            { id: 'pagination', label: 'Pagination', description: 'Pagination configuration' },
            { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
        ],
        fields: [
            // Connection
            {
                key: 'connectionCode',
                label: 'Connection',
                description: 'HTTP connection to use (optional)',
                type: 'connection',
                group: 'connection',
            },
            {
                key: 'url',
                label: 'GraphQL URL',
                description: 'GraphQL endpoint URL (or path if using connection)',
                type: 'string',
                required: true,
                placeholder: 'https://api.example.com/graphql',
                group: 'connection',
            },
            {
                key: 'headers',
                label: 'Additional Headers',
                description: 'Extra HTTP headers (JSON object)',
                type: 'json',
                group: 'connection',
            },
            // Query
            {
                key: 'query',
                label: 'GraphQL Query',
                description: 'GraphQL query or mutation to execute',
                type: 'string',
                required: true,
                placeholder: 'query { products { items { id name } } }',
                group: 'query',
            },
            {
                key: 'variables',
                label: 'Variables',
                description: 'Query variables (JSON object)',
                type: 'json',
                placeholder: '{"status": "active"}',
                group: 'query',
            },
            {
                key: 'operationName',
                label: 'Operation Name',
                description: 'Operation name (for queries with multiple operations)',
                type: 'string',
                group: 'query',
            },
            {
                key: 'dataPath',
                label: 'Data Path',
                description: 'Path to records array in response (e.g., "data.products.items")',
                type: 'string',
                placeholder: 'data.products.items',
                group: 'query',
            },
            // Pagination
            {
                key: 'pagination.type',
                label: 'Pagination Type',
                type: 'select',
                options: [
                    { value: GraphQLPaginationType.NONE, label: 'None' },
                    { value: GraphQLPaginationType.OFFSET, label: 'Offset (skip/take)' },
                    { value: GraphQLPaginationType.CURSOR, label: 'Cursor' },
                    { value: GraphQLPaginationType.RELAY, label: 'Relay Connection' },
                ],
                defaultValue: GraphQLPaginationType.NONE,
                group: 'pagination',
            },
            {
                key: 'pagination.limit',
                label: 'Page Size',
                description: 'Number of records per page',
                type: 'number',
                defaultValue: GRAPHQL_DEFAULTS.pageLimit,
                group: 'pagination',
            },
            {
                key: 'pagination.offsetVariable',
                label: 'Offset Variable',
                description: 'Variable name for offset (e.g., "skip")',
                type: 'string',
                defaultValue: 'skip',
                group: 'pagination',
                dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.OFFSET },
            },
            {
                key: 'pagination.limitVariable',
                label: 'Limit Variable',
                description: 'Variable name for limit (e.g., "take", "first")',
                type: 'string',
                defaultValue: 'take',
                group: 'pagination',
            },
            {
                key: 'pagination.cursorVariable',
                label: 'Cursor Variable',
                description: 'Variable name for cursor (e.g., "after")',
                type: 'string',
                defaultValue: 'after',
                group: 'pagination',
                dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.CURSOR },
            },
            {
                key: 'pagination.totalCountPath',
                label: 'Total Count Path',
                description: 'Path to total count in response (for offset pagination)',
                type: 'string',
                placeholder: 'data.products.totalItems',
                group: 'pagination',
                dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.OFFSET },
            },
            {
                key: 'pagination.pageInfoPath',
                label: 'Page Info Path',
                description: 'Path to pageInfo for Relay connections',
                type: 'string',
                placeholder: 'data.products.pageInfo',
                group: 'pagination',
                dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.RELAY },
            },
            {
                key: 'pagination.maxPages',
                label: 'Max Pages',
                description: 'Maximum pages to fetch (safety limit)',
                type: 'number',
                defaultValue: GRAPHQL_DEFAULTS.maxPages,
                group: 'pagination',
            },
            // Advanced
            {
                key: 'timeoutMs',
                label: 'Timeout (ms)',
                type: 'number',
                defaultValue: GRAPHQL_DEFAULTS.timeoutMs,
                group: 'advanced',
            },
            {
                key: 'includeExtensions',
                label: 'Include Extensions',
                description: 'Include GraphQL extensions in record metadata',
                type: 'boolean',
                defaultValue: false,
                group: 'advanced',
            },
            {
                key: 'retry.maxAttempts',
                label: 'Max Retry Attempts',
                type: 'number',
                defaultValue: 3,
                group: 'advanced',
            },
        ],
    };

    async *extract(
        context: ExtractorContext,
        config: GraphQLExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const startTime = Date.now();
        let totalFetched = 0;
        let requestCount = 0;

        try {
            context.logger.info('Starting GraphQL extraction', {
                url: config.url,
                hasVariables: !!config.variables,
                paginationType: config.pagination?.type || GraphQLPaginationType.NONE,
            });

            const paginationType = config.pagination?.type || GraphQLPaginationType.NONE;

            if (paginationType === GraphQLPaginationType.NONE) {
                // Single request, no pagination
                const response = await this.executeQuery(context, config, config.variables);
                requestCount++;

                if (response.errors?.length) {
                    const errorMsgs = response.errors.map(e => e.message).join('; ');
                    context.logger.warn(`GraphQL errors: ${errorMsgs}`);
                }

                const records = extractRecords(response.data, config.dataPath);
                context.logger.debug(`Extracted ${records.length} records`);

                for (const record of records) {
                    yield {
                        data: record,
                        meta: {
                            sourceId: config.url,
                            sourceTimestamp: new Date().toISOString(),
                            sequence: totalFetched,
                        },
                    };
                    totalFetched++;
                }
            } else {
                // Paginated extraction
                let state = initPaginationState();
                let hasMore = true;
                const maxPages = config.pagination?.maxPages || GRAPHQL_DEFAULTS.maxPages;

                while (hasMore && state.page < maxPages) {
                    if (await context.isCancelled()) {
                        context.logger.warn('Extraction cancelled');
                        break;
                    }

                    const paginatedVariables = buildPaginatedVariables(
                        config.variables,
                        config.pagination,
                        state,
                    );

                    const response = await this.executeQuery(context, config, paginatedVariables);
                    requestCount++;

                    if (response.errors?.length) {
                        const errorMsgs = response.errors.map(e => e.message).join('; ');
                        context.logger.warn(`GraphQL errors on page ${state.page + 1}: ${errorMsgs}`);
                    }

                    const records = extractRecords(response.data, config.dataPath);

                    for (const record of records) {
                        yield {
                            data: record,
                            meta: {
                                sourceId: config.url,
                                sourceTimestamp: new Date().toISOString(),
                                sequence: totalFetched,
                            },
                        };
                        totalFetched++;
                    }

                    // Get the nested response for pagination state update
                    const nestedResponse = config.dataPath
                        ? (getNestedValue(response.data, config.dataPath.replace(/\.items$|\.nodes$|\.edges$/, '')) as Record<string, unknown>)
                        : response.data as Record<string, unknown>;

                    const result = updatePaginationState(
                        config.pagination,
                        nestedResponse || {},
                        state,
                        records.length,
                    );

                    hasMore = result.hasMore;
                    state = result.state;

                    context.logger.debug(`Page ${state.page} completed`, {
                        recordsInPage: records.length,
                        totalFetched,
                        hasMore,
                    });
                }

                if (state.page >= maxPages) {
                    context.logger.warn(`Reached max pages limit (${maxPages})`);
                }
            }

            const durationMs = Date.now() - startTime;
            context.logger.info('GraphQL extraction completed', {
                totalFetched,
                requestCount,
                durationMs,
            });

            context.setCheckpoint({
                lastExtractedAt: new Date().toISOString(),
                totalFetched,
            });
        } catch (error) {
            context.logger.error('GraphQL extraction failed', error as Error);
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: GraphQLExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        // Validate URL
        if (!config.url && !config.connectionCode) {
            errors.push({ field: 'url', message: 'URL is required when no connection is specified' });
        } else if (config.url && !isValidGraphQLUrl(config.url, !!config.connectionCode)) {
            errors.push({ field: 'url', message: 'Invalid URL format' });
        }

        // Validate query
        if (!config.query) {
            errors.push({ field: 'query', message: 'GraphQL query is required' });
        } else {
            const queryValidation = isValidGraphQLQuery(config.query);
            if (!queryValidation.valid) {
                errors.push({ field: 'query', message: queryValidation.error || 'Invalid query' });
            }
        }

        // Validate pagination config
        if (config.pagination?.type === GraphQLPaginationType.RELAY) {
            if (!config.pagination.pageInfoPath) {
                warnings.push({
                    field: 'pagination.pageInfoPath',
                    message: 'Page info path recommended for Relay pagination',
                });
            }
        }

        // Validate variables JSON
        if (config.variables && typeof config.variables !== 'object') {
            errors.push({ field: 'variables', message: 'Variables must be a JSON object' });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: GraphQLExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        try {
            // Execute an introspection query to test the connection
            const testQuery = config.query || '{ __typename }';

            const response = await this.executeQuery(context, config, config.variables, testQuery);

            if (response.errors?.length) {
                const errorMsgs = response.errors.map(e => e.message).join('; ');
                return {
                    success: false,
                    error: `GraphQL errors: ${errorMsgs}`,
                    latencyMs: Date.now() - startTime,
                };
            }

            return {
                success: true,
                details: {
                    hasData: !!response.data,
                },
                latencyMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async preview(
        context: ExtractorContext,
        config: GraphQLExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        try {
            // For preview, add a limit to variables if pagination is enabled
            const variables = { ...config.variables };

            if (config.pagination?.type && config.pagination.type !== GraphQLPaginationType.NONE) {
                const limitVar = config.pagination.limitVariable || 'take';
                variables[limitVar] = limit;
            }

            const response = await this.executeQuery(context, config, variables);
            const records = extractRecords(response.data, config.dataPath);
            const preview = records.slice(0, limit);

            return {
                records: preview.map((record, index) => ({
                    data: record,
                    meta: { sourceId: config.url, sequence: index },
                })),
                totalAvailable: records.length,
                metadata: {
                    hasErrors: !!response.errors?.length,
                    errors: response.errors?.map(e => e.message) ?? [],
                },
            };
        } catch (error) {
            return {
                records: [],
                totalAvailable: 0,
                metadata: {
                    error: error instanceof Error ? error.message : 'Preview failed',
                },
            };
        }
    }

    /**
     * Execute a GraphQL query
     */
    private async executeQuery(
        context: ExtractorContext,
        config: GraphQLExtractorConfig,
        variables?: Record<string, unknown>,
        queryOverride?: string,
    ): Promise<GraphQLResponse> {
        const maxAttempts = config.retry?.maxAttempts || DEFAULTS.MAX_RETRIES;
        const initialDelay = config.retry?.initialDelayMs || DEFAULTS.RETRY_DELAY_MS;
        const backoffMultiplier = config.retry?.backoffMultiplier || DEFAULTS.WEBHOOK_BACKOFF_MULTIPLIER;

        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const url = await buildUrl(context, config);
                const headers = await buildHeaders(context, config);

                const body = JSON.stringify({
                    query: queryOverride || config.query,
                    variables,
                    operationName: config.operationName,
                });

                context.logger.debug(`Executing GraphQL query (attempt ${attempt}/${maxAttempts})`, {
                    url,
                    hasVariables: !!variables,
                });

                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: AbortSignal.timeout(config.timeoutMs || GRAPHQL_DEFAULTS.timeoutMs),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json() as GraphQLResponse;

                if (result.errors?.length) {
                    context.logger.debug('GraphQL response contains errors', {
                        errorCount: result.errors.length,
                        firstError: result.errors[0].message,
                    });
                }

                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt >= maxAttempts) {
                    throw lastError;
                }

                const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
                context.logger.warn(`Request failed, retrying in ${delay}ms`, {
                    attempt,
                    error: lastError.message,
                });

                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Request failed');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
