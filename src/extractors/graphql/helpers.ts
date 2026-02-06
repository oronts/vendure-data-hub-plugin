import { JsonObject } from '../../types/index';
import { ExtractorContext } from '../../types/index';
import { GraphQLExtractorConfig, GraphQLPaginationConfig, GRAPHQL_DEFAULTS } from './types';
import { GraphQLPaginationType, HTTP_HEADERS, CONTENT_TYPES } from '../../constants/index';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { applyAuthentication, AuthConfig, createSecretResolver } from '../../utils/auth-helpers';
import { buildUrlWithConnection, isValidGraphQLUrl as isValidGraphQLUrlUtil } from '../../utils/url-helpers';
import { getNestedValue } from '../../utils/object-path.utils';
import {
    ExtendedPaginationState,
    initExtendedPaginationState,
} from '../shared';

/**
 * Build the full GraphQL endpoint URL
 * Validates URL against SSRF attacks before returning
 *
 * @param context - Extractor context
 * @param config - GraphQL extractor config
 * @param ssrfConfig - Optional SSRF security configuration
 * @throws Error if URL fails SSRF validation
 */
export async function buildUrl(
    context: ExtractorContext,
    config: GraphQLExtractorConfig,
    ssrfConfig?: UrlSecurityConfig,
): Promise<string> {
    let url: string;

    // If using a connection, resolve it and build URL
    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        url = buildUrlWithConnection(config.url, connection);
    } else {
        url = config.url;
    }

    // Validate URL against SSRF attacks
    await assertUrlSafe(url, ssrfConfig);

    return url;
}

/**
 * Build headers including auth from config and connection
 */
export async function buildHeaders(
    context: ExtractorContext,
    config: GraphQLExtractorConfig,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        [HTTP_HEADERS.ACCEPT]: CONTENT_TYPES.JSON,
    };

    const secretResolver = createSecretResolver(context.secrets);

    // Get connection headers if available
    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.headers) {
            Object.assign(headers, connection.headers);
        }
        // Apply connection auth
        if (connection?.auth) {
            await applyAuthentication(headers, connection.auth as AuthConfig, secretResolver);
        }
    }

    // Config headers override connection headers
    if (config.headers) {
        Object.assign(headers, config.headers);
    }

    // Config auth overrides connection auth
    if (config.auth) {
        await applyAuthentication(headers, config.auth as AuthConfig, secretResolver);
    }

    return headers;
}

/**
 * Extract records from GraphQL response using data path
 */
export function extractRecords(
    data: unknown,
    dataPath?: string,
): JsonObject[] {
    if (!data) return [];

    if (!dataPath) {
        // If no path specified, try common patterns
        if (Array.isArray(data)) return data as JsonObject[];
        if (typeof data === 'object' && data !== null) {
            // Check for common GraphQL response patterns
            const obj = data as Record<string, unknown>;
            if (Array.isArray(obj.items)) return obj.items as JsonObject[];
            if (Array.isArray(obj.nodes)) return obj.nodes as JsonObject[];
            if (Array.isArray(obj.edges)) {
                return (obj.edges as Array<{ node: JsonObject }>).map(e => e.node);
            }
            // Return as single-item array
            return [data as JsonObject];
        }
        return [];
    }

    // Navigate to the specified path
    const parts = dataPath.split('.');
    let current: unknown = data;

    for (const part of parts) {
        if (current === null || current === undefined) return [];
        if (typeof current !== 'object') return [];
        current = (current as Record<string, unknown>)[part];
    }

    if (Array.isArray(current)) {
        return current as JsonObject[];
    }

    // Handle Relay-style connections
    if (current && typeof current === 'object') {
        const obj = current as Record<string, unknown>;
        if (Array.isArray(obj.edges)) {
            return (obj.edges as Array<{ node: JsonObject }>).map(e => e.node);
        }
        if (Array.isArray(obj.items)) {
            return obj.items as JsonObject[];
        }
        if (Array.isArray(obj.nodes)) {
            return obj.nodes as JsonObject[];
        }
    }

    return current ? [current as JsonObject] : [];
}

// Re-export getNestedValue from canonical location
export { getNestedValue };

/**
 * Build variables for paginated request
 */
export function buildPaginatedVariables(
    baseVariables: Record<string, unknown> | undefined,
    pagination: GraphQLPaginationConfig | undefined,
    state: PaginationState,
): Record<string, unknown> {
    const variables = { ...baseVariables };

    if (!pagination || pagination.type === GraphQLPaginationType.NONE) {
        return variables;
    }

    const limit = pagination.limit || GRAPHQL_DEFAULTS.pageLimit;

    switch (pagination.type) {
        case GraphQLPaginationType.OFFSET: {
            const offsetVar = pagination.offsetVariable || GRAPHQL_DEFAULTS.offsetVariable;
            const limitVar = pagination.limitVariable || GRAPHQL_DEFAULTS.limitVariable;
            variables[offsetVar] = state.offset || 0;
            variables[limitVar] = limit;
            break;
        }
        case GraphQLPaginationType.CURSOR:
        case GraphQLPaginationType.RELAY: {
            const cursorVar = pagination.cursorVariable || GRAPHQL_DEFAULTS.cursorVariable;
            const limitVar = pagination.limitVariable || 'first';
            variables[limitVar] = limit;
            if (state.cursor) {
                variables[cursorVar] = state.cursor;
            }
            break;
        }
    }

    return variables;
}

/**
 * Pagination state for tracking progress.
 * Extends the shared ExtendedPaginationState interface.
 */
export type PaginationState = ExtendedPaginationState;

/**
 * Initialize pagination state.
 * Uses shared extended pagination state initialization.
 */
export function initPaginationState(): PaginationState {
    return initExtendedPaginationState();
}

/**
 * Update pagination state based on response
 */
export function updatePaginationState(
    pagination: GraphQLPaginationConfig | undefined,
    response: Record<string, unknown>,
    currentState: PaginationState,
    recordsInPage: number,
): { hasMore: boolean; state: PaginationState } {
    if (!pagination || pagination.type === GraphQLPaginationType.NONE) {
        return { hasMore: false, state: currentState };
    }

    const limit = pagination.limit || GRAPHQL_DEFAULTS.pageLimit;
    const newState: PaginationState = {
        ...currentState,
        page: currentState.page + 1,
        recordCount: recordsInPage,
        totalFetched: currentState.totalFetched + recordsInPage,
    };

    switch (pagination.type) {
        case GraphQLPaginationType.OFFSET: {
            newState.offset = currentState.offset + recordsInPage;

            // Check if we have more records
            const hasMore = recordsInPage >= limit;

            // Also check totalCount if available
            if (pagination.totalCountPath) {
                const totalCount = getNestedValue(response, pagination.totalCountPath);
                if (typeof totalCount === 'number') {
                    return {
                        hasMore: newState.totalFetched < totalCount,
                        state: newState,
                    };
                }
            }

            return { hasMore, state: newState };
        }
        case GraphQLPaginationType.CURSOR:
        case GraphQLPaginationType.RELAY: {
            // Get page info from response
            const pageInfoPath = pagination.pageInfoPath || 'pageInfo';
            const pageInfo = getNestedValue(response, pageInfoPath) as Record<string, unknown> | undefined;

            if (pageInfo) {
                const hasNextPagePath = pagination.hasNextPagePath || 'hasNextPage';
                const endCursorPath = pagination.endCursorPath || 'endCursor';

                const hasNextPage = getNestedValue(pageInfo, hasNextPagePath.split('.').pop() || 'hasNextPage');
                const endCursor = getNestedValue(pageInfo, endCursorPath.split('.').pop() || 'endCursor');

                newState.cursor = endCursor as string | undefined;

                return {
                    hasMore: hasNextPage === true && !!endCursor,
                    state: newState,
                };
            }

            // Fallback: check if we got a full page
            return {
                hasMore: recordsInPage >= limit,
                state: newState,
            };
        }
    }

    return { hasMore: false, state: newState };
}

/**
 * Validate GraphQL URL.
 * Uses canonical implementation from url-helpers.
 */
export const isValidGraphQLUrl = isValidGraphQLUrlUtil;

/**
 * Validate GraphQL query string
 */
export function isValidGraphQLQuery(query: string): { valid: boolean; error?: string } {
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Query is required' };
    }

    const trimmed = query.trim();

    // Basic validation - check for query/mutation/subscription keywords
    if (!trimmed.match(/^(query|mutation|subscription|\{)/i)) {
        return { valid: false, error: 'Query must start with query, mutation, subscription, or {' };
    }

    // Check for balanced braces
    let braceCount = 0;
    for (const char of trimmed) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount < 0) {
            return { valid: false, error: 'Unbalanced braces in query' };
        }
    }

    if (braceCount !== 0) {
        return { valid: false, error: 'Unbalanced braces in query' };
    }

    return { valid: true };
}
