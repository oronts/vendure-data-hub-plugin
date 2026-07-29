import { describe, expect, it, vi } from 'vitest';
import type {
    ChannelService,
    PromotionService,
    RequestContext,
    RequestContextService,
} from '@vendure/core';
import type { PipelineStepDefinition } from '../../../types';
import type { DataHubLoggerFactory } from '../../../services/logger';
import { PromotionHandler } from './promotion-handler';

describe('PromotionHandler simulation', () => {
    it('reports malformed update operations instead of predicting success', async () => {
        const findAll = vi.fn(async () => ({
            items: [{ id: 1, couponCode: 'SAVE10' }],
        }));
        const loggerFactory = {
            createLogger: vi.fn(() => ({})),
        } as unknown as DataHubLoggerFactory;
        const handler = new PromotionHandler(
            { findAll } as unknown as PromotionService,
            {} as RequestContextService,
            {} as ChannelService,
            {} as never,
            loggerFactory,
        );
        const step = {
            key: 'promotion',
            type: 'LOAD',
            config: {
                adapterCode: 'promotionUpsert',
                actionsField: 'actions',
            },
        } as PipelineStepDefinition;

        const result = await handler.simulate(
            {} as RequestContext,
            step,
            [{ code: 'SAVE10', actions: '{' }],
        );

        expect(findAll).not.toHaveBeenCalled();
        expect(result.recordDetails[0]).toMatchObject({
            recordId: 'SAVE10',
            operation: 'ERROR',
            validationErrors: ['Promotion actions must contain valid JSON'],
        });
    });
});
