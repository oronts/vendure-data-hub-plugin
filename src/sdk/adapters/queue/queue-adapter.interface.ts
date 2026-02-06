import { JsonObject } from '../../../types/index';
import { AckMode } from '../../../constants/enums';

export interface QueueMessage {
    id: string;
    payload: JsonObject;
    routingKey?: string;
    headers?: Record<string, string>;
    priority?: number;
    ttlMs?: number;
    persistent?: boolean;
    delayMs?: number;
}

export interface PublishResult {
    success: boolean;
    messageId: string;
    error?: string;
}

export interface ConsumeResult {
    messageId: string;
    payload: JsonObject;
    headers?: Record<string, string>;
    deliveryTag?: string;
    redelivered?: boolean;
}

export interface QueueConnectionConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
    vhost?: string;
    useTls?: boolean;
    [key: string]: unknown;
}

export interface QueueAdapter {
    readonly code: string;
    readonly name: string;
    readonly description: string;

    publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]>;

    consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: {
            count: number;
            ackMode: AckMode;
            prefetch?: number;
        },
    ): Promise<ConsumeResult[]>;

    ack(connectionConfig: QueueConnectionConfig, deliveryTag: string): Promise<void>;

    nack(connectionConfig: QueueConnectionConfig, deliveryTag: string, requeue: boolean): Promise<void>;

    testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean>;
}
