import { TransactionalConnection } from '@vendure/core';
import { LockBackend, LockState, LockStatus, MemoryLockEntry } from './lock-backend.interface';
import { DataHubLogger } from '../../logger';
import { getErrorMessage } from '../../../utils/error.utils';

/**
 * PostgreSQL lock backend with in-memory fallback
 *
 * This backend uses a PostgreSQL table for distributed lock coordination
 * with automatic fallback to in-memory locks when the database is unavailable.
 *
 * Suitable for:
 * - Deployments without Redis
 * - PostgreSQL-only infrastructure
 * - Scenarios requiring persistent lock state
 *
 * Features:
 * - Database-backed distributed locks
 * - Automatic fallback to memory when DB unavailable
 * - Re-entrant lock support
 * - Combined memory + DB lock state for monitoring
 */
export class PostgresLockBackend implements LockBackend {
    readonly name = 'postgres';

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly memoryLocks: Map<string, MemoryLockEntry>,
        private readonly logger: DataHubLogger,
    ) {}

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = Date.now();

        // Check memory first for quick rejection
        if (this.isLockedByOther(key, owner, now)) {
            return false;
        }

        // Try database acquisition
        try {
            return await this.acquireFromDatabase(key, owner, ttlMs, now);
        } catch (error) {
            return this.handleAcquireError(error, key, owner, ttlMs, now);
        }
    }

    async release(key: string, owner: string): Promise<boolean> {
        const existing = this.memoryLocks.get(key);
        if (!existing || existing.owner !== owner) {
            return false;
        }

        this.memoryLocks.delete(key);

        // Try to release from database too
        await this.releaseFromDatabase(key, owner);

        return true;
    }

    async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const existing = this.memoryLocks.get(key);
        if (!existing || existing.owner !== owner) {
            return false;
        }

        const now = Date.now();
        existing.expiresAt = now + ttlMs;

        await this.extendInDatabase(key, owner, ttlMs, now);

        return true;
    }

    async isLocked(key: string): Promise<LockStatus> {
        const now = Date.now();
        const existing = this.memoryLocks.get(key);

        // Check memory lock first
        if (existing && existing.expiresAt > now) {
            return {
                locked: true,
                owner: existing.owner,
                expiresAt: new Date(existing.expiresAt).toISOString(),
            };
        }

        // Clean up expired memory lock
        if (existing) {
            this.memoryLocks.delete(key);
        }

        // Check database
        return this.checkDatabaseLock(key);
    }

    async cleanup(): Promise<number> {
        let count = this.cleanupMemoryLocks();
        count += await this.cleanupDatabaseLocks();
        return count;
    }

    async getActiveLocks(): Promise<LockState[]> {
        const locks = this.getMemoryActiveLocks();
        await this.addDatabaseActiveLocks(locks);
        return locks;
    }

    // --- Private helper methods ---

    private isLockedByOther(key: string, owner: string, now: number): boolean {
        const existing = this.memoryLocks.get(key);
        return !!(existing && existing.expiresAt > now && existing.owner !== owner);
    }

    private async acquireFromDatabase(
        key: string,
        owner: string,
        ttlMs: number,
        now: number,
    ): Promise<boolean> {
        const expiresAt = new Date(now + ttlMs);
        const nowDate = new Date(now);

        // Atomic upsert: insert new lock, or update if expired/re-entrant (same owner)
        const rows = await this.connection.rawConnection.query(
            `INSERT INTO data_hub_lock ("key", "owner", "expiresAt")
             VALUES ($1, $2, $3)
             ON CONFLICT ("key") DO UPDATE SET "owner" = $2, "expiresAt" = $3
             WHERE data_hub_lock."expiresAt" < $4 OR data_hub_lock."owner" = $2
             RETURNING "key"`,
            [key, owner, expiresAt, nowDate],
        );

        if (Array.isArray(rows) && rows.length > 0) {
            this.setMemoryLock(key, owner, ttlMs, now);
            return true;
        }

        return false;
    }

    private setMemoryLock(key: string, owner: string, ttlMs: number, now: number): void {
        this.memoryLocks.set(key, {
            owner,
            expiresAt: now + ttlMs,
            acquiredAt: now,
        });
    }

    private handleAcquireError(
        error: unknown,
        key: string,
        owner: string,
        ttlMs: number,
        now: number,
    ): boolean {
        if (error instanceof Error && error.message.includes('data_hub_lock')) {
            this.logger.debug('Using memory-only locks (data_hub_lock table not found)');
        } else {
            this.logger.warn('Database lock failed, using memory fallback', {
                error: getErrorMessage(error),
            });
        }

        // Fall back to memory locks
        const existing = this.memoryLocks.get(key);
        if (existing && existing.expiresAt > now) {
            return false;
        }

        this.setMemoryLock(key, owner, ttlMs, now);
        return true;
    }

    private async releaseFromDatabase(key: string, owner: string): Promise<void> {
        try {
            await this.connection.rawConnection
                .createQueryBuilder()
                .delete()
                .from('data_hub_lock')
                .where('key = :key AND owner = :owner', { key, owner })
                .execute();
        } catch {
            // Ignore DB errors - memory is authoritative
        }
    }

    private async extendInDatabase(
        key: string,
        owner: string,
        ttlMs: number,
        now: number,
    ): Promise<void> {
        try {
            await this.connection.rawConnection
                .createQueryBuilder()
                .update('data_hub_lock')
                .set({ expiresAt: new Date(now + ttlMs) })
                .where('key = :key AND owner = :owner', { key, owner })
                .execute();
        } catch {
            // Ignore DB errors - memory is authoritative
        }
    }

    private async checkDatabaseLock(key: string): Promise<LockStatus> {
        try {
            const dbLock = await this.connection.rawConnection
                .createQueryBuilder()
                .select('*')
                .from('data_hub_lock', 'lock')
                .where('lock.key = :key AND lock.expiresAt > :now', { key, now: new Date() })
                .getRawOne();

            if (dbLock) {
                return {
                    locked: true,
                    owner: dbLock.owner,
                    expiresAt: new Date(dbLock.expiresAt).toISOString(),
                };
            }
        } catch {
            // Ignore DB errors - memory is authoritative
        }

        return { locked: false };
    }

    private cleanupMemoryLocks(): number {
        const now = Date.now();
        let count = 0;

        for (const [key, entry] of this.memoryLocks.entries()) {
            if (entry.expiresAt < now) {
                this.memoryLocks.delete(key);
                count++;
            }
        }

        return count;
    }

    private async cleanupDatabaseLocks(): Promise<number> {
        try {
            const result = await this.connection.rawConnection
                .createQueryBuilder()
                .delete()
                .from('data_hub_lock')
                .where('expiresAt < :now', { now: new Date() })
                .execute();

            return result.affected ?? 0;
        } catch {
            // Ignore DB errors
            return 0;
        }
    }

    private getMemoryActiveLocks(): LockState[] {
        const now = Date.now();
        const locks: LockState[] = [];

        for (const [key, entry] of this.memoryLocks.entries()) {
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

    private async addDatabaseActiveLocks(locks: LockState[]): Promise<void> {
        const now = Date.now();

        try {
            const dbLocks = await this.connection.rawConnection
                .createQueryBuilder()
                .select('*')
                .from('data_hub_lock', 'lock')
                .where('lock.expiresAt > :now', { now: new Date() })
                .getRawMany();

            for (const dbLock of dbLocks) {
                // Skip if already in memory locks
                if (locks.some(l => l.key === dbLock.key)) {
                    continue;
                }

                const expiresAtTime = new Date(dbLock.expiresAt).getTime();
                locks.push({
                    key: dbLock.key,
                    owner: dbLock.owner,
                    acquiredAt: dbLock.acquiredAt
                        ? new Date(dbLock.acquiredAt).toISOString()
                        : new Date(expiresAtTime - 30_000).toISOString(),
                    expiresAt: new Date(expiresAtTime).toISOString(),
                    ttlMs: expiresAtTime - now,
                });
            }
        } catch {
            // Ignore DB errors - memory locks are sufficient
        }
    }
}
