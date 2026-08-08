import { describe, expect, it } from 'vitest';
import { LockBackendType } from '../../../constants/enums';
import { resolveLockBackendPlan } from './lock-backend-plan';

describe('resolveLockBackendPlan', () => {
    it('normalizes an explicit memory backend', () => {
        expect(resolveLockBackendPlan({
            forcedBackend: ' memory ',
            databaseType: 'better-sqlite3',
        })).toEqual({ type: LockBackendType.MEMORY });
    });

    it('rejects unknown explicit backends', () => {
        expect(() => resolveLockBackendPlan({
            forcedBackend: 'fallback',
            databaseType: 'postgres',
        })).toThrow('Invalid DATAHUB_LOCK_BACKEND');
    });

    it('requires Redis configuration for an explicit Redis backend', () => {
        expect(() => resolveLockBackendPlan({
            forcedBackend: 'redis',
            databaseType: 'postgres',
        })).toThrow('requires a Redis URL or Sentinel configuration');
    });

    it('uses configured Redis independently of the Vendure database', () => {
        expect(resolveLockBackendPlan({
            redisConfigured: true,
            databaseType: 'mysql',
        })).toEqual({ type: LockBackendType.REDIS });
    });

    it('selects PostgreSQL only for a PostgreSQL Vendure database', () => {
        expect(resolveLockBackendPlan({
            databaseType: 'postgres',
        })).toEqual({ type: LockBackendType.POSTGRES });

        expect(() => resolveLockBackendPlan({
            forcedBackend: 'postgres',
            databaseType: 'mysql',
        })).toThrow('requires Vendure database type "postgres"');
    });

    it.each(['better-sqlite3', 'sqljs', 'mysql', 'mariadb'])(
        'rejects an implicit process-local fallback for %s',
        databaseType => {
            expect(() => resolveLockBackendPlan({ databaseType })).toThrow(
                'Configure Redis or explicitly select MEMORY',
            );
        },
    );
});
