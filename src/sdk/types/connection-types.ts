import {
    JsonObject,
    SecretResolver,
    AdapterLogger,
} from '../../../shared/types';

export type ConnectionType = 'HTTP' | 'S3' | 'FTP' | 'SFTP' | 'DATABASE' | 'CUSTOM';

/**
 * Authentication types for SDK connection contracts.
 *
 * Structurally identical to AuthType in src/constants/enums.ts — kept separate
 * because the SDK must be independently packageable without importing from src/.
 *
 * @see src/constants/enums.ts — AuthType (same 7 values, backend-facing)
 */
export enum ConnectionAuthType {
    NONE = 'NONE',
    BASIC = 'BASIC',
    BEARER = 'BEARER',
    API_KEY = 'API_KEY',
    OAUTH2 = 'OAUTH2',
    HMAC = 'HMAC',
    JWT = 'JWT',
}

export interface ConnectionAuth {
    readonly type: ConnectionAuthType;
    readonly secretCode?: string;
    readonly headerName?: string;
}

/**
 * SDK ConnectionConfig - the full connection entity with `code` identifier.
 * Readonly contract for adapter implementors.
 *
 * Related ConnectionConfig types:
 * - shared/types/extractor.types.ts ConnectionConfig - inline connection format for
 *   extractor configs (no `code`, narrower type set, mutable)
 * - src/utils/url-helpers.ts UrlConnectionConfig - minimal interface for URL building
 */
export interface ConnectionConfig {
    readonly code: string;
    readonly type: ConnectionType;
    readonly baseUrl?: string;
    readonly headers?: Record<string, string>;
    readonly auth?: ConnectionAuth;
    readonly config?: JsonObject;
}

export type { SecretResolver, AdapterLogger };

export interface ConnectionResolver {
    get(code: string): Promise<ConnectionConfig | undefined>;
    getRequired(code: string): Promise<ConnectionConfig>;
}

export type MessengerType = 'JOB_QUEUE' | 'RABBITMQ';

export interface EnqueueOptions {
    readonly delayMs?: number;
    readonly priority?: number;
    readonly retries?: number;
    readonly deduplicationId?: string;
    readonly groupId?: string;
    readonly headers?: Record<string, string>;
}

export interface QueueStats {
    readonly pending: number;
    readonly processing: number;
    readonly completed: number;
    readonly failed: number;
    readonly delayed?: number;
}

export interface MessengerAdapter {
    readonly id: MessengerType;
    readonly name: string;
    readonly description?: string;

    enqueue<T extends JsonObject>(queue: string, payload: T, options?: EnqueueOptions): Promise<string>;
    ack(messageId: string): Promise<void>;
    reject(messageId: string, requeue?: boolean): Promise<void>;
    getQueueStats(queue: string): Promise<QueueStats>;
}
