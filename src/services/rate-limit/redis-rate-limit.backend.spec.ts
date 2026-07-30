import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../logger';
import { RedisRateLimitBackend } from './redis-rate-limit.backend';

const redis = vi.hoisted(() => ({
    construct: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
}));

vi.mock('ioredis', () => ({
    default: class RedisClient {
        readonly connect = redis.connect;
        readonly ping = redis.ping;
        readonly on = redis.on;
        readonly disconnect = redis.disconnect;

        constructor(first: unknown, second?: unknown) {
            redis.construct(first, second);
        }
    },
}));

function createLogger(): DataHubLogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as DataHubLogger;
}

describe('RedisRateLimitBackend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        redis.connect.mockResolvedValue(undefined);
        redis.ping.mockResolvedValue('PONG');
    });

    it('constructs a master-discovery client for Sentinel without logging credentials', async () => {
        const logger = createLogger();
        await RedisRateLimitBackend.create({
            mode: 'sentinel',
            sentinels: [
                { host: 'sentinel-a', port: 26379 },
                { host: 'sentinel-b', port: 26380 },
            ],
            masterName: 'datahub-primary',
            db: 3,
            username: 'application-user',
            password: 'application-secret',
            sentinelUsername: 'sentinel-user',
            sentinelPassword: 'sentinel-secret',
            tls: true,
            sentinelTls: true,
        }, logger);

        expect(redis.construct).toHaveBeenCalledWith(
            expect.objectContaining({
                sentinels: [
                    { host: 'sentinel-a', port: 26379 },
                    { host: 'sentinel-b', port: 26380 },
                ],
                name: 'datahub-primary',
                role: 'master',
                db: 3,
                username: 'application-user',
                password: 'application-secret',
                sentinelUsername: 'sentinel-user',
                sentinelPassword: 'sentinel-secret',
                tls: {},
                sentinelTLS: {},
                enableTLSForSentinelMode: true,
                autoResendUnfulfilledCommands: false,
                enableOfflineQueue: false,
                lazyConnect: true,
                maxRetriesPerRequest: 0,
            }),
            undefined,
        );
        expect(logger.info).toHaveBeenCalledWith(
            'Connected to Redis for distributed webhook rate limiting',
            { url: 'sentinel://sentinel-a:26379,sentinel-b:26380/datahub-primary?db=3' },
        );
        expect(JSON.stringify(
            (logger.info as ReturnType<typeof vi.fn>).mock.calls,
        )).not.toContain('secret');
    });

    it('routes client errors through the structured logger', async () => {
        const logger = createLogger();
        await RedisRateLimitBackend.create(
            'redis://redis.example.com:6379',
            logger,
        );
        const listener = redis.on.mock.calls[0]?.[1] as (error: unknown) => void;

        listener(new Error('connection reset'));

        expect(logger.error).toHaveBeenCalledWith(
            'Redis webhook rate-limit connection error',
            expect.objectContaining({ message: 'connection reset' }),
        );
    });

    it('uses one atomic fixed-window script and hashes the external key', async () => {
        const evaluate = vi.fn(async (
            _script: string,
            _numberOfKeys: number,
            _key: string,
            _windowMs: number,
        ) => [2, 4_250]);
        const client = {
            eval: evaluate,
            del: vi.fn(async () => 1),
            get: vi.fn(async () => '2'),
            quit: vi.fn(async () => undefined),
        };
        const backend = new RedisRateLimitBackend(
            client as never,
            createLogger(),
        );

        await expect(backend.increment('ip:203.0.113.10', 5_000)).resolves.toEqual({
            count: 2,
            ttlMs: 4_250,
        });
        const [script, numberOfKeys, redisKey, windowMs] =
            evaluate.mock.calls[0];
        expect(script).toContain('redis.call("pttl", KEYS[1])');
        expect(script).toContain('redis.call("set", KEYS[1], 1, "PX", ARGV[1])');
        expect(script.indexOf('redis.call("pttl", KEYS[1])'))
            .toBeLessThan(script.indexOf('redis.call("incr", KEYS[1])'));
        expect(numberOfKeys).toBe(1);
        expect(redisKey).toMatch(/^datahub:rate-limit:v1:[a-f0-9]{64}$/);
        expect(redisKey).not.toContain('203.0.113.10');
        expect(windowMs).toBe(5_000);
    });

    it('rejects malformed Redis script results', async () => {
        const backend = new RedisRateLimitBackend({
            eval: vi.fn(async () => ['not-a-count', -1]),
        } as never, createLogger());

        await expect(backend.increment('pipeline:orders', 60_000))
            .rejects.toThrow('invalid rate-limit counter values');
    });
});
