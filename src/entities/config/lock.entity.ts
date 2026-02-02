import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { JsonObject } from '../../types/index';
import { TABLE_NAMES } from '../../constants/table-names';

/**
 * DataHubLock is a standalone entity (not extending VendureEntity) because:
 * 1. It uses a string primary key (the lock key) instead of auto-generated ID
 * 2. It manages its own timestamps (acquiredAt, expiresAt) for lock lifecycle
 * 3. VendureEntity's createdAt/updatedAt don't fit the lock acquisition pattern
 */
@Entity(TABLE_NAMES.LOCK)
@Index(['expiresAt'])
@Index(['owner']) // Index for finding all locks owned by a specific owner
export class DataHubLock {
    @PrimaryColumn({ type: 'varchar', length: 255, name: 'key' })
    key!: string;

    @Column({ type: 'varchar', length: 255, name: 'owner' })
    owner!: string;

    @Column({ type: 'datetime', name: 'acquired_at', default: () => 'CURRENT_TIMESTAMP' })
    acquiredAt!: Date;

    @Column({ type: 'datetime', name: 'expires_at' })
    expiresAt!: Date;

    @Column({ type: 'simple-json', name: 'metadata', nullable: true })
    metadata!: JsonObject | null;
}
