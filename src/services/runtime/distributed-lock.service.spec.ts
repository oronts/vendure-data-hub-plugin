import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISTRIBUTED_LOCK } from '../../constants';
import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService initialization', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });

    it('initializes once when another provider acquires before its lifecycle hook', async () => {
        vi.stubEnv('DATAHUB_LOCK_BACKEND', 'memory');
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };
        const service = new DistributedLockService(
            {
                rawConnection: { options: { type: 'sqlite' } },
            } as never,
            { createLogger: vi.fn(() => logger) } as never,
        );

        const lock = await service.acquire('retention', { ttlMs: 1_000 });
        await service.onModuleInit();

        expect(lock.acquired).toBe(true);
        expect(lock.token).toBeDefined();
        expect(logger.info).toHaveBeenCalledOnce();
        await expect(service.release('retention', lock.token!)).resolves.toBe(true);
        await service.onModuleDestroy();
    });

    it('reclaims occurrence leases that expire exactly at the next bucket boundary', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        vi.stubEnv('DATAHUB_LOCK_BACKEND', 'memory');
        const service = new DistributedLockService(
            {
                rawConnection: { options: { type: 'sqlite' } },
            } as never,
            {
                createLogger: vi.fn(() => ({
                    debug: vi.fn(),
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn(),
                })),
            } as never,
        );

        for (let index = 0; index < DISTRIBUTED_LOCK.MAX_MEMORY_LOCKS; index++) {
            const result = await service.acquire(`occurrence:${index}`, { ttlMs: 1_000 });
            expect(result.acquired).toBe(true);
        }
        vi.setSystemTime(1_000);

        await expect(
            service.acquire('occurrence:next', { ttlMs: 1_000 }),
        ).resolves.toMatchObject({ acquired: true });
        await service.onModuleDestroy();
    });
});
