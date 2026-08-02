# Queue & Messaging Integration

Integrate Data Hub with message queues for event-driven data pipelines.

## Overview

Queue/messaging integration enables:

- **Event-driven pipelines** - Trigger pipelines from queue messages
- **Decoupled architecture** - Loose coupling between systems
- **Broker controls** - Acknowledgment and dead-letter configuration, with the runtime boundaries documented below
- **Scalability** - Process high-volume events asynchronously

## Supported Queue Systems

| System | Consume | Produce | Status |
|--------|---------|---------|--------|
| RabbitMQ (AMQP) | ✅ | ✅ | **Recommended** - Native AMQP 0-9-1 protocol |
| RabbitMQ (HTTP) | Adapter only | ✅ | Not available to message triggers because consume acknowledges immediately |
| Amazon SQS | ✅ | ✅ | Full support (requires `@aws-sdk/client-sqs`) |
| Redis Streams | ✅ | ✅ | Consumer groups and XACK |
| Apache Kafka | ❌ | ❌ | No built-in adapter; implement a custom integration |
| Google Pub/Sub | ❌ | ❌ | Use custom adapter with `@google-cloud/pubsub` |

These boundaries follow the [RabbitMQ HTTP API acknowledgment modes](https://www.rabbitmq.com/docs/http-api-reference) and Redis [XREADGROUP](https://redis.io/docs/latest/commands/xreadgroup/) / [XACK](https://redis.io/docs/latest/commands/xack/) consumer-group semantics.

### Amazon SQS dependency

RabbitMQ and Redis support use the plugin dependencies. Install the optional SQS client before selecting `SQS`:

```bash
npm install @aws-sdk/client-sqs
```

If it is missing, the SQS adapter reports the required package.

See [Custom Triggers](../developer-guide/extending/custom-triggers.md) for implementation guide.

The connection examples below reference secret codes. Define each code in the plugin `secrets` option (prefer the `ENV` provider) or create it in the dashboard before the connection is used.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Producer  │────▶│    Queue    │────▶│  Data Hub   │
│   System    │     │   Broker    │     │  Pipeline   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Consumer   │
                    │  (Vendure)  │
                    └─────────────┘
```

## Connection Configuration

### RabbitMQ (AMQP - Recommended)

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'rabbitmq-main',
            type: 'RABBITMQ',  // Use AMQP protocol
            settings: {
                host: 'rabbitmq.example.com',
                port: 5672,
                username: 'user',
                passwordSecretCode: 'rabbitmq-password',
                vhost: '/',
                ssl: false,
            },
        },
    ],
});
```

RabbitMQ connections require both `username` and `passwordSecretCode`; neither
adapter supplies `guest` credentials. The native adapter's direct configuration
defaults to port `5672`, or `5671` when TLS is enabled. Connection records
should set the port explicitly as shown. Before a socket is opened,
every resolved address must pass the configured SSRF policy; the connection
then uses that validated address set for DNS lookup while TLS continues to
verify the configured hostname. Connection setup has a bounded timeout, and
partial channel/connection setup is closed independently on failure and during
application shutdown.

### RabbitMQ (HTTP API Fallback)

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'rabbitmq-http',
            type: 'RABBITMQ',  // HTTP Management API
            settings: {
                host: 'rabbitmq.example.com',
                port: 15672,  // Management API port
                username: 'user',
                passwordSecretCode: 'rabbitmq-password',
                vhost: '/',
            },
        },
    ],
});
```

The HTTP adapter's direct configuration defaults to management port `15672`, or
`15671` when TLS is enabled. Set the management port explicitly on a connection
record because the shared RabbitMQ connection form defaults to the recommended
native AMQP port. The HTTP adapter is suitable for publishing and direct adapter
use, but not for reliable message triggers because RabbitMQ's HTTP get endpoint
acknowledges during the consume request.

### Amazon SQS

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'sqs-queue',
            type: 'SQS',
            settings: {
                region: 'us-east-1',
                accessKeyIdSecretCode: 'aws-access-key-id',
                secretAccessKeySecretCode: 'aws-secret-access-key',
                accountId: '123456789012',
            },
        },
    ],
});
```

`queueUrl` is a direct URL for one queue: its decoded final path segment must
match the queue name requested by the trigger or publisher. When another queue
is requested, including a `deadLetterQueue`, the adapter constructs a distinct
URL from `accountId` and either `region` or the optional SQS-compatible
`endpoint`. If `accountId` is unavailable, the adapter rejects the publish
instead of reusing the direct URL. Configure the access-key and secret-key Secret
Codes together, or omit both to use the AWS SDK credential chain.

Custom SQS-compatible endpoints and non-AWS direct Queue URLs are resolved
through the configured SSRF policy and bound to the validated address set.
Connection and inactive-socket timeouts are bounded. Endpoint and Queue URLs
must use HTTP(S) and cannot contain credentials.

### Redis Streams

Redis Streams connections are configured per saved connection or pipeline
step. The global Redis URL/Sentinel environment used for Data Hub locks and
incoming-webhook rate limits is intentionally not inherited by Streams.

Redis 6.2 or newer is required for bounded stale-delivery recovery with
`XAUTOCLAIM`.

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'redis-streams',
            type: 'REDIS',
            settings: {
                host: 'localhost',
                port: 6379,
                passwordSecretCode: 'redis-password',
                db: 0,
                ssl: true,
            },
        },
    ],
});
```

`host` is required, `port` must be an integer from 1 through 65535, and
`db` must be a non-negative integer supported by the target server. Before ioredis opens a socket, the
host is resolved through the configured SSRF policy. The client connects to the
approved IP and, with TLS enabled, validates the certificate against the
configured hostname. Private or local broker addresses therefore require an
explicit trusted-host or private-IP policy; development may disable SSRF only in
an isolated environment.

### Kafka and other brokers

Kafka and Google Pub/Sub do not have built-in queue adapters. The built-in
`MESSAGE` trigger accepts only the queue types listed below, so registering a
`QueueAdapter` alone does not add another trigger type. Integrate another broker
through a custom trigger and sink, or through an HTTP bridge whose delivery and
acknowledgment semantics you control.

The SDK `QueueAdapter` and `queueAdapterRegistry` exports remain available for
custom runtime integrations. They are the contract used by the built-in queue
implementations, not a replacement for trigger validation and dashboard
configuration.

## Consuming from Queues

### Pipeline with Message Trigger

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const orderProcessor = createPipeline()
    .name('order-queue-processor')
    .description('Process orders from message queue')
    .trigger('order-queue', {
        type: 'MESSAGE',
        message: {
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'rabbitmq-main',
            queueName: 'orders.created',
            batchSize: 10,
            ackMode: 'MANUAL',
            deadLetterQueue: 'orders.dlq',
        },
    })
    .extract('from-message', {
        adapterCode: 'inMemory',
        // Message body is automatically injected
    })
    .transform('prepare-order', {
        operators: [
            { op: 'validateRequired', args: { fields: ['orderId', 'customerEmail', 'lines'] } },
            { op: 'now', args: { target: 'processedAt', format: 'ISO' } },
            { op: 'set', args: { path: 'source', value: 'queue' } },
        ],
    })
    .load('upsert-order', {
        adapterCode: 'orderUpsert',
        strategy: 'UPSERT',
        codeField: 'orderId',
        customerEmailField: 'customerEmail',
        linesField: 'lines',
    })
    .build();
```

### Message Trigger Options

| Option | Type | Description |
|--------|------|-------------|
| `queueType` | string | `RABBITMQ_AMQP`, `SQS`, `REDIS_STREAMS`, or `INTERNAL` |
| `connectionCode` | string | Queue connection reference; omit only for `INTERNAL` |
| `queueName` | string | Queue or topic name |
| `batchSize` | number | Messages requested per poll; default 10, range 1-100 |
| `concurrency` | number | Parallel deliveries; default 1, range 1-32 |
| `prefetch` | number | Optional broker prefetch window; range 1-1000 |
| `pollIntervalMs` | number | Delay between polls; default 1000 ms, range 1000-300000 ms |
| `autoStart` | boolean | Default desired state when no durable manual override exists; default `true` |
| `ackMode` | 'MANUAL' | Acknowledge only after the correlated pipeline run completes successfully |
| `consumerGroup` | string | Redis Streams consumer group; rejected for other queue types |
| `maxRetries` | number | Enqueue retries after the initial failure; default 3, range 0-10 |
| `deadLetterQueue` | string | DLQ for exhausted enqueue failures and terminal run failures |

## Producing to Queues

### Queue Producer Sink (RabbitMQ Example)

```typescript
const stockUpdatePipeline = createPipeline()
    .name('stock-to-queue')
    .description('Send stock updates to queue')
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/5 * * * *',
    })
    .extract('stock-changes', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        // Get recently updated variants
    })
    .transform('prepare-message', {
        operators: [
            { op: 'now', args: { target: 'timestamp', format: 'ISO' } },
        ],
    })
    .sink('to-queue', {
        adapterCode: 'queueProducer',
        queueType: 'RABBITMQ_AMQP',
        connectionCode: 'rabbitmq-main',
        queueName: 'inventory.updates',
        routingKey: 'stock.updated',
    })
    .build();
```

### Producer Options

| Option | Type | Description |
|--------|------|-------------|
| `queueType` | string | `RABBITMQ_AMQP`, `RABBITMQ`, `SQS`, or `REDIS_STREAMS` |
| `connectionCode` | string | Reference to queue connection |
| `queueName` | string | Target queue or topic |
| `routingKey` | string | Routing key (RabbitMQ) |
| `headers` | object | Message headers |
| `persistent` | boolean | Persist messages |

## Use Cases

### Order Event Processing

```typescript
// When order is placed externally, sync to Vendure
const externalOrderSync = createPipeline()
    .name('external-order-sync')
    .trigger('external-orders', {
        type: 'MESSAGE',
        message: {
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'rabbitmq-main',
            queueName: 'ecommerce.orders',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .transform('map-order', {
        operators: [{
            op: 'map',
            args: {
                mapping: {
                    code: 'externalOrderId',
                    customerEmail: 'customer.email',
                    lines: 'items',
                },
            },
        }],
    })
    .load('create-order', {
        adapterCode: 'orderUpsert',
        strategy: 'UPSERT',
        codeField: 'code',
        customerEmailField: 'customerEmail',
        linesField: 'lines',
    })
    .build();
```

### Inventory Sync

```typescript
// Consume stock updates from warehouse system
const warehouseStockSync = createPipeline()
    .name('warehouse-stock-sync')
    .trigger('warehouse-updates', {
        type: 'MESSAGE',
        message: {
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'rabbitmq-main',
            queueName: 'warehouse.stock',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .load('update-stock', {
        adapterCode: 'stockAdjust',
        skuField: 'sku',
        stockByLocationField: 'stockByLocation',
        absolute: true,
    })
    .build();
```

### Price Updates

```typescript
// Receive price updates from ERP
const erpPriceSync = createPipeline()
    .name('erp-price-sync')
    .trigger('erp-prices', {
        type: 'MESSAGE',
        message: {
            queueType: 'SQS',
            connectionCode: 'sqs-queue',
            queueName: 'erp-price-updates',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .load('update-variant', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        skuField: 'sku',
        priceField: 'price',
    })
    .build();
```

### Event Fan-out

```typescript
// Publish product changes to multiple queues
const productChangeFanout = createPipeline()
    .name('product-change-fanout')
    .trigger('product-event', {
        type: 'EVENT',
        event: 'ProductEvent',
    })
    .extract('from-event', { adapterCode: 'inMemory' })
    .sink('to-search-queue', {
        adapterCode: 'queueProducer',
        queueType: 'RABBITMQ_AMQP',
        connectionCode: 'rabbitmq-main',
        queueName: 'search.reindex',
    })
    .sink('to-analytics-queue', {
        adapterCode: 'queueProducer',
        queueType: 'RABBITMQ_AMQP',
        connectionCode: 'rabbitmq-main',
        queueName: 'analytics.product-change',
    })
    .sink('to-feed-queue', {
        adapterCode: 'queueProducer',
        queueType: 'RABBITMQ_AMQP',
        connectionCode: 'rabbitmq-main',
        queueName: 'feeds.regenerate',
    })
    .build();
```

## Error Handling

### Retry and dead-letter behavior

Message triggers require `MANUAL` acknowledgment. Each delivery creates or reuses an idempotent correlated pipeline run, and the broker delivery is acknowledged only after that run reaches `COMPLETED`. `FAILED`, `TIMEOUT`, and `CANCELLED` runs follow the dead-letter and negative-acknowledgment path. SQS and Redis Streams renew delivery ownership before and after pipeline enqueue and after each four-minute observation window; the internal adapter retains its in-process delivery. RabbitMQ AMQP has no broker command that extends an unacknowledged delivery, so an active delivery is requeued after the observation window and the redelivery keeps observing the same correlated run. Configure RabbitMQ's consumer acknowledgement timeout above the maximum expected enqueue duration plus the observation window.

A custom adapter may implement `renewLease`. Renewal must extend ownership beyond the next observation window and retain the delivery state required by later `ack` or `nack` calls. Message IDs must remain stable across redelivery so the idempotency key finds the existing run. An adapter without renewal support falls back to negative acknowledgment with requeue.

`maxRetries` controls immediate retries of pipeline-run creation after the initial enqueue failure. The default is 3 and the accepted range is 0 through 10. Producers should provide stable, unique message IDs and pipeline effects should remain idempotent because an uncertain broker or database response can still lead to redelivery.

After retries are exhausted or the correlated run ends unsuccessfully, a configured `deadLetterQueue` is published first. For SQS connections that set a direct `queueUrl`, also configure `accountId` (and `endpoint` for an SQS-compatible service) so the adapter can construct a distinct DLQ URL. The original manual delivery is rejected without requeue only when the adapter returns exactly one matching successful publish result. A thrown publish, an empty or mismatched result, or `success: false` causes the original manual delivery to be requeued. Without a DLQ, the failed manual delivery is rejected without requeue.

`AUTO` is rejected for message-triggered pipelines because it acknowledges before the run outcome is known. The RabbitMQ HTTP adapter therefore remains producer/direct-adapter functionality only; use `RABBITMQ_AMQP` for reliable message triggers. A failed manual acknowledgment after a successful run is logged and is never copied to the DLQ, preventing the acknowledgment failure from being misreported as a processing failure.

`consumerGroup` is passed to Redis Streams and rejected for every other built-in queue type.

Consumer discovery refreshes every 60 seconds and suppresses overlapping refreshes. The effective desired state is the durable manual override for the published pipeline code and trigger key when one exists, otherwise the trigger's `autoStart` value. Admin API and Dashboard start/stop actions persist that override in Data Hub settings, so the decision survives refreshes and process restarts. Every configured trigger remains visible even when its desired state is disabled.

A changed trigger configuration is stopped before its replacement starts. Stop and reconfiguration fence successful acknowledgment, dead-letter publication, and metrics, wait up to one shared 30-second drain window, and release unsettled manual deliveries with negative acknowledgment and requeue. Graceful shutdown then closes every queue adapter and its pooled clients.

`desiredEnabled` is read from current durable global intent on every status query. `isActive` reports only whether the API replica answering the query currently owns and runs that consumer. `desiredEnabled: true` with `isActive: false` is a standby state: another replica may own the distributed lock, or this replica may be awaiting the next retry. `desiredEnabled: false` with `isActive: true` is a bounded stopping state. The local owner stops immediately; when a non-owning replica handles the mutation, the remote owner observes it on its next refresh, within 60 seconds by default. Do not treat one replica's `isActive` value as cluster-wide status. Ownership is per published pipeline code and trigger key, so replicas provide failover and can distribute different triggers while the distributed lock keeps one trigger single-owned.

### Dead Letter Queue

Configure a DLQ for failures that occur before pipeline-run enqueue completes:

```typescript
.trigger('order-queue', {
    type: 'MESSAGE',
    message: {
        queueType: 'RABBITMQ_AMQP',
        connectionCode: 'rabbitmq-main',
        queueName: 'orders.created',
        deadLetterQueue: 'orders.dead-letter',
    },
})
```

### Processing DLQ

Create a separate pipeline to handle dead letters:

```typescript
const dlqProcessor = createPipeline()
    .name('order-dlq-processor')
    .trigger('dlq', {
        type: 'MESSAGE',
        message: {
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'rabbitmq-main',
            queueName: 'orders.dead-letter',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .transform('add-metadata', {
        operators: [
            { op: 'now', args: { target: '_dlqProcessedAt', format: 'ISO' } },
            { op: 'set', args: { path: '_status', value: 'manual-review' } },
        ],
    })
    .load('save-for-review', {
        adapterCode: 'restPost',
        endpoint: 'https://api.example.com/dlq-review',
        method: 'POST',
    })
    .build();
```

## Monitoring

### Queue Metrics

Query the queue and consumer fields exposed by the Admin API:

```graphql
query {
    dataHubQueueStats {
        pending
        running
        failed
        completedToday
        byPipeline {
            code
            pending
            running
        }
        recentFailed {
            id
            code
            finishedAt
            error
        }
    }
}
```

### Health Checks

Check queue consumer status:

```graphql
query {
    dataHubQueueStats {
        pending
        running
        failed
        completedToday
    }
    dataHubConsumers {
        pipelineCode
        triggerKey
        queueName
        isActive
        autoStart
        desiredEnabled
        messagesProcessed
        messagesFailed
        lastMessageAt
    }
}
```

Use `desiredEnabled` for start/stop controls. Use `isActive` only as local-replica ownership telemetry.

## Best Practices

### Message Format

Use consistent message format:

```json
{
    "id": "msg-12345",
    "type": "order.created",
    "timestamp": "2024-01-15T10:30:00Z",
    "source": "external-system",
    "orderId": "ORD-001",
    "customerEmail": "customer.com",
    "lines": [],
    "metadata": {
        "correlationId": "abc-123",
        "version": "1.0"
    }
}
```

### Idempotency

Ensure pipeline can handle duplicate messages:

```typescript
.transform('check-idempotency', {
    operators: [{
        op: 'deltaFilter',
        args: { idPath: 'id' },
    }],
})
```

### Batch Processing

Process messages in batches for efficiency:

```typescript
message: {
    queueType: 'RABBITMQ_AMQP',
    connectionCode: 'rabbitmq-main',
    queueName: 'high-volume-events',
    batchSize: 100,  // Request up to 100; active work is also capped by concurrency
    concurrency: 16,
}
```

### Manual acknowledgment

For adapters that support individual acknowledgments, select manual mode explicitly. `RABBITMQ` (the HTTP adapter) rejects manual mode; use `RABBITMQ_AMQP` when the broker delivery must remain unsettled until the correlated pipeline run completes:

```typescript
message: {
    ackMode: 'MANUAL',  // Ack only after the correlated run reaches COMPLETED
}
```

## Troubleshooting

### Consumer Not Receiving Messages

1. Check connection configuration
2. Verify queue exists and has messages
3. Check the queue or Redis stream name
4. Review permissions

### Messages Going to DLQ

1. Check pipeline logs for errors
2. Verify message format matches expected schema
3. Verify `MANUAL` acknowledgment and `deadLetterQueue` configuration
4. Review DLQ messages for patterns

### High Latency

1. Increase `batchSize` for throughput
2. Check pipeline performance
3. Increase the trigger's `concurrency`; replicas provide failover for the same trigger
4. Optimize transform operations
