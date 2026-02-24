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

### Typical Performance Metrics

| Operation | Records/Second | Notes |
|-----------|----------------|-------|
| File Extraction (CSV) | 10,000-50,000 | Depends on file size, parsing complexity |
| HTTP API Extraction | 100-1,000 | Limited by rate limits, pagination |
| Database Extraction | 5,000-20,000 | Depends on query complexity, indexes |
| Transform Operations | 50,000-200,000 | Pure operations are fastest |
| Validation | 20,000-100,000 | Schema validation is slowest |
| Product Upsert | 50-200 | Vendure entity complexity, relations |
| Variant Upsert | 100-500 | Simpler than products |
| Customer Upsert | 200-800 | Moderate complexity |
| Search Indexing | 1,000-10,000 | Bulk operations are efficient |

### Performance Factors

1. **Step Configuration** - Batch size, concurrency, rate limits
2. **Data Volume** - Number of records, record size
3. **Operation Complexity** - Transforms, validations, database writes
4. **External Dependencies** - API rate limits, database performance
5. **Infrastructure** - CPU, memory, network bandwidth
6. **Vendure Load** - Concurrent operations, database connections

## Throughput Configuration

Control processing speed and resource usage with throughput settings.

### Global Throughput

Set defaults in pipeline context:

```typescript
createPipeline()
    .context({
        throughput: {
            batchSize: 100,        // Records per batch
            concurrency: 4,        // Parallel batches
            rateLimitRps: 10,      // Requests per second
            drainStrategy: 'BACKOFF',
        },
    })
```

### Step-Level Throughput

Override for specific steps:

```typescript
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    throughput: {
        batchSize: 50,      // Smaller batches for API
        rateLimitRps: 5,    // Respect API rate limit
    },
})

.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: {
        batchSize: 20,      // Smaller batches for complex writes
        concurrency: 2,     // Limit parallel database writes
    },
})
```

### Throughput Parameters

```typescript
interface Throughput {
    // Records per batch (default: 100)
    // Higher = more throughput, more memory
    // Lower = less memory, better error isolation
    batchSize?: number;

    // Parallel batch processing (default: 1)
    // Higher = more throughput, more CPU/memory
    // Should be ≤ CPU cores
    concurrency?: number;

    // Maximum requests per second (default: unlimited)
    // Prevents overwhelming external APIs
    rateLimitRps?: number;

    // Strategy when processing queue is full
    drainStrategy?: 'BACKOFF' | 'SHED' | 'QUEUE';

    // Pause on high error rate
    pauseOnErrorRate?: {
        threshold: number;      // 0-1 (0.05 = 5%)
        intervalSec: number;    // Check interval
    };
}
```

### Drain Strategies

```typescript
// BACKOFF - Slow down when queue is full (default)
drainStrategy: 'BACKOFF'  // Reduces throughput temporarily

// SHED - Drop records when overloaded (use with caution)
drainStrategy: 'SHED'     // May lose data

// QUEUE - Buffer records in memory (can cause OOM)
drainStrategy: 'QUEUE'    // Unlimited buffering
```

## Batch Processing

Optimize batch sizes for different operation types.

### Recommended Batch Sizes

```typescript
// File extraction - Large batches
.extract('parse-csv', {
    adapterCode: 'file',
    format: 'CSV',
    throughput: { batchSize: 1000 },
})

// API extraction - Respect pagination
.extract('fetch-api', {
    adapterCode: 'httpApi',
    throughput: { batchSize: 100 },
})

// Pure transforms - Large batches
.transform('normalize', {
    operators: [/* pure operations */],
    throughput: { batchSize: 5000 },
})

// Database writes - Small batches
.load('upsert-products', {
    adapterCode: 'productUpsert',
    throughput: { batchSize: 20 },
})

// Search indexing - Medium batches
.sink('index-search', {
    adapterCode: 'meilisearch',
    bulkSize: 500,
})
```

### Dynamic Batch Sizing

Adjust batch size based on data characteristics:

```typescript
.hooks({
    AFTER_EXTRACT: [{
        type: 'INTERCEPTOR',
        name: 'Adjust batch size',
        code: `
            // Larger records = smaller batches
            const avgSize = records.reduce((sum, r) =>
                sum + JSON.stringify(r).length, 0) / records.length;

            if (avgSize > 10000) {
                context.throughput.batchSize = 50;
            } else if (avgSize > 5000) {
                context.throughput.batchSize = 100;
            } else {
                context.throughput.batchSize = 500;
            }

            return records;
        `,
    }],
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

```typescript
// CPU-bound operations (transforms, validation)
.transform('heavy-processing', {
    throughput: {
        concurrency: 4,  // ≈ CPU cores
    },
})

// I/O-bound operations (API calls, database)
.extract('api-calls', {
    throughput: {
        concurrency: 16,  // Can be > CPU cores
    },
})

// Database writes
.load('upsert-entities', {
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
    relations: 'variants,featuredAsset',  // Only what's needed
    batchSize: 500,
})

// Use indexes for lookups
.load('upsert-products', {
    adapterCode: 'productUpsert',
    matchField: 'slug',  // Indexed field
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
    query: 'SELECT * FROM products WHERE updated_at > :checkpoint',
    incremental: {
        enabled: true,
        field: 'updated_at',
    },
    throughput: { batchSize: 1000 },
})

// Use indexed columns in WHERE clauses
.extract('fetch-products', {
    adapterCode: 'database',
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

### Streaming Mode

```typescript
// Enable streaming for large files
.extract('parse-large-csv', {
    adapterCode: 'file',
    path: '/data/large-file.csv',
    format: 'CSV',
    throughput: {
        batchSize: 1000,    // Process in chunks
    },
})
// Note: Extractors use async generators (already streaming)
```

### Memory-Efficient Operators

```typescript
// Avoid operators that buffer all records
.transform('process', {
    operators: [
        // Good: operates record-by-record
        { op: 'rename', args: { from: 'old', to: 'new' } },
        { op: 'set', args: { path: 'status', value: 'active' } },

        // Avoid: requires loading all records
        // { op: 'deduplicate', args: { field: 'sku' } },
        // { op: 'sort', args: { field: 'name' } },
    ],
})
```

### Checkpointing for Large Datasets

```typescript
.context({
    checkpointing: {
        enabled: true,
        strategy: 'COUNT',
        intervalRecords: 5000,  // Checkpoint every 5K records
    },
})
```

### Memory Monitoring

```typescript
.hooks({
    AFTER_TRANSFORM: [{
        type: 'INTERCEPTOR',
        name: 'Monitor memory',
        code: `
            const used = process.memoryUsage();
            const usedMB = Math.round(used.heapUsed / 1024 / 1024);

            if (usedMB > 1024) {  // > 1GB
                context.logger.warn(\`High memory usage: \${usedMB}MB\`);

                // Trigger garbage collection if needed
                if (global.gc) {
                    global.gc();
                }
            }

            return records;
        `,
    }],
})
```

## Network Optimization

Optimize network requests and API calls.

### Connection Reuse

```typescript
// Use connection pooling for HTTP clients
.extract('fetch-api', {
    adapterCode: 'httpApi',
    connectionCode: 'external-api',  // Reuses HTTP agent
    throughput: {
        concurrency: 10,  // Reuse connections
    },
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

```typescript
// Respect API rate limits
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    throughput: {
        rateLimitRps: 5,        // 5 requests/second
        batchSize: 100,         // Request 100 items at a time
    },
    pagination: {
        type: 'PAGE',
        limit: 100,
    },
})
```

### Retry with Backoff

```typescript
.extract('fetch-api', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    throughput: {
        rateLimitRps: 10,
    },
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
query {
  dataHubPipelinePerformance(
    pipelineId: "pipeline-1"
    timeRange: {
      from: "2024-01-01T00:00:00Z"
      to: "2024-01-31T23:59:59Z"
      intervalMinutes: 60
    }
  ) {
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

### Step-Level Profiling

```typescript
.hooks({
    BEFORE_TRANSFORM: [{
        type: 'LOG',
        level: 'INFO',
        message: 'Starting transform step',
    }],
    AFTER_TRANSFORM: [{
        type: 'INTERCEPTOR',
        name: 'Profile step',
        code: `
            const duration = Date.now() - context.startTime;
            const recordsPerSec = Math.round(records.length / (duration / 1000));

            context.logger.info(\`Transform completed: \${records.length} records in \${duration}ms (\${recordsPerSec} rec/sec)\`);

            return records;
        `,
    }],
})
```

### Custom Metrics

```typescript
import { DomainEventsService } from '@oronts/vendure-data-hub-plugin';

// Emit custom metrics
.hooks({
    AFTER_LOAD: [{
        type: 'SCRIPT',
        scriptName: 'emitMetrics',
    }],
})

// Register script
DataHubPlugin.init({
    scripts: {
        emitMetrics: async (records, context) => {
            const events = context.services.get(DomainEventsService);

            events.publish({
                type: 'CUSTOM_METRIC',
                payload: {
                    pipeline: context.pipelineCode,
                    step: context.stepKey,
                    recordCount: records.length,
                    timestamp: new Date(),
                },
            });

            return records;
        },
    },
})
```

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

// 2. Use incremental extraction
.extract('fetch-api', {
    incremental: {
        enabled: true,
        field: 'updated_at',
    },
})

// 3. Parallel API calls
.extract('fetch-api', {
    throughput: {
        concurrency: 10,  // Was 1
    },
})

// 4. Use database connection pooling
.extract('query-db', {
    adapterCode: 'database',
    connectionCode: 'db',  // Uses pool
})
```

### Symptom: Slow Transforms

**Problem:** Transform step is bottleneck

**Solutions:**

```typescript
// 1. Increase batch size
.transform('process', {
    throughput: { batchSize: 5000 },  // Was 100
})

// 2. Remove unnecessary operators
.transform('process', {
    operators: [
        // Only essential transforms
        { op: 'rename', args: { from: 'old', to: 'new' } },
    ],
})

// 3. Use parallel processing
.transform('process', {
    throughput: {
        concurrency: 4,
        batchSize: 1000,
    },
})

// 4. Move complex logic to custom operator
// (compiled code is faster than multiple small operators)
```

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
// 1. Reduce batch sizes
.context({
    throughput: { batchSize: 100 },  // Was 1000
})

// 2. Enable checkpointing
.context({
    checkpointing: {
        enabled: true,
        intervalRecords: 1000,
    },
})

// 3. Reduce concurrency
.context({
    throughput: { concurrency: 2 },  // Was 8
})

// 4. Avoid buffering operators
// (deduplicate, sort, groupBy)

// 5. Use streaming extractors
// (already default for file/database)
```

### Symptom: Rate Limit Errors

**Problem:** External API returns 429 errors

**Solutions:**

```typescript
// 1. Add rate limiting
.extract('fetch-api', {
    throughput: {
        rateLimitRps: 5,  // Match API limit
    },
})

// 2. Reduce concurrency
.extract('fetch-api', {
    throughput: {
        concurrency: 2,  // Fewer parallel requests
    },
})

// 3. Add retry with backoff
.context({
    errorHandling: {
        maxRetries: 5,
        retryDelayMs: 2000,
        backoffMultiplier: 2,
    },
})

// 4. Use pagination efficiently
.extract('fetch-api', {
    pagination: {
        limit: 100,      // Larger pages
        maxPages: 10,    // Limit total pages
    },
})
```

## Best Practices

### 1. Start Conservative, Then Optimize

```typescript
// Initial configuration (safe)
.context({
    throughput: {
        batchSize: 100,
        concurrency: 2,
    },
})

// After profiling, increase gradually
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

### 3. Use Appropriate Batch Sizes

| Operation Type | Recommended Batch Size |
|----------------|------------------------|
| File parsing | 1000-5000 |
| API extraction | 50-200 |
| Pure transforms | 1000-5000 |
| Database writes | 20-100 |
| Search indexing | 500-1000 |
| Validation | 100-500 |

### 4. Enable Checkpointing for Long Runs

```typescript
.context({
    checkpointing: {
        enabled: true,
        strategy: 'COUNT',
        intervalRecords: 5000,  // Checkpoint every 5K
    },
})
```

### 5. Monitor Error Rates

```typescript
.context({
    throughput: {
        pauseOnErrorRate: {
            threshold: 0.05,     // Pause at 5% error rate
            intervalSec: 60,
        },
    },
})
```

### 6. Use Dead Letter Queue

```typescript
.context({
    errorHandling: {
        deadLetterQueue: true,
        alertOnDeadLetter: true,
    },
})
```

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
            cache: true,  // Enable caching
            cacheTtl: 3600,  // 1 hour
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
    endpoint: '/prices/batch',  // Single batch request
    matchField: 'id',
})
```

## Performance Checklist

Before deploying to production:

- [ ] Set appropriate batch sizes for each step
- [ ] Configure concurrency limits
- [ ] Add rate limiting for external APIs
- [ ] Enable checkpointing for long-running pipelines
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
