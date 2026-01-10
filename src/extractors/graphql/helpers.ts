import { JsonObject, JsonValue } from '../../types/index';
import { ExtractorContext } from '../../types/index';
import { GraphQLExtractorConfig, GraphQLPaginationConfig, GRAPHQL_DEFAULTS } from './types';

/**
 * Build the full GraphQL endpoint URL
 */
export async function buildUrl(
    context: ExtractorContext,
    config: GraphQLExtractorConfig,
): Promise<string> {
    // If using a connection, resolve it and build URL
    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.baseUrl) {
            // If config.url is a path, combine with base URL
            if (config.url.startsWith('/')) {
                return `${connection.baseUrl.replace(/\/$/, '')}${config.url}`;
            }
            // If config.url is empty, use base URL directly
            if (!config.url) {
                return connection.baseUrl;
            }
        }
    }
    return config.url;
}

/**
 * Build headers including auth from config and connection
 */
export async function buildHeaders(
    context: ExtractorContext,
    config: GraphQLExtractorConfig,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    // Get connection headers if available
    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.headers) {
            Object.assign(headers, connection.headers);
        }
        // Apply connection auth
        if (connection?.auth) {
            await applyAuth(headers, connection.auth, context);
        }
    }

    // Config headers override connection headers
    if (config.headers) {
        Object.assign(headers, config.headers);
    }

    // Config auth overrides connection auth
    if (config.auth) {
        await applyAuth(headers, config.auth, context);
    }

    return headers;
}

/**
 * Apply authentication to headers
 */
async function applyAuth(
    headers: Record<string, string>,
    auth: GraphQLExtractorConfig['auth'],
    context: ExtractorContext,
): Promise<void> {
    if (!auth || auth.type === 'none') return;

    switch (auth.type) {
        case 'bearer': {
            const token = auth.secretCode
                ? await context.secrets.get(auth.secretCode)
                : auth.token;
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            break;
        }
        case 'basic': {
            const username = auth.username || '';
            const password = auth.secretCode
                ? await context.secrets.get(auth.secretCode)
                : auth.password || '';
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
            break;
        }
        case 'api-key': {
            const apiKey = auth.secretCode
                ? await context.secrets.get(auth.secretCode)
                : auth.token;
            const headerName = auth.headerName || 'X-API-Key';
            if (apiKey) {
                headers[headerName] = apiKey;
            }
            break;
        }
    }
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

/**
 * Get a value from nested object using dot notation path
 */
export function getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Build variables for paginated request
 */
export function buildPaginatedVariables(
    baseVariables: Record<string, unknown> | undefined,
    pagination: GraphQLPaginationConfig | undefined,
    state: PaginationState,
): Record<string, unknown> {
    const variables = { ...baseVariables };

    if (!pagination || pagination.type === 'none') {
        return variables;
    }

    const limit = pagination.limit || GRAPHQL_DEFAULTS.pageLimit;

    switch (pagination.type) {
        case 'offset': {
            const offsetVar = pagination.offsetVariable || GRAPHQL_DEFAULTS.offsetVariable;
            const limitVar = pagination.limitVariable || GRAPHQL_DEFAULTS.limitVariable;
            variables[offsetVar] = state.offset || 0;
            variables[limitVar] = limit;
            break;
        }
        case 'cursor':
        case 'relay': {
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
 * Pagination state for tracking progress
 */
export interface PaginationState {
    offset: number;
    cursor?: string;
    page: number;
    recordCount: number;
    totalFetched: number;
}

/**
 * Initialize pagination state
 */
export function initPaginationState(): PaginationState {
    return {
        offset: 0,
        cursor: undefined,
        page: 0,
        recordCount: 0,
        totalFetched: 0,
    };
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
    if (!pagination || pagination.type === 'none') {
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
        case 'offset': {
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
        case 'cursor':
        case 'relay': {
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
 * Validate GraphQL URL
 */
export function isValidGraphQLUrl(url: string, hasConnection: boolean): boolean {
    if (!url) return hasConnection; // Empty URL is ok if we have a connection

    // If using connection, url can be a path
    if (hasConnection && url.startsWith('/')) {
        return true;
    }

    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

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
