import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISTRIBUTED_LOCK } from '../../../constants';
import { RedisLockBackend } from './redis-lock.backend';

const redis = vi.hoisted(() => ({
    construct: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn(),
    disconnect: vi.fn(),
}));

vi.mock('ioredis', () => ({
    default: class RedisClient {
        readonly connect = redis.connect;
        readonly ping = redis.ping;
        readonly disconnect = redis.disconnect;

        constructor(url: string, options: unknown) {
            redis.construct(url, options);
        }
    },
}));

const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

describe('RedisLockBackend.create', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redis.connect.mockResolvedValue(undefined);
        redis.ping.mockResolvedValue('PONG');
    });

    it('uses bounded fail-fast Redis client options', async () => {
        await RedisLockBackend.create(
            'redis://user:secret@redis.example.com:6379/1',
            logger as never,
        );

        expect(redis.construct).toHaveBeenCalledWith(
            'redis://user:secret@redis.example.com:6379/1',
            expect.objectContaining({
                commandTimeout: DISTRIBUTED_LOCK.REDIS_COMMAND_TIMEOUT_MS,
                connectTimeout: DISTRIBUTED_LOCK.REDIS_CONNECT_TIMEOUT_MS,
                enableOfflineQueue: false,
                lazyConnect: true,
                maxRetriesPerRequest: DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST,
            }),
        );
        const options = redis.construct.mock.calls[0]?.[1] as {
            retryStrategy(times: number): number | null;
        };
        expect(options.retryStrategy(1)).toBe(DISTRIBUTED_LOCK.REDIS_RETRY_DELAY_MS);
        expect(options.retryStrategy(
            DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST + 1,
        )).toBeNull();
        expect(logger.info).toHaveBeenCalledWith(
            'Connected to Redis for distributed locking',
            { url: 'redis://redis.example.com:6379/1' },
        );
    });

    it('disconnects a client that fails its readiness check', async () => {
        redis.ping.mockRejectedValueOnce(new Error('Redis unavailable'));

        await expect(RedisLockBackend.create(
            'redis://redis.example.com:6379',
            logger as never,
        )).rejects.toThrow('Redis unavailable');

        expect(redis.disconnect).toHaveBeenCalledWith(false);
    });
});
