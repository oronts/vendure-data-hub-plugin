import { afterEach, describe, expect, it } from 'vitest';
import { AckMode } from '../../../constants/enums';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { internalQueueAdapter } from './internal.adapter';
import type { QueueConnectionConfig } from './queue-adapter.interface';

const connection: QueueConnectionConfig = { host: 'internal' };

afterEach(async () => {
    await internalQueueAdapter.destroy();
});

describe('internal queue adapter', () => {
    it('keeps manual deliveries distinct when message IDs are duplicated', async () => {
        await internalQueueAdapter.publish(connection, 'catalog', [
            { id: 'duplicate', payload: { sequence: 1 } },
            { id: 'duplicate', payload: { sequence: 2 } },
        ]);

        const [first] = await internalQueueAdapter.consume(connection, 'catalog', {
            count: 1,
            ackMode: AckMode.MANUAL,
        });
        const [second] = await internalQueueAdapter.consume(connection, 'catalog', {
            count: 1,
            ackMode: AckMode.MANUAL,
        });

        expect(first.deliveryTag).toBeDefined();
        expect(second.deliveryTag).toBeDefined();
        expect(first.deliveryTag).not.toBe(second.deliveryTag);
        if (!first.deliveryTag || !second.deliveryTag) {
            throw new Error('Manual delivery tags were not created');
        }

        await internalQueueAdapter.nack(connection, first.deliveryTag, true);
        await internalQueueAdapter.ack(connection, second.deliveryTag);

        const [redelivered] = await internalQueueAdapter.consume(connection, 'catalog', {
            count: 1,
            ackMode: AckMode.AUTO,
        });
        expect(redelivered).toMatchObject({
            messageId: 'duplicate',
            payload: { sequence: 1 },
            redelivered: true,
        });
    });

    it('rejects unknown settlement tags', async () => {
        await expect(internalQueueAdapter.ack(connection, 'missing')).rejects.toThrow(
            'No pending message found for delivery tag: missing',
        );
        await expect(internalQueueAdapter.nack(connection, 'missing', true)).rejects.toThrow(
            'No pending message found for delivery tag: missing',
        );
        await expect(internalQueueAdapter.renewLease(connection, 'missing')).rejects.toThrow(
            'No pending message found for delivery tag: missing',
        );
    });

    it('rejects invalid direct consume counts', async () => {
        await expect(internalQueueAdapter.consume(connection, 'catalog', {
            count: Number.POSITIVE_INFINITY,
            ackMode: AckMode.AUTO,
        })).rejects.toThrow('Internal queue consume count must be a positive integer');
    });

    it('retains buffered messages when manual settlement capacity is full', async () => {
        const originalLimit = QUEUE.MAX_PENDING_MESSAGES;
        Object.assign(QUEUE, { MAX_PENDING_MESSAGES: 1 });

        try {
            await internalQueueAdapter.publish(connection, 'catalog', [
                { id: 'first', payload: { sequence: 1 } },
                { id: 'second', payload: { sequence: 2 } },
            ]);
            const [first] = await internalQueueAdapter.consume(connection, 'catalog', {
                count: 2,
                ackMode: AckMode.MANUAL,
            });

            await expect(internalQueueAdapter.consume(connection, 'catalog', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([]);
            await internalQueueAdapter.ack(connection, first.deliveryTag!);
            await expect(internalQueueAdapter.consume(connection, 'catalog', {
                count: 1,
                ackMode: AckMode.AUTO,
            })).resolves.toEqual([
                expect.objectContaining({ messageId: 'second' }),
            ]);
        } finally {
            Object.assign(QUEUE, { MAX_PENDING_MESSAGES: originalLimit });
        }
    });
});
