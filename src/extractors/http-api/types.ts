import { ExtractorConfig, PaginationConfig } from '../../types/index';
import { JsonObject } from '../../types/index';
import { HttpMethod, HTTP, PAGINATION, DEFAULTS } from '../../constants/index';

export interface HttpApiExtractorConfig extends ExtractorConfig {
    /** Adapter code identifier */
    adapterCode: 'httpApi';

    /** HTTP method */
    method?: HttpMethod;

    /** API endpoint URL (or path if using connection) */
    url: string;

    /** Request headers */
    headers?: Record<string, string>;

    /** Request body (for POST/PUT/PATCH) */
    body?: JsonObject;

    /** Pagination configuration */
    pagination?: PaginationConfig;

    /** GraphQL query (if using GraphQL) */
    graphqlQuery?: string;

    /** GraphQL variables */
    graphqlVariables?: JsonObject;

    /** Response data path (JSON path to records array) */
    dataPath?: string;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
}

export interface PaginationState {
    cursor?: string;
    offset: number;
    page: number;
    recordCount: number;
}

export interface UpdatedPaginationState {
    hasMore: boolean;
    cursor?: string;
    offset: number;
    page: number;
}

export interface RateLimitConfig {
    requestsPerSecond?: number;
    burstLimit?: number;
}

export interface RetryConfig {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    retryableStatusCodes?: number[];
}

export const RETRYABLE_NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'] as const;

export const HTTP_DEFAULTS = {
    method: HttpMethod.GET,
    timeoutMs: HTTP.TIMEOUT_MS,
    maxRetries: HTTP.MAX_RETRIES,
    retryDelayMs: HTTP.RETRY_DELAY_MS,
    retryMaxDelayMs: HTTP.RETRY_MAX_DELAY_MS,
    backoffMultiplier: DEFAULTS.WEBHOOK_BACKOFF_MULTIPLIER,
    maxPages: PAGINATION.MAX_PAGES,
    pageLimit: PAGINATION.PAGE_SIZE,
} as const;
