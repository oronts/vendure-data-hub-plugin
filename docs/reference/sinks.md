# Sinks Reference

Complete reference for the seven built-in search, queue, and webhook sinks.

## Overview

Sinks send transformed data to external systems for search indexing, message queuing, or webhook notifications.

---

## MeiliSearch

Code: `meilisearch`

Index records to MeiliSearch for fast, typo-tolerant search.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Host URL (e.g., http://localhost:7700) |
| `apiKeySecretCode` | string | Yes | Secret code for API key |
| `indexName` | string | Yes | Target index name |
| `primaryKey` | string | Yes | Primary key field name |
| `batchSize` | number | No | Records per indexing request |
| `defaultOperation` | select | No | Operation used when a record has no `__operation` field: `UPSERT` or `DELETE` |
| `searchableFields` | json | No | Array of searchable field names |
| `filterableFields` | json | No | Array of filterable field names |
| `sortableFields` | json | No | Array of sortable field names |

### Example

```typescript
.sink('meilisearch-products', {
    adapterCode: 'meilisearch',
    host: 'http://localhost:7700',
    apiKeySecretCode: 'meilisearch-api-key',
    indexName: 'products',
    primaryKey: 'id',
    batchSize: 500,
    searchableFields: ['name', 'description', 'sku'],
    filterableFields: ['categoryId', 'price', 'inStock'],
    sortableFields: ['price', 'name', 'createdAt'],
})
```

### Index Settings

The sink automatically configures index settings:

```typescript
{
    searchableFields: ['name', 'description'],  // Fields for full-text search
    filterableFields: ['categoryId', 'price'],  // Fields for filtering
    sortableFields: ['price', 'createdAt'],     // Fields for sorting
}
```

### Authentication

Store API key as a secret:

```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'meilisearch-api-key',
            provider: 'ENV',
            value: 'MEILISEARCH_API_KEY',
        },
    ],
})
```

---

## Elasticsearch

Code: `elasticsearch`

Index records to Elasticsearch.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | string | Yes | Node URL (e.g., https://search.example.com:9200) |
| `apiKeySecretCode` | string | No | Secret code for API key auth |
| `usernameSecretCode` | string | No | Secret code resolving to the Basic-auth username |
| `passwordSecretCode` | string | No | Secret code resolving to the Basic-auth password |
| `indexName` | string | Yes | Target index name |
| `idField` | string | Yes | Document ID field |
| `batchSize` | number | No | Records per bulk request |
| `defaultOperation` | select | No | Operation used when a record has no `__operation` field: `UPSERT` or `DELETE` |

### Example - API Key Auth

```typescript
.sink('elasticsearch-products', {
    adapterCode: 'elasticsearch',
    node: 'https://elasticsearch.example.com:9200',
    apiKeySecretCode: 'elasticsearch-api-key',
    indexName: 'products',
    idField: 'id',
    batchSize: 1000,
})
```

### Example - Basic Auth

```typescript
.sink('elasticsearch-products', {
    adapterCode: 'elasticsearch',
    node: 'https://elasticsearch.example.com:9200',
    usernameSecretCode: 'es-username',
    passwordSecretCode: 'es-password',
    indexName: 'products',
    idField: 'id',
})
```

### Index Mapping

Elasticsearch creates dynamic mappings. For production, create index mappings beforehand:

```json
{
    "mappings": {
        "properties": {
            "id": { "type": "keyword" },
            "name": { "type": "text" },
            "sku": { "type": "keyword" },
            "price": { "type": "integer" },
            "description": { "type": "text" },
            "categories": { "type": "keyword" }
        }
    }
}
```

API-key authentication and Basic authentication are mutually exclusive. Basic
authentication requires both Secret Codes; missing or empty referenced secrets
fail before the first network request.

### OpenSearch

Use adapter code `opensearch` with the same fields. OpenSearch is a separate
built-in sink that uses the Elasticsearch-compatible bulk API.

---

## Algolia

Code: `algolia`

Index records to Algolia search service.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appId` | string | Yes | Algolia Application ID |
| `apiKeySecretCode` | string | Yes | Secret code for Admin API key |
| `indexName` | string | Yes | Target index name |
| `idField` | string | Yes | Field for object ID |
| `batchSize` | number | No | Records per Algolia batch request |
| `defaultOperation` | select | No | Operation used when a record has no `__operation` field: `UPSERT` or `DELETE` |

### Example

```typescript
.sink('algolia-products', {
    adapterCode: 'algolia',
    appId: 'YOUR_APP_ID',
    apiKeySecretCode: 'algolia-admin-key',
    indexName: 'products',
    idField: 'id',
    batchSize: 1000,
})
```

### Object ID

Algolia requires a unique `objectID` field. The `idField` specifies which record field to use:

```typescript
.sink('algolia-products', {
    adapterCode: 'algolia',
    appId: 'YOUR_APP_ID',
    apiKeySecretCode: 'algolia-admin-key',
    indexName: 'products',
    idField: 'sku',  // Use SKU as the Algolia objectID
    // ...
})
```

### Secrets Configuration

```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'algolia-admin-key',
            provider: 'ENV',
            value: 'ALGOLIA_ADMIN_KEY',
        },
    ],
})
```

---

## Typesense

Code: `typesense`

Index records to Typesense search engine.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Typesense host |
| `port` | number | Yes | Typesense port |
| `protocol` | select | No | http or https |
| `apiKeySecretCode` | string | Yes | Secret code for API key |
| `collectionName` | string | Yes | Target collection name |
| `idField` | string | Yes | Document ID field |
| `batchSize` | number | No | Records per Typesense import request |
| `defaultOperation` | select | No | Operation used when a record has no `__operation` field: `UPSERT` or `DELETE` |

### Example

```typescript
.sink('typesense-products', {
    adapterCode: 'typesense',
    host: 'localhost',
    port: 8108,
    protocol: 'http',
    apiKeySecretCode: 'typesense-api-key',
    collectionName: 'products',
    idField: 'id',
    batchSize: 250,
})
```

### Collection Schema

Create collection with schema before indexing:

```json
{
    "name": "products",
    "fields": [
        { "name": "id", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "description", "type": "string" },
        { "name": "price", "type": "int32" },
        { "name": "categories", "type": "string[]" }
    ],
    "default_sorting_field": "price"
}
```

---

## Shared Sink Behavior

All seven built-in sinks accept `batchSize`, `defaultOperation`,
`languageCode`, `translationsField`, and `channelCode`. Search sinks also
use the configured identity field when handling deletes: `primaryKey` for
MeiliSearch and `idField` for the other search engines, queue producer, and
webhook. A record-level `__operation: 'DELETE'` overrides
`defaultOperation`; the runtime removes `__operation` before sending the
record.

| Field | Type | Behavior |
|-------|------|----------|
| `languageCode` | string | Flatten the matching translation onto each record and replace every `${languageCode}` placeholder in an index or collection name |
| `translationsField` | string | Translation array field; defaults to `translations` |
| `channelCode` | string | Keep records whose channel array contains this code; records without a channel array remain included |
| `fields` | string[] | Code-first only: send only these source paths |
| `excludeFields` | string[] | Code-first only: omit these root fields when `fields` is not set |
| `channelField` | string | Code-first only: channel array field; defaults to `channels` |

For search sinks, each DELETE record is reduced to its resolved identity and
sent through the target's delete API. Queue DELETE messages carry the
`x-datahub-operation: DELETE` header. Webhook DELETE batches use HTTP
`DELETE` and contain identity-only objects.

`batchSize` controls sequential request chunks. It must be an integer from 1 to
10,000 and defaults to 100. Invalid values fail before any target request is
made. It does not enable parallel requests or add a per-second rate limiter.
Choose it according to record size, target limits, and observed latency.

`defaultOperation` and a record-level `__operation` accept only `UPSERT` or
`DELETE` (case-insensitive). An invalid default fails the step before target
requests begin. An invalid record operation fails and skips that record instead
of treating it as an upsert.

---

## Queue Producer

Code: `queueProducer`

Publish records through RabbitMQ AMQP, Amazon SQS, or Redis Streams. A deprecated
RabbitMQ HTTP Management API producer remains available for compatibility.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `queueType` | select | Yes | `RABBITMQ_AMQP`, `SQS`, `REDIS_STREAMS`, or deprecated `RABBITMQ` HTTP compatibility mode |
| `connectionCode` | string | Yes | Saved queue connection code |
| `queueName` | string | Yes | Queue name or Redis stream name |
| `routingKey` | string | No | RabbitMQ routing key |
| `headers` | json | No | Static string message headers |
| `idField` | string | No | Record field used as the message ID; otherwise a UUID is generated |
| `batchSize` | number | No | Records prepared and published per chunk; default: 100 |
| `persistent` | boolean | No | RabbitMQ delivery persistence; default: true |
| `priority` | number | No | RabbitMQ message priority |
| `ttlMs` | number | No | RabbitMQ message expiration in milliseconds |
| `defaultOperation` | select | No | `UPSERT` or `DELETE`; propagated as the `x-datahub-operation` header |

Fields with RabbitMQ-specific semantics are not portable broker guarantees.
SQS and Redis Streams still receive the payload, ID, static headers, and
`x-datahub-operation` header.

### RabbitMQ AMQP example

```typescript
.sink('rabbitmq-orders', {
    adapterCode: 'queueProducer',
    queueType: 'RABBITMQ_AMQP',
    connectionCode: 'rabbitmq-connection',
    queueName: 'order-processing',
    routingKey: 'order.created',
    idField: 'orderId',
    persistent: true,
    batchSize: 100,
})
```

The native AMQP adapter is the supported RabbitMQ transport for new deployments.
Select the deprecated `RABBITMQ` HTTP mode only when a long-lived AMQP connection
is impossible; RabbitMQ documents HTTP publishing as highly inefficient.

### RabbitMQ connection

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'rabbitmq-connection',
            type: 'RABBITMQ',
            settings: {
                host: 'rabbitmq.example.com',
                port: 5672,
                username: 'data-hub',
                passwordSecretCode: 'rabbitmq-password',
                vhost: '/',
                ssl: true,
            },
        },
    ],
})
```

The deprecated HTTP compatibility mode uses management port 15672. See
[Queue & Messaging](../user-guide/queue-messaging.md) for SQS and Redis
connection examples and their optional client dependencies.

---

## Webhook

Code: `webhook`

Send record batches to an HTTP endpoint with retries, bounded error responses,
SSRF protection, and a circuit breaker.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | HTTP endpoint to send records to |
| `method` | select | No | HTTP method (POST, PUT, PATCH) |
| `headers` | json | No | Non-sensitive static HTTP headers |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer authentication |
| `apiKeySecretCode` | string | No | Secret code for API key authentication |
| `apiKeyHeader` | string | No | Header name for API key (default: X-API-Key) |
| `batchSize` | number | No | Records per request |
| `timeoutMs` | number | No | Integer from 1 to 300000 milliseconds (default: 30000) |
| `retries` | number | No | Retries after the first attempt; integer from 0 to 10 (default: 3) |
| `hmacSecretCode` | string | No | Secret code for HMAC signing. When set, each request includes an HMAC-SHA256 signature computed over the request body |
| `signatureHeaderName` | string | No | Header name for the HMAC signature (default: `X-DataHub-Signature`) |
| `defaultOperation` | select | No | Operation used when a record has no `__operation` field: `UPSERT` or `DELETE` |

### Example - Single Records with Bearer Auth

```typescript
.sink('webhook-notifications', {
    adapterCode: 'webhook',
    url: 'https://api.example.com/webhook/products',
    method: 'POST',
    bearerTokenSecretCode: 'webhook-bearer-token',
    batchSize: 1,
})
```

Configure at most one of `bearerTokenSecretCode` and
`apiKeySecretCode`. `apiKeyHeader` requires `apiKeySecretCode`, and
`signatureHeaderName` requires `hmacSecretCode`. Credential, cookie,
signature, and routing-control headers are rejected from `headers`; use the
Secret Code fields instead. Missing, empty, or invalid Secret Codes fail before
the first request.

### Example - Batch Records with API Key

```typescript
.sink('webhook-bulk', {
    adapterCode: 'webhook',
    url: 'https://api.example.com/bulk-import',
    method: 'POST',
    apiKeySecretCode: 'webhook-api-key',
    apiKeyHeader: 'X-API-Key',
    batchSize: 100,
    timeoutMs: 60000,
    retries: 5,
})
```

### Authentication

**Bearer Token:**
```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'webhook-bearer-token',
            provider: 'ENV',
            value: 'WEBHOOK_BEARER_TOKEN',
        },
    ],
})
```
Sent as `Authorization: Bearer {value}` header.

**API Key:**
```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'webhook-api-key',
            provider: 'ENV',
            value: 'WEBHOOK_API_KEY',
        },
    ],
})
```
Sent in the header specified by `apiKeyHeader` (default: X-API-Key).
