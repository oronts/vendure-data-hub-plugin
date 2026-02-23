import { Injectable } from '@nestjs/common';
import { HTTP, GraphQLPaginationType } from '../../constants/index';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { executeWithRetry, createRetryConfig } from '../../utils/retry.utils';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
    JsonObject,
} from '../../types/index';
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
} from './helpers';
import { getNestedValue } from '../../utils/object-path.utils';
import { GRAPHQL_EXTRACTOR_SCHEMA } from './schema';

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
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'graphql';
    readonly name = 'GraphQL Extractor';
    readonly category: ExtractorCategory = 'API';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema: StepConfigSchema = GRAPHQL_EXTRACTOR_SCHEMA;

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
            context.logger.error('GraphQL extraction failed', toErrorOrUndefined(error), { error: getErrorMessage(error) });
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
                error: getErrorMessage(error),
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
                    error: getErrorMessage(error),
                },
            };
        }
    }

    /**
     * Execute a GraphQL query using the centralised retry utility.
     */
    private async executeQuery(
        context: ExtractorContext,
        config: GraphQLExtractorConfig,
        variables?: Record<string, unknown>,
        queryOverride?: string,
    ): Promise<GraphQLResponse> {
        const retryConfig = createRetryConfig({
            maxAttempts: config.retry?.maxAttempts || HTTP.MAX_RETRIES,
            initialDelayMs: config.retry?.initialDelayMs,
            backoffMultiplier: config.retry?.backoffMultiplier,
        });

        return executeWithRetry(
            async () => {
                const url = await buildUrl(context, config);
                const headers = await buildHeaders(context, config);

                const body = JSON.stringify({
                    query: queryOverride || config.query,
                    variables,
                    operationName: config.operationName,
                });

                context.logger.debug(`Executing GraphQL query`, {
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
            },
            {
                config: retryConfig,
                logger: {
                    warn: (msg: string, meta?: Record<string, unknown>) => context.logger.warn(msg, meta as JsonObject),
                    debug: (msg: string, meta?: Record<string, unknown>) => context.logger.debug(msg, meta as JsonObject),
                },
                context: { url: config.url },
            },
        );
    }
}
