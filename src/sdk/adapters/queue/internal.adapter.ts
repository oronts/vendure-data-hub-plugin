/**
 * Internal (In-Process) Queue Adapter
 *
 * Lightweight in-process message queue for testing and development.
 * Messages are stored in a module-level Map buffer — no external dependencies required.
 *
 * Suitable for:
 * - Unit and integration testing pipelines with MESSAGE triggers
 * - Local development without external queue infrastructure
 * - Simple fan-out within a single server instance
 *
 * NOT suitable for production multi-instance deployments (no shared state across processes).
 */

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
        'No external dependencies required — messages are stored in memory.';

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
        return batch.map(msg => ({
            messageId: msg.id,
            payload: msg.payload,
            headers: msg.headers,
            deliveryTag: msg.id,
        }));
    }

    async ack(_connectionConfig: QueueConnectionConfig, _deliveryTag: string): Promise<void> {
        // No-op: in-process queue has no external ack mechanism
    }

    async nack(
        _connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        if (requeue) {
            // Re-queue to the default internal queue (best effort)
            const buf = getBuffer('__internal_requeue__');
            buf.push({ id: deliveryTag, payload: {} });
        }
        // Otherwise discard
    }

    async testConnection(_connectionConfig: QueueConnectionConfig): Promise<boolean> {
        return true;
    }
}

export const internalQueueAdapter = new InternalQueueAdapter();
