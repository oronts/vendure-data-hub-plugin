import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { DataHubRecordError } from './error-record.entity';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.RECORD_RETRY_AUDIT)
@Index(['createdAt'])
@Index(['errorId', 'createdAt']) // Composite index for retry history per error
@Index(['userId', 'createdAt']) // Index for audit trail by user
export class DataHubRecordRetryAudit extends VendureEntity {
    constructor(input?: DeepPartial<DataHubRecordRetryAudit>) {
        super(input);
    }

    @ManyToOne(() => DataHubRecordError, { onDelete: 'CASCADE' })
    error!: DataHubRecordError;

    @Index()
    @Column({ type: 'int', nullable: true })
    errorId!: number | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    userId!: string | null;

    @Column({ type: 'simple-json' })
    previousPayload!: JsonObject;

    @Column({ type: 'simple-json' })
    patch!: JsonObject;

    @Column({ type: 'simple-json' })
    resultingPayload!: JsonObject;
}
