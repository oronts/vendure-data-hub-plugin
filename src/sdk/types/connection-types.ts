import { JsonObject } from '../../types/index';
import {
    SecretResolver as SharedSecretResolver,
    AdapterLogger as SharedAdapterLogger,
} from '../../../shared/types';

export type ConnectionType = 'http' | 's3' | 'sftp' | 'database' | 'custom';

export enum ConnectionAuthType {
    NONE = 'none',
    BASIC = 'basic',
    BEARER = 'bearer',
    API_KEY = 'api-key',
    OAUTH2 = 'oauth2',
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

export type MessengerType = 'job-queue' | 'rabbitmq';

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
