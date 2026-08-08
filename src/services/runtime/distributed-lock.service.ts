import * as crypto from 'crypto';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { DataHubLoggerFactory, type DataHubLogger } from '../logger/datahub-logger';
import type { LockBackend, MemoryLockEntry } from './lock-backends/lock-backend.interface';
import { LockBackendFactory } from './lock-backends/lock-backend.factory';
import { DISTRIBUTED_LOCK } from '../../constants/defaults/reliability-defaults';
import { sleep } from '../../utils/retry.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { generateTimestampedId } from '../../utils/id-generation.utils';

/**
 * Lock configuration options
 */
interface LockOptions {
    /** Lock timeout in milliseconds (default: 30000) */
    ttlMs?: number;
    /** Whether to wait for lock (default: false) */
    waitForLock?: boolean;
    /** Max wait time in milliseconds when waitForLock=true (default: 10000) */
    waitTimeoutMs?: number;
    /** Retry interval when waiting for lock (default: 100ms) */
    retryIntervalMs?: number;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
    /** Whether lock was acquired */
    acquired: boolean;
    /** Lock token for release (only if acquired) */
    token?: string;
    /** Owner ID of current lock holder (if not acquired) */
    currentOwner?: string;
    /** When the lock expires (ISO string) */
    expiresAt?: string;
}

/**
 * Distributed Locking Service
 *
 * Distributed locking for horizontal scaling with deterministic selection:
 * 1. An explicitly selected backend, which fails closed when unavailable
 * 2. Configured standalone Redis or Redis Sentinel
 * 3. PostgreSQL advisory locks for a PostgreSQL Vendure database
 * 4. Explicit in-memory locking for single-process deployments only
 *
 * Configuration via environment variables:
 * - DATAHUB_REDIS_URL: Standalone Redis connection URL
 * - DATAHUB_REDIS_SENTINELS and DATAHUB_REDIS_SENTINEL_NAME: Sentinel discovery
 * - DATAHUB_LOCK_BACKEND: Force a specific backend ('redis', 'postgres', 'memory')
 */

@Injectable()
export class DistributedLockService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private backend: LockBackend | undefined;
    private initialization: Promise<void> | undefined;
    private readonly instanceId: string;
    private cleanupInterval?: NodeJS.Timeout;
    private isShuttingDown = false;
    private readonly memoryLocks = new Map<string, MemoryLockEntry>();

    constructor(
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger('DistributedLockService');
        this.instanceId = `instance-${crypto.randomUUID()}`;
    }

    async onModuleInit(): Promise<void> {
        await this.ensureInitialized();
    }

    private async initialize(): Promise<void> {
        const factory = new LockBackendFactory({
            connection: this.connection,
            memoryLocks: this.memoryLocks,
            logger: this.logger,
        });
        this.backend = await factory.create();
        this.startCleanupInterval();

        this.logger.info('Distributed lock service initialized', {
            instanceId: this.instanceId,
            backend: this.backend.name,
        });
    }

    async onModuleDestroy(): Promise<void> {
        this.isShuttingDown = true;
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        await this.initialization?.catch(() => undefined);
        if (this.backend?.close) await this.backend.close();
    }

    /** Acquire a distributed lock */
    async acquire(key: string, options: LockOptions = {}): Promise<LockResult> {
        await this.ensureInitialized();
        const {
            ttlMs = DISTRIBUTED_LOCK.DEFAULT_TTL_MS,
            waitForLock = false,
            waitTimeoutMs = DISTRIBUTED_LOCK.DEFAULT_WAIT_TIMEOUT_MS,
            retryIntervalMs = DISTRIBUTED_LOCK.DEFAULT_RETRY_INTERVAL_MS,
        } = options;
        const token = this.generateToken();
        const startTime = Date.now();
        let shouldContinue = true;

        // Evict expired entries if the map exceeds the bound
        if (this.memoryLocks.size >= DISTRIBUTED_LOCK.MAX_MEMORY_LOCKS) {
            const now = Date.now();
            // First pass: remove all expired entries
            for (const [k, entry] of this.memoryLocks) {
                if (entry.expiresAt <= now) {
                    this.memoryLocks.delete(k);
                }
            }
            // If still at capacity after clearing expired, reject acquisition
            // instead of evicting active (non-expired) locks
            if (this.memoryLocks.size >= DISTRIBUTED_LOCK.MAX_MEMORY_LOCKS) {
                this.logger.warn('Memory lock map at capacity with no expired entries to evict, rejecting lock acquisition', {
                    key,
                    mapSize: this.memoryLocks.size,
                    maxSize: DISTRIBUTED_LOCK.MAX_MEMORY_LOCKS,
                });
                return { acquired: false };
            }
        }

        while (shouldContinue) {
            if (await this.backend!.acquire(key, token, ttlMs)) {
                this.logger.debug('Lock acquired', { key, token, ttlMs });
                return { acquired: true, token, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
            }

            if (!waitForLock || Date.now() - startTime >= waitTimeoutMs) {
                shouldContinue = false;
            } else {
                await sleep(retryIntervalMs);
            }
        }

        return this.createFailedResult(key);
    }

    /** Release a distributed lock */
    async release(key: string, token: string): Promise<boolean> {
        await this.ensureInitialized();
        const released = await this.backend!.release(key, token);
        this.logger.debug(released ? 'Lock released' : 'Lock release failed', { key, token });
        return released;
    }

    /** Extend a lock's TTL */
    async extend(key: string, token: string, ttlMs: number = DISTRIBUTED_LOCK.DEFAULT_TTL_MS): Promise<boolean> {
        await this.ensureInitialized();
        const extended = await this.backend!.extend(key, token, ttlMs);
        if (extended) this.logger.debug('Lock extended', { key, token, ttlMs });
        return extended;
    }

    /** Check if a key is locked */
    async isLocked(key: string): Promise<{ locked: boolean; owner?: string; expiresAt?: string }> {
        await this.ensureInitialized();
        return this.backend!.isLocked(key);
    }

    /** Execute a function with a lock */
    async withLock<T>(key: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
        const result = await this.acquire(key, options);
        if (!result.acquired || !result.token) throw new LockAcquisitionError(key, result.currentOwner);

        try {
            return await fn();
        } finally {
            await this.release(key, result.token);
        }
    }

    /** Clean up expired locks */
    async cleanup(): Promise<number> {
        await this.ensureInitialized();
        return this.backend!.cleanup();
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            if (!this.isShuttingDown) {
                this.cleanup().catch(err => this.logger.warn('Lock cleanup failed', { error: getErrorMessage(err) }));
            }
        }, DISTRIBUTED_LOCK.CLEANUP_INTERVAL_MS);
        this.cleanupInterval.unref?.();
    }

    private generateToken(): string {
        return generateTimestampedId(this.instanceId, 9);
    }

    private async createFailedResult(key: string): Promise<LockResult> {
        const lockInfo = await this.backend!.isLocked(key);
        return { acquired: false, currentOwner: lockInfo.owner, expiresAt: lockInfo.expiresAt };
    }

    private ensureInitialized(): Promise<void> {
        if (this.isShuttingDown && !this.initialization) {
            return Promise.reject(new Error('Distributed lock service is shutting down'));
        }
        this.initialization ??= this.initialize();
        return this.initialization;
    }
}

/** Error thrown when lock acquisition fails */
export class LockAcquisitionError extends Error {
    constructor(public readonly key: string, public readonly currentOwner?: string) {
        super(`Failed to acquire lock for: ${key}${currentOwner ? ` (held by ${currentOwner})` : ''}`);
        this.name = 'LockAcquisitionError';
    }
}
