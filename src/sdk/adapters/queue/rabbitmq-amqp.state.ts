import type { AckMode } from '../../../constants/enums';

export type AmqpConnection = {
    createChannel(): Promise<AmqpChannel>;
    createConfirmChannel(): Promise<AmqpConfirmChannel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
};

export type AmqpChannel = {
    assertQueue(
        queue: string,
        options?: Record<string, unknown>,
    ): Promise<unknown>;
    consume(
        queue: string,
        onMessage: (message: AmqpMessage | null) => void,
        options?: { noAck?: boolean },
    ): Promise<{ consumerTag: string }>;
    cancel(consumerTag: string): Promise<unknown>;
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

export type AmqpConfirmChannel = AmqpChannel & {
    publish(
        exchange: string,
        routingKey: string,
        content: Buffer,
        options?: Record<string, unknown>,
        callback?: (error: Error | null) => void,
    ): boolean;
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
    channel: AmqpConfirmChannel;
    lastUsed: number;
}

export interface PendingRabbitMqMessage {
    channel: AmqpChannel;
    deliveryTag: number;
    connectionIdentity: string;
    createdAt: number;
}

export interface RabbitMqSubscription {
    consumerId: string;
    connectionIdentity: string;
    queueName: string;
    prefetch: number;
    ackMode: AckMode;
    channel: AmqpChannel;
    deliveries: AmqpMessage[];
    consumerTag?: string;
    closed: boolean;
}

export class RabbitMqAdapterState {
    readonly connectionPool = new Map<string, RabbitMqConnectionEntry>();
    readonly connectingPromises = new Map<
        string,
        Promise<{ connection: AmqpConnection; channel: AmqpConfirmChannel }>
    >();
    readonly pendingMessages = new Map<string, PendingRabbitMqMessage>();
    readonly subscriptions = new Map<string, RabbitMqSubscription>();
    readonly subscriptionPromises = new Map<
        string,
        Promise<RabbitMqSubscription>
    >();
    readonly subscriptionCapacityReservations = new Map<string, number>();
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

    hasActiveSubscriptions(connectionIdentity: string): boolean {
        return [...this.subscriptions.values()].some(
            subscription =>
                !subscription.closed &&
                subscription.connectionIdentity === connectionIdentity,
        );
    }

    getReservedSubscriptionCapacity(excludedConsumerId?: string): number {
        let total = 0;
        for (const subscription of this.subscriptions.values()) {
            if (
                !subscription.closed &&
                subscription.consumerId !== excludedConsumerId
            ) {
                total += subscription.prefetch;
            }
        }
        for (const [consumerId, capacity] of this.subscriptionCapacityReservations) {
            if (
                consumerId !== excludedConsumerId &&
                !this.subscriptions.has(consumerId)
            ) {
                total += capacity;
            }
        }
        return total;
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

    removeConnectionState(connectionIdentity: string): void {
        for (const [consumerId, subscription] of this.subscriptions.entries()) {
            if (subscription.connectionIdentity === connectionIdentity) {
                subscription.closed = true;
                subscription.deliveries.length = 0;
                this.subscriptions.delete(consumerId);
            }
        }
        for (const [deliveryTag, pending] of this.pendingMessages.entries()) {
            if (pending.connectionIdentity === connectionIdentity) {
                this.pendingMessages.delete(deliveryTag);
            }
        }
    }
}
