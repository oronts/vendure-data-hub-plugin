import { describe, expect, it, vi } from 'vitest';
import type {
    OrderService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import type { DataHubLoggerFactory } from '../../../services/logger';
import { ApplyCouponHandler } from './order-handler';

function createHandler(existingOrder: Record<string, unknown> | null) {
    const connection = {
        getRepository: vi.fn(() => ({
            findOne: vi.fn(async () => existingOrder),
        })),
    } as unknown as TransactionalConnection;
    const loggerFactory = {
        createLogger: vi.fn(() => ({})),
    } as unknown as DataHubLoggerFactory;
    return new ApplyCouponHandler(
        {} as OrderService,
        connection,
        loggerFactory,
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
