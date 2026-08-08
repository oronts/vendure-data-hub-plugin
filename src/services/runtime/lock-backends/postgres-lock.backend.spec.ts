import { TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { DataHubLock } from '../../../entities/config';
import { DataHubLogger } from '../../logger';
import { PostgresLockBackend } from './postgres-lock.backend';

const COLUMN_NAMES = {
    key: 'lock_key',
    owner: 'lock_owner',
    acquiredAt: 'acquired_at',
    expiresAt: 'expires_at',
} as const;

function createConnection(query: ReturnType<typeof vi.fn>): TransactionalConnection {
    const rawConnection = {
        driver: {
            escape: (identifier: string) => `"${identifier}"`,
        },
        getMetadata: (target: unknown) => {
            expect(target).toBe(DataHubLock);
            return {
                tablePath: 'tenant.custom_lock',
                findColumnWithPropertyName: (propertyName: keyof typeof COLUMN_NAMES) => {
                    const databaseName = COLUMN_NAMES[propertyName];
                    return databaseName ? { databaseName } : undefined;
                },
            };
        },
        query,
    };

    return { rawConnection } as unknown as TransactionalConnection;
}

function createLogger(): DataHubLogger {
    const logger = new DataHubLogger('PostgresLockBackendTest');
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    return logger;
}

describe('PostgresLockBackend', () => {
    it('uses escaped TypeORM table and column metadata for atomic acquisition', async () => {
        const query = vi.fn().mockResolvedValue([{ lock_key: 'pipeline:1' }]);
        const memoryLocks = new Map();
        const backend = new PostgresLockBackend(
            createConnection(query),
            memoryLocks,
            createLogger(),
        );

        await expect(backend.acquire('pipeline:1', 'worker:1', 10_000)).resolves.toBe(true);

        expect(query).toHaveBeenCalledOnce();
        const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('INSERT INTO "tenant"."custom_lock" AS target');
        expect(sql).toContain(
            '("lock_key", "lock_owner", "acquired_at", "expires_at")',
        );
        expect(sql).toContain('ON CONFLICT ("lock_key") DO UPDATE');
        expect(sql).toContain('target."expires_at" <= $3');
        expect(sql).not.toContain('data_hub_lock');
        expect(parameters[0]).toBe('pipeline:1');
        expect(parameters[1]).toBe('worker:1');
        expect(parameters[2]).toBeInstanceOf(Date);
        expect(parameters[3]).toBeInstanceOf(Date);
        expect(memoryLocks.get('pipeline:1')).toMatchObject({ owner: 'worker:1' });
    });

    it('does not cache a lock when PostgreSQL rejects acquisition', async () => {
        const databaseError = new Error('database unavailable');
        const query = vi.fn().mockRejectedValue(databaseError);
        const memoryLocks = new Map();
        const logger = createLogger();
        const backend = new PostgresLockBackend(
            createConnection(query),
            memoryLocks,
            logger,
        );

        await expect(
            backend.acquire('pipeline:1', 'worker:1', 10_000),
        ).rejects.toBe(databaseError);
        expect(memoryLocks.size).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith(
            'PostgreSQL lock acquisition failed',
            expect.objectContaining({
                key: 'pipeline:1',
                error: 'database unavailable',
            }),
        );
    });

    it('does not cache a lock when the atomic conflict condition loses', async () => {
        const query = vi.fn().mockResolvedValue([]);
        const memoryLocks = new Map();
        const backend = new PostgresLockBackend(
            createConnection(query),
            memoryLocks,
            createLogger(),
        );

        await expect(backend.acquire('pipeline:1', 'worker:1', 10_000)).resolves.toBe(false);
        expect(memoryLocks.size).toBe(0);
    });
});
