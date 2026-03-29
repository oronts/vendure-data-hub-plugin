# GraphQL API

> **Important:** Use GraphQL introspection (`{ __schema { ... } }`) or the Vendure Admin UI's API playground for the definitive, up-to-date API reference. The examples below show common usage patterns but field names and signatures may differ from the current implementation.

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
                defaultValue
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
            finishedAt
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
        metrics
        triggeredBy
    }
}
```

### dataHubLogs

Query execution logs:

```graphql
query GetLogs {
    dataHubLogs(options: { take: 100 }) {
        items {
            id
            level
            message
            stepKey
            createdAt
            metadata
        }
        totalItems
    }
}
```

### dataHubRunErrors

Query failed records for a specific run:

```graphql
query RunErrors($runId: ID!) {
    dataHubRunErrors(runId: $runId) {
        id
        stepKey
        message
        payload
        stackTrace
        createdAt
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

### startDataHubPipelineRun

Execute a pipeline:

```graphql
mutation RunPipeline($pipelineId: ID!) {
    startDataHubPipelineRun(pipelineId: $pipelineId) {
        id
        status
    }
}
```

### cancelDataHubPipelineRun

Cancel a running pipeline:

```graphql
mutation CancelRun($id: ID!) {
    cancelDataHubPipelineRun(id: $id) {
        id
        status
    }
}
```

### validateDataHubPipelineDefinition

Validate a pipeline definition:

```graphql
query Validate($definition: JSON!) {
    validateDataHubPipelineDefinition(definition: $definition) {
        isValid
        issues {
            stepKey
            message
            reason
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

### retryDataHubRecord

Retry a single failed record with optional JSON patch:

```graphql
mutation RetryRecord($errorId: ID!, $patch: JSON) {
    retryDataHubRecord(errorId: $errorId, patch: $patch)
}
```

### updateDataHubSettings

Update plugin settings:

```graphql
mutation UpdateSettings($input: DataHubSettingsInput!) {
    updateDataHubSettings(input: $input) {
        retentionDaysRuns
        retentionDaysErrors
    }
}
```

## TypeScript Client

Using with `@vendure/admin-ui-plugin` or custom clients:

```typescript
import { gql } from 'graphql-tag';

const RUN_PIPELINE = gql`
    mutation RunPipeline($pipelineId: ID!) {
        startDataHubPipelineRun(pipelineId: $pipelineId) {
            id
            status
        }
    }
`;

// Execute
const result = await adminClient.mutate({
    mutation: RUN_PIPELINE,
    variables: { pipelineId: '1' },
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
