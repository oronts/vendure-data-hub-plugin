import { afterEach, describe, expect, it } from 'vitest';
import { AckMode } from '../../../constants/enums';
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
});
