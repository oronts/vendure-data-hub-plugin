/**
 * Queue Adapter Interface
 *
 * Extensible interface for message queue producers and consumers.
 * Implement this interface to add support for new queue systems.
 */

import { JsonObject } from '../../../types/index';
import { AckMode } from '../../../constants/enums';

/**
 * Queue message to be published
 */
export interface QueueMessage {
    /** Message ID for deduplication */
    id: string;
    /** Message payload */
    payload: JsonObject;
    /** Routing key for topic-based routing */
    routingKey?: string;
    /** Message headers */
    headers?: Record<string, string>;
    /** Message priority (1-10) */
    priority?: number;
    /** Message expiration in milliseconds */
    ttlMs?: number;
    /** Persist to disk */
    persistent?: boolean;
    /** Delay before message becomes available */
    delayMs?: number;
}

/**
 * Result of publishing a message
 */
export interface PublishResult {
    success: boolean;
    messageId: string;
    error?: string;
}

/**
 * Result of consuming a message
 */
export interface ConsumeResult {
    messageId: string;
    payload: JsonObject;
    headers?: Record<string, string>;
    deliveryTag?: string;
    redelivered?: boolean;
}

/**
 * Queue connection configuration
 */
export interface QueueConnectionConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
    vhost?: string;
    useTls?: boolean;
    [key: string]: unknown;
}

/**
 * Queue adapter interface for message queue operations
 */
export interface QueueAdapter {
    /** Unique adapter code */
    readonly code: string;
    /** Display name */
    readonly name: string;
    /** Description */
    readonly description: string;

    /**
     * Publish messages to a queue
     * @param connectionConfig Queue connection configuration
     * @param queueName Target queue name
     * @param messages Messages to publish
     * @returns Array of publish results
     */
    publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]>;

    /**
     * Consume messages from a queue (polling-based)
     * @param connectionConfig Queue connection configuration
     * @param queueName Source queue name
     * @param options Consume options
     * @returns Array of consumed messages
     */
    consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: {
            count: number;
            ackMode: AckMode;
            prefetch?: number;
        },
    ): Promise<ConsumeResult[]>;

    /**
     * Acknowledge a consumed message
     * @param connectionConfig Queue connection configuration
     * @param deliveryTag Message delivery tag
     */
    ack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void>;

    /**
     * Reject/nack a consumed message
     * @param connectionConfig Queue connection configuration
     * @param deliveryTag Message delivery tag
     * @param requeue Whether to requeue the message
     */
    nack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void>;

    /**
     * Test connection to the queue system
     * @param connectionConfig Queue connection configuration
     * @returns True if connection is successful
     */
    testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean>;
}
