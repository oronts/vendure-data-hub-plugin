# Architecture Overview

Understanding the plugin architecture helps you use it effectively and extend it.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Admin UI                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │ Pipeline     │  │ Connections  │  │ Runs / Logs /        │  │
│   │ Builder      │  │ & Secrets    │  │ Analytics            │  │
│   └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GraphQL
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Vendure Server                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    DataHub Plugin                           │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │ GraphQL     │  │ Job Queue   │  │ Webhook             │ │ │
│  │  │ Resolvers   │  │ Handlers    │  │ Controllers         │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  │         │                │                  │               │ │
│  │         ▼                ▼                  ▼               │ │
│  │  ┌────────────────────────────────────────────────────────┐│ │
│  │  │              Pipeline Runner Service                    ││ │
│  │  │                                                        ││ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ ││ │
│  │  │  │ Extract  │  │Transform │  │ Validate │  │  Load  │ ││ │
│  │  │  │ Executor │  │ Executor │  │ Executor │  │Executor│ ││ │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ ││ │
│  │  │         │            │             │            │      ││ │
│  │  │         ▼            ▼             ▼            ▼      ││ │
│  │  │  ┌──────────────────────────────────────────────────┐ ││ │
│  │  │  │              Adapter Registry                     │ ││ │
│  │  │  │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │ ││ │
│  │  │  │  │Extractors│  │Operators │  │    Loaders      │ │ ││ │
│  │  │  │  └──────────┘  └──────────┘  └─────────────────┘ │ ││ │
│  │  │  └──────────────────────────────────────────────────┘ ││ │
│  │  └────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │  ┌────────────────────────────────────────────────────────┐│ │
│  │  │                     Services                            ││ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ ││ │
│  │  │  │ Pipeline │  │ Secrets  │  │Connection│  │ Logging│ ││ │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ ││ │
│  │  └────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Database (TypeORM)                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │
│  │  │ Pipeline │  │  Runs    │  │ Secrets  │  │ Connections│ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Plugin Entry Point

`DataHubPlugin` is the main plugin class that registers:

- Database entities
- Service providers
- GraphQL schema extensions
- Admin UI extension
- Job queue handlers
- HTTP controllers

### Entities

| Entity | Purpose |
|--------|---------|
| `Pipeline` | Pipeline definitions |
| `PipelineRun` | Execution history |
| `PipelineRevision` | Version history |
| `PipelineLog` | Execution logs |
| `DataHubConnection` | External connections |
| `DataHubSecret` | Encrypted credentials |
| `DataHubSettings` | Plugin configuration |
| `DataHubRecordError` | Failed records |
| `PipelineCheckpointEntity` | Resume checkpoints |

### Services

| Service | Responsibility |
|---------|----------------|
| `PipelineService` | CRUD operations for pipelines |
| `PipelineRunnerService` | Orchestrates pipeline execution |
| `AdapterRuntimeService` | Executes adapters |
| `SecretService` | Manages secrets |
| `ConnectionService` | Manages connections |
| `CheckpointService` | Manages checkpoints |
| `PipelineLogService` | Writes execution logs |
| `AnalyticsService` | Aggregates metrics |
| `RecordErrorService` | Manages failed records |

### Executors

Step-type-specific execution logic:

| Executor | Step Types |
|----------|------------|
| `ExtractExecutor` | extract |
| `TransformExecutor` | transform, validate, enrich |
| `LoadExecutor` | load |
| `ExportExecutor` | export |
| `FeedExecutor` | feed |
| `SinkExecutor` | sink |

### Adapter Registry

The registry manages all adapters:

```typescript
// Extractors
registry.registerExtractor('http-api', HttpApiExtractor);
registry.registerExtractor('database', DatabaseExtractor);

// Operators
registry.registerOperator('rename', renameOperator);
registry.registerOperator('set', setOperator);

// Loaders
registry.registerLoader('product', ProductLoader);
registry.registerLoader('customer', CustomerLoader);
```

## Execution Flow

### 1. Trigger

A pipeline run starts when:
- User clicks "Run" in UI
- GraphQL mutation is called
- Scheduled job fires
- Webhook receives request
- Vendure event occurs

### 2. Job Queue

Runs are processed via Vendure's job queue:

```typescript
await jobQueue.add({
    type: 'data-hub-run',
    pipelineId: pipeline.id,
    triggeredBy: 'manual',
});
```

### 3. Pipeline Runner

The runner orchestrates execution:

1. Load pipeline definition
2. Resolve step dependencies
3. Execute steps in order
4. Track progress and checkpoints
5. Handle errors and retries
6. Record final status

### 4. Step Execution

For each step:

1. Get the appropriate executor
2. Resolve adapter from registry
3. Execute with configuration
4. Collect output records
5. Pass to next step(s)

### 5. Record Processing

Records flow through steps:

```
Extract → [record1, record2, ...] → Transform → Load
```

Each step can:
- Modify records
- Filter records (skip)
- Add records (fan-out)
- Fail records (quarantine)

## Data Flow

### Pipeline Definition

```typescript
{
    version: 1,
    steps: [
        { key: 'extract', type: 'extract', config: {...} },
        { key: 'transform', type: 'transform', config: {...} },
        { key: 'load', type: 'load', config: {...} },
    ],
    edges: [
        { from: 'extract', to: 'transform' },
        { from: 'transform', to: 'load' },
    ],
}
```

### Execution Context

Each run has a context:

```typescript
{
    runId: string;
    pipelineId: string;
    startedAt: Date;
    triggeredBy: string;
    parameters: Record<string, any>;
    variables: Record<string, any>;
    checkpoint: CheckpointData;
}
```

### Record Format

Records are JSON objects:

```typescript
interface Record {
    [key: string]: JsonValue;
    _meta?: {
        sourceStep: string;
        index: number;
        hash?: string;
    };
}
```

## Extension Points

### Custom Extractors

Implement the `DataExtractor` interface:

```typescript
interface DataExtractor {
    code: string;
    name: string;
    extract(ctx: RequestContext, config: JsonObject): AsyncGenerator<JsonObject>;
}
```

### Custom Operators

Create operator definitions:

```typescript
interface OperatorDefinition {
    code: string;
    name: string;
    execute(ctx: RequestContext, record: JsonObject, args: JsonObject): JsonObject | null;
}
```

### Custom Loaders

Implement entity loading:

```typescript
interface EntityLoader {
    code: string;
    entityType: string;
    load(ctx: RequestContext, records: JsonObject[], config: LoadConfig): Promise<LoadResult>;
}
```

See [Extending the Plugin](./extending/README.md) for details.

## Configuration Sync

Code-first configurations are synced on startup:

1. Plugin loads options from `DataHubPlugin.init()`
2. Pipelines, secrets, connections are compared with database
3. New items are created
4. Existing items are updated if code-first takes precedence
5. UI shows code-first items as read-only

## Security

### Permissions

Custom permissions protect operations:

```typescript
@Allow(DataHubPipelinePermission.Read)
@Query()
dataHubPipelines() { ... }

@Allow(RunDataHubPipelinePermission)
@Mutation()
runDataHubPipeline() { ... }
```

### Secret Encryption

Secrets are encrypted at rest using Vendure's encryption utilities.

### Webhook Signatures

Webhook requests can be verified with HMAC signatures.

## Performance Considerations

### Batch Processing

Records are processed in batches:

```typescript
{
    throughput: {
        batchSize: 100,
        concurrency: 4,
    }
}
```

### Checkpointing

Long runs save progress periodically:
- Resume from last checkpoint on failure
- Avoid reprocessing completed records

### Job Queue

Pipeline runs use the job queue:
- Distributed processing
- Retry handling
- Worker scaling
