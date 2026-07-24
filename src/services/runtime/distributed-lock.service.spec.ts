import { afterEach, describe, expect, it, vi } from 'vitest';
import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService initialization', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
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
});
