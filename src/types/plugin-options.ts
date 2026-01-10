import type { PipelineDefinition } from './pipeline';
import type { CustomFeedGenerator } from '../feeds/generators/feed-types';

/**
 * Runtime configuration for batch processing
 */
export interface BatchConfig {
    /** Default batch size for processing (default: 50) */
    size?: number;
    /** Bulk operation size (default: 100) */
    bulkSize?: number;
    /** Maximum concurrent operations (default: 5) */
    maxInFlight?: number;
    /** Rate limit - requests per second (default: 10) */
    rateLimitRps?: number;
}

/**
 * Runtime configuration for HTTP operations
 */
export interface HttpConfig {
    /** Request timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
    /** Maximum retry attempts (default: 3) */
    maxRetries?: number;
    /** Initial retry delay in milliseconds (default: 1000) */
    retryDelayMs?: number;
    /** Maximum retry delay in milliseconds (default: 30000) */
    retryMaxDelayMs?: number;
    /** Enable exponential backoff (default: true) */
    exponentialBackoff?: boolean;
    /** Backoff multiplier (default: 2) */
    backoffMultiplier?: number;
}

/**
 * Circuit breaker configuration for external calls
 */
export interface CircuitBreakerConfig {
    /** Enable circuit breaker (default: true) */
    enabled?: boolean;
    /** Failure threshold before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Success threshold to close circuit (default: 3) */
    successThreshold?: number;
    /** Time in ms before attempting reset (default: 30000) */
    resetTimeoutMs?: number;
    /** Time window for counting failures in ms (default: 60000) */
    failureWindowMs?: number;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
    /** Minimum connections (default: 1) */
    min?: number;
    /** Maximum connections (default: 10) */
    max?: number;
    /** Idle timeout in milliseconds (default: 30000) */
    idleTimeoutMs?: number;
    /** Acquire timeout in milliseconds (default: 10000) */
    acquireTimeoutMs?: number;
}

/**
 * Runtime pagination configuration
 */
export interface RuntimePaginationConfig {
    /** Maximum pages to fetch from paginated APIs (default: 100) */
    maxPages?: number;
    /** Default page size for data extraction (default: 100) */
    pageSize?: number;
    /** Database page size (default: 1000) */
    databasePageSize?: number;
}

/**
 * Scheduler configuration for pipeline scheduling
 */
export interface SchedulerConfig {
    /** Interval for checking cron schedules in milliseconds (default: 30000) */
    checkIntervalMs?: number;
    /** Interval for refreshing schedule cache in milliseconds (default: 60000) */
    refreshIntervalMs?: number;
    /** Minimum allowed interval in milliseconds - safety limit (default: 1000) */
    minIntervalMs?: number;
}

/**
 * Event trigger service configuration for pipeline cache management
 */
export interface EventTriggerServiceConfig {
    /** Interval for refreshing pipeline cache in milliseconds (default: 60000) */
    cacheRefreshIntervalMs?: number;
}

/**
 * Runtime limits configuration - all configurable via plugin options
 */
export interface RuntimeLimitsConfig {
    /** Batch processing configuration */
    batch?: BatchConfig;
    /** HTTP configuration */
    http?: HttpConfig;
    /** Circuit breaker configuration */
    circuitBreaker?: CircuitBreakerConfig;
    /** Connection pool configuration */
    connectionPool?: ConnectionPoolConfig;
    /** Pagination configuration */
    pagination?: RuntimePaginationConfig;
    /** Scheduler configuration for pipeline scheduling */
    scheduler?: SchedulerConfig;
    /** Event trigger service configuration */
    eventTrigger?: EventTriggerServiceConfig;
}

/**
 * Code-first pipeline configuration
 */
export interface CodeFirstPipeline {
    /** Unique pipeline identifier */
    code: string;
    /** Human-readable name */
    name: string;
    /** Optional description */
    description?: string;
    /** Whether pipeline is active (enabled) */
    enabled?: boolean;
    /** The pipeline definition */
    definition: PipelineDefinition;
    /** Tags for organization */
    tags?: string[];
}

/**
 * Code-first secret configuration.
 * Define secrets in code (values can reference env vars).
 */
export interface CodeFirstSecret {
    /** Unique secret identifier */
    code: string;
    /** Provider: 'inline' for direct value, 'env' to read from environment */
    provider: 'inline' | 'env';
    /** Value or env variable name */
    value: string;
    /** Optional metadata */
    metadata?: Record<string, any>;
}

/**
 * Code-first connection configuration.
 * Define external connections (databases, APIs, etc.) in code.
 */
export interface CodeFirstConnection {
    /** Unique connection identifier */
    code: string;
    /** Connection type (e.g., 'postgres', 'mysql', 'rest', 's3') */
    type: string;
    /** Human-readable name */
    name: string;
    /** Connection settings - supports env var references like ${DB_HOST} */
    settings: Record<string, any>;
}

// PLUGIN OPTIONS

/**
 * DataHub Plugin Options
 *
 * Main configuration interface for the DataHub plugin.
 */
export interface DataHubPluginOptions {
    /** Enable/disable the plugin */
    enabled?: boolean;
    /** Register built-in adapters (extractors, operators, loaders, etc.) */
    registerBuiltinAdapters?: boolean;
    /** Days to retain pipeline run history */
    retentionDaysRuns?: number;
    /** Days to retain error records */
    retentionDaysErrors?: number;

    // CODE-FIRST CONFIGURATION

    /**
     * Define pipelines in code. These are synced to DB on startup.
     * Code-defined pipelines take precedence over DB if codes match.
     */
    pipelines?: CodeFirstPipeline[];

    /**
     * Define secrets in code. Supports environment variable references.
     * Example: { code: 'api-key', provider: 'env', value: 'MY_API_KEY' }
     */
    secrets?: CodeFirstSecret[];

    /**
     * Define external connections in code.
     * Settings can use ${ENV_VAR} syntax for environment variables.
     */
    connections?: CodeFirstConnection[];

    /**
     * Register custom adapters (extractors, operators, loaders, etc.)
     * These are registered alongside built-in adapters.
     */
    adapters?: unknown[];

    /**
     * Register custom feed generators for custom feed formats.
     * Example: SSR feeds, Shopify exports, marketplace-specific feeds.
     */
    feedGenerators?: CustomFeedGenerator[];

    /**
     * Path to a JSON/YAML config file with pipelines, secrets, connections.
     * Alternative to inline options - useful for separating config.
     */
    configPath?: string;

    /**
     * Enable debug logging for pipeline execution
     */
    debug?: boolean;

    /**
     * Runtime limits configuration.
     * Override default values for batch processing, HTTP, circuit breaker, etc.
     */
    runtime?: RuntimeLimitsConfig;
}
