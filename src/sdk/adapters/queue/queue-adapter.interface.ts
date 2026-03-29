import { JsonObject } from '../../../types/index';
import { AckMode } from '../../../constants/enums';

export interface QueueMessage {
    readonly id: string;
    readonly payload: JsonObject;
    readonly routingKey?: string;
    readonly headers?: Record<string, string>;
    readonly priority?: number;
    readonly ttlMs?: number;
    readonly persistent?: boolean;
    readonly delayMs?: number;
}

export interface PublishResult {
    readonly success: boolean;
    readonly messageId: string;
    readonly error?: string;
}

export interface ConsumeResult {
    readonly messageId: string;
    readonly payload: JsonObject;
    readonly headers?: Record<string, string>;
    readonly deliveryTag?: string;
    readonly redelivered?: boolean;
}

export interface QueueConnectionConfig {
    readonly host: string;
    readonly port: number;
    readonly username?: string;
    readonly password?: string;
    readonly vhost?: string;
    readonly useTls?: boolean;
    readonly [key: string]: unknown;
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

    destroy(): Promise<void>;
}
