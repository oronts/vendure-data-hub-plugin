import { LanguageCode } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { PipelineStepDefinition } from '../../../types';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { CollectionHandler } from './collection-handler';
import { FacetHandler, FacetValueHandler } from './facet-handler';
import { PaymentMethodHandler } from './payment-method-handler';
import { PromotionHandler } from './promotion-handler';
import { ShippingMethodHandler } from './shipping-method-handler';
import { resolveChannelIds } from './shared-lookups';

const assignmentError = new Error('channel assignment failed');

function createContext(overrides: Record<string, unknown> = {}): RequestContext {
    return {
        apiType: 'admin',
        languageCode: LanguageCode.en,
        channelId: 'channel-1',
        channel: { id: 'channel-1', code: 'default-channel' },
        ...overrides,
    } as unknown as RequestContext;
}

function createStep(adapterCode: string, config: Record<string, unknown>): PipelineStepDefinition {
    return {
        key: `load-${adapterCode}`,
        type: 'LOAD',
        config: { adapterCode, ...config },
    } as PipelineStepDefinition;
}

function createLoggerFactory(): DataHubLoggerFactory {
    return {
        createLogger: () => ({
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            log: vi.fn(),
        }),
    } as unknown as DataHubLoggerFactory;
}

function createFailingChannelService() {
    return {
        findAll: vi.fn().mockResolvedValue({
            items: [{ id: 'channel-2', code: 'b2b' }],
            totalItems: 1,
        }),
        assignToChannels: vi.fn().mockRejectedValue(assignmentError),
    };
}

async function expectRecordFailure(
    execution: Promise<{ ok: number; fail: number }>,
    onRecordError: ReturnType<typeof vi.fn>,
    stepKey: string,
): Promise<void> {
    await expect(execution).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
    expect(onRecordError).toHaveBeenCalledWith(
        stepKey,
        assignmentError.message,
        expect.anything(),
        expect.any(String),
    );
}

describe('loader channel-assignment integrity', () => {
    it('fails a shipping method record when its requested channel assignment fails', async () => {
        const channelService = createFailingChannelService();
        const shippingMethodService = {
            findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            create: vi.fn().mockResolvedValue({ id: 'shipping-method-1' }),
        };
        const handler = new ShippingMethodHandler(
            shippingMethodService as never,
            channelService as never,
            {} as never,
            createLoggerFactory(),
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expectRecordFailure(
            handler.execute(
                createContext(),
                createStep('shippingMethodUpsert', { channelsField: 'channels' }),
                [{
                    name: 'Standard',
                    code: 'standard',
                    fulfillmentHandler: 'manual-fulfillment',
                    calculator: { code: 'default-shipping-calculator', args: {} },
                    channels: ['b2b'],
                }],
                onRecordError,
            ),
            onRecordError,
            'load-shippingMethodUpsert',
        );
    });

    it('fails a payment method record when its requested channel assignment fails', async () => {
        const channelService = createFailingChannelService();
        const paymentMethodService = {
            findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            create: vi.fn().mockResolvedValue({ id: 'payment-method-1' }),
        };
        const handler = new PaymentMethodHandler(
            paymentMethodService as never,
            channelService as never,
            {} as never,
            createLoggerFactory(),
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expectRecordFailure(
            handler.execute(
                createContext(),
                createStep('paymentMethodUpsert', { channelsField: 'channels' }),
                [{
                    name: 'Invoice',
                    code: 'invoice',
                    handler: { code: 'dummy-payment-handler', args: {} },
                    channels: ['b2b'],
                }],
                onRecordError,
            ),
            onRecordError,
            'load-paymentMethodUpsert',
        );
    });

    it('fails facet and facet-value records when requested channel assignment fails', async () => {
        const channelService = createFailingChannelService();
        const facetService = {
            findByCode: vi.fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce({ id: 'facet-1' }),
            create: vi.fn().mockResolvedValue({ id: 'facet-1' }),
        };
        const facetValueService = {
            findByFacetId: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ id: 'facet-value-1' }),
        };
        const facetHandler = new FacetHandler(
            facetService as never,
            {} as never,
            {} as never,
            channelService as never,
            createLoggerFactory(),
        );
        const facetValueHandler = new FacetValueHandler(
            facetService as never,
            facetValueService as never,
            {} as never,
            channelService as never,
            createLoggerFactory(),
        );
        const facetError = vi.fn().mockResolvedValue(undefined);
        const valueError = vi.fn().mockResolvedValue(undefined);

        await expectRecordFailure(
            facetHandler.execute(
                createContext(),
                createStep('facetUpsert', { channelsField: 'channels' }),
                [{ code: 'color', name: 'Color', channels: ['b2b'] }],
                facetError,
            ),
            facetError,
            'load-facetUpsert',
        );
        await expectRecordFailure(
            facetValueHandler.execute(
                createContext(),
                createStep('facetValueUpsert', { channelsField: 'channels' }),
                [{ facetCode: 'color', code: 'blue', name: 'Blue', channels: ['b2b'] }],
                valueError,
            ),
            valueError,
            'load-facetValueUpsert',
        );
    });

    it('fails a promotion record when target-channel assignment fails', async () => {
        const targetContext = createContext({ channelId: 'channel-2' });
        const channelService = {
            findAll: vi.fn().mockResolvedValue({
                items: [{ id: 'channel-2', code: 'b2b' }],
                totalItems: 1,
            }),
            assignToChannels: vi.fn().mockRejectedValue(assignmentError),
        };
        const promotionService = {
            findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            createPromotion: vi.fn().mockResolvedValue({ id: 'promotion-1' }),
        };
        const handler = new PromotionHandler(
            promotionService as never,
            { create: vi.fn().mockResolvedValue(targetContext) } as never,
            channelService as never,
            {
                withTransaction: vi.fn(async (ctx, work) => work(ctx)),
            } as never,
            createLoggerFactory(),
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expectRecordFailure(
            handler.execute(
                createContext(),
                createStep('promotionUpsert', { channelsField: 'channels', actionsField: 'actions' }),
                [{
                    code: 'SUMMER',
                    channels: ['b2b'],
                    actions: [{
                        code: 'order_percentage_discount',
                        arguments: [{ name: 'discount', value: '10' }],
                    }],
                }],
                onRecordError,
            ),
            onRecordError,
            'load-promotionUpsert',
        );
    });

    it('fails a promotion record when Vendure rejects the write before assignment', async () => {
        const channelService = {
            findAll: vi.fn().mockResolvedValue({
                items: [{ id: 'channel-2', code: 'b2b' }],
                totalItems: 1,
            }),
        };
        const promotionService = {
            findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            createPromotion: vi.fn().mockResolvedValue({
                errorCode: 'COUPON_CODE_CONFLICT_ERROR',
                message: 'Coupon code already exists',
            }),
            assignPromotionsToChannel: vi.fn(),
        };
        const handler = new PromotionHandler(
            promotionService as never,
            { create: vi.fn().mockResolvedValue(createContext({ channelId: 'channel-2' })) } as never,
            channelService as never,
            {
                withTransaction: vi.fn(async (ctx, work) => work(ctx)),
            } as never,
            createLoggerFactory(),
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        const result = await handler.execute(
            createContext(),
            createStep('promotionUpsert', { channel: 'b2b', actionsField: 'actions' }),
            [{
                code: 'SUMMER',
                actions: [{
                    code: 'order_percentage_discount',
                    arguments: [{ name: 'discount', value: '10' }],
                }],
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-promotionUpsert',
            'Failed to create promotion: Coupon code already exists',
            expect.anything(),
            expect.any(String),
        );
        expect(promotionService.assignPromotionsToChannel).not.toHaveBeenCalled();
    });

    it('fails a collection record when its requested channel assignment fails', async () => {
        const channelService = createFailingChannelService();
        const collectionService = {
            findOneBySlug: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({ id: 'collection-1' }),
        };
        const handler = new CollectionHandler(
            collectionService as never,
            {} as never,
            channelService as never,
            createLoggerFactory(),
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expectRecordFailure(
            handler.execute(
                createContext(),
                createStep('collectionUpsert', { channelsField: 'channels' }),
                [{ slug: 'summer', name: 'Summer', channels: ['b2b'] }],
                onRecordError,
            ),
            onRecordError,
            'load-collectionUpsert',
        );
    });

    it('rejects missing channel codes instead of partially succeeding', async () => {
        const channelService = {
            findAll: vi.fn().mockResolvedValue({
                items: [{ id: 'channel-2', code: 'b2b' }],
                totalItems: 1,
            }),
        };

        await expect(resolveChannelIds(
            channelService as never,
            createContext(),
            ['b2b', 'missing-channel'],
            new Map(),
        )).rejects.toThrow('Channel code not found: missing-channel');
    });
});
