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

        readonly xadd = vi.fn().mockResolvedValue('1-0');
        readonly xreadgroup = vi.fn(async () => [['stream:orders', entries]] as Array<[
            string,
            Array<[string, string[]]>,
        ]>);
        readonly xgroup = vi.fn().mockResolvedValue('OK');
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
        readonly quit = vi.fn().mockResolvedValue('OK');
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

    it('requeues a pending entry for immediate XAUTOCLAIM recovery', async () => {
        const fields = [
            'payload', '{"orderId":"order-1"}',
            'messageId', 'message-1',
        ];
        const fake = createRedisModule([['1-0', fields]]);
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
            fake.clients[0]?.xclaim.mockResolvedValueOnce([['1-0', fields]]);
            await adapter.nack(connectionConfig, message?.deliveryTag ?? '', true);
            expect(fake.clients[0]?.xclaim).toHaveBeenCalledWith(
                'stream:orders',
                'workers',
                'worker-1',
                0,
                '1-0',
                'IDLE',
                expect.any(Number),
            );

            fake.clients[0]?.xautoclaim.mockResolvedValueOnce([
                '0-0',
                [['1-0', fields]],
            ]);
            fake.clients[0]?.xreadgroup.mockClear();
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([expect.objectContaining({
                messageId: 'message-1',
                redelivered: true,
            })]);
            expect(fake.clients[0]?.xreadgroup).not.toHaveBeenCalled();
        } finally {
            await adapter.destroy();
        }
    });

    it('fills unused claim capacity with new stream entries', async () => {
        const fake = createRedisModule([['2-0', [
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
                [['1-0', [
                    'payload', '{}',
                    'headers', '{"trace-id":"trace-1"}',
                    'messageId', 'stale-message',
                ]]],
            ]);

            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 2,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([
                expect.objectContaining({
                    messageId: 'stale-message',
                    headers: { 'trace-id': 'trace-1' },
                    redelivered: true,
                }),
                expect.objectContaining({
                    messageId: 'new-message',
                    redelivered: false,
                }),
            ]);
            expect(fake.clients[0]?.xreadgroup).toHaveBeenCalledWith(
                'GROUP', 'workers', 'worker-1',
                'COUNT', 1,
                'BLOCK', 5000,
                'STREAMS', 'stream:orders', '>',
            );
        } finally {
            await adapter.destroy();
        }
    });

    it('keeps client and settlement state isolated between adapter instances', async () => {
        const firstFake = createRedisModule([['1-0', [
            'payload', '{}',
            'messageId', 'message-1',
        ]]]);
        const secondFake = createRedisModule();
        const first = new RedisStreamsAdapter(async () => firstFake.module as never);
        const second = new RedisStreamsAdapter(async () => secondFake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
        } as QueueConnectionConfig;

        try {
            const [message] = await first.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            await second.testConnection(connectionConfig);
            await second.destroy();
            await expect(first.ack(connectionConfig, message?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
            expect(firstFake.clients).toHaveLength(1);
            expect(secondFake.clients).toHaveLength(1);
            expect(firstFake.clients[0]?.quit).not.toHaveBeenCalled();
        } finally {
            await first.destroy();
        }
    });

    it('rejects invalid broker counts before issuing Redis commands', async () => {
        const fake = createRedisModule();
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
        } as QueueConnectionConfig;
        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 0,
                ackMode: AckMode.MANUAL,
            })).rejects.toThrow('Redis consume count must be a positive integer');
            expect(fake.clients).toHaveLength(0);
        } finally {
            await adapter.destroy();
        }
    });

    it('acknowledges AUTO batches with one atomic Redis command', async () => {
        const fake = createRedisModule([
            ['1-0', ['payload', '{}', 'messageId', 'message-1']],
            ['2-0', ['payload', '{}', 'messageId', 'message-2']],
        ]);
        const adapter = new RedisStreamsAdapter(async () => fake.module as never);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
            consumerGroup: 'workers',
        } as QueueConnectionConfig;
        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 2,
                ackMode: AckMode.AUTO,
            })).resolves.toHaveLength(2);
            expect(fake.clients[0]?.xack).toHaveBeenCalledTimes(1);
            expect(fake.clients[0]?.xack).toHaveBeenCalledWith(
                'stream:orders',
                'workers',
                '1-0',
                '2-0',
            );
        } finally {
            await adapter.destroy();
        }
    });

    it('closes a client whose connection setup finishes during destroy', async () => {
        const fake = createRedisModule();
        let resolveModule: ((value: unknown) => void) | undefined;
        const modulePromise = new Promise<unknown>(resolve => {
            resolveModule = resolve;
        });
        const loader = vi.fn(() => modulePromise as never);
        const adapter = new RedisStreamsAdapter(loader);
        const connectionConfig = {
            host: 'redis.example.com',
            port: 6379,
        } as QueueConnectionConfig;

        const connection = adapter.testConnection(connectionConfig);
        await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
        const destroyed = adapter.destroy();
        resolveModule?.(fake.module);

        await expect(connection).resolves.toBe(false);
        await destroyed;
        expect(fake.clients).toHaveLength(1);
        expect(fake.clients[0]?.quit).toHaveBeenCalledTimes(1);
    });
});
