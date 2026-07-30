import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';
import type { WebhookDeliveryStatus } from '../../services/webhooks/webhook.types';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.WEBHOOK_DELIVERY)
@Index(['channelId', 'deliveryKey'], { unique: true })
@Index(['status', 'availableAt'])
@Index(['status', 'leaseExpiresAt'])
@Index(['status', 'deliveredAt'])
@Index(['status', 'lastAttemptAt'])
@Index(['channelId', 'createdAt'])
@Index(['channelId', 'webhookId', 'createdAt'])
export class DataHubWebhookDelivery extends VendureEntity {
    constructor(input?: DeepPartial<DataHubWebhookDelivery>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255 })
    channelId!: string;

    @Column({ type: 'varchar', length: 255 })
    channelToken!: string;

    @Column({ type: 'varchar', length: 256 })
    deliveryKey!: string;

    @Column({ type: 'varchar', length: 255 })
    webhookId!: string;

    @Column({ type: 'text' })
    publicUrl!: string;

    @Column({ type: 'varchar', length: 10 })
    method!: string;

    @Column({ type: 'varchar', length: 64 })
    requestFingerprint!: string;

    @Column({ type: 'varchar', length: 64 })
    payloadHash!: string;

    @Column({ type: 'int' })
    payloadBytes!: number;

    @Column({ type: 'text' })
    encryptedReplayEnvelope!: string;

    @Column({ type: 'varchar', length: 20 })
    status!: WebhookDeliveryStatus;

    @Column({ type: 'int', default: 0 })
    attempts!: number;

    @Column({ type: 'int' })
    maxAttempts!: number;

    @Column({ type: Date })
    availableAt!: Date;

    @Column({ type: Date, nullable: true })
    lastAttemptAt!: Date | null;

    @Column({ type: Date, nullable: true })
    nextRetryAt!: Date | null;

    @Column({ type: Date, nullable: true })
    leaseExpiresAt!: Date | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    dispatchToken!: string | null;

    @Column({ type: 'int', nullable: true })
    responseStatus!: number | null;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;

    @Column({ type: Date, nullable: true })
    deliveredAt!: Date | null;
}
