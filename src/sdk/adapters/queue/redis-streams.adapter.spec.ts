import { describe, expect, it, vi } from 'vitest';
import { AckMode, QUEUE } from '../../../constants';
import type { QueueConnectionConfig } from './queue-adapter.interface';
import { RedisStreamsAdapter } from './redis-streams.adapter';

function createRedisModule(entries: Array<[string, string[]]> = []) {
    const clients: FakeRedis[] = [];

    class FakeRedis {
        readonly xack = vi.fn().mockResolvedValue(1);
        readonly options: Record<string, unknown>;

        constructor(options: Record<string, unknown>) {
            this.options = options;
            clients.push(this);
        }

        xadd(): Promise<string> { return Promise.resolve('1-0'); }
        readonly xreadgroup = vi.fn(async () => [['stream:orders', entries]] as Array<[
            string,
            Array<[string, string[]]>,
        ]>);
        xgroup(): Promise<string> { return Promise.resolve('OK'); }
        readonly xclaim = vi.fn(async () => [] as Array<[string, string[]]>);
        readonly xautoclaim = vi.fn(async (
            _key: string,
            _group: string,
            _consumer: string,
            _minIdleTime: number,
            _start: string,
            _countLabel: string,
            _count: number,
        ) => ['0-0', []] as [string, Array<[string, string[]]>]);
        xlen(): Promise<number> { return Promise.resolve(0); }
        xtrim(): Promise<number> { return Promise.resolve(0); }
        ping(): Promise<string> { return Promise.resolve('PONG'); }
        quit(): Promise<string> { return Promise.resolve('OK'); }
        duplicate(): FakeRedis { return this; }
    }

    return {
        clients,
        module: { default: FakeRedis },
    };
}

describe('RedisStreamsAdapter connection security', () => {
    it('uses TLS and does not share clients across credentials or TLS settings', async () => {
        const fake = createRedisModule();
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const base = {
            host: 'redis.example.com',
            port: 6379,
            db: 0,
        };

        try {
            await expect(adapter.testConnection({
                ...base,
                password: 'first-secret',
                ssl: true,
            } as QueueConnectionConfig)).resolves.toBe(true);
            await expect(adapter.testConnection({
                ...base,
                password: 'second-secret',
                ssl: true,
            } as QueueConnectionConfig)).resolves.toBe(true);
            await expect(adapter.testConnection({
                ...base,
                password: 'second-secret',
                ssl: false,
            } as QueueConnectionConfig)).resolves.toBe(true);

            expect(fake.clients).toHaveLength(3);
            expect(fake.clients[0]?.options.tls).toEqual({});
            expect(fake.clients[2]?.options.tls).toBeUndefined();
        } finally {
            await adapter.destroy();
        }
    });

    it('binds opaque delivery tags to the originating Redis connection', async () => {
        const fake = createRedisModule([['1-0', [
            'payload', '{"orderId":"order-1"}',
            'messageId', 'message-1',
        ]]])
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const original = {
            host: 'redis-one.example.com',
            port: 6379,
            password: 'first-secret',
            consumerGroup: 'workers',
        } as QueueConnectionConfig;
        const other = {
            ...original,
            host: 'redis-two.example.com',
        } as QueueConnectionConfig;

        try {
            const [message] = await adapter.consume(original, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            const deliveryTag = message?.deliveryTag ?? '';

            expect(deliveryTag).not.toContain('redis-one.example.com');
            expect(deliveryTag).not.toContain('first-secret');
            await expect(adapter.ack(other, deliveryTag))
                .rejects.toThrow('belongs to a different connection');
            await expect(adapter.ack(original, deliveryTag)).resolves.toBeUndefined();
            expect(fake.clients[0]?.xack).toHaveBeenCalledWith(
                'stream:orders',
                'workers',
                '1-0',
            );
        } finally {
            await adapter.destroy();
        }
    });

    it('refreshes Redis pending ownership while a pipeline run remains active', async () => {
        const fake = createRedisModule([['1-0', [
            'payload', '{"orderId":"order-1"}',
            'messageId', 'message-1',
        ]]]);
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
            consumerName: 'worker-1',
        } as QueueConnectionConfig;

        try {
            const [message] = await adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            fake.clients[0]?.xclaim.mockResolvedValueOnce([['1-0', []]]);

            await expect(adapter.renewLease(connectionConfig, message?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
            expect(fake.clients[0]?.xclaim).toHaveBeenCalledWith(
                'stream:orders',
                'workers',
                'worker-1',
                0,
                '1-0',
            );
        } finally {
            await adapter.destroy();
        }
    });

    it('retains the existing settlement when a later delivery exceeds capacity', async () => {
        const entries: Array<[string, string[]]> = [['1-0', [
            'payload', '{}',
            'messageId', 'message-1',
        ]]];
        const fake = createRedisModule(entries);
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
            consumerName: 'worker-1',
        } as QueueConnectionConfig;
        const originalLimit = QUEUE.MAX_PENDING_MESSAGES;
        Object.assign(QUEUE, { MAX_PENDING_MESSAGES: 1 });

        try {
            const [first] = await adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            fake.clients[0]?.xautoclaim.mockClear();
            entries.splice(0, 1, ['2-0', [
                'payload', '{}',
                'messageId', 'message-2',
            ]]);
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([]);
            await expect(adapter.claimStaleMessages(
                connectionConfig,
                'orders',
                0,
                10,
            )).resolves.toEqual([]);
            expect(fake.clients[0]?.xautoclaim).not.toHaveBeenCalled();
            await expect(adapter.ack(connectionConfig, first?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
            expect(fake.clients[0]?.xack).toHaveBeenCalledWith(
                'stream:orders',
                'workers',
                '1-0',
            );
        } finally {
            Object.assign(QUEUE, { MAX_PENDING_MESSAGES: originalLimit });
            await adapter.destroy();
        }
    });

    it('claims stale entries without being blocked by a newer active prefix', async () => {
        const fake = createRedisModule([['new-entry', [
            'payload', '{}',
            'messageId', 'new-message',
        ]]]);
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
            consumerName: 'worker-1',
        } as QueueConnectionConfig;
        try {
            await adapter.testConnection(connectionConfig);
            fake.clients[0]?.xautoclaim.mockResolvedValueOnce([
                '0-0',
                [['stale-entry', [
                    'payload', '{"orderId":"order-1"}',
                    'messageId', 'stale-message',
                ]]],
            ]);

            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([expect.objectContaining({
                messageId: 'stale-message',
                redelivered: true,
            })]);
            expect(fake.clients[0]?.xreadgroup).not.toHaveBeenCalled();
        } finally {
            await adapter.destroy();
        }
    });

    it('continues XAUTOCLAIM scans from the returned cursor', async () => {
        const fake = createRedisModule();
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
            consumerName: 'worker-1',
        } as QueueConnectionConfig;

        try {
            await adapter.testConnection(connectionConfig);
            fake.clients[0]?.xautoclaim
                .mockResolvedValueOnce(['5-0', []])
                .mockResolvedValueOnce([
                    '0-0',
                    [['stale-entry', [
                        'payload', '{}',
                        'messageId', 'stale-message',
                    ]]],
                ]);

            await expect(adapter.claimStaleMessages(
                connectionConfig,
                'orders',
                10_000,
                1,
            )).resolves.toEqual([]);
            await expect(adapter.claimStaleMessages(
                connectionConfig,
                'orders',
                10_000,
                1,
            )).resolves.toEqual([expect.objectContaining({
                messageId: 'stale-message',
            })]);

            expect(fake.clients[0]?.xautoclaim.mock.calls[0]?.[4]).toBe('0-0');
            expect(fake.clients[0]?.xautoclaim.mock.calls[1]?.[4]).toBe('5-0');
        } finally {
            await adapter.destroy();
        }
    });
});
