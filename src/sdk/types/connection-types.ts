/**
 * Connection Types - SDK types for external connections and authentication
 *
 * These types define how to connect to external systems (APIs, databases, etc.)
 * and authenticate with them.
 *
 * @module sdk/types/connection-types
 */

import { JsonObject } from '../../types/index';

// CONNECTION CONFIGURATION

/**
 * Connection type string literals (for convenience)
 */
export type ConnectionType = 'http' | 's3' | 'sftp' | 'database' | 'custom';

/**
 * Enumerates supported authentication strategies for connections
 */
export enum ConnectionAuthType {
    NONE = 'none',
    BASIC = 'basic',
    BEARER = 'bearer',
    API_KEY = 'api-key',
    OAUTH2 = 'oauth2',
}

/**
 * Authentication configuration for connections
 */
export interface ConnectionAuth {
    /** Authentication type */
    readonly type: ConnectionAuthType;
    /** Reference to a secret containing credentials */
    readonly secretCode?: string;
    /** Header name for API key authentication */
    readonly headerName?: string;
}

/**
 * External connection configuration
 */
export interface ConnectionConfig {
    /** Unique connection identifier */
    readonly code: string;
    /** Type of connection */
    readonly type: ConnectionType;
    /** Base URL for HTTP connections */
    readonly baseUrl?: string;
    /** Default headers for HTTP connections */
    readonly headers?: Record<string, string>;
    /** Authentication configuration */
    readonly auth?: ConnectionAuth;
    /** Additional configuration specific to connection type */
    readonly config?: JsonObject;
}

// SECRET RESOLUTION

/**
 * Interface for resolving secrets at runtime
 */
export interface SecretResolver {
    /**
     * Get a secret value by code
     * @param code The secret identifier
     * @returns The secret value or undefined if not found
     */
    get(code: string): Promise<string | undefined>;

    /**
     * Get a required secret value by code
     * @param code The secret identifier
     * @throws Error if secret is not found
     */
    getRequired(code: string): Promise<string>;
}

/**
 * Interface for resolving connections at runtime
 */
export interface ConnectionResolver {
    /**
     * Get a connection configuration by code
     * @param code The connection identifier
     * @returns The connection config or undefined if not found
     */
    get(code: string): Promise<ConnectionConfig | undefined>;

    /**
     * Get a required connection configuration by code
     * @param code The connection identifier
     * @throws Error if connection is not found
     */
    getRequired(code: string): Promise<ConnectionConfig>;
}

// ADAPTER LOGGER

/**
 * Logger interface for adapters
 */
export interface AdapterLogger {
    /** Log debug message */
    debug(message: string, data?: JsonObject): void;
    /** Log info message */
    info(message: string, data?: JsonObject): void;
    /** Log warning message */
    warn(message: string, data?: JsonObject): void;
    /** Log error message */
    error(message: string, error?: Error | JsonObject): void;
}

// MESSENGER TYPES

/**
 * Messenger adapter types for queue-based processing
 */
export type MessengerType = 'job-queue' | 'redis' | 'rabbitmq' | 'kafka' | 'sqs' | 'pubsub';

/**
 * Options for enqueueing messages
 */
export interface EnqueueOptions {
    /** Delay before message becomes visible (milliseconds) */
    readonly delayMs?: number;
    /** Message priority (higher = processed first) */
    readonly priority?: number;
    /** Number of retry attempts */
    readonly retries?: number;
    /** Deduplication ID for exactly-once processing */
    readonly deduplicationId?: string;
    /** Group ID for FIFO ordering */
    readonly groupId?: string;
    /** Custom headers */
    readonly headers?: Record<string, string>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
    /** Messages waiting to be processed */
    readonly pending: number;
    /** Messages currently being processed */
    readonly processing: number;
    /** Successfully processed messages */
    readonly completed: number;
    /** Failed messages */
    readonly failed: number;
    /** Messages scheduled for future delivery */
    readonly delayed?: number;
}

/**
 * Messenger adapter interface for queue operations
 */
export interface MessengerAdapter {
    /** Unique messenger identifier */
    readonly id: MessengerType;
    /** Display name */
    readonly name: string;
    /** Optional description */
    readonly description?: string;

    /**
     * Enqueue a message for processing
     * @param queue Queue name
     * @param payload Message payload
     * @param options Enqueue options
     * @returns Message ID
     */
    enqueue<T extends JsonObject>(queue: string, payload: T, options?: EnqueueOptions): Promise<string>;

    /**
     * Acknowledge successful message processing
     * @param messageId Message ID to acknowledge
     */
    ack(messageId: string): Promise<void>;

    /**
     * Reject a message (failed processing)
     * @param messageId Message ID to reject
     * @param requeue Whether to requeue the message
     */
    reject(messageId: string, requeue?: boolean): Promise<void>;

    /**
     * Get queue statistics
     * @param queue Queue name
     */
    getQueueStats(queue: string): Promise<QueueStats>;
}
