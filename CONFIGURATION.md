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

## Plugin Options

Configure the plugin when initializing it in your Vendure config:

```typescript
import { DataHubPlugin } from '@vendure/data-hub-plugin';

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
