# Performance Tuning Guide

Optimize Data Hub for high-throughput data processing and large-scale operations.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Throughput Configuration](#throughput-configuration)
- [Batch Processing](#batch-processing)
- [Parallel Execution](#parallel-execution)
- [Database Optimization](#database-optimization)
- [Memory Management](#memory-management)
- [Network Optimization](#network-optimization)
- [Monitoring and Profiling](#monitoring-and-profiling)
- [Common Bottlenecks](#common-bottlenecks)
- [Best Practices](#best-practices)

## Performance Overview

Data Hub processes data through a multi-stage pipeline with configurable performance characteristics:

### Establish a deployment baseline

There is no portable records-per-second baseline. Results change with record
shape, adapter configuration, Vendure relations, database indexes, external
latency, worker count, CPU, memory, and concurrent storefront load. Treat any
number measured on a developer machine as local diagnostic evidence only.

Benchmark the exact published pipeline and release artifact against
production-like data and infrastructure. Record at least:

- commit/package and Vendure versions;
- CPU, memory, Node.js version, worker count, and database topology;
- record count and representative payload-size distribution;
- warm-up policy, sample count, median, p95, variance, failures, and retries;
- queue wait time separately from execution time; and
- database, remote-service, network, and memory saturation during the run.

Repeat the same workload before and after a release. Set capacity and alert
thresholds from that measured baseline, not from an undocumented generic range.

### Performance Factors

1. **Step Configuration** - Extractor pagination, load throughput, and sink batch size
2. **Data Volume** - Number of records, record size
3. **Operation Complexity** - Transforms, validations, database writes
4. **External Dependencies** - API rate limits, database performance
5. **Infrastructure** - CPU, memory, network bandwidth
6. **Vendure Load** - Concurrent operations, database connections

## Throughput Configuration

The runtime throughput controller applies only to `LOAD` steps. A `throughput`
object attached to an extract, transform, validate, enrich, export, feed, or sink
step is retained in the definition but is not consumed during execution. Use
each adapter's own pagination or batch settings for those steps.

### Pipeline Load Defaults

Set default load batching, concurrency, and pacing in the pipeline context:

```typescript
createPipeline()
    .context({
        throughput: {
            batchSize: 100,        // Records per load batch
            concurrency: 4,        // Parallel load batches
            rateLimitRps: 10,      // Max load-batch starts per second
            pauseOnErrorRate: {
                threshold: 0.05,
                intervalSec: 10,
            },
            drainStrategy: 'BACKOFF',
        },
    })
```

These context values are defaults for every load step. A load step can override
individual values without repeating the rest of the context configuration.

### Load-Step Throughput

Override the pipeline defaults for a specific load step:

```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: {
        batchSize: 20,      // Smaller batches for complex writes
        concurrency: 2,     // Limit parallel database writes
        pauseOnErrorRate: {
            threshold: 0.05,
            intervalSec: 10,
        },
        drainStrategy: 'BACKOFF',
    },
})
```

### Throughput Parameters

```typescript
interface Throughput {
    // Records per load batch; 1-10,000; defaults to the current input batch length
    batchSize?: number;

    // Parallel load batches; 1-16; defaults to 1
    concurrency?: number;

    // Aggregate load-batch starts per second; 0-1,000; 0 or omitted disables it
    rateLimitRps?: number;

    // Evaluated across load batches completed during the rolling interval
    pauseOnErrorRate?: {
        threshold: number;      // Ratio from 0 to 1
        intervalSec?: number;   // 0.1-3,600; BACKOFF default 1, QUEUE default 5
    };

    drainStrategy?: 'BACKOFF' | 'SHED' | 'QUEUE';
}
```

`rateLimitRps` spaces load-batch starts by at least `1000 / rateLimitRps`
milliseconds across all concurrent workers. It does not rate-limit extractors.
Values above 1,000 are rejected because the scheduler has millisecond
resolution; they are not silently rounded down.

### Drain Strategies

Drain behavior is evaluated only when a load step has `pauseOnErrorRate` and
the failed-record ratio across batches completed during `intervalSec` reaches
the configured threshold. It is not triggered by queue capacity.

| Strategy | Current runtime behavior |
|----------|--------------------------|
| `BACKOFF` | Pause all new load-batch starts for at least `intervalSec`. Loader calls already running finish normally. |
| `SHED` | Clear load batches that have not started. Batches already in flight finish normally. |
| `QUEUE` | Move not-yet-started batches into an in-memory queue capped at 1,000 batches. After `intervalSec` (5 seconds when omitted), return deferred work to the same concurrent, rate-limited scheduler. If recovery remains unhealthy, untouched work is deferred for another interval. Queue overflow fails the step instead of dropping records. |

## Batch Processing

Choose the setting owned by each runtime component. Pipeline `throughput.batchSize`
is a load-only control; extraction, transforms, and sinks do not inherit it.

### Component-Specific Batch Controls

```typescript
// HTTP extraction - records requested per page
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    pagination: {
        type: 'PAGE',
        limit: 100,
    },
})

// Load execution - records passed to each loader invocation
.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: { batchSize: 20 },
})

// Search sink - records sent in each bulk request
.sink('index-search', {
    adapterCode: 'meilisearch',
    host: 'http://localhost:7700',
    apiKeySecretCode: 'meilisearch-api-key',
    indexName: 'products',
    primaryKey: 'id',
    batchSize: 500,
})
```

Transforms receive the records delivered by the pipeline executor. They do not
currently expose a separate runtime batch-size or concurrency control.

### Static Load Batch Sizing

Load throughput is resolved before the load runs. Hook contexts do not contain
a mutable throughput configuration, so select the load batch size in the
pipeline definition:

```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: {
        batchSize: 50,
        concurrency: 2,
    },
})
```

## Parallel Execution

Enable parallel processing for independent steps.

### Graph-Based Parallelism

```typescript
createPipeline()
    .parallel({
        maxConcurrentSteps: 8,
        errorPolicy: 'CONTINUE',
    })

    // These steps run in parallel (no data dependencies)
    .extract('fetch-products', { /* ... */ })
    .extract('fetch-prices', { /* ... */ })
    .extract('fetch-inventory', { /* ... */ })

    // Merge results
    .transform('merge', { /* ... */ })

    // Edges define dependencies
    .edge('fetch-products', 'merge')
    .edge('fetch-prices', 'merge')
    .edge('fetch-inventory', 'merge')
```

### Concurrency Limits

The graph executor can run independent steps concurrently. The `concurrency`
inside `throughput` has a narrower meaning: it controls only parallel batches
within a load step.

```typescript
// Parallel loader invocations within this load step
.load('upsert-entities', {
    adapterCode: 'productUpsert',
    throughput: {
        concurrency: 2,  // Conservative for safety
    },
})
```

### Worker Pool Pattern

For CPU-intensive operations:

```typescript
import { Worker } from 'worker_threads';

// Register custom operator with worker pool
const heavyTransform = {
    type: 'OPERATOR',
    code: 'heavy-transform',

    async apply(records, config) {
        const workerPool = createWorkerPool(4);
        const chunks = chunkArray(records, 100);

        const results = await Promise.all(
            chunks.map(chunk =>
                workerPool.execute(chunk, config)
            )
        );

        return results.flat();
    },
};
```

## Database Optimization

Optimize database queries and writes.

### Connection Pooling

```typescript
// In vendure-config.ts
import { VendureConfig } from '@vendure/core';

export const config: VendureConfig = {
    dbConnectionOptions: {
        // Increase pool size for concurrent pipelines
        extra: {
            max: 20,           // Maximum connections
            min: 5,            // Minimum connections
            idleTimeoutMillis: 30000,
        },
    },
};
```

### Query Optimization

```typescript
// Load only needed relations
.extract('query-products', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',
    relations: ['variants', 'featuredAsset'],  // Only what's needed
    batchSize: 500,
})

// Use indexes for lookups
.load('upsert-products', {
    adapterCode: 'productUpsert',
    slugField: 'slug',  // Product identity field
})
```

### Batch Database Operations

```typescript
// Batch related operations
.load('upsert-products', {
    adapterCode: 'productUpsert',
    strategy: 'UPSERT',
    throughput: {
        batchSize: 50,      // Batch upserts together
        concurrency: 2,     // Limit concurrent batches
    },
})
```

### Database Extractor Performance

```typescript
// Incremental extraction (much faster)
.extract('fetch-updates', {
    adapterCode: 'database',
    connectionCode: 'erp-db',
    databaseType: 'POSTGRESQL',
    query: 'SELECT id, sku, updated_at FROM products',
    incremental: {
        enabled: true,
        column: 'updated_at',
    },
    pagination: {
        enabled: true,
        type: 'CURSOR',
        pageSize: 1000,
        cursorColumn: 'updated_at',
        cursorTieBreakerColumn: 'id',
    },
})

// Use indexed columns in WHERE clauses
.extract('fetch-products', {
    adapterCode: 'database',
    connectionCode: 'erp-db',
    databaseType: 'POSTGRESQL',
    query: `
        SELECT * FROM products
        WHERE status = 'active'  -- indexed
        AND updated_at > :checkpoint  -- indexed
        ORDER BY id  -- indexed
    `,
})
```

## Memory Management

Prevent out-of-memory errors with large datasets.

### Large Uploaded Files

Uploaded CSV, JSON, XML, and XLSX files are parsed into memory before downstream
steps run. Load `throughput.batchSize` controls only the later loader invocations;
putting it on the extract step does not change parsing or extraction memory use.
Size the upload limit and worker memory together, and load-test representative
files before raising production limits.

```typescript
.extract('parse-large-csv', {
    adapterCode: 'csv',
    fileId: 'large-csv-upload-id',
})

.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: { batchSize: 100 },
})
```

### Memory-Efficient Operators

```typescript
// Avoid operators that buffer all records
.transform('process', {
    operators: [
        // Good: operates record-by-record
        { op: 'rename', args: { from: 'old', to: 'new' } },
        { op: 'set', args: { path: 'status', value: 'active' } },

        // Batch-wide deduplication buffers the active batch; size it accordingly
        // { op: 'deduplicateRecords', args: { key: 'sku' } },
        // Sort at the source query or implement a bounded custom operator
    ],
})
```

### Adapter Checkpoints for Large Datasets

Checkpoint progress is adapter-specific. File extractors persist record offsets,
database/CDC extractors persist incremental cursors, and custom SDK adapters can
persist their own cursor with `setCheckpoint()`. The pipeline context does not
provide a generic periodic checkpoint policy.

### Memory Monitoring

Interceptor code runs in an isolated VM without Node's `process` or `global`
objects and without a logger on `HookContext`. Monitor heap and container memory
with the host runtime or your infrastructure telemetry. A hook can log only the
serializable hook fields and record count through the sandbox console:

```typescript
.hooks({
    AFTER_TRANSFORM: [{
        type: 'INTERCEPTOR',
        name: 'Log transform batch',
        code: `
            console.log('Transform batch completed', {
                pipelineId: context.pipelineId,
                runId: context.runId,
                stage: context.stage,
                recordCount: records.length,
            });
            return records;
        `,
    }],
})
```

## Network Optimization

Optimize network requests and API calls.

### Connection Reuse

```typescript
// Reuse centrally managed endpoint and authentication settings
.extract('fetch-api', {
    adapterCode: 'httpApi',
    connectionCode: 'external-api',
})
```

### Compression

```typescript
// Enable compression for large payloads
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/data',
    headers: {
        'Accept-Encoding': 'gzip, deflate',
    },
})
```

### Rate Limiting

`rateLimitRps` paces load-batch starts, not HTTP extraction requests. The
following configuration starts REST load batches at least 200 milliseconds
apart across all workers:

```typescript
.load('push-api', {
    adapterCode: 'restPost',
    endpoint: 'https://api.example.com/products',
    method: 'POST',
    batchMode: 'array',
    maxBatchSize: 100,
    throughput: {
        batchSize: 100,
        concurrency: 1,
        rateLimitRps: 5,
    },
})
```

The built-in HTTP extractor follows pages sequentially and adaptively backs off
after `429` or `503` responses. It does not currently expose a proactive
requests-per-second limiter in the pipeline execution path.

### Retry with Backoff

```typescript
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
})

.context({
    errorHandling: {
        maxRetries: 5,
        retryDelayMs: 1000,
        maxRetryDelayMs: 60000,
        backoffMultiplier: 2,  // Exponential backoff
    },
})
```

## Monitoring and Profiling

Track performance metrics and identify bottlenecks.

### Pipeline Metrics

Monitor via the Analytics dashboard or GraphQL API:

```graphql
query PipelinePerformance {
  dataHubPipelinePerformance(
    pipelineId: "pipeline-1"
    timeRange: "30d"
    limit: 100
  ) {
    pipelineId
    pipelineCode
    pipelineName
    totalRuns
    successfulRuns
    failedRuns
    avgDurationMs
    p50DurationMs
    p95DurationMs
    p99DurationMs
  }
}
```

`dataHubPipelinePerformance` returns a list. `timeRange` is a string such as
`"1h"`, `"24h"`, `"7d"`, `"30d"`, or `"90d"`; it is not a date-range input
object.

### Step Boundary Diagnostics

Hook contexts do not expose step start times or a logger. Use run analytics and
persisted logs for duration measurements. For boundary diagnostics, use `LOG`
actions or the sandbox console with the serializable `HookContext` fields:

```typescript
.hooks({
    BEFORE_TRANSFORM: [{
        type: 'LOG',
        level: 'INFO',
        message: 'Starting transform step',
    }],
    AFTER_TRANSFORM: [{
        type: 'INTERCEPTOR',
        name: 'Log transform completion',
        code: `
            console.log('Transform step completed', {
                pipelineId: context.pipelineId,
                runId: context.runId,
                stage: context.stage,
                recordCount: records.length,
            });
            return records;
        `,
    }],
})
```

### Custom Metrics

Interceptor and registered-script hook contexts do not expose the Nest service
container, `DomainEventsService`, or a pipeline code. Export custom metrics from
host application instrumentation or an external collector; use the Analytics
API above for Data Hub's persisted run metrics.

### OTLP/OpenTelemetry Export

The optional `DataHubPlugin.init({ telemetry: ... })` setting exports the
logger's in-memory metrics and completed spans as OTLP/HTTP JSON. The configured
endpoint is a collector base URL; Data Hub sends to `/v1/metrics` and
`/v1/traces`.

```typescript
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (!otlpEndpoint) {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is required');
}
const otlpCaFile = process.env.OTEL_EXPORTER_OTLP_CERTIFICATE;
const otlpClientCertificateFile = process.env.OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE;
const otlpClientKeyFile = process.env.OTEL_EXPORTER_OTLP_CLIENT_KEY;

DataHubPlugin.init({
    telemetry: {
        endpoint: otlpEndpoint,
        serviceName: 'vendure-data-hub-worker',
        serviceVersion: '0.1.8',
        environment: process.env.NODE_ENV,
        exportIntervalMs: 30_000,
        requestTimeoutMs: 5_000,
        maxQueueSize: 2_048,
        maxBatchSize: 256,
        maxRequestBodyBytes: 64 * 1_024 * 1_024,
        tls: otlpCaFile || otlpClientCertificateFile || otlpClientKeyFile ? {
            caFile: otlpCaFile,
            clientCertificateFile: otlpClientCertificateFile,
            clientKeyFile: otlpClientKeyFile,
        } : undefined,
    },
})
```

Metric values are cumulative from process startup. A registry retains at most
500 metric names. Label series remain separate, but each retained metric keeps
at most 1,000 series and each histogram series keeps at most 1,000 recent
samples for local percentile diagnostics. OTLP histogram summaries export
cumulative count and sum; sliding-window quantiles are not emitted as
process-lifetime quantiles. These values are not a cluster-wide aggregate:
every API and worker process exports its own resource.

Completed spans enter a bounded in-memory queue without network I/O. Background
flushes send at most `maxBatchSize` spans per request. A full queue drops new
spans. Each span retains its first 128 events and reports later events through
OTLP `droppedEventsCount`. Retryable transport failures are requeued within the
configured bound and retried with exponential backoff and jitter; collector
`Retry-After` guidance takes precedence. Permanent HTTP failures are dropped.
Requests larger than `maxRequestBodyBytes` are rejected before collector I/O;
oversized trace batches are dropped. An OTLP
partial-success response is reported without retrying data the collector already
accepted. Graceful shutdown drains every remaining batch while exports make
queue progress and stops when an export leaves the queue unchanged. Collector
timeouts, invalid responses, and non-success HTTP responses do not fail pipeline
execution.

Only allowlisted scalar operational attributes are exported. Record bodies,
configuration objects, credentials, user identifiers, error messages, and
stacks are excluded. Authentication headers are never written to Data Hub
logs; load them from the deployment environment rather than committing them.
Private CA and client-certificate files are scoped to the collector transport;
the paired client certificate and key enable mTLS without changing global Node
TLS verification. Protect and rotate those files as deployment secrets.
The Dashboard's persisted run analytics remain independent of this
process-local telemetry stream.

## Common Bottlenecks

Identify and resolve performance issues.

### Symptom: Slow Extraction

**Problem:** Extracting data takes too long

**Solutions:**

```typescript
// 1. Increase pagination/batch size
.extract('fetch-api', {
    pagination: { limit: 500 },  // Was 100
})

// 2. Use incremental database extraction
.extract('fetch-updates', {
    adapterCode: 'database',
    connectionCode: 'db',
    databaseType: 'POSTGRESQL',
    query: 'SELECT id, sku, updated_at FROM products',
    incremental: {
        enabled: true,
        column: 'updated_at',
    },
    pagination: {
        enabled: true,
        type: 'CURSOR',
        pageSize: 1000,
        cursorColumn: 'updated_at',
        cursorTieBreakerColumn: 'id',
    },
})

// 3. Bound pagination while profiling
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    pagination: {
        type: 'PAGE',
        limit: 500,
        maxPages: 20,
    },
})

// 4. Use database connection pooling
.extract('query-db', {
    adapterCode: 'database',
    connectionCode: 'db',  // Uses pool
    databaseType: 'POSTGRESQL',
    query: 'SELECT id, sku FROM products ORDER BY id',
})
```

### Symptom: Slow Transforms

**Problem:** Transform step is bottleneck

**Solutions:**

```typescript
// 1. Remove unnecessary operators
.transform('process', {
    operators: [
        // Only essential transforms
        { op: 'rename', args: { from: 'old', to: 'new' } },
    ],
})

// 2. Move complex logic to a registered custom operator
// (compiled code is faster than multiple small operators)
```

Transform steps do not currently consume `throughput.batchSize` or
`throughput.concurrency`. Use graph-level parallelism only for independent
steps, and benchmark custom operators for CPU-heavy work.

### Symptom: Slow Database Writes

**Problem:** Load step takes too long

**Solutions:**

```typescript
// 1. Reduce batch size (counterintuitive but helps)
.load('upsert', {
    throughput: { batchSize: 20 },  // Was 100
})

// 2. Limit concurrency
.load('upsert', {
    throughput: {
        batchSize: 50,
        concurrency: 2,  // Was 4
    },
})

// 3. Use appropriate strategy
.load('upsert', {
    strategy: 'CREATE',  // Faster than UPSERT if records are new
})

// 4. Reduce relations loaded
.load('upsert', {
    adapterCode: 'productUpsert',
    config: {
        loadRelations: false,  // Don't load unnecessary relations
    },
})

// 5. Use MERGE instead of SOURCE_WINS
.load('upsert', {
    conflictStrategy: 'MERGE',  // Only updates changed fields
})
```

### Symptom: High Memory Usage

**Problem:** Pipeline runs out of memory

**Solutions:**

```typescript
// 1. Limit loader work in flight
.context({
    throughput: { batchSize: 100 },  // Was 1000
})

// 2. Reduce concurrency
.context({
    throughput: { concurrency: 2 },  // Was 8
})

// 3. Avoid buffering operators
// (deduplicate, sort, groupBy)

```

Context throughput changes only loader invocation size and concurrency. The
pipeline executor still holds extracted records in memory, so these settings do
not turn extraction or transforms into streaming operations.

### Symptom: Rate Limit Errors

**Problem:** External API returns 429 errors

**Solutions:**

```typescript
// 1. Pace outbound REST load batches
.load('push-api', {
    adapterCode: 'restPost',
    endpoint: 'https://api.example.com/products',
    method: 'POST',
    batchMode: 'array',
    throughput: {
        batchSize: 100,
        concurrency: 1,
        rateLimitRps: 5,
    },
})

// 2. Configure HTTP extraction retries
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    retry: {
        maxAttempts: 5,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
    },
})

// 3. Bound each page and the total page count
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    pagination: {
        type: 'PAGE',
        limit: 100,
        maxPages: 10,
    },
})
```

## Best Practices

### 1. Start Conservative, Then Optimize

```typescript
// Initial load defaults
.context({
    throughput: {
        batchSize: 100,
        concurrency: 2,
    },
})

// After profiling loaders, increase gradually
.context({
    throughput: {
        batchSize: 500,      // 5x increase
        concurrency: 4,      // 2x increase
    },
})
```

### 2. Profile Before Optimizing

```typescript
// Add timing hooks to identify bottlenecks
.hooks({
    AFTER_EXTRACT: [{ type: 'LOG', level: 'INFO', message: 'Extract done' }],
    AFTER_TRANSFORM: [{ type: 'LOG', level: 'INFO', message: 'Transform done' }],
    AFTER_VALIDATE: [{ type: 'LOG', level: 'INFO', message: 'Validate done' }],
    AFTER_LOAD: [{ type: 'LOG', level: 'INFO', message: 'Load done' }],
})

// Review logs to find slowest steps
```

### 3. Use the Component's Active Batch Control

| Operation type | Active setting |
|----------------|----------------|
| HTTP extraction | `pagination.limit` |
| Database extraction | `pagination.pageSize` |
| Load execution | `throughput.batchSize` |
| Search sinks | `batchSize` |
| File parsing | No pipeline throughput control; the parser reads the uploaded file |
| Transform and validation | No per-step throughput control |

### 4. Choose an Extractor with Durable Cursor Support

For restartable ingestion, use an extractor that documents a persisted offset or
incremental cursor. A checkpoint cannot avoid the initial in-memory parse of an
uploaded CSV, JSON, XML, or XLSX file.

### 5. Monitor Error Rates

```typescript
.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: {
        pauseOnErrorRate: {
            threshold: 0.05,     // Pause at 5% error rate
            intervalSec: 60,
        },
        drainStrategy: 'BACKOFF',
    },
})
```

### 6. Configure Message Dead Letters at the Trigger

MESSAGE triggers own their retry limit and dead-letter destination. Record-level
errors are stored for inspection and replay; alerting is built externally from
logs, events, metrics, or webhook hooks.

### 7. Optimize for Common Case

```typescript
// If 90% of records are new, use CREATE
.load('upsert', {
    strategy: 'CREATE',  // Faster than UPSERT
})

// If most records exist, use UPDATE
.load('upsert', {
    strategy: 'UPDATE',
})

// Mixed? Use UPSERT with MERGE
.load('upsert', {
    strategy: 'UPSERT',
    conflictStrategy: 'MERGE',
})
```

### 8. Scale Horizontally

```typescript
// Run multiple pipeline instances with data partitioning
.extract('fetch-api', {
    url: 'https://api.example.com/products',
    query: {
        // Partition by ID range
        minId: process.env.PARTITION_MIN,
        maxId: process.env.PARTITION_MAX,
    },
})
```

### 9. Use Caching for Lookups

```typescript
// Cache HTTP lookups
.transform('enrich', {
    operators: [{
        op: 'httpLookup',
        args: {
            url: 'https://api.example.com/lookup/{{sku}}',
            target: 'enrichedData',
            cacheTtlSec: 3600,
        },
    }],
})
```

### 10. Optimize Network Round Trips

```typescript
// Bad: N+1 queries
.extract('products', { /* ... */ })
.transform('enrich', {
    operators: [
        { op: 'httpLookup', args: { url: '/prices/{{id}}' } },  // 1 request per record
    ],
})

// Good: Batch request
.extract('products', { /* ... */ })
.enrich('fetch-prices', {
    sourceType: 'HTTP',
    url: '/prices/batch',  // Single batch request
    keyField: 'id',
    target: 'priceData',
})
```

## Performance Checklist

Before deploying to production:

- [ ] Configure extractor pagination, load throughput, and sink batches separately
- [ ] Configure graph parallelism and load-batch concurrency separately
- [ ] Account for external API quotas; load pacing does not throttle extraction
- [ ] Verify that long-running extractors persist the cursor needed for restart
- [ ] Configure error handling and retries
- [ ] Set up monitoring and alerting
- [ ] Test with production data volumes
- [ ] Profile and identify bottlenecks
- [ ] Optimize slowest steps
- [ ] Test failure scenarios and recovery
- [ ] Configure database connection pools
- [ ] Set memory limits and test for leaks
- [ ] Document performance characteristics
- [ ] Set up automated performance testing

## See Also

- [Configuration Guide](./configuration.md) - Plugin configuration options
- [Monitoring Guide](../user-guide/monitoring.md) - Metrics and alerting
- [Troubleshooting Guide](./troubleshooting.md) - Common issues
- [Architecture Overview](../developer-guide/architecture.md) - Execution model
