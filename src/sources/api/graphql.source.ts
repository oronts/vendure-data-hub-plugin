/**
 * DataHub Sources - GraphQL API Source
 *
 * Fetches data from GraphQL APIs with pagination support.
 */

import {
    GraphqlApiSourceConfig,
    SourceResult,
    SourceError,
    DataSource,
} from '../types';
import { PAGINATION, GraphQLPaginationStyle } from '../../constants/index';
import { navigatePath } from '../../parsers/formats/json.parser';
import { buildAuthHeaders } from '../shared';

/**
 * GraphQL API source implementation
 */
export class GraphqlApiSource implements DataSource<GraphqlApiSourceConfig> {
    /**
     * Fetch data from GraphQL API
     */
    async fetch(config: GraphqlApiSourceConfig): Promise<SourceResult> {
        const allRecords: Record<string, unknown>[] = [];
        const errors: SourceError[] = [];
        let hasMore = true;
        let pageCount = 0;
        let cursor: string | undefined;

        const maxPages = config.pagination?.maxPages ?? PAGINATION.MAX_GRAPHQL_PAGES;
        const pageSize = config.pagination?.pageSize ?? PAGINATION.PAGE_SIZE;

        while (hasMore && pageCount < maxPages) {
            try {
                const variables = this.buildVariables(config.variables, {
                    cursor,
                    pageSize,
                    offset: pageCount * pageSize,
                });

                const response = await this.executeQuery(config, variables);

                if (response.errors?.length) {
                    for (const gqlError of response.errors) {
                        errors.push({
                            code: 'GRAPHQL_ERROR',
                            message: gqlError.message || 'GraphQL error',
                            details: gqlError.locations ? { locations: gqlError.locations } : undefined,
                            retryable: false,
                        });
                    }
                    break;
                }

                // Extract records from response
                const records = this.extractRecords(response.data, config.dataPath);
                allRecords.push(...records);

                // Check for more pages
                const paginationResult = this.handlePagination(
                    response.data,
                    config,
                    records.length,
                    pageSize,
                );

                hasMore = paginationResult.hasMore;
                cursor = paginationResult.cursor;
                pageCount++;
            } catch (err) {
                errors.push({
                    code: 'FETCH_ERROR',
                    message: err instanceof Error ? err.message : 'GraphQL request failed',
                    retryable: true,
                });
                break;
            }
        }

        return {
            success: errors.length === 0,
            records: allRecords,
            total: allRecords.length,
            errors: errors.length > 0 ? errors : undefined,
            metadata: {
                hasMore,
                nextCursor: cursor,
            },
        };
    }

    /**
     * Test GraphQL API connectivity
     */
    async test(config: GraphqlApiSourceConfig): Promise<{ success: boolean; message?: string }> {
        try {
            // Execute introspection query
            const introspectionQuery = `
                query {
                    __schema {
                        queryType {
                            name
                        }
                    }
                }
            `;

            const response = await this.executeQuery(
                { ...config, query: introspectionQuery },
                {},
            );

            if (response.errors?.length) {
                return {
                    success: false,
                    message: response.errors[0].message,
                };
            }

            return {
                success: true,
                message: 'GraphQL endpoint is accessible',
            };
        } catch (err) {
            return {
                success: false,
                message: err instanceof Error ? err.message : 'Connection failed',
            };
        }
    }

    /**
     * Execute GraphQL query
     */
    private async executeQuery(
        config: GraphqlApiSourceConfig,
        variables: Record<string, unknown>,
    ): Promise<GraphqlResponse> {
        const headers = buildAuthHeaders(config.headers, config.auth);

        const response = await fetch(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: config.query,
                variables,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as GraphqlResponse;
    }

    /**
     * Build query variables with pagination
     */
    private buildVariables(
        baseVariables: Record<string, unknown> = {},
        pagination: { cursor?: string; pageSize?: number; offset?: number },
    ): Record<string, unknown> {
        const variables = { ...baseVariables };

        // Common pagination variable names
        if (pagination.cursor) {
            variables['after'] = pagination.cursor;
            variables['cursor'] = pagination.cursor;
        }

        if (pagination.pageSize) {
            variables['first'] = pagination.pageSize;
            variables['limit'] = pagination.pageSize;
            variables['take'] = pagination.pageSize;
        }

        if (pagination.offset !== undefined) {
            variables['skip'] = pagination.offset;
            variables['offset'] = pagination.offset;
        }

        return variables;
    }

    /**
     * Extract records from response data
     */
    private extractRecords(data: unknown, dataPath?: string): Record<string, unknown>[] {
        let records = dataPath ? navigatePath(data, dataPath) : data;

        // Handle Relay-style connections
        if (records && typeof records === 'object' && 'edges' in (records as object)) {
            const edges = (records as { edges: Array<{ node: unknown }> }).edges;
            records = edges.map(edge => edge.node);
        }

        if (!Array.isArray(records)) {
            if (typeof records === 'object' && records !== null) {
                records = [records];
            } else {
                return [];
            }
        }

        return records as Record<string, unknown>[];
    }

    /**
     * Handle pagination response
     */
    private handlePagination(
        data: unknown,
        config: GraphqlApiSourceConfig,
        recordCount: number,
        pageSize: number,
    ): { hasMore: boolean; cursor?: string } {
        if (!config.pagination) {
            return { hasMore: false };
        }

        const { style, pageInfoPath, endCursorPath, hasNextPagePath } = config.pagination;

        switch (style) {
            case GraphQLPaginationStyle.RELAY: {
                // Navigate to pageInfo (e.g., "products.pageInfo")
                const basePath = config.dataPath ?? '';
                const pageInfo = navigatePath(
                    data,
                    pageInfoPath ?? (basePath ? `${basePath}.pageInfo` : 'pageInfo'),
                ) as { hasNextPage?: boolean; endCursor?: string } | undefined;

                if (pageInfo) {
                    return {
                        hasMore: pageInfo.hasNextPage ?? false,
                        cursor: pageInfo.endCursor,
                    };
                }
                break;
            }

            case GraphQLPaginationStyle.CURSOR: {
                const cursor = endCursorPath
                    ? (navigatePath(data, endCursorPath) as string)
                    : undefined;
                const hasNext = hasNextPagePath
                    ? (navigatePath(data, hasNextPagePath) as boolean)
                    : !!cursor;

                return { hasMore: hasNext, cursor };
            }

            case GraphQLPaginationStyle.OFFSET: {
                // For offset pagination, check if we got a full page
                return { hasMore: recordCount >= pageSize };
            }
        }

        return { hasMore: recordCount >= pageSize };
    }
}

/**
 * GraphQL response structure
 */
interface GraphqlResponse {
    data?: unknown;
    errors?: Array<{
        message: string;
        locations?: Array<{ line: number; column: number }>;
        path?: string[];
    }>;
}

/**
 * Create a GraphQL API source instance
 */
export function createGraphqlApiSource(): GraphqlApiSource {
    return new GraphqlApiSource();
}
