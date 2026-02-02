import { ExtractorConfig, PaginationConfig, AuthConfig } from '../../types/index';
import { HTTP, PAGINATION, GraphQLPaginationType } from '../../constants/index';

/**
 * GraphQL Extractor Configuration
 *
 * Configuration options for extracting data via GraphQL queries.
 * Supports both external GraphQL APIs and internal Vendure GraphQL.
 */
export interface GraphQLExtractorConfig extends ExtractorConfig {
    /** GraphQL endpoint URL (or path if using connection) */
    url: string;

    /** GraphQL query string */
    query: string;

    /** GraphQL variables (JSON object) */
    variables?: Record<string, unknown>;

    /** Path to records array in response (e.g., "data.products.items") */
    dataPath?: string;

    /** Additional HTTP headers */
    headers?: Record<string, string>;

    /** Authentication override */
    auth?: AuthConfig;

    /** Pagination configuration */
    pagination?: GraphQLPaginationConfig;

    /** Request timeout in milliseconds */
    timeoutMs?: number;

    /** Operation name (for queries with multiple operations) */
    operationName?: string;

    /** Whether to include extensions in response */
    includeExtensions?: boolean;
}

export interface GraphQLPaginationConfig extends Omit<PaginationConfig, 'type'> {
    type: GraphQLPaginationType;

    /** Variable name for offset/skip */
    offsetVariable?: string;

    /** Variable name for limit/first/take */
    limitVariable?: string;

    /** Variable name for cursor/after */
    cursorVariable?: string;

    /** Path to page info for Relay connections */
    pageInfoPath?: string;

    /** Path to hasNextPage for Relay */
    hasNextPagePath?: string;

    /** Path to endCursor for Relay */
    endCursorPath?: string;

    /** Path to totalCount in response */
    totalCountPath?: string;
}

export interface GraphQLResponse {
    data?: Record<string, unknown>;
    errors?: GraphQLError[];
    extensions?: Record<string, unknown>;
}

export interface GraphQLError {
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
}

export const GRAPHQL_DEFAULTS = {
    timeoutMs: HTTP.TIMEOUT_MS,
    pageLimit: PAGINATION.PAGE_SIZE,
    maxPages: PAGINATION.MAX_GRAPHQL_PAGES,
    offsetVariable: 'skip',
    limitVariable: 'take',
    cursorVariable: 'after',
} as const;
