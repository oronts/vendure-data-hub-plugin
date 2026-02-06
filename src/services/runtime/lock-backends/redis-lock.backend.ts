import { LockBackend, LockState, LockStatus } from './lock-backend.interface';
import { DataHubLogger } from '../../logger';
import { DISTRIBUTED_LOCK } from '../../../constants/index';

/**
 * Redis client interface for lock operations
 *
 * Subset of Redis methods used by the lock backend.
 * Using an interface instead of `any` provides type safety while remaining
 * compatible with the dynamically imported ioredis module.
 */
interface RedisClient {
    set(key: string, value: string, mode: 'PX', ttl: number, flag: 'NX'): Promise<'OK' | null>;
    get(key: string): Promise<string | null>;
    pttl(key: string): Promise<number>;
    eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<number>;
    scan(cursor: string, mode: 'MATCH', pattern: string, countMode: 'COUNT', count: number): Promise<[string, string[]]>;
    quit(): Promise<void>;
}

/**
 * Redis lock backend for distributed multi-instance deployments
 *
 * This backend uses Redis for lock coordination and is suitable for:
 * - Multi-instance/horizontal scaling deployments
 * - High-performance lock operations
 * - Cloud-native environments
 *
 * Features:
 * - Atomic lock operations using Lua scripts
 * - Automatic TTL management via Redis
 * - SCAN-based lock enumeration (non-blocking)
 */
export class RedisLockBackend implements LockBackend {
    readonly name = 'redis';

    private static readonly LOCK_PREFIX = 'datahub:lock:';

    // Lua script for atomic release (only release if we own the lock)
    private static readonly RELEASE_SCRIPT = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;

    // Lua script for atomic extend (only extend if we own the lock)
    private static readonly EXTEND_SCRIPT = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
        else
            return 0
        end
    `;

    constructor(
        private readonly client: RedisClient,
        private readonly logger: DataHubLogger,
    ) {}

    /**
     * Create a Redis lock backend with connection
     */
    static async create(url: string, logger: DataHubLogger): Promise<RedisLockBackend> {
        // Dynamic import of ioredis - we use unknown and type assertion
        // since ioredis is an optional peer dependency
        const ioredisModule = await import('ioredis') as { default?: unknown; [key: string]: unknown };
        const Redis = (ioredisModule.default || ioredisModule) as new (url: string, options: {
            maxRetriesPerRequest: number;
            retryStrategy: (times: number) => number | null;
            lazyConnect: boolean;
        }) => RedisClient & { connect(): Promise<void>; ping(): Promise<string> };

        // Create Redis client with retry strategy
        const client = new Redis(url, {
            maxRetriesPerRequest: DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST,
            retryStrategy: (times: number) => {
                if (times > DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST) return null;
                return Math.min(times * 100, DISTRIBUTED_LOCK.MAX_RETRY_DELAY_MS);
            },
            lazyConnect: true,
        });

        // Test connection
        await client.connect();
        await client.ping();

        logger.info('Connected to Redis for distributed locking', { url });

        return new RedisLockBackend(client, logger);
    }

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const lockKey = this.getLockKey(key);
        const result = await this.client.set(lockKey, owner, 'PX', ttlMs, 'NX');
        return result === 'OK';
    }

    async release(key: string, owner: string): Promise<boolean> {
        const lockKey = this.getLockKey(key);
        const result = await this.client.eval(
            RedisLockBackend.RELEASE_SCRIPT,
            1,
            lockKey,
            owner,
        );
        return result === 1;
    }

    async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const lockKey = this.getLockKey(key);
        const result = await this.client.eval(
            RedisLockBackend.EXTEND_SCRIPT,
            1,
            lockKey,
            owner,
            String(ttlMs),
        );
        return result === 1;
    }

    async isLocked(key: string): Promise<LockStatus> {
        const lockKey = this.getLockKey(key);
        const [owner, ttl] = await Promise.all([
            this.client.get(lockKey),
            this.client.pttl(lockKey),
        ]);

        if (owner && ttl > 0) {
            return {
                locked: true,
                owner,
                expiresAt: new Date(Date.now() + ttl).toISOString(),
            };
        }

        return { locked: false };
    }

    async cleanup(): Promise<number> {
        // Redis handles TTL automatically, no cleanup needed
        return 0;
    }

    async getActiveLocks(): Promise<LockState[]> {
        const locks: LockState[] = [];
        let cursor = '0';
        let iterations = 0;

        do {
            const [nextCursor, keys] = await this.scanForLocks(cursor);
            cursor = nextCursor;

            await this.processScannedKeys(keys, locks);

            iterations++;
        } while (cursor !== '0' && iterations < DISTRIBUTED_LOCK.MAX_SCAN_ITERATIONS);

        return locks;
    }

    async close(): Promise<void> {
        try {
            await this.client.quit();
        } catch (err) {
            this.logger.warn('Error closing Redis connection', { error: String(err) });
        }
    }

    private getLockKey(key: string): string {
        return `${RedisLockBackend.LOCK_PREFIX}${key}`;
    }

    private async scanForLocks(cursor: string): Promise<[string, string[]]> {
        return this.client.scan(
            cursor,
            'MATCH',
            `${RedisLockBackend.LOCK_PREFIX}*`,
            'COUNT',
            100,
        );
    }

    private async processScannedKeys(keys: string[], locks: LockState[]): Promise<void> {
        for (const lockKey of keys) {
            const lockState = await this.getLockStateFromKey(lockKey);
            if (lockState) {
                locks.push(lockState);
            }
        }
    }

    private async getLockStateFromKey(lockKey: string): Promise<LockState | null> {
        try {
            const [owner, ttl] = await Promise.all([
                this.client.get(lockKey),
                this.client.pttl(lockKey),
            ]);

            if (owner && ttl > 0) {
                const key = lockKey.replace(RedisLockBackend.LOCK_PREFIX, '');
                return {
                    key,
                    owner,
                    // Estimate acquired time (we don't store it in Redis)
                    acquiredAt: new Date(Date.now() - Math.max(DISTRIBUTED_LOCK.DEFAULT_TTL_MS - ttl, 0)).toISOString(),
                    expiresAt: new Date(Date.now() + ttl).toISOString(),
                    ttlMs: ttl,
                };
            }
        } catch {
            // Lock may have expired between scan and get - skip it
        }

        return null;
    }
}
