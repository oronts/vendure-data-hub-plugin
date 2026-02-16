import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { DataHubLoggerFactory, DataHubLogger } from '../logger';
import { LockBackend, LockState, MemoryLockEntry, LockBackendFactory } from './lock-backends';
import { DISTRIBUTED_LOCK } from '../../constants/index';
import { sleep } from '../../utils/retry.utils';

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
 * Distributed locking for horizontal scaling with automatic fallback:
 * 1. Redis (when available) - Best for multi-instance deployments
 * 2. PostgreSQL table locks - Works with any PostgreSQL setup
 * 3. In-memory locks - Fallback for single-instance deployments
 *
 * Configuration via environment variables:
 * - DATAHUB_REDIS_URL: Redis connection URL (e.g., redis://localhost:6379)
 * - DATAHUB_LOCK_BACKEND: Force a specific backend ('redis', 'postgres', 'memory')
 */
/** Maximum number of in-memory lock entries to prevent unbounded growth */
const MAX_MEMORY_LOCKS = 1000;

@Injectable()
export class DistributedLockService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private backend!: LockBackend;
    private readonly instanceId: string;
    private cleanupInterval?: NodeJS.Timeout;
    private isShuttingDown = false;
    private readonly memoryLocks = new Map<string, MemoryLockEntry>();

    constructor(
        private readonly connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger('DistributedLockService');
        this.instanceId = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    async onModuleInit(): Promise<void> {
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
        if (this.backend.close) await this.backend.close();
    }

    /** Acquire a distributed lock */
    async acquire(key: string, options: LockOptions = {}): Promise<LockResult> {
        const {
            ttlMs = DISTRIBUTED_LOCK.DEFAULT_TTL_MS,
            waitForLock = false,
            waitTimeoutMs = DISTRIBUTED_LOCK.DEFAULT_WAIT_TIMEOUT_MS,
            retryIntervalMs = DISTRIBUTED_LOCK.DEFAULT_RETRY_INTERVAL_MS,
        } = options;
        const token = this.generateToken();
        const startTime = Date.now();
        let shouldContinue = true;

        // Evict expired or oldest entries if the map exceeds the bound
        if (this.memoryLocks.size >= MAX_MEMORY_LOCKS) {
            const now = Date.now();
            // First pass: remove expired entries
            for (const [k, entry] of this.memoryLocks) {
                if (entry.expiresAt < now) {
                    this.memoryLocks.delete(k);
                }
            }
            // If still at capacity, evict the oldest entry
            if (this.memoryLocks.size >= MAX_MEMORY_LOCKS) {
                const oldestKey = this.memoryLocks.keys().next().value;
                if (oldestKey) this.memoryLocks.delete(oldestKey);
            }
        }

        while (shouldContinue) {
            if (await this.backend.acquire(key, token, ttlMs)) {
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
        const released = await this.backend.release(key, token);
        this.logger.debug(released ? 'Lock released' : 'Lock release failed', { key, token });
        return released;
    }

    /** Extend a lock's TTL */
    async extend(key: string, token: string, ttlMs: number = DISTRIBUTED_LOCK.DEFAULT_TTL_MS): Promise<boolean> {
        const extended = await this.backend.extend(key, token, ttlMs);
        if (extended) this.logger.debug('Lock extended', { key, token, ttlMs });
        return extended;
    }

    /** Check if a key is locked */
    async isLocked(key: string): Promise<{ locked: boolean; owner?: string; expiresAt?: string }> {
        return this.backend.isLocked(key);
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
    cleanup(): Promise<number> {
        return this.backend.cleanup();
    }

    /** Get all active locks (for monitoring) */
    getActiveLocks(): Promise<LockState[]> {
        return this.backend.getActiveLocks?.() ?? Promise.resolve([]);
    }

    /** Get current backend name (for monitoring) */
    getBackendName(): string {
        return this.backend.name;
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            if (!this.isShuttingDown) {
                this.cleanup().catch(err => this.logger.warn('Lock cleanup failed', { error: err.message }));
            }
        }, DISTRIBUTED_LOCK.CLEANUP_INTERVAL_MS);
        this.cleanupInterval.unref?.();
    }

    private generateToken(): string {
        return `${this.instanceId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    private async createFailedResult(key: string): Promise<LockResult> {
        const lockInfo = await this.backend.isLocked(key);
        return { acquired: false, currentOwner: lockInfo.owner, expiresAt: lockInfo.expiresAt };
    }
}

/** Error thrown when lock acquisition fails */
export class LockAcquisitionError extends Error {
    constructor(public readonly key: string, public readonly currentOwner?: string) {
        super(`Failed to acquire lock for: ${key}${currentOwner ? ` (held by ${currentOwner})` : ''}`);
        this.name = 'LockAcquisitionError';
    }
}

export { LockState } from './lock-backends';
