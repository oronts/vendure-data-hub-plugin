import { describe, expect, it, vi } from 'vitest';
import { AckMode } from '../../../constants';
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
        xreadgroup(): Promise<Array<[string, Array<[string, string[]]>]>> {
            return Promise.resolve([['stream:orders', entries]]);
        }
        xgroup(): Promise<string> { return Promise.resolve('OK'); }
        xclaim(): Promise<Array<[string, string[]]>> { return Promise.resolve([]); }
        xpending(): Promise<Array<[string, string, number, number]>> { return Promise.resolve([]); }
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
});
