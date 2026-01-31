/**
 * Queue Adapter Registry
 *
 * Central registry for queue adapters. New queue systems can be added
 * by implementing QueueAdapter and registering here.
 *
 * Available adapters:
 * - rabbitmq-amqp: Native AMQP 0-9-1 protocol (recommended for production)
 * - rabbitmq: HTTP Management API fallback (useful when amqplib unavailable)
 * - sqs: AWS SQS for cloud-native message queuing
 * - redis-streams: Redis Streams for high-performance messaging
 */

import { QueueAdapter } from './queue-adapter.interface';
import { rabbitmqAdapter } from './rabbitmq.adapter';
import { rabbitmqAmqpAdapter } from './rabbitmq-amqp.adapter';
import { sqsAdapter } from './sqs.adapter';
import { redisStreamsAdapter } from './redis-streams.adapter';

/**
 * Validate adapter code format
 * @param code Adapter code to validate
 * @throws Error if code is invalid
 */
function validateAdapterCode(code: string): void {
    if (!code || typeof code !== 'string') {
        throw new Error('Queue adapter code must be a non-empty string');
    }
    if (code.trim() !== code) {
        throw new Error('Queue adapter code must not have leading or trailing whitespace');
    }
    if (code.length > 50) {
        throw new Error('Queue adapter code must not exceed 50 characters');
    }
}

class QueueAdapterRegistry {
    private adapters = new Map<string, QueueAdapter>();

    constructor() {
        // Register built-in adapters
        // AMQP adapter is the preferred production adapter for RabbitMQ
        this.register(rabbitmqAmqpAdapter);
        // HTTP Management API adapter as fallback for RabbitMQ
        this.register(rabbitmqAdapter);
        // AWS SQS adapter for cloud-native deployments
        this.register(sqsAdapter);
        // Redis Streams adapter for high-performance messaging
        this.register(redisStreamsAdapter);
    }

    /**
     * Register a queue adapter
     * @param adapter Queue adapter to register
     * @throws Error if adapter is invalid or code is already registered
     */
    register(adapter: QueueAdapter): void {
        if (!adapter) {
            throw new Error('Queue adapter is required');
        }
        validateAdapterCode(adapter.code);

        if (this.adapters.has(adapter.code)) {
            throw new Error(`Queue adapter already registered: ${adapter.code}`);
        }
        this.adapters.set(adapter.code, adapter);
    }

    /**
     * Get an adapter by code
     */
    get(code: string): QueueAdapter | undefined {
        return this.adapters.get(code);
    }

    /**
     * Get all registered adapters
     */
    getAll(): QueueAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Get all adapter codes
     */
    getCodes(): string[] {
        return Array.from(this.adapters.keys());
    }

    /**
     * Check if an adapter is registered
     */
    has(code: string): boolean {
        return this.adapters.has(code);
    }
}

export const queueAdapterRegistry = new QueueAdapterRegistry();
