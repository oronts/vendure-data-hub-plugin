# Queue & Messaging Integration

Integrate Data Hub with message queues for event-driven data pipelines.

## Overview

Queue/messaging integration enables:

- **Event-driven pipelines** - Trigger pipelines from queue messages
- **Decoupled architecture** - Loose coupling between systems
- **Reliable processing** - Retry, dead-letter queues, acknowledgments
- **Scalability** - Process high-volume events asynchronously

## Supported Queue Systems

| System | Consume | Produce | Status |
|--------|---------|---------|--------|
| RabbitMQ (AMQP) | ✅ | ✅ | **Recommended** - Native AMQP 0-9-1 protocol |
| RabbitMQ (HTTP) | ✅ | ✅ | HTTP Management API fallback |
| Amazon SQS | ✅ | ✅ | Full support (requires `@aws-sdk/client-sqs`) |
| Redis Streams | ✅ | ✅ | Consumer groups, XACK (requires `ioredis`) |
| Apache Kafka | ⚠️ | ⚠️ | REST Proxy required (not native client) |
| Google Pub/Sub | ❌ | ❌ | Use custom adapter with `@google-cloud/pubsub` |

### Optional Dependencies

Install the required packages for your queue system:

```bash
# For Amazon SQS
npm install @aws-sdk/client-sqs

# For Redis Streams
npm install ioredis

# For RabbitMQ AMQP (recommended)
npm install amqplib
```

> **Note:** If the optional dependency is not installed, the adapter will throw a helpful error message explaining which package to install.

See [Custom Triggers](../developer-guide/extending/custom-triggers.md) for implementation guide.

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
            type: 'rabbitmq-amqp',  // Use AMQP protocol
            name: 'RabbitMQ Production',
            config: {
                host: 'rabbitmq.example.com',
                port: 5672,
                username: 'user',
                password: 'pass',
                vhost: '/',
                ssl: false,
            },
        },
    ],
});
```

### RabbitMQ (HTTP API Fallback)

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'rabbitmq-http',
            type: 'rabbitmq',  // HTTP Management API
            name: 'RabbitMQ via HTTP',
            config: {
                host: 'rabbitmq.example.com',
                port: 15672,  // Management API port
                username: 'user',
                password: 'pass',
                vhost: '/',
            },
        },
    ],
});
```

### Amazon SQS

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'sqs-queue',
            type: 'sqs',
            name: 'AWS SQS',
            config: {
                region: 'us-east-1',
                accessKeyId: 'AKIA...',
                secretAccessKey: 'secret',
                // Optional: for LocalStack or custom endpoints
                // endpoint: 'http://localhost:4566',
                accountId: '123456789012',
            },
        },
    ],
});
```

### Redis Streams

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'redis-streams',
            type: 'redis-streams',
            name: 'Redis Streams',
            config: {
                host: 'localhost',
                port: 6379,
                password: 'your-password',
                db: 0,
                // Consumer group settings
                consumerGroup: 'datahub-consumers',
                consumerName: 'consumer-1',
            },
        },
    ],
});
```

### Kafka (via REST Proxy)

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'kafka-cluster',
            type: 'kafka',
            name: 'Kafka Cluster',
            config: {
                brokers: ['kafka1:9092', 'kafka2:9092', 'kafka3:9092'],
                clientId: 'vendure-datahub',
                ssl: true,
                sasl: {
                    mechanism: 'plain',
                    username: 'api-key',
                    password: 'api-secret',
                },
            },
        },
    ],
});
```

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
            connectionCode: 'rabbitmq-main',
            queue: 'orders.created',
            batchSize: 10,
            ackMode: 'MANUAL',
            maxRetries: 3,
            deadLetterQueue: 'orders.dlq',
        },
    })
    .extract('from-message', {
        adapterCode: 'inMemory',
        // Message body is automatically injected
    })
    .transform('validate', {
        adapterCode: 'validateRequired',
        fields: ['orderId', 'customerId', 'items'],
    })
    .transform('enrich', {
        adapterCode: 'map',
        mapping: {
            'processedAt': 'new Date().toISOString()',
            'source': '"queue"',
        },
    })
    .load('upsert-order', {
        adapterCode: 'orderLoader',
    })
    .build();
```

### Message Trigger Options

| Option | Type | Description |
|--------|------|-------------|
| `connectionCode` | string | Reference to queue connection |
| `queue` | string | Queue or topic name |
| `batchSize` | number | Messages to process at once |
| `ackMode` | 'AUTO' \| 'MANUAL' | Acknowledgment mode |
| `maxRetries` | number | Retries before DLQ |
| `deadLetterQueue` | string | DLQ for failed messages |
| `consumerGroup` | string | Consumer group (Kafka) |

## Producing to Queues

### Queue Producer Sink (RabbitMQ Example)

```typescript
const stockUpdatePipeline = createPipeline()
    .name('stock-to-queue')
    .description('Send stock updates to queue')
    .trigger('schedule', {
        type: 'SCHEDULE',
        schedule: { cron: '*/5 * * * *' },
    })
    .extract('stock-changes', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        // Get recently updated variants
    })
    .transform('prepare-message', {
        adapterCode: 'map',
        mapping: {
            'sku': 'sku',
            'stockOnHand': 'stockOnHand',
            'timestamp': 'new Date().toISOString()',
        },
    })
    .sink('to-queue', {
        adapterCode: 'queue-producer',
        connectionCode: 'rabbitmq-main',
        queue: 'inventory.updates',
        routingKey: 'stock.updated',
    })
    .build();
```

### Producer Options

| Option | Type | Description |
|--------|------|-------------|
| `connectionCode` | string | Reference to queue connection |
| `queue` | string | Target queue or topic |
| `routingKey` | string | Routing key (RabbitMQ) |
| `partition` | string | Partition key field (Kafka) |
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
            connectionCode: 'kafka-cluster',
            queue: 'ecommerce.orders',
            consumerGroup: 'vendure-sync',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .transform('map-order', {
        adapterCode: 'map',
        mapping: {
            'code': 'externalOrderId',
            'customerId': 'customer.email',
            'lines': 'items',
        },
    })
    .load('create-order', { adapterCode: 'orderLoader' })
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
            connectionCode: 'rabbitmq-main',
            queue: 'warehouse.stock',
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
            connectionCode: 'sqs-queue',
            queue: 'erp-price-updates',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .transform('convert-price', {
        adapterCode: 'toCents',
        source: 'price',
        target: 'priceInCents',
    })
    .load('update-variant', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        matchField: 'sku',
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
        eventType: 'ProductEvent',
    })
    .extract('from-event', { adapterCode: 'inMemory' })
    .sink('to-search-queue', {
        adapterCode: 'queue-producer',
        connectionCode: 'rabbitmq-main',
        queue: 'search.reindex',
    })
    .sink('to-analytics-queue', {
        adapterCode: 'queue-producer',
        connectionCode: 'rabbitmq-main',
        queue: 'analytics.product-change',
    })
    .sink('to-feed-queue', {
        adapterCode: 'queue-producer',
        connectionCode: 'rabbitmq-main',
        queue: 'feeds.regenerate',
    })
    .build();
```

## Error Handling

### Retry Strategy

Messages that fail processing are retried with exponential backoff:

1. First retry: Immediate
2. Second retry: After 5 seconds
3. Third retry: After 30 seconds
4. After max retries: Sent to dead-letter queue

### Dead Letter Queue

Configure DLQ for failed messages:

```typescript
.trigger('order-queue', {
    type: 'MESSAGE',
    message: {
        connectionCode: 'rabbitmq-main',
        queue: 'orders.created',
        maxRetries: 3,
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
            connectionCode: 'rabbitmq-main',
            queue: 'orders.dead-letter',
        },
    })
    .extract('from-message', { adapterCode: 'inMemory' })
    .transform('add-metadata', {
        adapterCode: 'enrich',
        set: {
            '_dlqProcessedAt': 'new Date().toISOString()',
            '_status': 'manual-review',
        },
    })
    .load('save-for-review', {
        adapterCode: 'restPost',
        url: 'https://api.example.com/dlq-review',
    })
    .build();
```

## Monitoring

### Queue Metrics

Monitor queue-based pipelines:

```graphql
query {
    dataHubPipelineRuns(
        filter: { pipelineCode: "order-queue-processor" }
        take: 100
    ) {
        items {
            id
            status
            startedAt
            completedAt
            metrics
            triggerPayload
        }
    }
}
```

### Health Checks

Check queue consumer status:

```graphql
query {
    dataHubQueueStatus(connectionCode: "rabbitmq-main") {
        connected
        consumers {
            pipelineCode
            queue
            messagesProcessed
            messagesPerMinute
            lastMessageAt
            errors
        }
    }
}
```

## Best Practices

### Message Format

Use consistent message format:

```json
{
    "id": "msg-12345",
    "type": "order.created",
    "timestamp": "2024-01-15T10:30:00Z",
    "source": "external-system",
    "data": {
        "orderId": "ORD-001",
        "customerId": "CUST-123",
        "items": []
    },
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
    adapterCode: 'deltaFilter',
    idPath: 'id',
    // Only process if record changed
})
```

### Batch Processing

Process messages in batches for efficiency:

```typescript
message: {
    queue: 'high-volume-events',
    batchSize: 100,  // Process 100 messages at once
}
```

### Graceful Shutdown

Ensure messages are acknowledged before shutdown:

```typescript
message: {
    ackMode: 'MANUAL',  // Ack only after successful processing
}
```

## Troubleshooting

### Consumer Not Receiving Messages

1. Check connection configuration
2. Verify queue exists and has messages
3. Check consumer group settings (Kafka)
4. Review permissions

### Messages Going to DLQ

1. Check pipeline logs for errors
2. Verify message format matches expected schema
3. Check `maxRetries` setting
4. Review DLQ messages for patterns

### High Latency

1. Increase `batchSize` for throughput
2. Check pipeline performance
3. Scale consumers horizontally
4. Optimize transform operations
