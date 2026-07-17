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
            hasValue
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

Query failed records for a specific run. Use the returned cursor to request the
next page; cursors are opaque and must not be constructed by clients.

```graphql
query RunErrors($runId: ID!, $first: Int!, $after: String) {
    dataHubRunErrors(runId: $runId, first: $first, after: $after) {
        items {
            id
            stepKey
            message
            payload
            stackTrace
            createdAt
        }
        totalItems
        hasNextPage
        endCursor
    }
}
```

`dataHubDeadLetters(first:, after:)` uses the same page shape. Page size is
bounded by the server query limit.

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

### dataHubExportDestinations

List channel-scoped delivery destinations. The API returns configuration
and Secret Codes, never resolved secret values:

```graphql
query {
    dataHubExportDestinations {
        id
        name
        type
        enabled
        url
        auth {
            type
            secretCode
            usernameSecretCode
        }
    }
}
```

Destination definitions are stored in the database and scoped to the active
Vendure channel. API and worker processes read the same durable definition, so
registrations survive restarts and do not rely on process-local cache
invalidation. Only validated configuration and Secret Codes are persisted;
resolved credential values are never written to the destination table. Pipeline
destination schemas and saved pipeline definitions remain separate.

Each channel can store up to 100 managed destinations. Creation and deletion
are serialized per channel with the configured Data Hub lock backend, and the
capacity check runs in a transaction opened after the lock is acquired. Managed
creation rejects an ID that already exists in the active channel instead of
silently replacing its configuration.

## Mutations

### dataHubRegisterExportDestination

Create every referenced secret first, then register the destination using only
Secret Codes. Plaintext credential fields, credential-bearing static headers,
embedded URL credentials, and prototype keys are rejected.

```graphql
mutation RegisterPartnerDestination {
    dataHubRegisterExportDestination(input: {
        id: "partner-http"
        name: "Partner HTTP"
        type: HTTP
        url: "https://partner.example.com/import"
        method: "POST"
        auth: {
            type: BEARER
            secretCode: "partner-api-token"
        }
    }) {
        success
        id
    }
}
```

S3 uses `accessKeyIdSecretCode` and `secretAccessKeySecretCode`. FTP uses
`passwordSecretCode`; SFTP supports `passwordSecretCode`,
`privateKeySecretCode`, `passphraseSecretCode`, and
`hostKeyFingerprintSecretCode`. The fingerprint reference must resolve to the trusted
OpenSSH `SHA256:<base64>` server host-key fingerprint and is required in production.
SMTP authentication uses `smtp.usernameSecretCode` (or a non-secret
`smtp.username`) together with `smtp.passwordSecretCode`. Secret values are
resolved only while testing or delivering to a destination.

### dataHubDeleteExportDestination

Delete a managed destination from the active Vendure channel. A destination
with the same ID in another channel is not affected. The mutation requires
`ManageDataHubDestinations` and returns Vendure's standard deletion result.

```graphql
mutation DeletePartnerDestination {
    dataHubDeleteExportDestination(id: "partner-http") {
        result
        message
    }
}
```


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
### Pipeline lifecycle mutations

Pipeline lifecycle transitions are enforced by the service and revision layers:

- `submitDataHubPipelineForReview`: `DRAFT` to `REVIEW`
- `publishDataHubPipeline`: `REVIEW` to `PUBLISHED`
- `approveDataHubPipeline`: `REVIEW` to `PUBLISHED` and requires both review and publish permissions
- `rejectDataHubPipelineReview`: `REVIEW` to `DRAFT`
- `archiveDataHubPipeline`: `PUBLISHED` to `ARCHIVED` and disables execution
- `reactivateDataHubPipeline`: `ARCHIVED` to `PUBLISHED`, restores the active published revision, and explicitly re-enables execution

- revision reversion is allowed only for `PUBLISHED` pipelines and creates a new validated published revision
Draft, review, and archived pipelines cannot bypass the review workflow through revision reversion. Reactivation does not create a new revision.

```graphql
mutation ReactivatePipeline($id: ID!) {
    reactivateDataHubPipeline(id: $id) {
        id
        status
        enabled
        version
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

### runDataHubHookTest

Execute the configured observation actions for one hook stage. Interceptor and
script actions are reported as skipped because they require the pipeline's
record-processing lifecycle.

```graphql
mutation TestHook($pipelineId: ID!, $stage: String!, $payload: JSON) {
    runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload) {
        status
        configured
        executed
        skipped
        failed
        errors {
            action
            type
            error
        }
    }
}
```

The mutation requires the Run Data Hub Pipeline permission. A resolved mutation
is not necessarily successful: inspect `status` and `failed`.

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
        hasValue
    }
}
```

Variables:
```json
{
    "input": {
        "code": "api-key",
        "provider": "ENV",
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

The value fields have explicit three-state semantics:

- Retain: omit both `value` and `clearValue`, for example `{ "id": "1", "metadata": { "owner": "ops" } }`
- Replace: send a non-blank `value`, for example `{ "id": "1", "value": "new-secret" }`
- Clear: omit `value` and send `{ "id": "1", "clearValue": true }`

Sending `value: null`, an empty/whitespace value, or both `value` and `clearValue` is rejected instead of silently deleting data.
Changing `provider` requires a valid non-blank replacement in the same update. `ENV` values must be environment-variable names such as `SUPPLIER_API_KEY` and cannot contain fallbacks. `INLINE` writes require `DATAHUB_MASTER_KEY` with at least 32 characters.
Secret queries and mutation responses expose `hasValue`; the stored value is never returned.

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

Retry a single failed record with an optional field patch:

```graphql
mutation RetryRecord($errorId: ID!, $patch: JSON) {
    retryDataHubRecord(errorId: $errorId, patch: $patch) {
        success
        outcome
        message
        errorId
        runId
        stepKey
        adapterCode
        definitionVersion
        appliedPatch
        rejectedPatchKeys
        processed
        succeeded
        failed
        auditId
        auditRecorded
    }
}
```

The retry uses the failed run's immutable definition snapshot. Adapter identity is resolved from canonical `step.config.adapterCode`, with the typed root `step.adapterCode` supported for code-first definitions. A patch is rejected atomically if any requested field is not patchable; inspect `success`, `outcome`, and `rejectedPatchKeys` before reporting success. `APPLIED` means replay produced at least one successful side effect. Audit persistence is reported separately through `auditRecorded` and `auditId`.

`ReplayDataHubRecord` is required for every retry. A non-empty `patch`
also requires `EditDataHubQuarantine`; callers with replay-only access can
retry the recorded payload unchanged by omitting `patch` or passing `{}`.

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
