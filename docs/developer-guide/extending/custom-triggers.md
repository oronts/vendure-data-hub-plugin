# Custom Triggers

Create custom trigger types to start pipelines from new event sources.

## Overview

Data Hub supports several built-in trigger types:

| Type | Description | Status |
|------|-------------|--------|
| `manual` | Triggered via UI or API | ✅ Implemented |
| `schedule` | Cron-based scheduling | ✅ Implemented |
| `webhook` | HTTP webhook endpoint | ✅ Implemented |
| `event` | Vendure event subscription | ✅ Implemented |
| `file` | File watch (FTP/S3) | ⚠️ Defined, partial |
| `message` | Queue/messaging | ❌ Not implemented |

This guide covers how to implement custom trigger handlers, including the `message` trigger type for queue-based systems.

## Trigger Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Trigger Source │────▶│  Trigger Handler │────▶│ Pipeline Engine │
│  (Queue/Event)  │     │  (Your Code)     │     │  (Execution)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Implementing a Trigger Handler

### Step 1: Define Trigger Configuration

```typescript
// src/triggers/message-trigger.types.ts

import { TriggerType } from '@oronts/vendure-data-hub-plugin';

export interface MessageTriggerConfig {
    /** Connection code for queue system */
    connectionCode: string;
    /** Queue or topic name */
    queue: string;
    /** Consumer group (for Kafka) */
    consumerGroup?: string;
    /** Batch size for consuming messages */
    batchSize?: number;
    /** Acknowledgment mode */
    ackMode?: 'auto' | 'manual';
    /** Dead letter queue for failed messages */
    deadLetterQueue?: string;
    /** Max retries before DLQ */
    maxRetries?: number;
}

export interface MessagePayload {
    id: string;
    body: unknown;
    headers?: Record<string, string>;
    timestamp: string;
    retryCount?: number;
}
```

### Step 2: Create the Trigger Handler

```typescript
// src/triggers/message-trigger.handler.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    PipelineExecutionService,
    ConnectionService,
    DataHubLogger,
    DataHubLoggerFactory,
} from '@oronts/vendure-data-hub-plugin';
import { MessageTriggerConfig, MessagePayload } from './message-trigger.types';

@Injectable()
export class MessageTriggerHandler implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private consumers: Map<string, QueueConsumer> = new Map();
    private isRunning = false;

    constructor(
        private pipelineService: PipelineExecutionService,
        private connectionService: ConnectionService,
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger('MessageTriggerHandler');
    }

    async onModuleInit() {
        // Load all pipelines with message triggers and start consumers
        await this.initializeConsumers();
        this.isRunning = true;
    }

    async onModuleDestroy() {
        this.isRunning = false;
        await this.stopAllConsumers();
    }

    /**
     * Initialize consumers for all pipelines with message triggers
     */
    private async initializeConsumers() {
        const ctx = RequestContext.empty();
        const pipelines = await this.pipelineService.findPipelinesWithTriggerType(ctx, 'message');

        for (const pipeline of pipelines) {
            // Find message trigger by TYPE in steps array
            const messageTriggers = findEnabledTriggersByType(pipeline.definition, 'message');
            for (const trigger of messageTriggers) {
                const config = trigger.config as MessageTriggerConfig;
                await this.startConsumer(pipeline.id, pipeline.code, config);
            }
        }

        this.logger.info(`Initialized ${this.consumers.size} message consumers`);
    }

    /**
     * Start a consumer for a specific pipeline
     */
    async startConsumer(pipelineId: string, pipelineCode: string, config: MessageTriggerConfig) {
        const key = `${pipelineCode}:${config.queue}`;

        if (this.consumers.has(key)) {
            this.logger.warn(`Consumer already exists for ${key}`);
            return;
        }

        try {
            // Get connection configuration
            const ctx = RequestContext.empty();
            const connection = await this.connectionService.findByCode(ctx, config.connectionCode);

            if (!connection) {
                throw new Error(`Connection not found: ${config.connectionCode}`);
            }

            // Create appropriate consumer based on connection type
            const consumer = await this.createConsumer(connection.type, connection.config, config);

            // Set up message handler
            consumer.onMessage(async (message: MessagePayload) => {
                await this.handleMessage(pipelineId, pipelineCode, config, message);
            });

            // Start consuming
            await consumer.start();

            this.consumers.set(key, consumer);
            this.logger.info(`Started consumer for ${key}`);
        } catch (error) {
            this.logger.error(`Failed to start consumer for ${key}`, error);
        }
    }

    /**
     * Stop a consumer
     */
    async stopConsumer(pipelineCode: string, queue: string) {
        const key = `${pipelineCode}:${queue}`;
        const consumer = this.consumers.get(key);

        if (consumer) {
            await consumer.stop();
            this.consumers.delete(key);
            this.logger.info(`Stopped consumer for ${key}`);
        }
    }

    /**
     * Stop all consumers
     */
    private async stopAllConsumers() {
        for (const [key, consumer] of this.consumers) {
            await consumer.stop();
            this.logger.info(`Stopped consumer for ${key}`);
        }
        this.consumers.clear();
    }

    /**
     * Handle incoming message
     */
    private async handleMessage(
        pipelineId: string,
        pipelineCode: string,
        config: MessageTriggerConfig,
        message: MessagePayload,
    ) {
        const ctx = RequestContext.empty();

        try {
            this.logger.debug(`Received message for ${pipelineCode}`, {
                messageId: message.id,
                queue: config.queue,
            });

            // Create trigger payload
            const triggerPayload = {
                type: 'message' as const,
                timestamp: new Date().toISOString(),
                data: message.body,
                meta: {
                    messageId: message.id,
                    queue: config.queue,
                    headers: message.headers,
                    retryCount: message.retryCount || 0,
                },
            };

            // Execute pipeline
            const result = await this.pipelineService.executePipeline(
                ctx,
                pipelineCode,
                { triggerPayload },
            );

            this.logger.info(`Pipeline ${pipelineCode} completed`, {
                messageId: message.id,
                status: result.status,
                recordsProcessed: result.metrics?.totalRecords,
            });

            return { success: true };
        } catch (error) {
            this.logger.error(`Pipeline ${pipelineCode} failed`, {
                messageId: message.id,
                error: error.message,
            });

            // Handle retry logic
            const retryCount = (message.retryCount || 0) + 1;
            if (retryCount < (config.maxRetries || 3)) {
                return { success: false, retry: true, retryCount };
            }

            // Send to DLQ if configured
            if (config.deadLetterQueue) {
                // Implement DLQ sending
            }

            return { success: false, retry: false };
        }
    }

    /**
     * Create consumer based on connection type
     */
    private async createConsumer(
        type: string,
        connectionConfig: any,
        triggerConfig: MessageTriggerConfig,
    ): Promise<QueueConsumer> {
        switch (type) {
            case 'redis':
                return new RedisConsumer(connectionConfig, triggerConfig);
            case 'rabbitmq':
                return new RabbitMQConsumer(connectionConfig, triggerConfig);
            case 'kafka':
                return new KafkaConsumer(connectionConfig, triggerConfig);
            case 'sqs':
                return new SQSConsumer(connectionConfig, triggerConfig);
            default:
                throw new Error(`Unsupported queue type: ${type}`);
        }
    }
}

// Consumer interface
interface QueueConsumer {
    onMessage(handler: (message: MessagePayload) => Promise<{ success: boolean; retry?: boolean }>): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
```

### Step 3: Implement Queue-Specific Consumers

#### Redis Consumer (using BullMQ)

```typescript
// src/triggers/consumers/redis-consumer.ts

import { Queue, Worker } from 'bullmq';
import { MessagePayload, MessageTriggerConfig } from '../message-trigger.types';

interface RedisConnectionConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
}

export class RedisConsumer implements QueueConsumer {
    private worker: Worker | null = null;
    private messageHandler: ((message: MessagePayload) => Promise<any>) | null = null;

    constructor(
        private connectionConfig: RedisConnectionConfig,
        private triggerConfig: MessageTriggerConfig,
    ) {}

    onMessage(handler: (message: MessagePayload) => Promise<any>) {
        this.messageHandler = handler;
    }

    async start() {
        const connection = {
            host: this.connectionConfig.host,
            port: this.connectionConfig.port,
            password: this.connectionConfig.password,
            db: this.connectionConfig.db || 0,
        };

        this.worker = new Worker(
            this.triggerConfig.queue,
            async (job) => {
                if (!this.messageHandler) return;

                const message: MessagePayload = {
                    id: job.id || '',
                    body: job.data,
                    timestamp: new Date(job.timestamp).toISOString(),
                    retryCount: job.attemptsMade,
                };

                const result = await this.messageHandler(message);

                if (!result.success && result.retry) {
                    throw new Error('Retry requested');
                }
            },
            {
                connection,
                concurrency: this.triggerConfig.batchSize || 1,
            },
        );

        this.worker.on('error', (err) => {
            console.error('Worker error:', err);
        });
    }

    async stop() {
        if (this.worker) {
            await this.worker.close();
            this.worker = null;
        }
    }
}
```

#### RabbitMQ Consumer

```typescript
// src/triggers/consumers/rabbitmq-consumer.ts

import * as amqp from 'amqplib';
import { MessagePayload, MessageTriggerConfig } from '../message-trigger.types';

interface RabbitMQConnectionConfig {
    url: string;
    // or individual fields
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    vhost?: string;
}

export class RabbitMQConsumer implements QueueConsumer {
    private connection: amqp.Connection | null = null;
    private channel: amqp.Channel | null = null;
    private messageHandler: ((message: MessagePayload) => Promise<any>) | null = null;

    constructor(
        private connectionConfig: RabbitMQConnectionConfig,
        private triggerConfig: MessageTriggerConfig,
    ) {}

    onMessage(handler: (message: MessagePayload) => Promise<any>) {
        this.messageHandler = handler;
    }

    async start() {
        const url = this.connectionConfig.url || this.buildUrl();
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();

        // Ensure queue exists
        await this.channel.assertQueue(this.triggerConfig.queue, { durable: true });

        // Set prefetch for batch processing
        await this.channel.prefetch(this.triggerConfig.batchSize || 1);

        // Start consuming
        await this.channel.consume(
            this.triggerConfig.queue,
            async (msg) => {
                if (!msg || !this.messageHandler) return;

                const message: MessagePayload = {
                    id: msg.properties.messageId || msg.properties.correlationId || '',
                    body: JSON.parse(msg.content.toString()),
                    headers: msg.properties.headers as Record<string, string>,
                    timestamp: new Date().toISOString(),
                    retryCount: (msg.properties.headers?.['x-retry-count'] as number) || 0,
                };

                try {
                    const result = await this.messageHandler(message);

                    if (result.success || !result.retry) {
                        this.channel?.ack(msg);
                    } else {
                        // Requeue with retry count
                        this.channel?.nack(msg, false, true);
                    }
                } catch (error) {
                    this.channel?.nack(msg, false, true);
                }
            },
            { noAck: this.triggerConfig.ackMode === 'auto' },
        );
    }

    async stop() {
        if (this.channel) {
            await this.channel.close();
            this.channel = null;
        }
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
    }

    private buildUrl(): string {
        const { host, port, username, password, vhost } = this.connectionConfig;
        const auth = username ? `${username}:${password}@` : '';
        return `amqp://${auth}${host || 'localhost'}:${port || 5672}/${vhost || ''}`;
    }
}
```

### Step 4: Register the Trigger Handler

```typescript
// src/triggers/message-trigger.module.ts

import { Module } from '@nestjs/common';
import { MessageTriggerHandler } from './message-trigger.handler';

@Module({
    providers: [MessageTriggerHandler],
    exports: [MessageTriggerHandler],
})
export class MessageTriggerModule {}
```

```typescript
// In your plugin
import { VendurePlugin } from '@vendure/core';
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { MessageTriggerModule } from './triggers/message-trigger.module';

@VendurePlugin({
    imports: [DataHubPlugin, MessageTriggerModule],
})
export class MyQueueTriggersPlugin {}
```

## Using Message Triggers in Pipelines

### Pipeline Definition

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const orderSyncPipeline = createPipeline()
    .name('order-queue-sync')
    .description('Process orders from message queue')
    .trigger('queue-trigger', {
        type: 'message',
        message: {
            connectionCode: 'rabbitmq-main',
            queue: 'orders.created',
            batchSize: 10,
            ackMode: 'manual',
            deadLetterQueue: 'orders.dead-letter',
            maxRetries: 3,
        },
    })
    .extract('from-payload', {
        adapterCode: 'inMemory',
        // Data comes from trigger payload
    })
    .transform('validate', {
        adapterCode: 'validateRequired',
        fields: ['orderId', 'customerId', 'items'],
    })
    .load('create-order', {
        adapterCode: 'orderLoader',
    })
    .build();
```

### Connection Configuration

```typescript
DataHubPlugin.init({
    connections: [
        {
            code: 'rabbitmq-main',
            type: 'rabbitmq',
            config: {
                host: 'localhost',
                port: 5672,
                username: 'guest',
                password: 'guest',
                vhost: '/',
            },
        },
        {
            code: 'redis-queue',
            type: 'redis',
            config: {
                host: 'localhost',
                port: 6379,
                password: 'secret',
            },
        },
        {
            code: 'kafka-cluster',
            type: 'kafka',
            config: {
                brokers: ['kafka1:9092', 'kafka2:9092'],
                clientId: 'vendure-datahub',
                ssl: true,
                sasl: {
                    mechanism: 'plain',
                    username: 'user',
                    password: 'pass',
                },
            },
        },
    ],
});
```

## Bi-directional Queue Integration

### Consuming + Producing

```typescript
const fullQueuePipeline = createPipeline()
    .name('queue-to-queue')
    .description('Consume from one queue, process, produce to another')
    // Consume from input queue
    .trigger('input-queue', {
        type: 'message',
        message: {
            connectionCode: 'rabbitmq-main',
            queue: 'orders.pending',
        },
    })
    .extract('from-payload', { adapterCode: 'inMemory' })
    .transform('process', {
        adapterCode: 'map',
        mapping: {
            'orderId': 'id',
            'status': '"processed"',
            'processedAt': 'new Date().toISOString()',
        },
    })
    // Produce to output queue
    .sink('output-queue', {
        adapterCode: 'queue-producer',  // Custom sink
        connectionCode: 'rabbitmq-main',
        queue: 'orders.processed',
    })
    .build();
```

### Queue Producer Sink

```typescript
import { SinkAdapter, SinkContext, SinkResult } from '@oronts/vendure-data-hub-plugin';

export const queueProducerSink: SinkAdapter = {
    type: 'sink',
    code: 'queue-producer',
    name: 'Queue Producer',
    sinkType: 'custom',
    schema: {
        fields: [
            { key: 'connectionCode', type: 'string', required: true, label: 'Connection' },
            { key: 'queue', type: 'string', required: true, label: 'Queue/Topic' },
            { key: 'routingKey', type: 'string', label: 'Routing Key' },
        ],
    },

    async index(context, config, records): Promise<SinkResult> {
        const connection = await context.connections.get(config.connectionCode);

        // Implement queue-specific producer logic
        // ...

        return { indexed: records.length, deleted: 0, failed: 0 };
    },
};
```

## Error Handling

### Retry Configuration

```typescript
trigger('queue-trigger', {
    type: 'message',
    message: {
        connectionCode: 'rabbitmq-main',
        queue: 'orders',
        maxRetries: 5,
        deadLetterQueue: 'orders.dlq',
    },
})
```

### Dead Letter Queue Processing

```typescript
const dlqProcessingPipeline = createPipeline()
    .name('dlq-processor')
    .trigger('dlq-trigger', {
        type: 'message',
        message: {
            connectionCode: 'rabbitmq-main',
            queue: 'orders.dlq',
        },
    })
    .extract('from-payload', { adapterCode: 'inMemory' })
    .load('log-error', {
        adapterCode: 'webhook',
        url: 'https://monitoring.example.com/dlq-alert',
    })
    .build();
```

## Testing Triggers

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MessageTriggerHandler } from './message-trigger.handler';

describe('MessageTriggerHandler', () => {
    it('should handle message and execute pipeline', async () => {
        const mockPipelineService = {
            executePipeline: vi.fn().mockResolvedValue({
                status: 'COMPLETED',
                metrics: { totalRecords: 5 },
            }),
        };

        const handler = new MessageTriggerHandler(
            mockPipelineService as any,
            {} as any,
            {} as any,
            { createLogger: () => mockLogger } as any,
        );

        await handler.handleMessage(
            'pipeline-1',
            'test-pipeline',
            { connectionCode: 'test', queue: 'test' },
            { id: 'msg-1', body: { orderId: '123' }, timestamp: new Date().toISOString() },
        );

        expect(mockPipelineService.executePipeline).toHaveBeenCalledWith(
            expect.anything(),
            'test-pipeline',
            expect.objectContaining({
                triggerPayload: expect.objectContaining({
                    type: 'message',
                    data: { orderId: '123' },
                }),
            }),
        );
    });
});
```
