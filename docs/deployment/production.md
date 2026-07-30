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
- [ ] Shared Redis, OTLP, storage, and remote-system topology rehearsed where configured
- [ ] Database and artifact-storage restore drill completed with recorded RPO/RTO

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

Data Hub follows Vendure's scheduler process ownership. With Vendure's default
`schedulerOptions.runTasksInWorkerOnly: true`, scheduled pipeline discovery and
triggering run in the worker process. A single-process deployment must set
`runTasksInWorkerOnly: false` explicitly; do not start schedule polling in both
API and worker roles.

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

The scheduler uses process timers and occurrence-scoped distributed leases.
Each cron minute or fixed-interval bucket is claimed once across Data Hub processes,
and scheduled starts are handed to `data-hub.run`.

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

Vendure servers expose `/health`. Add deployment-critical dependencies through
`systemOptions.healthChecks` with Vendure `HealthCheckStrategy` implementations;
when replacing that array, retain `TypeORMHealthCheckStrategy`. Vendure workers
expose `/health` after `startHealthCheckServer()` is called, as in the worker
example above. Data Hub does not register a separate `DataHubHealthService` or
plugin-specific health endpoint.

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

Treat the host database, persistent artifact storage, application build, and
secret material as one recovery unit.

### Required recovery material

- a consistent backup or snapshot of the complete Vendure database, including
  Data Hub definitions, revisions, runs, logs, checkpoints, record errors,
  settings, connections, encrypted INLINE secret values, outboxes, deliveries,
  destinations, feeds, and schema registry rows;
- the exact application artifact, plugin and Vendure versions, configuration,
  lockfile, and reviewed host migrations used by that database;
- `DATAHUB_MASTER_KEY`, environment-backed secret values, and external secret
  provider configuration stored separately from the database backup;
- the persistent local or object-storage state used for uploads, exports, feed
  artifacts, and other Data Hub files; and
- the queue-backend recovery material required by the selected Vendure job
  queue strategy.

A definition export is a useful secondary aid, but it is not a backup. Code-first
configuration also does not reconstruct revision history, active run state,
checkpoints, encrypted database values, or delivery outboxes.

### Recovery procedure

1. Quiesce API servers, workers, schedules, webhooks, event producers, file
   watchers, and message consumers before taking or restoring a coordinated
   recovery point.
2. Restore database and persistent artifact storage to the same logical point.
   A rewound checkpoint can replay a remote read or pending move/delete intent;
   compare restored checkpoint state with the remote system before re-enabling
   sources.
3. Deploy the matching application artifact, configuration, lockfile, reviewed
   migrations, master key, and secret-provider values.
4. Start one controlled API/worker pair first. Verify decryption, migration
   state, channel ownership, queue state, artifact reads, and representative
   authenticated queries.
5. Reconcile nonterminal runs, outbox rows, remote pending intents, and job
   queues before scaling out or re-enabling producers.
6. Run one controlled end-to-end pipeline per critical integration, then record
   actual recovery time and recovered data point against the deployment RTO/RPO.

Do not routinely recreate database connections or INLINE secrets from
documentation after a restore; restoring the database and the matching master
key preserves them. ENV-backed secret values still come from the external
secret store and are never contained in the database.

## Target-Environment Sign-Off

Repository acceptance tests prove code paths against disposable local services;
they do not certify a customer's network, credentials, HA topology, or remote
product configuration. Record an owner, endpoint/topology, CA and key source,
credential rotation plan, allowlist/firewall rule, expected volume, timeout and
retry policy, failover scenario, evidence timestamp, rollback trigger, and
pass/fail result for every configured dependency.

| Dependency | Repository evidence | Required production evidence |
| --- | --- | --- |
| PostgreSQL/MySQL extractor | Disposable mTLS query, active-session proof, untrusted CA/hostname/client-cert rejection, and PostgreSQL new-install migration apply/revert | Target TLS/CA or mTLS, least privilege, query plan, stable failover DNS/proxy, timeout, upgrade from the actual prior schema, and recovery |
| Redis | Atomic counters, locks, Streams, process crash, outage/reconnect against one server, and controlled Sentinel promotion with old-node loss | Automatic primary-loss election or managed failover in the target topology, persistence policy, split-brain controls, promotion time, and accepted data-loss behavior |
| OTLP | Real Collector metrics/traces export and outage recovery | Target collector authentication, TLS, capacity, retention, alert routing, and collector/egress failure |
| S3 | MinIO object round trip and signed URL | Target AWS/S3-compatible IAM, region, HTTPS/CA, bucket policy, encryption, large-object, and interruption behavior |
| FTP/FTPS/SFTP | FTP and password-SFTP round trip with SFTP host-key pinning | FTPS certificate validation where used, private-key/passphrase rotation, firewall/passive ports, transfer interruption, and reconnect |
| Pimcore | Synthetic local HTTP server covering authentication headers, pagination, retry, and checkpoint contracts | Active target Data Hub GraphQL configuration, supported Pimcore/schema version, real auth, deterministic pagination, rate limiting, and representative data |

## Scaling

### Horizontal Scaling

Data Hub coordinates schedule triggers, message consumers, and individual run
jobs across multiple processes when a shared lock backend is configured:

**Distributed Locking:**

```bash
# Option 1a: standalone or managed Redis endpoint
DATAHUB_REDIS_URL=redis://redis.production.internal:6379

# Option 1b: Redis Sentinel discovery
DATAHUB_REDIS_SENTINELS=redis-sentinel-1.internal:26379,redis-sentinel-2.internal:26379,redis-sentinel-3.internal:26379
DATAHUB_REDIS_SENTINEL_NAME=vendure-primary
DATAHUB_REDIS_TLS=true
DATAHUB_REDIS_SENTINEL_TLS=true

# Option 2: force PostgreSQL (no additional infrastructure)
DATAHUB_LOCK_BACKEND=postgres
```

Provide Sentinel and data-node ACL credentials through the deployment secret
manager when the target requires them. TLS uses the Node.js trust store; add a
private CA with `NODE_EXTRA_CA_CERTS` before startup. Use the same discovery,
database, TLS, and authentication settings on every API server and worker.

Either Redis discovery mode also enables atomic shared rate-limit counters for
incoming webhooks. Without Redis, those counters are process-local. If Redis
becomes unavailable after startup, webhook admission fails closed with `503`;
the limiter never weakens itself to per-process counters in a multi-instance
deployment.

A configured Redis topology also auto-selects Redis for distributed locks unless a
different valid backend is forced. Redis lock initialization is fail-closed, so
an unavailable lock backend can prevent application bootstrap. On PostgreSQL,
set `DATAHUB_LOCK_BACKEND=POSTGRES` to keep locking independent of Redis.

The repository proves a supported controlled Sentinel promotion followed by
loss of the original node. Before production sign-off, force an unplanned
primary failure in the actual target topology and record election time,
application reconnect time, surviving lock/quota state, and the target's
persistence/data-loss result. Global Sentinel settings do not configure Redis
Streams; each Streams trigger or sink uses its saved connection.

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
    adapterCode: 'productUpsert',
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
