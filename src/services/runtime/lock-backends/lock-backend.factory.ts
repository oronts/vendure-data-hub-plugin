import { TransactionalConnection } from '@vendure/core';
import { LockBackendType } from '../../../constants/enums';
import { DISTRIBUTED_LOCK } from '../../../constants/index';
import { DataHubLogger } from '../../logger';
import { LockBackend, MemoryLockEntry } from './lock-backend.interface';
import { MemoryLockBackend } from './memory-lock.backend';
import { RedisLockBackend } from './redis-lock.backend';
import { PostgresLockBackend } from './postgres-lock.backend';
import { getErrorMessage } from '../../../utils/error.utils';

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
 * 2. Redis if DATAHUB_REDIS_URL is provided
 * 3. Auto-detect Redis at default location (redis://localhost:6379)
 * 4. Fall back to PostgreSQL backend
 */
export class LockBackendFactory {
    constructor(private readonly deps: BackendFactoryDependencies) {}

    /**
     * Create the appropriate lock backend based on environment configuration
     */
    async create(): Promise<LockBackend> {
        const forcedBackend = process.env.DATAHUB_LOCK_BACKEND as LockBackendType | undefined;
        const redisUrl = process.env.DATAHUB_REDIS_URL;

        // Handle forced backend selection
        if (forcedBackend === LockBackendType.MEMORY) {
            return this.createMemoryBackend();
        }

        if (forcedBackend === LockBackendType.POSTGRES) {
            return this.createPostgresBackend();
        }

        // Try Redis if URL provided or forced
        if (redisUrl || forcedBackend === LockBackendType.REDIS) {
            const redis = await this.tryCreateRedisBackend(redisUrl);
            if (redis) return redis;
        }

        // Try auto-detect Redis at default location
        if (!forcedBackend) {
            const redis = await this.tryCreateRedisBackend(DISTRIBUTED_LOCK.DEFAULT_REDIS_URL);
            if (redis) return redis;
        }

        // Fall back to PostgreSQL
        return this.createPostgresBackend();
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

    private async tryCreateRedisBackend(url?: string): Promise<RedisLockBackend | null> {
        try {
            return await RedisLockBackend.create(url ?? DISTRIBUTED_LOCK.DEFAULT_REDIS_URL, this.deps.logger);
        } catch (error) {
            this.deps.logger.warn('Redis backend initialization failed, falling back', {
                error: getErrorMessage(error),
            });
            return null;
        }
    }
}
