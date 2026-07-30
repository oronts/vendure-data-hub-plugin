import type { RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { In, IsNull, LessThan, LessThanOrEqual } from 'typeorm';
import { WEBHOOK_QUEUE } from '../../constants';
import { DataHubWebhookDelivery } from '../../entities/pipeline/webhook-delivery.entity';
import { WebhookDeliveryStatus } from './webhook.types';

const ACTIVE_STATUSES = [
    WebhookDeliveryStatus.PENDING,
    WebhookDeliveryStatus.RETRYING,
] as const;

export interface DeliveryFilter {
    status?: WebhookDeliveryStatus;
    webhookId?: string;
    limit: number;
}

export interface DeliveryFailureUpdate {
    status: WebhookDeliveryStatus.RETRYING | WebhookDeliveryStatus.DEAD_LETTER;
    attempts: number;
    attemptedAt: Date;
    nextRetryAt: Date | null;
    responseStatus: number | null;
    error: string;
}
export interface WebhookStatsGroup {
    webhookId: string;
    status: WebhookDeliveryStatus;
    total: string | number;
}


export class WebhookDeliveryStore {
    constructor(private readonly connection: TransactionalConnection) {}

    save(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
    ): Promise<DataHubWebhookDelivery> {
        return this.repo(ctx).save(delivery);
    }

    findByDeliveryKey(
        ctx: RequestContext,
        deliveryKey: string,
    ): Promise<DataHubWebhookDelivery | null> {
        return this.repo(ctx).findOne({
            where: { channelId: String(ctx.channelId), deliveryKey },
        });
    }

    list(
        ctx: RequestContext,
        filter: DeliveryFilter,
    ): Promise<DataHubWebhookDelivery[]> {
        return this.repo(ctx).find({
            where: {
                channelId: String(ctx.channelId),
                ...(filter.status ? { status: filter.status } : {}),
                ...(filter.webhookId ? { webhookId: filter.webhookId } : {}),
            },
            order: { createdAt: 'DESC' },
            take: filter.limit,
        });
    }

    listStats(ctx: RequestContext): Promise<WebhookStatsGroup[]> {
        return this.repo(ctx)
            .createQueryBuilder('delivery')
            .select('delivery.webhookId', 'webhookId')
            .addSelect('delivery.status', 'status')
            .addSelect('COUNT(delivery.id)', 'total')
            .where('delivery.channelId = :channelId', {
                channelId: String(ctx.channelId),
            })
            .groupBy('delivery.webhookId')
            .addGroupBy('delivery.status')
            .getRawMany<WebhookStatsGroup>();
    }

    async resetDeadLetter(
        ctx: RequestContext,
        deliveryKey: string,
    ): Promise<DataHubWebhookDelivery | null> {
        const result = await this.repo(ctx).update(
            {
                channelId: String(ctx.channelId),
                deliveryKey,
                status: WebhookDeliveryStatus.DEAD_LETTER,
            },
            {
                status: WebhookDeliveryStatus.PENDING,
                attempts: 0,
                availableAt: new Date(),
                nextRetryAt: null,
                leaseExpiresAt: null,
                dispatchToken: null,
                responseStatus: null,
                lastError: null,
                deliveredAt: null,
            },
        );
        if (result.affected !== 1) return null;
        return this.findByDeliveryKey(ctx, deliveryKey);
    }

    async removeDeadLetter(ctx: RequestContext, deliveryKey: string): Promise<boolean> {
        const result = await this.repo(ctx).delete({
            channelId: String(ctx.channelId),
            deliveryKey,
            status: WebhookDeliveryStatus.DEAD_LETTER,
        });
        return result.affected === 1;
    }

    async recoverExpiredLeases(ctx: RequestContext, now: Date): Promise<number> {
        const repo = this.repo(ctx);
        const criteria = {
            status: In([...ACTIVE_STATUSES]),
            leaseExpiresAt: LessThanOrEqual(now),
        };
        const expired = await repo.find({
            select: { id: true },
            where: criteria,
            order: { leaseExpiresAt: 'ASC' },
            take: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
        });
        if (expired.length === 0) return 0;

        const result = await repo.update(
            { ...criteria, id: In(expired.map(delivery => delivery.id)) },
            { leaseExpiresAt: null, dispatchToken: null },
        );
        return result.affected ?? 0;
    }

    async deleteExpiredHistory(
        ctx: RequestContext,
        now: Date,
    ): Promise<{ delivered: number; deadLetters: number }> {
        const repo = this.repo(ctx);
        const deliveredCutoff = new Date(
            now.getTime() - WEBHOOK_QUEUE.DELIVERED_RETENTION_MS,
        );
        const deadLetterCutoff = new Date(
            now.getTime() - WEBHOOK_QUEUE.DEAD_LETTER_RETENTION_MS,
        );
        const delivered = await this.deleteDeliveredHistory(repo, deliveredCutoff);
        const deadLetters = await this.deleteDeadLetterHistory(repo, deadLetterCutoff);
        return { delivered, deadLetters };
    }

    findDue(ctx: RequestContext, now: Date): Promise<DataHubWebhookDelivery[]> {
        return this.repo(ctx).find({
            where: {
                status: In([...ACTIVE_STATUSES]),
                availableAt: LessThanOrEqual(now),
                dispatchToken: IsNull(),
            },
            order: { availableAt: 'ASC' },
            take: WEBHOOK_QUEUE.DISPATCH_BATCH_SIZE,
        });
    }

    async claim(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
        now: Date,
    ): Promise<boolean> {
        const result = await this.repo(ctx).update(
            {
                id: deliveryId,
                status: In([...ACTIVE_STATUSES]),
                availableAt: LessThanOrEqual(now),
                dispatchToken: IsNull(),
            },
            {
                dispatchToken,
                leaseExpiresAt: this.leaseExpiry(now),
            },
        );
        return result.affected === 1;
    }

    releaseAfterEnqueueFailure(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
        now: Date,
    ): Promise<unknown> {
        return this.repo(ctx).update(
            { id: deliveryId, dispatchToken },
            {
                dispatchToken: null,
                leaseExpiresAt: null,
                availableAt: new Date(
                    now.getTime() + WEBHOOK_QUEUE.ENQUEUE_RETRY_DELAY_MS,
                ),
                lastError: 'Webhook delivery could not be queued',
            },
        );
    }

    findClaimed(
        ctx: RequestContext,
        deliveryId: string,
        dispatchToken: string,
    ): Promise<DataHubWebhookDelivery | null> {
        return this.repo(ctx).findOne({ where: { id: deliveryId, dispatchToken } });
    }

    async renewLease(
        ctx: RequestContext,
        deliveryId: string | number,
        dispatchToken: string,
        now: Date,
    ): Promise<boolean> {
        const result = await this.repo(ctx).update(
            { id: deliveryId, dispatchToken },
            { leaseExpiresAt: this.leaseExpiry(now) },
        );
        return result.affected === 1;
    }

    async markDelivered(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
        dispatchToken: string,
        attempts: number,
        attemptedAt: Date,
        responseStatus: number,
        deliveredAt: Date,
    ): Promise<boolean> {
        const result = await this.repo(ctx).update(
            { id: delivery.id, dispatchToken },
            {
                status: WebhookDeliveryStatus.DELIVERED,
                attempts,
                lastAttemptAt: attemptedAt,
                nextRetryAt: null,
                availableAt: deliveredAt,
                leaseExpiresAt: null,
                dispatchToken: null,
                responseStatus,
                lastError: null,
                deliveredAt,
            },
        );
        return result.affected === 1;
    }

    async markFailed(
        ctx: RequestContext,
        delivery: DataHubWebhookDelivery,
        dispatchToken: string,
        update: DeliveryFailureUpdate,
    ): Promise<boolean> {
        const result = await this.repo(ctx).update(
            { id: delivery.id, dispatchToken },
            {
                status: update.status,
                attempts: update.attempts,
                lastAttemptAt: update.attemptedAt,
                nextRetryAt: update.nextRetryAt,
                availableAt: update.nextRetryAt ?? update.attemptedAt,
                leaseExpiresAt: null,
                dispatchToken: null,
                responseStatus: update.responseStatus,
                lastError: update.error.slice(0, WEBHOOK_QUEUE.LAST_ERROR_MAX_LENGTH),
            },
        );
        return result.affected === 1;
    }

    private leaseExpiry(now: Date): Date {
        return new Date(now.getTime() + WEBHOOK_QUEUE.DISPATCH_LEASE_MS);
    }

    private repo(ctx: RequestContext) {
        return this.connection.getRepository(ctx, DataHubWebhookDelivery);
    }

    private async deleteDeliveredHistory(
        repo: ReturnType<WebhookDeliveryStore['repo']>,
        cutoff: Date,
    ): Promise<number> {
        let deleted = 0;
        while (deleted < WEBHOOK_QUEUE.MAX_MAINTENANCE_ROWS_PER_PASS) {
            const rows = await repo.find({
                select: { id: true },
                where: {
                    status: WebhookDeliveryStatus.DELIVERED,
                    deliveredAt: LessThan(cutoff),
                },
                order: { deliveredAt: 'ASC' },
                take: this.nextMaintenanceBatchSize(deleted),
            });
            if (rows.length === 0) break;
            const result = await repo.delete({
                id: In(rows.map(row => row.id)),
                status: WebhookDeliveryStatus.DELIVERED,
                deliveredAt: LessThan(cutoff),
            });
            const affected = result.affected ?? 0;
            deleted += affected;
            if (affected === 0 || rows.length < WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE) break;
        }
        return deleted;
    }

    private async deleteDeadLetterHistory(
        repo: ReturnType<WebhookDeliveryStore['repo']>,
        cutoff: Date,
    ): Promise<number> {
        let deleted = 0;
        while (deleted < WEBHOOK_QUEUE.MAX_MAINTENANCE_ROWS_PER_PASS) {
            const rows = await repo.find({
                select: { id: true },
                where: {
                    status: WebhookDeliveryStatus.DEAD_LETTER,
                    lastAttemptAt: LessThan(cutoff),
                },
                order: { lastAttemptAt: 'ASC' },
                take: this.nextMaintenanceBatchSize(deleted),
            });
            if (rows.length === 0) break;
            const result = await repo.delete({
                id: In(rows.map(row => row.id)),
                status: WebhookDeliveryStatus.DEAD_LETTER,
                lastAttemptAt: LessThan(cutoff),
            });
            const affected = result.affected ?? 0;
            deleted += affected;
            if (affected === 0 || rows.length < WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE) break;
        }
        return deleted;
    }

    private nextMaintenanceBatchSize(deleted: number): number {
        return Math.min(
            WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
            WEBHOOK_QUEUE.MAX_MAINTENANCE_ROWS_PER_PASS - deleted,
        );
    }
}
