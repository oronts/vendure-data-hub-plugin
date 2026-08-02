export type AmqpConnection = {
    createConfirmChannel(): Promise<AmqpChannel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
};

export type AmqpChannel = {
    assertQueue(
        queue: string,
        options?: Record<string, unknown>,
    ): Promise<unknown>;
    publish(
        exchange: string,
        routingKey: string,
        content: Buffer,
        options?: Record<string, unknown>,
        callback?: (error: Error | null) => void,
    ): boolean;
    get(
        queue: string,
        options?: { noAck?: boolean },
    ): Promise<AmqpMessage | false>;
    ack(message: { fields: { deliveryTag: number } }): void;
    nack(
        message: { fields: { deliveryTag: number } },
        allUpTo?: boolean,
        requeue?: boolean,
    ): void;
    prefetch(count: number): Promise<void>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
};

export type AmqpMessage = {
    content: Buffer;
    fields: {
        deliveryTag: number;
        redelivered: boolean;
    };
    properties: {
        messageId?: string;
        headers?: Record<string, unknown>;
    };
};

export interface RabbitMqConnectionEntry {
    connection: AmqpConnection;
    channel: AmqpChannel;
    lastUsed: number;
}

export interface PendingRabbitMqMessage {
    channel: AmqpChannel;
    deliveryTag: number;
    connectionIdentity: string;
    createdAt: number;
}

export class RabbitMqAdapterState {
    readonly connectionPool = new Map<string, RabbitMqConnectionEntry>();
    readonly connectingPromises = new Map<
        string,
        Promise<{ connection: AmqpConnection; channel: AmqpChannel }>
    >();
    readonly pendingMessages = new Map<string, PendingRabbitMqMessage>();
    readonly cleanupOperations = new Set<Promise<void>>();

    trackCleanup(operation: Promise<void>): void {
        this.cleanupOperations.add(operation);
        void operation.then(
            () => this.cleanupOperations.delete(operation),
            () => this.cleanupOperations.delete(operation),
        );
    }

    hasPendingMessages(connectionIdentity: string): boolean {
        return [...this.pendingMessages.values()].some(
            pending => pending.connectionIdentity === connectionIdentity,
        );
    }

    takeExpiredPendingMessages(
        now: number,
        maximumAgeMs: number,
    ): PendingRabbitMqMessage[] {
        const expired: PendingRabbitMqMessage[] = [];
        for (const [deliveryTag, pending] of this.pendingMessages.entries()) {
            if (now - pending.createdAt > maximumAgeMs) {
                this.pendingMessages.delete(deliveryTag);
                expired.push(pending);
            }
        }
        return expired;
    }

    removePendingMessagesForChannel(channel: AmqpChannel): void {
        for (const [deliveryTag, pending] of this.pendingMessages.entries()) {
            if (pending.channel === channel) {
                this.pendingMessages.delete(deliveryTag);
            }
        }
    }
}
