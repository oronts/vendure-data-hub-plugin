# External Integrations

Data Hub includes integrations for external services with built-in fault tolerance.

## Search Engine Sinks

Index your data to search engines with automatic circuit breaker protection.

### Supported Search Engines

| Engine | Adapter Code | Features |
|--------|--------------|----------|
| MeiliSearch | `meilisearch` | Full-text search, faceting |
| Elasticsearch | `elasticsearch` | Advanced querying, analytics |
| OpenSearch | `elasticsearch` | AWS-compatible (uses Elasticsearch adapter) |
| Algolia | `algolia` | Instant search, relevance tuning |
| Typesense | `typesense` | Typo-tolerant, fast |

### Configuration

```typescript
// Pipeline with search sink
.sink('index-products', {
    adapterCode: 'meilisearch',
    host: 'http://localhost:7700',
    apiKeySecretCode: 'meili-api-key',
    indexName: 'products',
    primaryKey: 'id',
    batchSize: 100,
})
```

## Webhook Sink

Send data to external HTTP endpoints with retry and circuit breaker.

```typescript
.sink('notify-external', {
    adapterCode: 'webhook',
    url: 'https://api.example.com/webhook',
    method: 'POST',
    bearerTokenSecretCode: 'webhook-token',
    batchSize: 50,
    timeoutMs: 30000,
    retries: 3,
})
```

## Queue Producer Sink

Publish messages to message queues. See [Queue & Messaging](./queue-messaging.md) for details.

```typescript
.sink('to-queue', {
    adapterCode: 'queueProducer',
    queueType: 'rabbitmq-amqp',
    connectionCode: 'my-rabbitmq',
    queueName: 'product-updates',
})
```

## Circuit Breaker Protection

All external sinks include automatic circuit breaker protection to prevent cascading failures.

### How It Works

1. **Closed State** (Normal): Requests flow normally
2. **Open State** (Protected): After 5 failures in 60 seconds, circuit opens and requests fail fast
3. **Half-Open State** (Testing): After 30 seconds, allows test requests
4. **Recovery**: After 3 consecutive successes, circuit closes

### Configuration

Circuit breaker uses defaults from plugin configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `failureThreshold` | 5 | Failures before opening |
| `successThreshold` | 3 | Successes to close |
| `resetTimeoutMs` | 30000 | Time before half-open |
| `failureWindowMs` | 60000 | Window for counting failures |

### Monitoring

When circuit breaker activates, warnings are logged:

```
WARN [SinkExecutor] Circuit breaker OPEN for sink:elasticsearch:https://search.example.com
     - Blocking requests until reset
     - Time until half-open: 25000ms
```

## HTTP Lookup Operator

Enrich records by fetching data from external APIs during transformation.

### Features

- **Caching**: Configurable TTL to reduce API calls
- **Rate Limiting**: Limit requests per second per domain
- **Authentication**: Bearer token, API key, Basic auth
- **Retry Logic**: Automatic retry on transient errors
- **Batch Processing**: Parallel requests for efficiency

### Example

```typescript
.transform('enrich-inventory', {
    operators: [
        {
            op: 'httpLookup',
            args: {
                url: 'https://api.inventory.com/stock/{{sku}}',
                target: 'stockLevel',
                responsePath: 'data.available',
                bearerTokenSecretCode: 'inventory-api-key',
                cacheTtlSec: 300,
                rateLimitPerSecond: 50,
                maxRetries: 3,
                default: 0,
            },
        },
    ],
})
```

### Options

| Option | Description |
|--------|-------------|
| `url` | Endpoint URL with `{{field}}` placeholders |
| `method` | GET or POST |
| `target` | Field to store response |
| `responsePath` | JSON path to extract |
| `cacheTtlSec` | Cache duration (0 = disabled) |
| `rateLimitPerSecond` | Max requests per second |
| `maxRetries` | Retry attempts on failure |
| `timeoutMs` | Request timeout |
| `bearerTokenSecretCode` | Bearer token secret |
| `apiKeySecretCode` | API key secret |
| `default` | Value if lookup fails |

## Best Practices

### 1. Use Caching

Always enable caching for HTTP lookups to reduce load:

```typescript
{ op: 'httpLookup', args: { cacheTtlSec: 300, ... } }
```

### 2. Set Rate Limits

Respect external API limits:

```typescript
{ op: 'httpLookup', args: { rateLimitPerSecond: 10, ... } }
```

### 3. Provide Defaults

Handle failures gracefully:

```typescript
{ op: 'httpLookup', args: { default: null, skipOn404: true, ... } }
```

### 4. Monitor Circuit Breakers

Check logs for circuit breaker activations and investigate root causes.

### 5. Use Batch Sizes

Tune batch sizes based on external service capacity:

```typescript
.sink('index', { batchSize: 100, ... })
```

## Troubleshooting

### Circuit Breaker Keeps Opening

- Check external service health
- Increase `failureThreshold` for flaky services
- Add retry logic with `maxRetries`

### High Latency

- Enable caching
- Reduce batch sizes
- Add rate limiting

### Authentication Errors

- Verify secret values
- Check token expiration
- Confirm header names
