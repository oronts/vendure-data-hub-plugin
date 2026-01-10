# GraphQL API

The Data Hub plugin extends the Vendure Admin API with queries and mutations for pipeline management.

## Queries

### dataHubPipelines

List all pipelines:

```graphql
query {
    dataHubPipelines(options: { take: 20, skip: 0 }) {
        items {
            id
            code
            name
            description
            enabled
            createdAt
            updatedAt
        }
        totalItems
    }
}
```

### dataHubPipeline

Get a single pipeline:

```graphql
query GetPipeline($id: ID!) {
    dataHubPipeline(id: $id) {
        id
        code
        name
        description
        enabled
        definition
        createdAt
        updatedAt
    }
}
```

### dataHubConnections

List connections:

```graphql
query {
    dataHubConnections {
        items {
            id
            code
            name
            type
            createdAt
        }
        totalItems
    }
}
```

### dataHubSecrets

List secrets (values hidden):

```graphql
query {
    dataHubSecrets {
        items {
            id
            code
            provider
            createdAt
        }
        totalItems
    }
}
```

### dataHubAdapters

List available adapters:

```graphql
query {
    dataHubAdapters {
        code
        name
        type
        category
        description
        schema {
            fields {
                key
                type
                required
                label
                default
                options { value label }
            }
        }
    }
}
```

### dataHubPipelineRuns

Query pipeline runs:

```graphql
query GetRuns($pipelineId: ID!) {
    dataHubPipelineRuns(pipelineId: $pipelineId, options: { take: 10 }) {
        items {
            id
            status
            startedAt
            completedAt
            recordsProcessed
            recordsFailed
            triggeredBy
        }
        totalItems
    }
}
```

### dataHubPipelineRun

Get a single run:

```graphql
query GetRun($id: ID!) {
    dataHubPipelineRun(id: $id) {
        id
        status
        startedAt
        completedAt
        recordsProcessed
        recordsFailed
        triggeredBy
        stepMetrics {
            stepKey
            recordsIn
            recordsOut
            recordsFailed
            durationMs
        }
    }
}
```

### dataHubLogs

Query execution logs:

```graphql
query GetLogs($runId: ID!) {
    dataHubLogs(runId: $runId, options: { take: 100 }) {
        items {
            id
            level
            message
            stepKey
            timestamp
            metadata
        }
        totalItems
    }
}
```

### dataHubRecordErrors

Query failed records:

```graphql
query {
    dataHubRecordErrors(options: { take: 50 }) {
        items {
            id
            pipelineId
            runId
            stepKey
            recordData
            errorMessage
            createdAt
            retryCount
        }
        totalItems
    }
}
```

### dataHubSettings

Get plugin settings:

```graphql
query {
    dataHubSettings {
        retentionDaysRuns
        retentionDaysErrors
        retentionDaysLogs
        logPersistenceLevel
    }
}
```

## Mutations

### createDataHubPipeline

Create a pipeline:

```graphql
mutation CreatePipeline($input: CreateDataHubPipelineInput!) {
    createDataHubPipeline(input: $input) {
        id
        code
        name
    }
}
```

Variables:
```json
{
    "input": {
        "code": "my-pipeline",
        "name": "My Pipeline",
        "description": "Pipeline description",
        "definition": {
            "version": 1,
            "steps": [],
            "edges": []
        }
    }
}
```

### updateDataHubPipeline

Update a pipeline:

```graphql
mutation UpdatePipeline($input: UpdateDataHubPipelineInput!) {
    updateDataHubPipeline(input: $input) {
        id
        name
        enabled
    }
}
```

Variables:
```json
{
    "input": {
        "id": "1",
        "name": "Updated Name",
        "enabled": true
    }
}
```

### deleteDataHubPipeline

Delete a pipeline:

```graphql
mutation DeletePipeline($id: ID!) {
    deleteDataHubPipeline(id: $id) {
        result
        message
    }
}
```

### runDataHubPipeline

Execute a pipeline:

```graphql
mutation RunPipeline($id: ID!, $parameters: JSON) {
    runDataHubPipeline(id: $id, parameters: $parameters) {
        id
        status
    }
}
```

### cancelDataHubPipelineRun

Cancel a running pipeline:

```graphql
mutation CancelRun($runId: ID!) {
    cancelDataHubPipelineRun(runId: $runId) {
        success
        message
    }
}
```

### validateDataHubPipelineDefinition

Validate a pipeline definition:

```graphql
mutation Validate($definition: JSON!) {
    validateDataHubPipelineDefinition(definition: $definition) {
        isValid
        errors
        issues {
            stepKey
            message
            severity
        }
    }
}
```

### createDataHubConnection

Create a connection:

```graphql
mutation CreateConnection($input: CreateDataHubConnectionInput!) {
    createDataHubConnection(input: $input) {
        id
        code
        type
    }
}
```

### updateDataHubConnection

Update a connection:

```graphql
mutation UpdateConnection($input: UpdateDataHubConnectionInput!) {
    updateDataHubConnection(input: $input) {
        id
        code
    }
}
```

### deleteDataHubConnection

Delete a connection:

```graphql
mutation DeleteConnection($id: ID!) {
    deleteDataHubConnection(id: $id) {
        result
    }
}
```

### testDataHubConnection

Test a connection:

```graphql
mutation TestConnection($id: ID!) {
    testDataHubConnection(id: $id) {
        success
        message
        latencyMs
    }
}
```

### createDataHubSecret

Create a secret:

```graphql
mutation CreateSecret($input: CreateDataHubSecretInput!) {
    createDataHubSecret(input: $input) {
        id
        code
        provider
    }
}
```

Variables:
```json
{
    "input": {
        "code": "api-key",
        "provider": "env",
        "value": "MY_API_KEY"
    }
}
```

### updateDataHubSecret

Update a secret:

```graphql
mutation UpdateSecret($input: UpdateDataHubSecretInput!) {
    updateDataHubSecret(input: $input) {
        id
        code
    }
}
```

### deleteDataHubSecret

Delete a secret:

```graphql
mutation DeleteSecret($id: ID!) {
    deleteDataHubSecret(id: $id) {
        result
    }
}
```

### retryDataHubRecordErrors

Retry failed records:

```graphql
mutation RetryErrors($ids: [ID!]!) {
    retryDataHubRecordErrors(ids: $ids) {
        success
        retriedCount
        failedCount
    }
}
```

### deleteDataHubRecordErrors

Delete error records:

```graphql
mutation DeleteErrors($ids: [ID!]!) {
    deleteDataHubRecordErrors(ids: $ids) {
        success
        deletedCount
    }
}
```

### setDataHubSettings

Update plugin settings:

```graphql
mutation UpdateSettings($input: DataHubSettingsInput!) {
    setDataHubSettings(input: $input) {
        retentionDaysRuns
        retentionDaysErrors
    }
}
```

## Subscriptions

### dataHubPipelineRunUpdated

Subscribe to run updates:

```graphql
subscription OnRunUpdate($pipelineId: ID) {
    dataHubPipelineRunUpdated(pipelineId: $pipelineId) {
        id
        status
        recordsProcessed
        recordsFailed
    }
}
```

### dataHubLogAdded

Subscribe to new logs:

```graphql
subscription OnLog($runId: ID!) {
    dataHubLogAdded(runId: $runId) {
        id
        level
        message
        timestamp
    }
}
```

## TypeScript Client

Using with `@vendure/admin-ui-plugin` or custom clients:

```typescript
import { gql } from 'graphql-tag';

const RUN_PIPELINE = gql`
    mutation RunPipeline($id: ID!) {
        runDataHubPipeline(id: $id) {
            id
            status
        }
    }
`;

// Execute
const result = await adminClient.mutate({
    mutation: RUN_PIPELINE,
    variables: { id: '1' },
});
```

## Error Handling

GraphQL errors follow Vendure patterns:

```typescript
try {
    const result = await adminClient.mutate({ ... });
} catch (error) {
    if (error.graphQLErrors) {
        for (const gqlError of error.graphQLErrors) {
            console.log(gqlError.message);
            console.log(gqlError.extensions?.code);
        }
    }
}
```

Common error codes:
- `FORBIDDEN` - Missing required permission
- `NOT_FOUND` - Entity not found
- `VALIDATION_ERROR` - Invalid input
- `PIPELINE_RUNNING` - Pipeline already running
