import { JsonValue, BaseOperatorConfig } from '../types';

export interface LookupOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly map: Record<string, JsonValue>;
    readonly target: string;
    readonly default?: JsonValue;
}

/**
 * HTTP Lookup Operator Configuration
 *
 * Enriches records by fetching data from external HTTP endpoints.
 * Supports caching, multiple HTTP methods, authentication, and configurable
 * error handling for 404s and timeouts.
 */
export interface HttpLookupOperatorConfig extends BaseOperatorConfig {
    /** HTTP endpoint URL. Supports {{field}} placeholders for dynamic URLs */
    readonly url: string;
    /** HTTP method (GET or POST) */
    readonly method?: 'GET' | 'POST';
    /** Field path to use as lookup key for caching */
    readonly keyField?: string;
    /** Target field to store the response data */
    readonly target: string;
    /** JSON path to extract from response (e.g., 'data.result') */
    readonly responsePath?: string;
    /** Default value if lookup fails or returns 404 */
    readonly default?: JsonValue;
    /** Request timeout in milliseconds (default: 5000) */
    readonly timeoutMs?: number;
    /** Cache TTL in seconds (default: 300). Set to 0 to disable caching */
    readonly cacheTtlSec?: number;
    /** HTTP headers to send (static) */
    readonly headers?: Record<string, string>;
    /** Secret code for Bearer token authentication */
    readonly bearerTokenSecretCode?: string;
    /** Secret code for API key authentication */
    readonly apiKeySecretCode?: string;
    /** Header name for API key (default: 'X-API-Key') */
    readonly apiKeyHeader?: string;
    /** Secret code for Basic auth (format: 'username:password') */
    readonly basicAuthSecretCode?: string;
    /** Field path for POST body (uses record value at this path) */
    readonly bodyField?: string;
    /** Static POST body (JSON object) */
    readonly body?: JsonValue;
    /** Whether to skip the record on 404 (default: false, uses default value) */
    readonly skipOn404?: boolean;
    /** Whether to fail the pipeline on error (default: false) */
    readonly failOnError?: boolean;
    /** Max retries on transient errors (default: 2) */
    readonly maxRetries?: number;
    /** Parallel concurrency limit - process this many records in parallel (default: 50) */
    readonly batchSize?: number;
    /** Rate limit per second per domain (default: 100) */
    readonly rateLimitPerSecond?: number;
}

export interface EnrichOperatorConfig extends BaseOperatorConfig {
    readonly set?: Record<string, JsonValue>;
    readonly defaults?: Record<string, JsonValue>;
}

export interface CoalesceOperatorConfig extends BaseOperatorConfig {
    readonly paths: string[];
    readonly target: string;
    readonly default?: JsonValue;
}

export interface DefaultOperatorConfig extends BaseOperatorConfig {
    readonly path: string;
    readonly value: JsonValue;
}
