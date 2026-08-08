import { TransactionalConnection } from '@vendure/core';
import { LockBackendType } from '../../../constants/enums';
import type { DataHubLogger } from '../../logger/datahub-logger';
import { LockBackend, MemoryLockEntry } from './lock-backend.interface';
import { MemoryLockBackend } from './memory-lock.backend';
import { RedisLockBackend } from './redis-lock.backend';
import { PostgresLockBackend } from './postgres-lock.backend';
import { resolveLockBackendPlan } from './lock-backend-plan';
import { getConfiguredRedisConnection } from '../redis-configuration';

export interface BackendFactoryDependencies {
    connection: TransactionalConnection;
    memoryLocks: Map<string, MemoryLockEntry>;
    logger: DataHubLogger;
}

/**
 * Factory for creating lock backends based on configuration
 *
 * Selection priority:
 * 1. Forced backend via DATAHUB_LOCK_BACKEND env var
 * 2. Redis if a standalone URL or Sentinel is configured
 * 3. Fall back to PostgreSQL backend
 */
export class LockBackendFactory {
    constructor(private readonly deps: BackendFactoryDependencies) {}

    /**
     * Create the appropriate lock backend based on environment configuration
     */
    async create(): Promise<LockBackend> {
        const redisConnection = getConfiguredRedisConnection();
        const plan = resolveLockBackendPlan({
            forcedBackend: process.env.DATAHUB_LOCK_BACKEND,
            redisConfigured: redisConnection !== undefined,
            databaseType: String(this.deps.connection.rawConnection.options.type),
        });

        if (plan.type === LockBackendType.MEMORY) {
            this.deps.logger.warn(
                'Using process-local locking; this mode is safe only for a single application process',
            );
            return this.createMemoryBackend();
        }
        if (plan.type === LockBackendType.POSTGRES) {
            return this.createPostgresBackend();
        }
        if (!redisConnection) {
            throw new Error('Redis backend selected without Redis configuration');
        }
        return RedisLockBackend.create(redisConnection, this.deps.logger);
    }

    private createMemoryBackend(): LockBackend {
        return new MemoryLockBackend(this.deps.memoryLocks);
    }

    private createPostgresBackend(): LockBackend {
        return new PostgresLockBackend(
            this.deps.connection,
            this.deps.memoryLocks,
            this.deps.logger,
        );
    }
}
