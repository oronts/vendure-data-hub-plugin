import type { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_QUEUE } from '../../constants';
import { WebhookDeliveryStore } from './webhook-delivery.store';
import { WebhookDeliveryStatus } from './webhook.types';

function createFixture() {
    const repository = {
        find: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    };
    const store = new WebhookDeliveryStore({
        getRepository: vi.fn(() => repository),
    } as never);
    return {
        ctx: { channelId: 1 } as RequestContext,
        repository,
        store,
    };
}

describe('WebhookDeliveryStore maintenance', () => {
    it('releases only the matching dispatch claim', async () => {
        const fixture = createFixture();
        fixture.repository.update.mockResolvedValueOnce({ affected: 1 });

        await expect(
            fixture.store.releaseClaim(fixture.ctx, 42, 'dispatch-token'),
        ).resolves.toBe(true);

        expect(fixture.repository.update).toHaveBeenCalledWith(
            { id: 42, dispatchToken: 'dispatch-token' },
            { dispatchToken: null, leaseExpiresAt: null },
        );
    });

    it('recovers only one ordered lease batch with a guarded update', async () => {
        const fixture = createFixture();
        const expired = Array.from(
            { length: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE },
            (_, index) => ({ id: index + 1 }),
        );
        fixture.repository.find.mockResolvedValueOnce(expired);
        fixture.repository.update.mockResolvedValueOnce({ affected: expired.length });

        await expect(
            fixture.store.recoverExpiredLeases(fixture.ctx, new Date()),
        ).resolves.toBe(WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE);

        expect(fixture.repository.find).toHaveBeenCalledWith(expect.objectContaining({
            order: { leaseExpiresAt: 'ASC' },
            take: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
        }));
        expect(fixture.repository.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.anything() }),
            { leaseExpiresAt: null, dispatchToken: null },
        );
    });

    it('caps delivered-history deletion during one cleanup pass', async () => {
        const fixture = createFixture();
        const batch = Array.from(
            { length: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE },
            (_, index) => ({ id: index + 1 }),
        );
        fixture.repository.find.mockImplementation(async options => (
            options.where.status === WebhookDeliveryStatus.DELIVERED ? batch : []
        ));
        fixture.repository.delete.mockResolvedValue({
            affected: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
        });

        const result = await fixture.store.deleteExpiredHistory(fixture.ctx, new Date());

        expect(result).toEqual({
            delivered: WEBHOOK_QUEUE.MAX_MAINTENANCE_ROWS_PER_PASS,
            deadLetters: 0,
        });
        expect(fixture.repository.delete).toHaveBeenCalledTimes(
            WEBHOOK_QUEUE.MAX_MAINTENANCE_ROWS_PER_PASS
                / WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
        );
        expect(fixture.repository.find).toHaveBeenLastCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: WebhookDeliveryStatus.DEAD_LETTER }),
            take: WEBHOOK_QUEUE.MAINTENANCE_BATCH_SIZE,
        }));
    });
});
