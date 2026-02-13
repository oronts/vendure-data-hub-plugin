import { JsonObject } from '../../types/index';
import {
    SecretResolver as SharedSecretResolver,
    AdapterLogger as SharedAdapterLogger,
} from '../../../shared/types';

export type ConnectionType = 'HTTP' | 'S3' | 'FTP' | 'SFTP' | 'DATABASE' | 'CUSTOM';

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

export interface ConnectionConfig {
    readonly code: string;
    readonly type: ConnectionType;
    readonly baseUrl?: string;
    readonly headers?: Record<string, string>;
    readonly auth?: ConnectionAuth;
    readonly config?: JsonObject;
}

export type SecretResolver = SharedSecretResolver;

export interface ConnectionResolver {
    get(code: string): Promise<ConnectionConfig | undefined>;
    getRequired(code: string): Promise<ConnectionConfig>;
}

export type AdapterLogger = SharedAdapterLogger;

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
