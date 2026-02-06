/**
 * Connection Types - SDK types for external connections and authentication
 *
 * These types define how to connect to external systems (APIs, databases, etc.)
 * and authenticate with them.
 *
 * @module sdk/types/connection-types
 */

import { JsonObject } from '../../types/index';
import {
    SecretResolver as SharedSecretResolver,
    AdapterLogger as SharedAdapterLogger,
} from '../../../shared/types';

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
 * External connection configuration for SDK use.
 *
 * SDK connection management interface that includes
 * the `code` field for identifying stored connections. It uses immutable
 * (readonly) properties for SDK safety.
 *
 * Related ConnectionConfig types:
 * - shared/types/extractor.types.ts ConnectionConfig - Extractor input format (no code, mutable)
 * - src/utils/url-helpers.ts UrlConnectionConfig - Minimal interface for URL building
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

export type SecretResolver = SharedSecretResolver;

/**
 * Interface for resolving connections at runtime
 */
export interface ConnectionResolver {
    /**
     * Get a connection configuration by code
     * @param code The connection identifier
     * @returns Connection config or undefined if not found
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

export type AdapterLogger = SharedAdapterLogger;

// MESSENGER TYPES

/**
 * Messenger adapter types for queue-based processing
 * Currently RabbitMQ is supported via HTTP Management API.
 */
export type MessengerType = 'job-queue' | 'rabbitmq';

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
