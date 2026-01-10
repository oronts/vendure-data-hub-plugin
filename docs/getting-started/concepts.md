# Core Concepts

Understanding these concepts will help you build effective data pipelines.

## Pipeline

A pipeline is a complete data flow definition. It contains:

- **Steps** - Individual operations (extract, transform, load)
- **Edges** - Connections between steps defining execution order
- **Configuration** - Scheduling, hooks, and metadata

```typescript
{
    version: 1,
    steps: [...],
    edges: [...],
    context: { ... },
    capabilities: { ... },
    hooks: { ... },
}
```

## Steps

Steps are the building blocks of a pipeline. Each step has:

- **Key** - Unique identifier within the pipeline
- **Type** - The step category (trigger, extract, transform, load, etc.)
- **Config** - Step-specific configuration

### Step Types

| Type | Purpose |
|------|---------|
| `trigger` | Defines how the pipeline starts (manual, schedule, webhook, event) |
| `extract` | Pulls data from external sources |
| `transform` | Modifies, validates, or enriches data |
| `validate` | Validates records against rules or schemas |
| `enrich` | Adds data from external lookups |
| `route` | Splits data flow based on conditions |
| `load` | Creates or updates Vendure entities |
| `export` | Sends data to external destinations |
| `feed` | Generates product feeds (Google, Meta, etc.) |
| `sink` | Indexes data to search engines |

## Edges

Edges connect steps to define execution order:

```typescript
{
    from: 'extract-step',
    to: 'transform-step',
    branch: 'optional-branch-name'  // For routing
}
```

Data flows from the `from` step to the `to` step. Multiple edges can originate from one step (fan-out) and multiple edges can target one step (fan-in).

## Records

A record is a single data item flowing through the pipeline. Records are typically JSON objects:

```json
{
    "id": "123",
    "name": "Product Name",
    "price": 29.99,
    "category": "Electronics"
}
```

Records are processed individually through transform and load steps. Extractors typically yield multiple records from a single source.

## Adapters

Adapters are reusable components that perform specific operations:

| Adapter Type | Purpose |
|--------------|---------|
| Extractor | Connects to data sources and yields records |
| Operator | Transforms individual record fields |
| Loader | Creates or updates Vendure entities |
| Exporter | Writes data to external destinations |
| Feed Generator | Creates product feed files |
| Search Sink | Indexes data to search engines |

## Connections

Connections store reusable configuration for external systems:

- Database connections (PostgreSQL, MySQL, etc.)
- API endpoints with authentication
- Cloud storage (S3, GCS)
- FTP/SFTP servers

Connections are referenced by code in extract and export steps:

```typescript
.extract('fetch-api', {
    adapterCode: 'rest',
    connectionCode: 'my-api',  // References saved connection
    endpoint: '/products',
})
```

## Secrets

Secrets store sensitive values like API keys and passwords. They are:

- Encrypted at rest
- Never logged or exposed in API responses
- Referenced by code in step configurations

```typescript
.extract('api-call', {
    adapterCode: 'rest',
    endpoint: 'https://api.example.com/products',
    bearerTokenSecretCode: 'api-key',  // References saved secret
})
```

## Pipeline Runs

A run is a single execution of a pipeline. Each run tracks:

- **Status** - Running, completed, failed, cancelled
- **Timing** - Start time, end time, duration
- **Metrics** - Records processed, records failed
- **Logs** - Execution logs for debugging
- **Checkpoints** - Progress markers for resumption

## Checkpoints

Checkpoints allow a failed pipeline to resume from the last successful record instead of starting over. The plugin automatically saves checkpoint data when:

- A batch of records is successfully processed
- A step completes

If a run fails, rerunning the pipeline will skip already-processed records.

## Throughput

Control how records flow through steps:

```typescript
{
    throughput: {
        batchSize: 100,      // Process 100 records at a time
        concurrency: 4,      // Process 4 batches in parallel
        rateLimit: 10,       // Max 10 operations per second
        retryCount: 3,       // Retry failed records 3 times
        retryDelay: 1000,    // Wait 1 second between retries
    }
}
```

## Load Strategies

When loading entities, choose a strategy:

| Strategy | Behavior |
|----------|----------|
| `create` | Only create new records; skip if exists |
| `update` | Only update existing records; skip if not found |
| `upsert` | Create new or update existing records |

## Channel Strategy

When loading to Vendure, control channel assignment:

| Strategy | Behavior |
|----------|----------|
| `assign` | Add to specified channel(s) |
| `replace` | Remove from all channels, add to specified |
| `skip` | Don't modify channel assignments |

## Validation

Records can be validated at multiple points:

1. **In transform steps** - Using validation operators
2. **In validate steps** - Using schema validation
3. **In load steps** - Before entity creation

Invalid records are quarantined for review and can be:
- Fixed and retried
- Skipped
- Deleted

## Error Handling

When a record fails:

1. The error is logged with full context
2. The record is quarantined (saved with error details)
3. The pipeline continues processing remaining records
4. After completion, you can review and retry failed records

## Execution Flow

1. **Trigger** - Pipeline execution starts
2. **Extract** - Data is pulled from source(s)
3. **Transform** - Each record is modified
4. **Validate** - Records are checked (optional)
5. **Route** - Records are directed to different branches (optional)
6. **Load/Export/Feed/Sink** - Data is written to destination(s)
7. **Complete** - Run ends with success or partial failure

## Next Steps

- [User Guide](../user-guide/README.md) - Build pipelines with the visual editor
- [Developer Guide](../developer-guide/README.md) - Use the code-first DSL
- [Reference](../reference/README.md) - Complete adapter documentation
