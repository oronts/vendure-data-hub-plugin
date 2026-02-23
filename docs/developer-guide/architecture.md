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
| `DataHubCheckpoint` | Resume checkpoints |
| `DataHubRecordRetryAudit` | Retry audit trail |

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

The registry manages all adapters via `registerRuntime()`:

```typescript
// All adapter types use the same registration method
registry.registerRuntime(httpApiExtractor);
registry.registerRuntime(databaseExtractor);
registry.registerRuntime(renameOperator);
registry.registerRuntime(setOperator);
registry.registerRuntime(productLoader);
registry.registerRuntime(customerLoader);
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

Implement the `ExtractorAdapter` interface:

```typescript
interface ExtractorAdapter {
    readonly type: 'EXTRACTOR';
    code: string;
    name: string;
    extract(context: ExtractContext, config: JsonObject): AsyncGenerator<RecordEnvelope>;
}
```

### Custom Operators

Create operator definitions:

```typescript
interface SingleRecordOperator<TConfig = JsonObject> {
    readonly type: 'OPERATOR';
    readonly pure: boolean;
    applyOne(record: JsonObject, config: TConfig, helpers: AdapterOperatorHelpers): JsonObject | null;
}
```

### Custom Loaders

Implement entity loading:

```typescript
interface LoaderAdapter<TConfig = JsonObject> {
    readonly type: 'LOADER';
    load(context: LoadContext, config: TConfig, records: readonly JsonObject[]): Promise<LoadResult>;
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

## Enterprise Architecture

### DAG-Based Workflow Engine

Pipelines execute as Directed Acyclic Graphs (DAGs):

```
┌─────────┐     ┌───────────┐     ┌─────────┐
│ Trigger │────▶│  Extract  │────▶│Transform│
└─────────┘     └───────────┘     └────┬────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                      ▼
              ┌───────────┐                         ┌───────────┐
              │   Route   │                         │  Enrich   │
              └─────┬─────┘                         └─────┬─────┘
           ┌───────┴───────┐                              │
           ▼               ▼                              ▼
      ┌────────┐     ┌────────┐                    ┌───────────┐
      │ Load A │     │ Load B │                    │   Sink    │
      └────────┘     └────────┘                    └───────────┘
```

Features:
- Parallel branch execution
- Conditional routing based on record data
- Fan-out/fan-in patterns
- Topological sort for dependency resolution
- Cycle detection during validation

### Distributed Locking

For multi-instance deployments:

```
┌─────────────────────────────────────────────────────────────┐
│                    Lock Backend Selection                     │
├─────────────────┬─────────────────┬─────────────────────────┤
│      Redis      │   PostgreSQL    │        Memory           │
│   (Recommended) │   (Fallback)    │   (Single Instance)     │
├─────────────────┼─────────────────┼─────────────────────────┤
│ SET NX EX       │ Advisory Locks  │ Map<string, LockToken>  │
│ Atomic ops      │ pg_try_advisory │ setTimeout cleanup      │
│ TTL expiration  │ Transaction-    │ No cluster support      │
│ Cluster support │ scoped          │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

Configuration:
```typescript
DataHubPlugin.init({
    distributedLock: {
        backend: 'redis',
        redis: { host: 'localhost', port: 6379 },
        defaultTtlMs: 30000,
        waitTimeoutMs: 5000,
    },
})
```

### Circuit Breaker

Protects external service calls:

```
         ┌─────────────────────────────────────────────┐
         │              Circuit States                  │
         ├─────────────────────────────────────────────┤
         │                                             │
         │   ┌────────┐  5 failures  ┌────────┐       │
         │   │ CLOSED │─────────────▶│  OPEN  │       │
         │   │(normal)│              │(blocked)│       │
         │   └────┬───┘              └────┬───┘       │
         │        ▲                       │           │
         │        │    ┌───────────┐      │ 30s      │
         │ 3 success   │HALF-OPEN  │◀─────┘           │
         │        └────│ (testing) │                  │
         │             └───────────┘                  │
         └─────────────────────────────────────────────┘
```

Applied to:
- HTTP API extractors
- Search engine sinks (MeiliSearch, Elasticsearch, Algolia, Typesense)
- Webhook sinks
- HTTP lookup operators

### Queue Architecture

Message queue integration for event-driven pipelines:

```
┌─────────────────────────────────────────────────────────────┐
│                    Queue Adapters                            │
├──────────────┬──────────────┬─────────────┬────────────────┤
│ RabbitMQ     │ Amazon SQS   │ Redis       │ Internal       │
│ (AMQP)       │              │ Streams     │ (BullMQ)       │
├──────────────┼──────────────┼─────────────┼────────────────┤
│ Native AMQP  │ AWS SDK      │ XREAD/XADD  │ Redis-backed   │
│ Publisher    │ Long polling │ Consumer    │ Job queue      │
│ confirms     │ Visibility   │ groups      │ Delayed jobs   │
│ Dead-letter  │ timeout      │ Pending     │ Retries        │
│ queues       │ Batch recv   │ entries     │                │
└──────────────┴──────────────┴─────────────┴────────────────┘
```

Consumer patterns:
- Manual acknowledgment for guaranteed processing
- Configurable prefetch/batch size
- Dead-letter queue for failed messages
- Consumer groups for load balancing

### Multi-Trigger Architecture

Pipelines support multiple concurrent triggers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Trigger Types                             │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│  Manual  │ Schedule │ Webhook  │  Event   │ Message Queue  │
├──────────┼──────────┼──────────┼──────────┼────────────────┤
│ UI/API   │ Cron     │ HTTP     │ Vendure  │ RabbitMQ/SQS/  │
│ trigger  │ express  │ endpoint │ events   │ Redis Streams  │
└──────────┴──────────┴──────────┴──────────┴────────────────┘
         │           │          │          │           │
         └───────────┴──────────┴──────────┴───────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Pipeline Runner │
                    └─────────────────┘
```

All triggers converge to the same execution engine, enabling:
- Unified error handling
- Consistent logging
- Shared checkpointing
- Common metrics

### Feed Generator Architecture

Product feed generation for marketing channels:

```
┌─────────────────────────────────────────────────────────────┐
│                  Feed Generation Pipeline                    │
│                                                              │
│  ┌────────────┐    ┌────────────┐    ┌──────────────────┐  │
│  │  Vendure   │───▶│ Feed       │───▶│ Format Generator │  │
│  │  Products  │    │ Filters    │    │                  │  │
│  └────────────┘    └────────────┘    │ ┌──────────────┐ │  │
│                                       │ │ Google XML  │ │  │
│                                       │ ├──────────────┤ │  │
│                                       │ │ Meta/FB     │ │  │
│                                       │ ├──────────────┤ │  │
│                                       │ │ RSS/Atom    │ │  │
│                                       │ ├──────────────┤ │  │
│                                       │ │ CSV/JSON    │ │  │
│                                       │ └──────────────┘ │  │
│                                       └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Supports:
- Google Shopping XML
- Meta/Facebook Product Catalog
- RSS 2.0 / Atom 1.0
- CSV, JSON, JSONL exports
- Custom feed formats via adapters

### Sink Architecture

Output to external systems:

```
┌─────────────────────────────────────────────────────────────┐
│                      Sink Executor                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Circuit Breaker                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│           ┌───────────────┼───────────────┐                 │
│           ▼               ▼               ▼                 │
│     ┌───────────┐   ┌───────────┐   ┌───────────┐          │
│     │  Search   │   │  Webhook  │   │   Queue   │          │
│     │  Engines  │   │           │   │  Producer │          │
│     ├───────────┤   ├───────────┤   ├───────────┤          │
│     │MeiliSearch│   │ HTTP POST │   │ RabbitMQ  │          │
│     │Elastic    │   │ Auth      │   │ SQS       │          │
│     │Algolia    │   │ Retry     │   │ Redis     │          │
│     │Typesense  │   │ Timeout   │   │           │          │
│     └───────────┘   └───────────┘   └───────────┘          │
└─────────────────────────────────────────────────────────────┘
```

All sinks feature:
- Batch processing for efficiency
- Automatic retries with backoff
- Circuit breaker protection
- Configurable timeouts
- Error aggregation and reporting

## Directory Structure

```
src/plugins/data-hub/
├── src/                          # Backend source
│   ├── api/                      # GraphQL resolvers & schema
│   ├── bootstrap/                # Plugin initialization
│   ├── constants/                # Configuration constants
│   ├── decorators/               # Custom decorators
│   ├── enrichers/                # Record enrichers
│   ├── entities/                 # TypeORM entities
│   ├── extractors/               # Data extractors
│   ├── feeds/                    # Feed generators
│   ├── gql/                      # Generated GraphQL types
│   ├── jobs/                     # Job queue handlers
│   ├── loaders/                  # Entity loaders
│   ├── mappers/                  # Field mappers
│   ├── operators/                # Transform operators
│   ├── parsers/                  # File parsers
│   ├── runtime/                  # Execution engine
│   ├── sdk/                      # Public SDK & DSL
│   ├── services/                 # Business logic
│   ├── templates/                # Import/export templates
│   ├── transforms/               # Transform execution
│   ├── types/                    # TypeScript types
│   ├── utils/                    # Utilities
│   ├── validation/               # Pipeline definition validators
│   └── vendure-schemas/          # Vendure entity schema definitions
├── connectors/                   # External system connectors (e.g. Pimcore)
├── dashboard/                    # React Admin UI
│   ├── components/               # UI components
│   ├── constants/                # UI constants
│   ├── gql/                      # GraphQL queries
│   ├── hooks/                    # React hooks
│   ├── routes/                   # Route components
│   ├── types/                    # UI type definitions
│   └── utils/                    # UI utilities
├── shared/                       # Shared code (backend + dashboard)
│   ├── constants/                # Shared constants
│   ├── types/                    # Shared types
│   └── utils/                    # Shared utilities
├── dev-server/                   # Development server & examples
├── docs/                         # Documentation
└── e2e/                          # End-to-end tests
```
