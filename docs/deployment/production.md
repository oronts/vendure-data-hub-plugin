# Production Setup

Best practices for deploying Data Hub in production.

## Pre-Deployment Checklist

### Configuration

- [ ] Debug mode disabled (`debug: false`)
- [ ] Appropriate retention settings configured
- [ ] All secrets use canonical environment-variable names without embedded fallback values
- [ ] Connections configured for production systems
- [ ] External config file secured (if used)
- [ ] `DATA_HUB_EXPORT_ROOT` points to writable persistent storage for local outputs

### Security

- [ ] Permissions assigned to appropriate roles
- [ ] Secrets stored securely
- [ ] Webhook signatures enabled
- [ ] Database user has minimum required privileges

### Infrastructure

- [ ] Job queue workers configured
- [ ] Database indexes verified
- [ ] Log aggregation set up
- [ ] Monitoring and alerting configured

## Environment Variables

Use environment variables for deployment-specific configuration and secrets:

```bash
# Database connections
ERP_DB_HOST=db.production.internal
ERP_DB_USER=vendure_reader
ERP_DB_PASSWORD=secure-password

# API keys
SUPPLIER_API_KEY=sk_live_...
GOOGLE_MERCHANT_API_KEY=...

# AWS credentials (for S3)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Server-local Data Hub exports
DATA_HUB_EXPORT_ROOT=/var/lib/vendure-data-hub/exports
```

### Local output storage

`DATA_HUB_EXPORT_ROOT` is resolved when each process starts and defaults to `<cwd>/exports`. Set it explicitly in production and provide a writable persistent mount. API servers and workers that must share local outputs need the same configured root and shared storage.

Local exporter `path` and feed `outputPath` values remain relative, such as `catalog` and `feeds/google.xml`. Absolute paths, URLs, and traversal are invalid for local output fields; remote destinations keep their own `remotePath`, bucket/prefix, or URL settings.

## Plugin Configuration

```typescript
DataHubPlugin.init({
    enabled: true,
    debug: false,
    retentionDaysRuns: 30,
    retentionDaysErrors: 90,

    secrets: [
        { code: 'supplier-api', provider: 'ENV', value: 'SUPPLIER_API_KEY' },
        { code: 'erp-db-password', provider: 'ENV', value: 'ERP_DB_PASSWORD' },
    ],

    connections: [
        {
            code: 'erp-db',
            type: 'POSTGRES',
            settings: {
                host: '${ERP_DB_HOST}',
                port: 5432,
                database: 'erp',
                username: '${ERP_DB_USER}',
                passwordSecretCode: 'erp-db-password',
                ssl: true,
            },
        },
    ],
})
```

## Job Queue Setup

### Single Server

For smaller deployments, the default configuration works:

```typescript
jobQueueOptions: {
    activeQueues: ['default', 'data-hub.event-trigger-outbox', 'data-hub.webhook-retry', 'data-hub.run'],
}
```

### Multiple Workers

For high-volume processing, run dedicated workers:

```typescript
// Main server - handles API requests
jobQueueOptions: {
    activeQueues: ['default'],
}

// Worker process - handles data hub jobs
jobQueueOptions: {
    activeQueues: [
        'data-hub.event-trigger-outbox',
        'data-hub.webhook-retry',
        'data-hub.run',
    ],
}
```

EVENT and outgoing webhook delivery use database outboxes plus leased Vendure
jobs. Configure a persistent strategy such as the database-backed
`DefaultJobQueuePlugin`, and run workers that consume
`data-hub.event-trigger-outbox`, `data-hub.webhook-retry`, and
`data-hub.run`. Event and webhook outbox rows recover expired or lost queue
publications. Pipeline run rows retain a queue request and stale-dispatch claim
until a worker owns execution, so startup reconciliation recovers a failed
run-queue handoff. A persistent queue avoids recovery delays and is required
for normal multi-process worker operation. Every webhook worker also needs the same
`DATAHUB_MASTER_KEY` and Secret Code providers as the API process.

Every API server and worker must also receive identical code-first `pipelines`,
`connections`, and `configPath` configuration. One API server reconciles those
database rows under a distributed lock. Workers verify the resulting shared
state read-only and delay schedule, message-consumer, and file-watcher discovery
until it matches. A mismatch aborts worker startup instead of running with stale
connection or pipeline configuration.

### Worker Script

```typescript
// worker.ts
import { bootstrapWorker, Logger } from '@vendure/core';
import config from './vendure-config';

bootstrapWorker({
    ...config,
    jobQueueOptions: {
        activeQueues: [
            'data-hub.event-trigger-outbox',
            'data-hub.webhook-retry',
            'data-hub.run',
        ],
        pollInterval: 1000,
    },
})
    .then(worker => worker.startJobQueue())
    .then(worker => worker.startHealthCheckServer({ port: 3020 }))
    .catch(err => {
        Logger.error(
            `Worker failed to start: ${err instanceof Error ? err.message : String(err)}`,
            'DataHubWorker',
        );
        process.exitCode = 1;
    });
```

The scheduler uses process timers and distributed locks. Scheduled starts are
handed to `data-hub.run`.

## Database Considerations

### Connection Pooling

Set the database extractor pool explicitly to avoid exhausting database
connections:

```typescript
.extract('read-external-products', {
    adapterCode: 'database',
    connectionCode: 'erp-db',
    databaseType: 'POSTGRESQL',
    query: 'SELECT * FROM products ORDER BY id',
    pool: {
        min: 1,
        max: 5,
    },
})
```

### Read Replicas

For read-heavy operations, configure read replicas:

```typescript
connections: [
    {
        code: 'erp-db-read',
        type: 'POSTGRES',
        settings: {
            host: '${ERP_DB_READ_HOST}',
            port: 5432,
            database: 'erp',
            username: '${ERP_DB_READ_USER}',
            passwordSecretCode: 'erp-db-password',
            ssl: true,
        },
    },
]
```

## Logging

### Log Persistence Level

Set the minimum level to persist:

```graphql
mutation {
    updateDataHubSettings(input: {
        logPersistenceLevel: PIPELINE
    }) {
        logPersistenceLevel
    }
}
```

- `ERROR_ONLY` persists errors.
- `PIPELINE` persists pipeline lifecycle events and errors and is the default.
- `STEP` also persists step lifecycle events.
- `DEBUG` persists all supported events and has the highest storage cost.

### Vendure Application Logging

Vendure writes through the logger configured on `VendureConfig.logger`. The
built-in logger can be configured explicitly:

```ts
import { DefaultLogger, LogLevel, type VendureConfig } from '@vendure/core';

export const config: VendureConfig = {
    // ...
    logger: new DefaultLogger({
        level: LogLevel.Info,
        timestamp: true,
    }),
};
```

For CloudWatch, Datadog, or another structured backend, either collect the
application's stdout or provide an implementation of Vendure's
`VendureLogger` interface. There is no `LoggingService` base class in the
current Vendure API. Keep log redaction at both the Data Hub and application
logger boundaries.

## Monitoring

### Key Metrics

The plugin does not install alert rules or expose a Prometheus endpoint. Derive
deployment-specific signals from the Admin API, persisted logs, the database,
and infrastructure monitoring. Example signals are:

| Signal | Source |
|--------|--------|
| Pipeline success and failure trend | Pipeline run statuses |
| Run duration | Run start/finish timestamps and metrics |
| Record-error trend | Quarantined record-error rows |
| Queue depth and recent failures | `dataHubQueueStats` |
| Worker health | Vendure worker health endpoint and infrastructure probes |

### Health Checks

Vendure servers expose `/health` and can be extended through
`HealthCheckRegistryService`. Vendure workers expose `/health` after
`startHealthCheckServer()` is called, as in the worker example above. Data Hub
does not register a separate `DataHubHealthService` or plugin-specific health
endpoint.

Use authenticated Admin API checks for `dataHubQueueStats`, representative run
queries, and message-consumer status when deeper readiness evidence is needed.
Do not expose those Admin API operations as unauthenticated health routes. See
Vendure's [deployment health-check guidance](https://docs.vendure.io/current/core/deployment/using-docker).

### Alerting

Set up alerts for:

- Pipeline failures
- High error rates
- Long-running pipelines
- Job queue backlog
- Worker crashes

## Backup and Recovery

### Data to Backup

- Pipeline definitions (if not code-first)
- Connection configurations
- Secret metadata (not values)
- Run history (optional)

### Recovery Procedures

1. **Code-first pipelines**: Automatically restored from code
2. **UI-created pipelines**: Restore from database backup
3. **Secrets**: Recreate from secure storage
4. **Connections**: Recreate from documentation

## Scaling

### Horizontal Scaling

Data Hub coordinates schedule triggers, message consumers, and individual run
jobs across multiple processes when a shared lock backend is configured:

**Distributed Locking:**

```bash
# Option 1: Redis
DATAHUB_REDIS_URL=redis://redis.production.internal:6379

# Option 2: Force PostgreSQL (no additional infrastructure)
DATAHUB_LOCK_BACKEND=postgres
```

The Redis URL also enables atomic shared rate-limit counters for incoming
webhooks. Without a Redis URL, those counters are process-local. If Redis
becomes unavailable after startup, webhook admission fails closed with `503`;
the limiter never weakens itself to per-process counters in a multi-instance
deployment.

A configured Redis URL also auto-selects Redis for distributed locks unless a
different valid backend is forced. Redis lock initialization is fail-closed, so
an unavailable lock backend can prevent application bootstrap. On PostgreSQL,
set `DATAHUB_LOCK_BACKEND=POSTGRES` to keep locking independent of Redis.

**What's Protected:**
- **Scheduled Triggers** - Only one instance executes each schedule
- **Message Consumers** - Only one instance owns each published pipeline/trigger-key consumer; replicas provide failover
- **Pipeline Runs** - Prevents duplicate execution of the same run
- **Incoming Webhook Limits** - Redis counters enforce one fixed-window limit across API replicas

**Deployment Architecture:**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Vendure 1   │    │   Vendure 2   │    │   Vendure 3   │
│ + Data Hub    │    │ + Data Hub    │    │ + Data Hub    │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Primary DB    │    │     Redis     │    │  Message Queue│
│               │    │ (conditional) │    │   (optional)  │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Without Redis:**
- PostgreSQL Vendure deployments use PostgreSQL advisory locks.
- Other database engines must configure Redis for multi-process safety.
- Process-local memory locking must be selected explicitly and is safe only for
  one process.

**With Redis:**
- Faster lock acquisition/release
- Required for shared locking when the Vendure database is not PostgreSQL

### Additional Scaling Tips

- Run multiple API servers behind load balancer
- Run multiple worker processes for job queue
- Use read replicas for heavy read operations

### Vertical Scaling

- Increase batch sizes for high-volume pipelines
- Increase concurrency for parallel processing
- Tune database connection pools

### Load Rate Limiting

Limit aggregate loader batch starts across the pipeline run:

```typescript
.load('write-products', {
    adapterCode: 'product',
    throughput: {
        rateLimitRps: 10,
    },
})
```

This setting controls load execution; it does not rate-limit extractor HTTP
requests. Configure external API throttling in the extractor or connection
adapter that owns those requests.

## Security Best Practices

1. **Secrets**: Always use environment variables in production
2. **Connections**: Use SSL/TLS for database connections
3. **Webhooks**: Enable signature verification
4. **Permissions**: Follow principle of least privilege
5. **Logging**: Never log sensitive data
6. **Network**: Restrict access to internal APIs
