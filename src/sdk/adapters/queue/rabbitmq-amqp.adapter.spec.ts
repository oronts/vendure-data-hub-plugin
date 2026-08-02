import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    const channel = {
        assertQueue: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn(),
        get: vi.fn(),
        ack: vi.fn(),
        nack: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
    };
    const connection = {
        createConfirmChannel: vi.fn().mockResolvedValue(channel),
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
    };
    amqp.connect.mockResolvedValue(connection);
    return { channel, connection };
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

    it('closes both resources when channel initialization fails', async () => {
        const { channel, connection } = createAmqpFixture();
        channel.prefetch.mockRejectedValueOnce(new Error('prefetch failed'));

        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(false);

        expect(channel.close).toHaveBeenCalledOnce();
        expect(connection.close).toHaveBeenCalledOnce();
    });

    it('still closes the connection when channel shutdown fails', async () => {
        const { channel, connection } = createAmqpFixture();
        await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
        channel.close.mockRejectedValueOnce(new Error('channel close failed'));

        await adapter.destroy();

        expect(channel.close).toHaveBeenCalledOnce();
        expect(connection.close).toHaveBeenCalledOnce();
    });
});
