import { LockBackend, LockState, LockStatus, MemoryLockEntry } from './lock-backend.interface';

/**
 * In-memory lock backend for single-instance deployments
 *
 * This backend stores locks in memory and is suitable for:
 * - Development environments
 * - Single-instance deployments
 * - Fallback when other backends are unavailable
 *
 * Note: Locks are NOT shared across multiple instances.
 */
export class MemoryLockBackend implements LockBackend {
    readonly name = 'memory';

    constructor(private readonly locks: Map<string, MemoryLockEntry>) {}

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = Date.now();
        const existing = this.locks.get(key);

        // Check if lock exists and is still valid
        if (existing && existing.expiresAt > now && existing.owner !== owner) {
            return false;
        }

        // Acquire the lock
        this.locks.set(key, {
            owner,
            expiresAt: now + ttlMs,
            acquiredAt: now,
        });

        return true;
    }

    async release(key: string, owner: string): Promise<boolean> {
        const existing = this.locks.get(key);

        // Only release if we own the lock
        if (!existing || existing.owner !== owner) {
            return false;
        }

        this.locks.delete(key);
        return true;
    }

    async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const existing = this.locks.get(key);

        // Only extend if we own the lock
        if (!existing || existing.owner !== owner) {
            return false;
        }

        existing.expiresAt = Date.now() + ttlMs;
        return true;
    }

    async isLocked(key: string): Promise<LockStatus> {
        const now = Date.now();
        const existing = this.locks.get(key);

        if (existing && existing.expiresAt > now) {
            return {
                locked: true,
                owner: existing.owner,
                expiresAt: new Date(existing.expiresAt).toISOString(),
            };
        }

        // Clean up expired lock
        if (existing) {
            this.locks.delete(key);
        }

        return { locked: false };
    }

    async cleanup(): Promise<number> {
        const now = Date.now();
        let count = 0;

        for (const [key, entry] of this.locks.entries()) {
            if (entry.expiresAt < now) {
                this.locks.delete(key);
                count++;
            }
        }

        return count;
    }

    async getActiveLocks(): Promise<LockState[]> {
        const now = Date.now();
        const locks: LockState[] = [];

        for (const [key, entry] of this.locks.entries()) {
            if (entry.expiresAt > now) {
                locks.push({
                    key,
                    owner: entry.owner,
                    acquiredAt: new Date(entry.acquiredAt).toISOString(),
                    expiresAt: new Date(entry.expiresAt).toISOString(),
                    ttlMs: entry.expiresAt - now,
                });
            }
        }

        return locks;
    }
}
