import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AckMode, OUTBOUND_RESPONSE_LIMITS } from '../../../constants';
import { secureFetch } from '../../../utils/secure-fetch.utils';
import type { QueueConnectionConfig } from './queue-adapter.interface';
import { RabbitMQAdapter } from './rabbitmq.adapter';

vi.mock('../../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

const connectionConfig = {
    host: 'rabbitmq.example.com',
    port: 15_672,
} as QueueConnectionConfig;

describe('RabbitMQAdapter acknowledgment capabilities', () => {
    beforeEach(() => {
        vi.mocked(secureFetch).mockReset();
    });

    it('rejects MANUAL consumption before making an HTTP request', async () => {
        const adapter = new RabbitMQAdapter();

        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
        })).rejects.toThrow('supports AUTO acknowledgment only');
    });

    it('rejects individual ack and nack calls instead of reporting fake success', async () => {
        const adapter = new RabbitMQAdapter();

        await expect(adapter.ack(connectionConfig, 'delivery-1'))
            .rejects.toThrow('cannot be acknowledged individually');
        await expect(adapter.nack(connectionConfig, 'delivery-1', true))
            .rejects.toThrow('cannot be rejected individually');
    });

    it('rejects oversized publish response bodies', async () => {
        vi.mocked(secureFetch).mockResolvedValue(new Response('{"routed":true}', {
            status: 200,
            headers: {
                'content-length': String(OUTBOUND_RESPONSE_LIMITS.ERROR_BODY_BYTES + 1),
            },
        }));
        const adapter = new RabbitMQAdapter();

        await expect(adapter.publish(connectionConfig, 'orders', [{
            id: 'message-1',
            payload: { orderId: 'order-1' },
        }])).resolves.toEqual([expect.objectContaining({
            success: false,
            messageId: 'message-1',
            error: expect.stringContaining('exceeds'),
        })]);
    });

    it('rejects oversized consume response bodies', async () => {
        vi.mocked(secureFetch).mockResolvedValue(new Response('[]', {
            status: 200,
            headers: {
                'content-length': String(OUTBOUND_RESPONSE_LIMITS.CONNECTOR_EXTRACT_BYTES + 1),
            },
        }));
        const adapter = new RabbitMQAdapter();

        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.AUTO,
        })).rejects.toThrow('RabbitMQ consume response exceeds');
    });
});
