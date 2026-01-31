# DataHub Plugin Configuration

This document describes all configurable options for the DataHub plugin.

## Environment Variables

The following environment variables can be used to configure external service URLs:

### Search Services

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_MEILISEARCH_URL` | Meilisearch server URL | `http://localhost:7700` |
| `DATAHUB_ELASTICSEARCH_URL` | Elasticsearch server URL | `http://localhost:9200` |
| `DATAHUB_TYPESENSE_URL` | Typesense server URL | `http://localhost:8108` |

### Horizontal Scaling / Distributed Locks

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_REDIS_URL` | Redis URL for distributed locks | `redis://localhost:6379` |
| `DATAHUB_LOCK_BACKEND` | Force lock backend (`redis`, `postgres`, `memory`) | Auto-detect |

> **Horizontal Scaling Notes:**
>
> When running multiple instances of Vendure with DataHub, distributed locks ensure:
> - Only one instance executes a scheduled pipeline trigger at a time
> - Only one instance runs a message queue consumer for a given pipeline
> - Pipeline runs don't duplicate across instances
>
> **Fallback Order:**
> 1. **Redis** - Used if `DATAHUB_REDIS_URL` is set or Redis is detected at localhost:6379
> 2. **PostgreSQL** - Automatic fallback using the Vendure database
> 3. **Memory** - Single-instance only (used when no external store available)

### File Upload / API

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_API_UPLOAD` | File upload endpoint | `/data-hub/upload` |

## Plugin Options

Configure the plugin when initializing it in your Vendure config:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

DataHubPlugin.init({
    enabled: true,
    debug: false,
    retentionDaysRuns: 30,
    retentionDaysErrors: 90,

    // Runtime configuration
    runtime: {
        batch: {
            size: 50,           // Default batch size for processing
            bulkSize: 100,      // Bulk operation size
            maxInFlight: 5,     // Maximum concurrent operations
            rateLimitRps: 10,   // Rate limit (requests per second)
        },
        http: {
            timeoutMs: 30000,       // Request timeout
            maxRetries: 3,          // Maximum retry attempts
            retryDelayMs: 1000,     // Initial retry delay
            retryMaxDelayMs: 30000, // Maximum retry delay
            exponentialBackoff: true,
            backoffMultiplier: 2,
        },
        circuitBreaker: {
            enabled: true,
            failureThreshold: 5,    // Failures before opening circuit
            successThreshold: 3,    // Successes to close circuit
            resetTimeoutMs: 30000,  // Time before attempting reset
            failureWindowMs: 60000, // Time window for counting failures
        },
        connectionPool: {
            min: 1,
            max: 10,
            idleTimeoutMs: 30000,
            acquireTimeoutMs: 10000,
        },
        pagination: {
            maxPages: 100,
            pageSize: 100,
            databasePageSize: 1000,
        },
        scheduler: {
            checkIntervalMs: 30000,
            refreshIntervalMs: 60000,
            minIntervalMs: 1000,
        },
    },

    // Code-first pipelines
    pipelines: [],

    // Code-first secrets
    secrets: [],

    // Code-first connections
    connections: [],
});
```

## Default Values Reference

### Retention Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `retentionDaysRuns` | 30 | Days to retain pipeline run history |
| `retentionDaysErrors` | 90 | Days to retain error records |

### Batch Processing

| Setting | Default | Description |
|---------|---------|-------------|
| `batch.size` | 50 | Default batch size for processing |
| `batch.bulkSize` | 100 | Bulk operation size |
| `batch.maxInFlight` | 5 | Maximum concurrent in-flight operations |
| `batch.rateLimitRps` | 10 | Rate limit (requests per second) |

### HTTP Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `http.timeoutMs` | 30000 | Request timeout in milliseconds |
| `http.maxRetries` | 3 | Maximum retry attempts |
| `http.retryDelayMs` | 1000 | Initial retry delay |
| `http.retryMaxDelayMs` | 30000 | Maximum retry delay |
| `http.exponentialBackoff` | true | Enable exponential backoff |
| `http.backoffMultiplier` | 2 | Backoff multiplier |

### Circuit Breaker

| Setting | Default | Description |
|---------|---------|-------------|
| `circuitBreaker.enabled` | true | Enable circuit breaker |
| `circuitBreaker.failureThreshold` | 5 | Failures before opening circuit |
| `circuitBreaker.successThreshold` | 3 | Successes needed to close circuit |
| `circuitBreaker.resetTimeoutMs` | 30000 | Time before attempting reset |
| `circuitBreaker.failureWindowMs` | 60000 | Time window for counting failures |

### Connection Pool

| Setting | Default | Description |
|---------|---------|-------------|
| `connectionPool.min` | 1 | Minimum connections |
| `connectionPool.max` | 10 | Maximum connections |
| `connectionPool.idleTimeoutMs` | 30000 | Idle timeout |
| `connectionPool.acquireTimeoutMs` | 10000 | Acquire timeout |

### Pagination

| Setting | Default | Description |
|---------|---------|-------------|
| `pagination.maxPages` | 100 | Maximum pages to fetch from APIs |
| `pagination.pageSize` | 100 | Default page size |
| `pagination.databasePageSize` | 1000 | Page size for database queries |

### Scheduler

| Setting | Default | Description |
|---------|---------|-------------|
| `scheduler.checkIntervalMs` | 30000 | Interval for checking schedules |
| `scheduler.refreshIntervalMs` | 60000 | Interval for refreshing cache |
| `scheduler.minIntervalMs` | 1000 | Minimum allowed interval |

### Webhook Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Timeout | 30000ms | Webhook request timeout |
| Max Attempts | 5 | Maximum retry attempts |
| Initial Delay | 1000ms | Initial retry delay |
| Max Delay | 3600000ms | Maximum retry delay (1 hour) |
| Backoff Multiplier | 2 | Exponential backoff multiplier |

### Webhook Trigger Authentication

Configure authentication for incoming webhook requests in the pipeline trigger config:

| Authentication Type | Secret Code Field | Description |
|---------------------|-------------------|-------------|
| `NONE` | - | No authentication (not recommended for production) |
| `API_KEY` | `apiKeySecretCode` | API key in request header |
| `HMAC` | `secretCode` | HMAC-SHA256 signature verification |
| `BASIC` | `basicSecretCode` | HTTP Basic Authentication (username:password) |
| `JWT` | `jwtSecretCode` | JWT Bearer token with signature verification |

| Setting | Default | Description |
|---------|---------|-------------|
| `rateLimit` | 100 | Requests per minute per IP (0 = unlimited) |
| `apiKeyHeaderName` | `x-api-key` | Header name for API key authentication |
| `hmacHeaderName` | `x-datahub-signature` | Header name for HMAC signature |
| `hmacAlgorithm` | `sha256` | Hash algorithm (`sha256` or `sha512`) |
| `jwtHeaderName` | `authorization` | Header name for JWT token |
| `requireIdempotencyKey` | `false` | Require X-Idempotency-Key header |

### File Storage

| Setting | Default | Description |
|---------|---------|-------------|
| Max File Size | 100MB | Maximum upload file size |
| Max Files | 10 | Maximum files per upload |
| Expiry | 24 hours | File expiration time |

## Constants Reference

All default values are defined in `src/constants/defaults.ts`. Key constant groups include:

- `RETENTION` - Data retention settings
- `PAGINATION` - Pagination limits
- `BATCH` - Batch processing settings
- `SCHEDULER` - Scheduler intervals
- `WEBHOOK` - Webhook configuration
- `HTTP` - HTTP client settings
- `CIRCUIT_BREAKER` - Circuit breaker settings
- `CONNECTION_POOL` - Connection pool settings
- `FILE_STORAGE` - File storage limits
- `CACHE` - Cache TTL settings
- `DISTRIBUTED_LOCK` - Distributed lock settings

### Distributed Locking

| Setting | Default | Description |
|---------|---------|-------------|
| `CLEANUP_INTERVAL_MS` | 30000 | Lock cleanup interval |
| `DEFAULT_TTL_MS` | 30000 | Default lock TTL |
| `DEFAULT_WAIT_TIMEOUT_MS` | 10000 | Wait timeout when acquiring locks |
| `DEFAULT_RETRY_INTERVAL_MS` | 100 | Retry interval when waiting |
| `PIPELINE_LOCK_TTL_MS` | 300000 | Pipeline execution lock TTL (5 minutes) |
| `SCHEDULER_LOCK_TTL_MS` | 30000 | Scheduler trigger lock TTL |
| `MESSAGE_CONSUMER_LOCK_TTL_MS` | 300000 | Message consumer lock TTL |

## Dashboard Configuration

Dashboard UI constants are defined in `dashboard/constants/`:

- `ui-config.ts` - Polling intervals, thresholds
- `editor.ts` - Pipeline editor defaults
- `connection-defaults.ts` - Connection form placeholders

### Polling Intervals

| Component | Interval | Description |
|-----------|----------|-------------|
| Queues | 5000ms | Queue status updates |
| Pipeline Runs | 5000ms | Run list updates |
| Run Details | 3000ms | Individual run updates |
| Analytics | 10000ms | Analytics data refresh |
| Logs | 30000ms | Log statistics refresh |
