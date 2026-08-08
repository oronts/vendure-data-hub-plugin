import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { HTTP } from '../../../constants/defaults/http-defaults';
import { QueueConnectionConfig } from './queue-adapter.interface';
import { resolveSafeRemoteAddresses } from '../../../utils/remote-host-security.utils';

const amqp = vi.hoisted(() => ({
    connect: vi.fn(),
}));

vi.mock('amqplib', () => ({
    connect: amqp.connect,
}));

vi.mock('../../../utils/remote-host-security.utils', async importOriginal => ({
    ...await importOriginal<typeof import('../../../utils/remote-host-security.utils')>(),
    resolveSafeRemoteAddresses: vi.fn(async (hostname: string) => [{
        hostname,
        address: '203.0.113.20',
        family: 4,
    }]),
}));

import { RabbitMQAmqpAdapter } from './rabbitmq-amqp.adapter';

const connectionConfig: QueueConnectionConfig = {
    host: 'rabbitmq.example.com',
    username: 'data-hub',
    password: 'secret',
    vhost: '/data-hub',
};

function createAmqpFixture() {
    const confirmChannel = {
        assertQueue: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn(),
        ack: vi.fn(),
        nack: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
        consume: vi.fn(),
        cancel: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
    };
    let deliveryHandler: ((message: {
        content: Buffer;
        fields: { deliveryTag: number; redelivered: boolean };
        properties: {
            messageId?: string;
            headers?: Record<string, unknown>;
        };
    } | null) => void) | undefined;
    const channelListeners = new Map<string, (...args: unknown[]) => void>();
    const connectionListeners = new Map<string, (...args: unknown[]) => void>();
    const channel = {
        assertQueue: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn(),
        ack: vi.fn(),
        nack: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
        consume: vi.fn().mockImplementation((
            _queueName: string,
            handler: typeof deliveryHandler,
        ) => {
            deliveryHandler = handler;
            return Promise.resolve({ consumerTag: 'consumer-tag-1' });
        }),
        cancel: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation((
            event: string,
            listener: (...args: unknown[]) => void,
        ) => {
            channelListeners.set(event, listener);
        }),
    };
    const connection = {
        createChannel: vi.fn().mockResolvedValue(channel),
        createConfirmChannel: vi.fn().mockResolvedValue(confirmChannel),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation((
            event: string,
            listener: (...args: unknown[]) => void,
        ) => {
            connectionListeners.set(event, listener);
        }),
    };
    amqp.connect.mockResolvedValue(connection);
    return {
        channel,
        confirmChannel,
        connection,
        deliver(message: Parameters<NonNullable<typeof deliveryHandler>>[0]) {
            if (!deliveryHandler) {
                throw new Error('AMQP consumer is not registered');
            }
            deliveryHandler(message);
        },
        emitChannel(event: string, ...args: unknown[]) {
            channelListeners.get(event)?.(...args);
        },
        emitConnection(event: string, ...args: unknown[]) {
            connectionListeners.get(event)?.(...args);
        },
    };
}

describe('RabbitMQAmqpAdapter lifecycle', () => {
    let adapter: RabbitMQAmqpAdapter;

    beforeEach(() => {
        vi.clearAllMocks();
        adapter = new RabbitMQAmqpAdapter();
    });

    afterEach(async () => {
        await adapter.destroy();
    });

    it('uses the bounded connection timeout and native RabbitMQ port', async () => {
        createAmqpFixture();

        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);

        expect(amqp.connect).toHaveBeenCalledWith(
            'amqp://data-hub:secret@rabbitmq.example.com:5672/%2Fdata-hub',
            {
                timeout: HTTP.TIMEOUT_MS,
                lookup: expect.any(Function),
            },
        );
        expect(resolveSafeRemoteAddresses).toHaveBeenCalledWith(
            'rabbitmq.example.com',
        );
    });

    it('rejects unsafe DNS results before opening an AMQP socket', async () => {
        createAmqpFixture();
        vi.mocked(resolveSafeRemoteAddresses).mockRejectedValueOnce(
            new Error('SSRF protection: private address'),
        );

        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(false);

        expect(amqp.connect).not.toHaveBeenCalled();
    });

    it('closes the socket when confirm-channel creation fails', async () => {
        const { connection } = createAmqpFixture();
        connection.createConfirmChannel.mockRejectedValueOnce(
            new Error('channel setup failed'),
        );

        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(false);

        expect(connection.close).toHaveBeenCalledOnce();
    });

    it('closes a consumer channel when subscription initialization fails', async () => {
        const { channel, connection } = createAmqpFixture();
        channel.prefetch.mockRejectedValueOnce(new Error('prefetch failed'));

        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        })).rejects.toThrow('prefetch failed');

        expect(channel.close).toHaveBeenCalledOnce();
        expect(connection.close).not.toHaveBeenCalled();
    });

    it('still closes the connection when channel shutdown fails', async () => {
        const { confirmChannel, connection } = createAmqpFixture();
        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
        confirmChannel.close.mockRejectedValueOnce(new Error('channel close failed'));

        await adapter.destroy();

        expect(confirmChannel.close).toHaveBeenCalledOnce();
        expect(connection.close).toHaveBeenCalledOnce();
    });

    it('keeps connection pools isolated between adapter instances', async () => {
        const firstFixture = createAmqpFixture();
        const secondFixture = createAmqpFixture();
        amqp.connect
            .mockReset()
            .mockResolvedValueOnce(firstFixture.connection)
            .mockResolvedValueOnce(secondFixture.connection);
        const first = new RabbitMQAmqpAdapter();
        const second = new RabbitMQAmqpAdapter();

        try {
            await expect(first.testConnection(connectionConfig)).resolves.toBe(true);
            await expect(second.testConnection(connectionConfig)).resolves.toBe(true);
            await second.destroy();

            expect(secondFixture.connection.close).toHaveBeenCalledOnce();
            expect(firstFixture.connection.close).not.toHaveBeenCalled();
        } finally {
            await first.destroy();
            await second.destroy();
        }

        expect(firstFixture.connection.close).toHaveBeenCalledOnce();
    });

    it('ignores a stale close event after a replacement connection is active', async () => {
        const firstFixture = createAmqpFixture();
        const secondFixture = createAmqpFixture();
        amqp.connect
            .mockReset()
            .mockResolvedValueOnce(firstFixture.connection)
            .mockResolvedValueOnce(secondFixture.connection);

        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
        firstFixture.emitConnection('close');
        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
        firstFixture.emitConnection('close');
        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);

        expect(amqp.connect).toHaveBeenCalledTimes(2);
        expect(secondFixture.connection.close).not.toHaveBeenCalled();
    });

    it('requeues stale manual deliveries and releases their connection', async () => {
        vi.useFakeTimers();
        const { channel, connection, deliver } = createAmqpFixture();

        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                prefetch: 1,
                consumerId: 'catalog:orders',
            })).resolves.toEqual([]);
            deliver({
                content: Buffer.from('{"orderId":"order-1"}'),
                fields: { deliveryTag: 42, redelivered: false },
                properties: { messageId: 'message-1', headers: {} },
            });
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                prefetch: 1,
                consumerId: 'catalog:orders',
            })).resolves.toEqual([expect.objectContaining({
                messageId: 'message-1',
            })]);

            await vi.advanceTimersByTimeAsync(
                INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS
                + INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS,
            );

            expect(channel.nack).toHaveBeenCalledWith(
                { fields: { deliveryTag: 42 } },
                false,
                true,
            );
            expect(connection.close).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects invalid direct consume limits before connecting', async () => {
        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 0,
            ackMode: AckMode.AUTO,
        })).rejects.toThrow('RabbitMQ consume count must be a positive integer');
        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.AUTO,
            prefetch: QUEUE.MAX_MESSAGE_PREFETCH + 1,
        })).rejects.toThrow(
            `RabbitMQ prefetch must not exceed ${QUEUE.MAX_MESSAGE_PREFETCH}`,
        );

        expect(amqp.connect).not.toHaveBeenCalled();
    });

    it('bounds total subscription prefetch capacity atomically', async () => {
        const originalLimit = QUEUE.MAX_PENDING_MESSAGES;
        Object.assign(QUEUE, { MAX_PENDING_MESSAGES: 1 });
        const { connection } = createAmqpFixture();

        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                prefetch: 1,
                consumerId: 'catalog:orders',
            })).resolves.toEqual([]);

            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                prefetch: 1,
                consumerId: 'catalog:returns',
            })).rejects.toThrow(
                'RabbitMQ subscription capacity exceeds 1 unsettled deliveries',
            );
            expect(connection.createChannel).toHaveBeenCalledOnce();
        } finally {
            Object.assign(QUEUE, { MAX_PENDING_MESSAGES: originalLimit });
        }
    });

    it('reuses one long-lived subscription and drains bounded batches', async () => {
        const { channel, deliver } = createAmqpFixture();
        await expect(adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            prefetch: 2,
            consumerId: 'catalog:orders',
        })).resolves.toEqual([]);
        deliver({
                content: Buffer.from('{"orderId":"order-1"}'),
                fields: { deliveryTag: 42, redelivered: false },
                properties: { messageId: 'message-1', headers: {} },
        });
        deliver({
            content: Buffer.from('{"orderId":"order-2"}'),
            fields: { deliveryTag: 43, redelivered: false },
            properties: { messageId: 'message-2', headers: {} },
        });

        const first = await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            prefetch: 2,
            consumerId: 'catalog:orders',
        });
        const second = await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            prefetch: 2,
            consumerId: 'catalog:orders',
        });

        expect(first).toEqual([expect.objectContaining({
            messageId: 'message-1',
            deliveryTag: expect.any(String),
        })]);
        expect(second).toEqual([expect.objectContaining({
            messageId: 'message-2',
        })]);
        expect(channel.consume).toHaveBeenCalledOnce();
        expect(channel.prefetch).toHaveBeenCalledWith(2);
        expect(channel.consume).toHaveBeenCalledWith(
            'orders',
            expect.any(Function),
            { noAck: false },
        );
        await adapter.ack(connectionConfig, first[0].deliveryTag!);
        expect(channel.ack).toHaveBeenCalledWith({ fields: { deliveryTag: 42 } });
    });

    it('deduplicates concurrent subscription setup for one consumer', async () => {
        const { channel, connection } = createAmqpFixture();

        await expect(Promise.all([
            adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                consumerId: 'catalog:orders',
            }),
            adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
                consumerId: 'catalog:orders',
            }),
        ])).resolves.toEqual([[], []]);

        expect(connection.createChannel).toHaveBeenCalledOnce();
        expect(channel.consume).toHaveBeenCalledOnce();
    });

    it('recreates a subscription after the broker closes its channel', async () => {
        const { channel, connection, emitChannel } = createAmqpFixture();
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        });

        emitChannel('close');
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        });

        expect(connection.createChannel).toHaveBeenCalledTimes(2);
        expect(channel.consume).toHaveBeenCalledTimes(2);
    });

    it('acknowledges automatic deliveries only when they leave the buffer', async () => {
        const { channel, deliver } = createAmqpFixture();
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.AUTO,
            consumerId: 'direct-orders',
        });
        deliver({
            content: Buffer.from('{"orderId":"order-1"}'),
            fields: { deliveryTag: 42, redelivered: false },
            properties: { messageId: 'message-1', headers: {} },
        });
        expect(channel.ack).not.toHaveBeenCalled();

        const result = await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.AUTO,
            consumerId: 'direct-orders',
        });

        expect(result[0].deliveryTag).toBeUndefined();
        expect(channel.ack).toHaveBeenCalledWith(
            expect.objectContaining({ fields: { deliveryTag: 42, redelivered: false } }),
        );
    });

    it('cancels and closes a subscription before forgetting its deliveries', async () => {
        const { channel, deliver } = createAmqpFixture();
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        });
        deliver({
            content: Buffer.from('{"orderId":"order-1"}'),
            fields: { deliveryTag: 42, redelivered: false },
            properties: { messageId: 'message-1', headers: {} },
        });
        const [message] = await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        });

        await adapter.stopConsumer('catalog:orders');

        expect(channel.cancel).toHaveBeenCalledWith('consumer-tag-1');
        expect(channel.close).toHaveBeenCalledOnce();
        await expect(
            adapter.ack(connectionConfig, message.deliveryTag!),
        ).rejects.toThrow('No pending message found');
    });

    it('still closes a subscription channel when broker cancellation fails', async () => {
        const { channel } = createAmqpFixture();
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'catalog:orders',
        });
        channel.cancel.mockRejectedValueOnce(new Error('cancel failed'));

        await expect(
            adapter.stopConsumer('catalog:orders'),
        ).resolves.toBeUndefined();

        expect(channel.close).toHaveBeenCalledOnce();
    });

    it('recreates a subscription when its acknowledgment mode changes', async () => {
        const { channel, connection } = createAmqpFixture();
        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            consumerId: 'direct-orders',
        });

        await adapter.consume(connectionConfig, 'orders', {
            count: 1,
            ackMode: AckMode.AUTO,
            consumerId: 'direct-orders',
        });

        expect(channel.cancel).toHaveBeenCalledWith('consumer-tag-1');
        expect(channel.close).toHaveBeenCalledOnce();
        expect(connection.createChannel).toHaveBeenCalledTimes(2);
        expect(channel.consume).toHaveBeenCalledTimes(2);
    });
});
