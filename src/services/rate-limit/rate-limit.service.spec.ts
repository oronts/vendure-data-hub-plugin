import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../logger';
import {
    RateLimitBackendUnavailableError,
    RateLimitService,
} from './rate-limit.service';
import { RedisRateLimitBackend } from './redis-rate-limit.backend';

function createLogger(): DataHubLogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as DataHubLogger;
}

function createService(): RateLimitService {
    const logger = createLogger();
    return new RateLimitService({
        createLogger: vi.fn(() => logger),
    } as never);
}

function redisBackend(
    increment: () => Promise<{ count: number; ttlMs: number }>,
): RedisRateLimitBackend {
    return {
        increment: vi.fn(increment),
        reset: vi.fn(async () => undefined),
        getCount: vi.fn(async () => 0),
        close: vi.fn(async () => undefined),
    } as unknown as RedisRateLimitBackend;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('RateLimitService', () => {
    it('uses the bounded process-local limiter when Redis is not configured', async () => {
        vi.stubEnv('DATAHUB_REDIS_URL', '');
        vi.stubEnv('REDIS_URL', '');
        const service = createService();
        await service.onModuleInit();

        await expect(service.isRateLimited({ ip: '203.0.113.10' }, 2, 60_000))
            .resolves.toMatchObject({ limited: false, retryAfter: 0 });
        await expect(service.isRateLimited({ ip: '203.0.113.10' }, 2, 60_000))
            .resolves.toMatchObject({ limited: false, retryAfter: 0 });
        await expect(service.isRateLimited({ ip: '203.0.113.10' }, 2, 60_000))
            .resolves.toMatchObject({ limited: true });

        await service.onModuleDestroy();
    });

    it('shares Redis counters across service instances', async () => {
        vi.stubEnv('DATAHUB_REDIS_URL', 'redis://rate-limits.internal:6379');
        let count = 0;
        const backend = redisBackend(async () => ({
            count: ++count,
            ttlMs: 60_000,
        }));
        vi.spyOn(RedisRateLimitBackend, 'create').mockResolvedValue(backend);
        const first = createService();
        const second = createService();
        await Promise.all([first.onModuleInit(), second.onModuleInit()]);

        await expect(first.isRateLimited({ pipelineCode: 'orders' }, 1, 60_000))
            .resolves.toMatchObject({ limited: false });
        await expect(second.isRateLimited({ pipelineCode: 'orders' }, 1, 60_000))
            .resolves.toMatchObject({ limited: true });

        await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
    });

    it('fails closed without using local counters when configured Redis is unavailable', async () => {
        vi.stubEnv('DATAHUB_REDIS_URL', 'redis://unavailable.internal:6379');
        vi.spyOn(RedisRateLimitBackend, 'create')
            .mockRejectedValue(new Error('connection refused'));
        const service = createService();

        await expect(service.onModuleInit()).resolves.toBeUndefined();
        await expect(service.isRateLimited({ ip: '203.0.113.10' }, 10, 60_000))
            .rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
        expect(service.getStats()).toEqual({});

        await service.onModuleDestroy();
    });

    it('fails closed when an established Redis backend rejects a command', async () => {
        vi.stubEnv('DATAHUB_REDIS_URL', 'redis://rate-limits.internal:6379');
        const backend = redisBackend(async () => {
            throw new Error('command timed out');
        });
        vi.spyOn(RedisRateLimitBackend, 'create').mockResolvedValue(backend);
        const service = createService();
        await service.onModuleInit();

        await expect(service.isRateLimited({ ip: '203.0.113.10' }, 10, 60_000))
            .rejects.toBeInstanceOf(RateLimitBackendUnavailableError);
        expect(backend.close).toHaveBeenCalledOnce();

        await service.onModuleDestroy();
    });
});
