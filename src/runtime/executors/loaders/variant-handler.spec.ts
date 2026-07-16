import { describe, expect, it, vi } from 'vitest';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { ConfigService, RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../../types';
import { DataHubLoggerFactory } from '../../../services/logger';
import { VariantHandler } from './variant-handler';

function createHandler(precision = 2) {
    const productService = {
        findOneBySlug: vi.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const productVariantService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        create: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
        update: vi.fn(),
    };
    const configService = {
        entityOptions: {
            moneyStrategy: { precision },
        },
    } as ConfigService;
    const channelService = {
        findAll: vi.fn().mockResolvedValue({ items: [{ id: 'channel-2', code: 'b2b' }] }),
        assignToChannels: vi.fn().mockResolvedValue({}),
    };
    const loggerFactory = {
        createLogger: () => ({
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            log: vi.fn(),
        }),
    } as unknown as DataHubLoggerFactory;

    return {
        handler: new VariantHandler(
            productService as never,
            productVariantService as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            channelService as never,
            {} as never,
            configService,
            loggerFactory,
        ),
        productVariantService,
        channelService,
    };
}

function createContext(): RequestContext {
    return {
        languageCode: LanguageCode.en,
        apiType: 'admin',
        channel: {
            code: 'default-channel',
            defaultCurrencyCode: CurrencyCode.USD,
            availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
        },
    } as unknown as RequestContext;
}

function createStep(config: Record<string, unknown> = {}): PipelineStepDefinition {
    return {
        key: 'load-variants',
        type: 'LOAD',
        config: {
            adapterCode: 'variantUpsert',
            ...config,
        },
    } as PipelineStepDefinition;
}

describe('VariantHandler prices', () => {
    it('converts a scalar major-unit price once before calling Vendure', async () => {
        const { handler, productVariantService } = createHandler();

        const result = await handler.execute(createContext(), createStep(), [{
            sku: 'SKU-1',
            name: 'Variant',
            price: 12.34,
            productSlug: 'product',
        }]);

        expect(result).toEqual({ ok: 1, fail: 0 });
        expect(productVariantService.create).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({ price: 1234 })],
        );
    });

    it('uses the configured Vendure precision for currency maps', async () => {
        const { handler, productVariantService } = createHandler(3);

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                sku: 'SKU-2',
                name: 'Variant',
                prices: { USD: 12.34, EUR: '10.50' },
                productSlug: 'product',
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0 });
        expect(productVariantService.create).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({
                price: 12340,
            })],
        );
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [{
                id: 'variant-1',
                prices: [
                    { currencyCode: CurrencyCode.USD, price: 12340 },
                    { currencyCode: CurrencyCode.EUR, price: 10500 },
                ],
            }],
        );
    });

    it('rejects ambiguous scalar and currency-map prices', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                sku: 'SKU-3',
                name: 'Variant',
                price: 12.34,
                prices: { USD: 12.34 },
                productSlug: 'product',
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Configure either priceField or priceByCurrencyField data, not both',
            expect.anything(),
            expect.anything(),
        );
    });

    it('rejects a currency map without the channel default currency', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                sku: 'SKU-DEFAULT-MISSING',
                name: 'Variant',
                prices: { EUR: 10.50 },
                productSlug: 'product',
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Currency prices must include the channel default currency "USD"',
            expect.anything(),
            expect.anything(),
        );
    });

    it('reports a failed record when channel assignment fails', async () => {
        const { handler, channelService } = createHandler();
        const onRecordError = vi.fn().mockResolvedValue(undefined);
        channelService.assignToChannels.mockRejectedValue(new Error('channel assignment failed'));

        const result = await handler.execute(
            createContext(),
            createStep({ channelsField: 'channels' }),
            [{
                sku: 'SKU-4',
                name: 'Variant',
                price: 12.34,
                productSlug: 'product',
                channels: ['b2b'],
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'channel assignment failed',
            expect.anything(),
            expect.any(String),
        );
    });
});
