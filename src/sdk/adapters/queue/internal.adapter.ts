/** In-process queue adapter for testing and development. Not suitable for multi-instance deployments. */

import { AckMode } from '../../../constants/enums';
import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
} from './queue-adapter.interface';

/** Module-level buffer: queueName → ordered message list */
const internalBuffer = new Map<string, QueueMessage[]>();

/** Pending messages awaiting ack/nack: deliveryTag → { queueName, message } */
const pendingMessages = new Map<string, { queueName: string; message: QueueMessage }>();

/** Track message IDs that have been requeued (nack with requeue=true) */
const redeliveredIds = new Set<string>();

/** Return (creating if necessary) the buffer for a given queue */
function getBuffer(queueName: string): QueueMessage[] {
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
            buf.push(msg);
            return { success: true, messageId: msg.id };
        });
    }

    async consume(
        _connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: { count: number; ackMode: AckMode; prefetch?: number },
    ): Promise<ConsumeResult[]> {
        const buf = getBuffer(queueName);
        const batch = buf.splice(0, options.count);
        let tagCounter = 0;
        return batch.map(msg => {
            const deliveryTag = `${queueName}:${msg.id}:${Date.now()}:${tagCounter++}`;
            if (options.ackMode === AckMode.MANUAL) {
                pendingMessages.set(deliveryTag, { queueName, message: msg });
            }
            const redeliveryKey = `${queueName}:${msg.id}`;
            return {
                messageId: msg.id,
                payload: msg.payload,
                headers: msg.headers,
                deliveryTag: options.ackMode === AckMode.MANUAL ? deliveryTag : undefined,
                redelivered: redeliveredIds.has(redeliveryKey),
            };
        });
    }

    async ack(_connectionConfig: QueueConnectionConfig, deliveryTag: string): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        pendingMessages.delete(deliveryTag);
        if (pending) redeliveredIds.delete(`${pending.queueName}:${pending.message.id}`);
    }

    async nack(
        _connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = pendingMessages.get(deliveryTag);
        pendingMessages.delete(deliveryTag);

        if (requeue && pending) {
            redeliveredIds.add(`${pending.queueName}:${pending.message.id}`);
            const buf = getBuffer(pending.queueName);
            buf.push(pending.message);
        } else if (pending) {
            redeliveredIds.delete(`${pending.queueName}:${pending.message.id}`);
        }
    }

    async testConnection(_connectionConfig: QueueConnectionConfig): Promise<boolean> {
        return true;
    }

    async destroy(): Promise<void> {
        internalBuffer.clear();
        pendingMessages.clear();
        redeliveredIds.clear();
    }
}

export const internalQueueAdapter = new InternalQueueAdapter();
