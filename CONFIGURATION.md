# DataHub Plugin Configuration

This document describes all configurable options for the DataHub plugin.

## Environment Variables

The following environment variables configure external services and server-local output:

### Search Services

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_MEILISEARCH_URL` | Meilisearch server URL | `http://localhost:7700` |
| `DATAHUB_ELASTICSEARCH_URL` | Elasticsearch server URL | `http://localhost:9200` |
| `DATAHUB_TYPESENSE_URL` | Typesense server URL | `http://localhost:8108` |

### Secret Encryption

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_MASTER_KEY` | Durable key for AES-256-GCM encryption of database-backed INLINE secrets; use at least 32 characters and configure the same value on every API and worker | Unset; INLINE database storage and resolution are disabled |

ENV-backed secrets do not require the master key. Code-first INLINE values are
still plaintext in source and are rejected in production; use ENV references
for deployed code-first configuration.

### Horizontal Scaling / Distributed Locks

| Variable | Description | Default |
|----------|-------------|---------|
| `DATAHUB_REDIS_URL` | Redis URL for distributed locks and shared incoming-webhook rate limits; `REDIS_URL` is also recognized | Unset |
| `DATAHUB_REDIS_SENTINELS` | Comma-separated Sentinel `host[:port]` nodes; requires `DATAHUB_REDIS_SENTINEL_NAME` | Unset |
| `DATAHUB_REDIS_SENTINEL_NAME` | Sentinel monitored-master name | Unset |
| `DATAHUB_REDIS_DB` | Non-negative Redis database number used in Sentinel mode | `0` |
| `DATAHUB_REDIS_USERNAME` | Optional Redis data-node ACL username in Sentinel mode | Unset |
| `DATAHUB_REDIS_PASSWORD` | Optional Redis data-node password in Sentinel mode | Unset |
| `DATAHUB_REDIS_SENTINEL_USERNAME` | Optional Sentinel ACL username | Unset |
| `DATAHUB_REDIS_SENTINEL_PASSWORD` | Optional Sentinel password | Unset |
| `DATAHUB_REDIS_TLS` | Require TLS from Sentinel-discovered clients to Redis data nodes | `false` |
| `DATAHUB_REDIS_SENTINEL_TLS` | Require TLS for Sentinel discovery connections | `false` |
| `DATAHUB_LOCK_BACKEND` | Force lock backend (`redis`, `postgres`, `memory`) | Unset; select configured Redis, otherwise PostgreSQL for a PostgreSQL Vendure database |

> **Horizontal Scaling Notes:**
>
> When running multiple instances of Vendure with DataHub, distributed locks ensure:
> - Only one instance handles a given pipeline/trigger schedule occurrence
> - Only one instance owns a message consumer for a given published pipeline and trigger key
> - The same pipeline run job is not executed concurrently by several workers
>
> **Selection Order:**
> 1. `DATAHUB_LOCK_BACKEND` forces a backend and fails startup when its requirements are not met.
> 2. A configured standalone Redis URL or complete Sentinel configuration selects Redis.
> 3. A PostgreSQL Vendure database selects PostgreSQL advisory locking.
> 4. Other databases fail startup unless `DATAHUB_LOCK_BACKEND=memory` is selected explicitly for a single-process deployment.
>
> Redis is not probed automatically on localhost, and memory locking is never an automatic production fallback.

Configure either `DATAHUB_REDIS_URL` or the Sentinel node/name pair, never both.
`REDIS_URL` is only a standalone fallback when no Data Hub-specific standalone
or Sentinel configuration is present. Sentinel nodes default to port `26379`.
Use the same topology, database, and credentials on every API server and worker.
TLS uses the Node.js trust store; add a private CA with `NODE_EXTRA_CA_CERTS`
before process startup when required. Certificate verification remains enabled.

Incoming webhook admission independently uses the selected standalone or
Sentinel Redis configuration. Its fixed-window counters are atomic and shared
by all API instances. Without Redis, the limiter stays process-local and is safe
only for one API instance unless an ingress supplies the cluster-wide limit.
When configured Redis cannot be reached or a bounded command times out, webhook
admission returns `503 Service Unavailable`; it does not silently fall back to
per-process counters.

The same Redis configuration auto-selects Redis for distributed locks unless another valid lock
backend is forced. Lock initialization remains fail-closed; on PostgreSQL, use
`DATAHUB_LOCK_BACKEND=POSTGRES` when locks must remain independent of Redis.

These global settings serve Data Hub locks and incoming-webhook rate limits.
Redis Streams sources and sinks remain connection-scoped and use their saved
connection settings; they do not inherit the global Sentinel environment.

### Server-local exports

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_HUB_EXPORT_ROOT` | Root directory for server-local exporter and feed files | `<cwd>/exports` |

The value is resolved to an absolute root when the process starts. Configure a writable persistent directory in production. Pipeline-local exporter `path` values and feed `outputPath` values remain relative to this root.

### Storage Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_HUB_STORAGE_TYPE` | Asset storage backend: `local` or `s3` | `local` |
| `DATA_HUB_STORAGE_PATH` | Base directory for the local backend | `data-hub-uploads` |
| `DATA_HUB_S3_BUCKET` | S3 bucket; required when the backend is `s3` | None |
| `DATA_HUB_S3_REGION` | S3 region | `us-east-1` |
| `DATA_HUB_S3_ACCESS_KEY_ID` | Optional static access key; must be paired with the secret access key | AWS SDK credential chain |
| `DATA_HUB_S3_SECRET_ACCESS_KEY` | Optional static secret access key; must be paired with the access key | AWS SDK credential chain |
| `DATA_HUB_S3_ENDPOINT` | Optional HTTP(S) endpoint for an S3-compatible service | AWS S3 |
| `DATA_HUB_S3_PREFIX` | Optional object-key prefix | None |
| `DATA_HUB_S3_URL_EXPIRY` | Signed-URL lifetime in seconds (`1-604800`) | `3600` |

Prefer the AWS SDK credential chain (for example, a workload role) over static
keys. Unknown storage types, incomplete static credential pairs, missing S3
buckets, and invalid URL-expiry values fail startup.
The seven-day maximum is the AWS SDK SigV4 limit; temporary credentials can
expire sooner than the configured URL. See the
[AWS presigned URL documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

## Plugin Options

Configure the plugin when initializing it in your Vendure config:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';

DataHubPlugin.init({
    enabled: true,
    debug: false,
    retentionDaysRuns: 30,
    retentionDaysErrors: 90,

    telemetry: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? {
        endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        serviceName: 'vendure-data-hub',
        environment: process.env.NODE_ENV,
    } : undefined,

    // Runtime configuration
    runtime: {
        circuitBreaker: {
            enabled: true,
            failureThreshold: 5,    // Failures before opening circuit
            successThreshold: 3,    // Successes to close circuit
            resetTimeoutMs: 30000,  // Time before attempting reset
            failureWindowMs: 60000, // Time window for counting failures
        },
        scheduler: {
            checkIntervalMs: 30000,
            refreshIntervalMs: 60000,
            minIntervalMs: 1000,
            maxPipelineDiscovery: 1000,
            maxTrackingEntries: 1000,
            maxConsecutiveFailures: 5,
        },
    },

    // Code-first pipelines
    pipelines: [],

    // Code-first secrets
    secrets: [],

    // Code-first connections
    connections: [],

    // Custom executable adapters and dependency-injection factories
    adapters: [],
    adapterFactories: [],
});
```

## Default Values Reference

### Retention Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `retentionDaysRuns` | 30 | Days to retain pipeline run history |
| `retentionDaysErrors` | 90 | Days to retain error records |

### OpenTelemetry Export

The optional `telemetry` plugin option sends process-local cumulative metrics
and completed spans to an OpenTelemetry Collector over OTLP/HTTP JSON. Its
`endpoint` is a base URL; `/v1/metrics` and `/v1/traces` are appended.
Export is disabled when the option is omitted. See the
[complete configuration reference](docs/deployment/configuration.md#telemetry).
Private collector CAs and mutual TLS use the scoped `telemetry.tls` file
settings; no process-wide certificate-verification bypass is supported.

Retention maintenance runs in the Vendure server process under the configured
distributed lock. Each statement handles at most 1,000 rows and each entity is
limited to 10,000 rows per daily cycle; larger backlogs continue in later cycles.

### Circuit Breaker

| Setting | Default | Description |
|---------|---------|-------------|
| `circuitBreaker.enabled` | true | Enable circuit breaker |
| `circuitBreaker.failureThreshold` | 5 | Failures before opening circuit |
| `circuitBreaker.successThreshold` | 3 | Successes needed to close circuit |
| `circuitBreaker.resetTimeoutMs` | 30000 | Time before attempting reset |
| `circuitBreaker.failureWindowMs` | 60000 | Time window for counting failures |

### Scheduler

| Setting | Default | Description |
|---------|---------|-------------|
| `scheduler.checkIntervalMs` | 30000 | Interval for checking schedules |
| `scheduler.refreshIntervalMs` | 60000 | Interval for refreshing cache |
| `scheduler.minIntervalMs` | 1000 | Minimum allowed interval |
| `scheduler.maxPipelineDiscovery` | 1000 | Maximum enabled, published pipelines inspected per refresh |
| `scheduler.maxTrackingEntries` | 1000 | Maximum active schedules and in-memory tracking entries |
| `scheduler.maxConsecutiveFailures` | 5 | Trigger failures before a schedule is paused |

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
| `hmacAlgorithm` | `SHA256` | Hash algorithm (`SHA256` or `SHA512`) |
| `jwtHeaderName` | `authorization` | Header name for JWT token |
| `jwtIssuer` | Unset | Required `iss` claim when configured |
| `jwtAudience` | Unset | Required `aud` claim when configured |
| `requireIdempotencyKey` | `false` | Require X-Idempotency-Key header |

JWT authentication accepts HS256 only and requires a valid numeric `exp`
claim. Optional `nbf` and `iat` claims must also be valid numeric dates.

The plugin registers an early `*splat` JSON middleware. It delegates non-webhook
JSON requests to the normal Express parser and uses raw-byte capture plus the
10 MiB plugin limit for `/data-hub/webhook/*`. Vendure's `beforeListen` ordering
places it ahead of the automatic parser; no separate Nest raw-body bootstrap
option is required.

### File Limits

| Setting | Default | Description |
|---------|---------|-------------|
| Max File Size | 100MB | Maximum upload file size |
| Max Files | 10 | Maximum files per upload |
| Expiry | 24 hours | File expiration time |
| Export Root | `<cwd>/exports` | Root directory for server-local exporter and feed output |

Exporter `path` values and feed `outputPath` values are relative to the export root. Absolute paths, URLs, directory traversal, and symbolic-link escapes are rejected for local output.

## Constants Reference

Default values are split across the modules in `src/constants/defaults/`. Key constant groups include:

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
