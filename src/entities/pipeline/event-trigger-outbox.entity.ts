import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';
import type { VendureEventType } from '../../../shared/types';
import { TABLE_NAMES } from '../../constants/table-names';

export const EventTriggerOutboxStatus = {
    PENDING: 'PENDING',
    DISPATCHING: 'DISPATCHING',
    QUEUED: 'QUEUED',
    PROCESSING: 'PROCESSING',
    DELIVERED: 'DELIVERED',
} as const;

export type EventTriggerOutboxStatus =
    typeof EventTriggerOutboxStatus[keyof typeof EventTriggerOutboxStatus];

@Entity(TABLE_NAMES.EVENT_TRIGGER_OUTBOX)
@Index(['status', 'availableAt'])
@Index(['status', 'leaseExpiresAt'])
@Index(['pipelineId', 'createdAt'])
export class DataHubEventTriggerOutbox extends VendureEntity {
    constructor(input?: DeepPartial<DataHubEventTriggerOutbox>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 64 })
    deliveryKey!: string;

    @Column({ type: 'varchar', length: 80 })
    eventType!: VendureEventType;

    @EntityId()
    pipelineId!: ID;

    @Column({ type: 'varchar', length: 255 })
    pipelineCode!: string;

    @Column({ type: 'varchar', length: 255 })
    triggerKey!: string;

    @Column({ type: 'varchar', length: 255 })
    channelId!: string;

    @Column({ type: 'varchar', length: 255 })
    channelToken!: string;

    @Column({ type: 'varchar', length: 20 })
    languageCode!: string;

    @Column({ type: 'varchar', length: 20 })
    currencyCode!: string;

    @Column({ type: 'simple-json' })
    seedRecords!: Array<Record<string, unknown>>;

    @Column({ type: 'varchar', length: 20 })
    status!: EventTriggerOutboxStatus;

    @Column({ type: 'int', default: 0 })
    attempts!: number;

    @Column({ type: Date })
    availableAt!: Date;

    @Column({ type: Date, nullable: true })
    leaseExpiresAt!: Date | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    dispatchToken!: string | null;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;

    @EntityId({ nullable: true })
    runId!: ID | null;

    @Column({ type: Date, nullable: true })
    deliveredAt!: Date | null;
}
