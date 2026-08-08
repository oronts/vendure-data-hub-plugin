import { describe, expect, it, vi } from 'vitest';
import type {
    OrderService,
    RequestContext,
    ShippingMethodService,
    TransactionalConnection,
} from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import type { DataHubLoggerFactory } from '../../../services/logger';
import { ApplyCouponHandler, OrderTransitionHandler } from './order-handler';

function createHandler(existingOrder: Record<string, unknown> | null) {
    const orderService = {
        findOneByCode: vi.fn(async () => existingOrder),
        findOne: vi.fn(async () => existingOrder),
        applyCouponCode: vi.fn(async () => existingOrder),
    };
    return new ApplyCouponHandler(
        orderService as unknown as OrderService,
    );
}

describe('ApplyCouponHandler simulation', () => {
    it('uses the same default coupon field as execution', async () => {
        const handler = createHandler({ id: 1, code: 'ORDER-1' });
        const step = {
            key: 'coupon',
            type: 'LOAD',
            config: { adapterCode: 'applyCoupon' },
        } as PipelineStepDefinition;

        const result = await handler.simulate(
            {} as RequestContext,
            step,
            [{ orderCode: 'ORDER-1', coupon: 'SAVE10' }],
        );

        expect(result).toMatchObject({
            supported: true,
            recordsIn: 1,
            wouldUpdate: 1,
            wouldFail: 0,
        });
        expect(result.recordDetails[0]).toMatchObject({
            recordId: 'ORDER-1',
            operation: 'UPDATE',
            validationErrors: [],
        });
    });
});

describe('ApplyCouponHandler execution', () => {
    it('reports Vendure coupon errors instead of counting them as successful', async () => {
        const applyCouponCode = vi.fn(async () => ({
            errorCode: 'COUPON_CODE_INVALID_ERROR',
            message: 'Coupon code is invalid',
        }));
        const handler = new ApplyCouponHandler({
            findOneByCode: vi.fn(async () => ({ id: 1, code: 'ORDER-1' })),
            applyCouponCode,
        } as unknown as OrderService);
        const onRecordError = vi.fn().mockResolvedValue(undefined);
        const step = {
            key: 'coupon',
            type: 'LOAD',
            config: { adapterCode: 'applyCoupon' },
        } as PipelineStepDefinition;

        await expect(handler.execute(
            {} as RequestContext,
            step,
            [{ orderCode: 'ORDER-1', coupon: 'INVALID' }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'coupon',
            'Failed to apply coupon "INVALID": Coupon code is invalid',
            expect.anything(),
            expect.any(String),
        );
    });
});

describe('OrderTransitionHandler execution', () => {
    it('rejects partial fulfillment targets before shipping mutations', async () => {
        const orderService = {
            findOne: vi.fn(async () => ({ id: 1, code: 'ORDER-1', state: 'AddingItems' })),
            getEligibleShippingMethods: vi.fn(),
        };
        const connection = {
            withTransaction: vi.fn(async (ctx, work) => work(ctx)),
        };
        const handler = new OrderTransitionHandler(
            orderService as unknown as OrderService,
            connection as unknown as TransactionalConnection,
            {} as ShippingMethodService,
            {
                createLogger: vi.fn(() => ({ warn: vi.fn() })),
            } as unknown as DataHubLoggerFactory,
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);
        const step = {
            key: 'transition',
            type: 'LOAD',
            config: {
                adapterCode: 'orderTransition',
                state: 'PartiallyShipped',
            },
        } as PipelineStepDefinition;

        await expect(handler.execute(
            {} as RequestContext,
            step,
            [{ orderId: 1 }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(orderService.getEligibleShippingMethods).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'transition',
            'Cannot transition order 1 to "PartiallyShipped" without per-line fulfillment quantities',
            expect.anything(),
            expect.any(String),
        );
    });
});
