import { TransactionalConnection } from '@vendure/core';
import { LessThanOrEqual, MoreThan } from 'typeorm';
import { DataHubLock } from '../../../entities/config';
import { LockBackend, LockState, LockStatus, MemoryLockEntry } from './lock-backend.interface';
import { DataHubLogger } from '../../logger';
import { getErrorMessage } from '../../../utils/error.utils';

interface PostgresLockSqlIdentifiers {
    table: string;
    key: string;
    owner: string;
    acquiredAt: string;
    expiresAt: string;
}

/** PostgreSQL-backed distributed locking with a local contention cache. */
export class PostgresLockBackend implements LockBackend {
    readonly name = 'postgres';

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly memoryLocks: Map<string, MemoryLockEntry>,
        private readonly logger: DataHubLogger,
    ) {}

    async acquire(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = Date.now();
        if (this.isLockedByOther(key, owner, now)) {
            return false;
        }

        try {
            return await this.acquireFromDatabase(key, owner, ttlMs, now);
        } catch (error) {
            this.logger.warn('PostgreSQL lock acquisition failed', {
                key,
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    async release(key: string, owner: string): Promise<boolean> {
        const result = await this.connection.rawConnection.getRepository(DataHubLock).delete({ key, owner });
        if ((result.affected ?? 0) === 0) {
            return false;
        }
        this.memoryLocks.delete(key);
        return true;
    }

    async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlMs);
        const result = await this.connection.rawConnection
            .getRepository(DataHubLock)
            .createQueryBuilder()
            .update(DataHubLock)
            .set({ expiresAt })
            .where({ key, owner, expiresAt: MoreThan(now) })
            .execute();
        if ((result.affected ?? 0) === 0) {
            return false;
        }
        this.setMemoryLock(key, owner, ttlMs, now.getTime());
        return true;
    }

    async isLocked(key: string): Promise<LockStatus> {
        const lock = await this.connection.rawConnection.getRepository(DataHubLock).findOne({
            where: { key, expiresAt: MoreThan(new Date()) },
        });
        if (!lock) {
            return { locked: false };
        }
        return {
            locked: true,
            owner: lock.owner,
            expiresAt: lock.expiresAt.toISOString(),
        };
    }

    async cleanup(): Promise<number> {
        this.cleanupMemoryLocks();
        const result = await this.connection.rawConnection.getRepository(DataHubLock).delete({ expiresAt: LessThanOrEqual(new Date()) });
        return result.affected ?? 0;
    }

    async getActiveLocks(): Promise<LockState[]> {
        const now = new Date();
        const locks = await this.connection.rawConnection.getRepository(DataHubLock).find({
            where: { expiresAt: MoreThan(now) },
        });
        return locks.map(lock => ({
            key: lock.key,
            owner: lock.owner,
            acquiredAt: lock.acquiredAt.toISOString(),
            expiresAt: lock.expiresAt.toISOString(),
            ttlMs: lock.expiresAt.getTime() - now.getTime(),
        }));
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
        const ids = this.getSqlIdentifiers();
        const rows = await this.connection.rawConnection.query(
            `INSERT INTO ${ids.table} AS target (${ids.key}, ${ids.owner}, ${ids.acquiredAt}, ${ids.expiresAt})
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (${ids.key}) DO UPDATE
             SET ${ids.owner} = EXCLUDED.${ids.owner},
                 ${ids.acquiredAt} = EXCLUDED.${ids.acquiredAt},
                 ${ids.expiresAt} = EXCLUDED.${ids.expiresAt}
             WHERE target.${ids.expiresAt} <= $3
                OR target.${ids.owner} = EXCLUDED.${ids.owner}
             RETURNING ${ids.key}`,
            [key, owner, nowDate, expiresAt],
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

    private getSqlIdentifiers(): PostgresLockSqlIdentifiers {
        const dataSource = this.connection.rawConnection;
        const metadata = dataSource.getMetadata(DataHubLock);
        const escapeIdentifier = (identifier: string): string =>
            dataSource.driver.escape(identifier);
        const getColumn = (propertyName: string): string => {
            const column = metadata.findColumnWithPropertyName(propertyName);
            if (!column) {
                throw new Error(`Missing DataHubLock metadata for ${propertyName}`);
            }
            return escapeIdentifier(column.databaseName);
        };

        return {
            table: metadata.tablePath
                .split('.')
                .map(escapeIdentifier)
                .join('.'),
            key: getColumn('key'),
            owner: getColumn('owner'),
            acquiredAt: getColumn('acquiredAt'),
            expiresAt: getColumn('expiresAt'),
        };
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

}
