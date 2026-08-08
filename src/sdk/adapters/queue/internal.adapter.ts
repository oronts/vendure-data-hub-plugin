/** In-process queue adapter for testing and development. Not suitable for multi-instance deployments. */

import { randomUUID } from 'node:crypto';
import { AckMode } from '../../../constants/enums';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { requirePositiveInteger } from './queue-message.utils';
import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
    QueueConsumeOptions,
} from './queue-adapter.interface';

interface BufferedMessage {
    readonly message: QueueMessage;
    readonly redelivered: boolean;
}

/** Module-level buffer: queueName → ordered delivery list */
const internalBuffer = new Map<string, BufferedMessage[]>();

/** Pending messages awaiting ack/nack: deliveryTag → { queueName, delivery } */
const pendingMessages = new Map<string, { queueName: string; delivery: BufferedMessage }>();

/** Return (creating if necessary) the buffer for a given queue */
function getBuffer(queueName: string): BufferedMessage[] {
    let buf = internalBuffer.get(queueName);
    if (!buf) {
        buf = [];
        internalBuffer.set(queueName, buf);
    }
    return buf;
}

class InternalQueueAdapter implements QueueAdapter {
    readonly code = 'internal';
    readonly name = 'Internal (In-Process)';
    readonly description =
        'In-process message queue for testing and development. ' +
        'No external dependencies required - messages are stored in memory.';

    async publish(
        _connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        const buf = getBuffer(queueName);
        return messages.map(msg => {
            buf.push({ message: msg, redelivered: false });
            return { success: true, messageId: msg.id };
        });
    }

    async consume(
        _connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: QueueConsumeOptions,
    ): Promise<ConsumeResult[]> {
        const buf = getBuffer(queueName);
        const requestedCount = requirePositiveInteger(
            options.count,
            'Internal queue consume count',
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
        );
        const count = options.ackMode === AckMode.MANUAL
            ? Math.min(
                requestedCount,
                Math.max(0, QUEUE.MAX_PENDING_MESSAGES - pendingMessages.size),
            )
            : requestedCount;
        const batch = buf.splice(0, count);
        return batch.map(delivery => {
            const deliveryTag = `internal:${queueName}:${randomUUID()}`;
            if (options.ackMode === AckMode.MANUAL) {
                pendingMessages.set(deliveryTag, { queueName, delivery });
            }
            return {
                messageId: delivery.message.id,
                payload: delivery.message.payload,
                headers: delivery.message.headers,
                deliveryTag: options.ackMode === AckMode.MANUAL ? deliveryTag : undefined,
                redelivered: delivery.redelivered,
            };
        });
    }

    async ack(_connectionConfig: QueueConnectionConfig, deliveryTag: string): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }
        pendingMessages.delete(deliveryTag);
    }

    async nack(
        _connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }
        pendingMessages.delete(deliveryTag);

        if (requeue) {
            const buf = getBuffer(pending.queueName);
            buf.push({ message: pending.delivery.message, redelivered: true });
        }
    }

    async renewLease(
        _connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        if (!pendingMessages.has(deliveryTag)) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }
    }

    async testConnection(_connectionConfig: QueueConnectionConfig): Promise<boolean> {
        return true;
    }

    async destroy(): Promise<void> {
        internalBuffer.clear();
        pendingMessages.clear();
    }
}

export const internalQueueAdapter = new InternalQueueAdapter();
