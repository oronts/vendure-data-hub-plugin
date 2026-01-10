import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { DataHubRecordError } from './error-record.entity';

/**
 * DataHubRecordRetryAudit entity tracks retry attempts for failed records.
 * Provides audit trail of payload modifications and retry outcomes.
 */
@Entity('data_hub_record_retry_audit')
@Index(['createdAt'])
export class DataHubRecordRetryAudit extends VendureEntity {
    constructor(input?: DeepPartial<DataHubRecordRetryAudit>) {
        super(input);
    }

    @ManyToOne(() => DataHubRecordError, { onDelete: 'CASCADE' })
    error!: DataHubRecordError;

    @Index()
    @Column({ nullable: true })
    errorId: number;

    @Column({ type: 'varchar', nullable: true })
    userId: string | null;

    @Column('simple-json')
    previousPayload!: any;

    @Column('simple-json')
    patch!: any;

    @Column('simple-json')
    resultingPayload!: any;
}
