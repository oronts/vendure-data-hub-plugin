import { describe, expect, it, vi } from 'vitest';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { ConfigService, RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../../types';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { ProductHandler } from './product-handler';

function createHandler(precision = 2) {
    const productService = {
        findOneBySlug: vi.fn().mockResolvedValue(undefined),
        findOne: vi.fn().mockResolvedValue({ id: 'product-1', facetValues: [] }),
        create: vi.fn().mockResolvedValue({ id: 'product-1' }),
        update: vi.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const productVariantService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        create: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
        update: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
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
    const facetValueService = {
        findAll: vi.fn().mockResolvedValue([
            { id: 'facet-red', code: 'red', name: 'Red' },
            { id: 'facet-blue', code: 'blue', name: 'Blue' },
        ]),
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
        handler: new ProductHandler(
            productService as never,
            productVariantService as never,
            {} as never,
            {} as never,
            channelService as never,
            {} as never,
            facetValueService as never,
            {} as never,
            configService,
            loggerFactory,
        ),
        productVariantService,
        productService,
        facetValueService,
        channelService,
    };
}

function createContext(): RequestContext {
    return {
        languageCode: LanguageCode.en,
        channel: {
            code: 'default-channel',
            defaultCurrencyCode: CurrencyCode.USD,
            availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
        },
    } as unknown as RequestContext;
}

function createStep(config: Record<string, unknown> = {}): PipelineStepDefinition {
    return {
        key: 'load-products',
        type: 'LOAD',
        config: {
            adapterCode: 'productUpsert',
            ...config,
        },
    } as PipelineStepDefinition;
}

describe('ProductHandler prices', () => {
    it('converts a default variant price once before calling Vendure', async () => {
        const { handler, productVariantService } = createHandler();

        const result = await handler.execute(createContext(), createStep(), [{
            name: 'Product',
            slug: 'product',
            sku: 'SKU-1',
            price: 12.34,
        }]);

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productVariantService.create).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({ price: 1234 })],
        );
    });

    it('converts configured currency prices with Vendure precision', async () => {
        const { handler, productVariantService } = createHandler(3);

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                name: 'Product',
                slug: 'product',
                sku: 'SKU-2',
                prices: { USD: 12.34, EUR: '10.50' },
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
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

    it('rejects a currency map without the channel default currency', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                name: 'Product',
                slug: 'product',
                sku: 'SKU-DEFAULT-MISSING',
                prices: { EUR: 10.50 },
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-products',
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
            createStep({ channelsField: 'channels', createVariants: false }),
            [{ name: 'Product', slug: 'product', channels: ['b2b'] }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-products',
            'channel assignment failed',
            expect.anything(),
            expect.any(String),
        );
    });
});

describe('ProductHandler identity', () => {
    it('updates the existing SKU parent instead of creating an orphan product', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productVariantService.findAll.mockResolvedValue({
            items: [{ id: 'variant-a', productId: 'product-a' }],
            totalItems: 1,
        });
        productService.findOne.mockResolvedValue({ id: 'product-a', facetValues: [] });
        productService.update.mockResolvedValue({ id: 'product-a' });

        const result = await handler.execute(createContext(), createStep(), [{
            name: 'Renamed Product',
            slug: 'renamed-product',
            sku: 'SKU-A',
        }]);

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productService.create).not.toHaveBeenCalled();
        expect(productService.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 'product-a' }),
        );
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({ id: 'variant-a' })],
        );
    });

    it('fails before mutation when slug and SKU resolve to different products', async () => {
        const { handler, productService, productVariantService, channelService } = createHandler();
        productService.findOneBySlug.mockResolvedValue({ id: 'product-b' });
        productVariantService.findAll.mockResolvedValue({
            items: [{ id: 'variant-a', productId: 'product-a' }],
            totalItems: 1,
        });
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        const result = await handler.execute(createContext(), createStep(), [{
            name: 'Conflicting Product',
            slug: 'product-b',
            sku: 'SKU-A',
        }], onRecordError);

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-products',
            expect.stringContaining('resolve to different products'),
            expect.anything(),
            expect.any(String),
        );
        expect(productService.create).not.toHaveBeenCalled();
        expect(productService.update).not.toHaveBeenCalled();
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(productVariantService.update).not.toHaveBeenCalled();
        expect(channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('fails closed when the SKU is ambiguous', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productVariantService.findAll.mockResolvedValue({
            items: [
                { id: 'variant-a', productId: 'product-a' },
                { id: 'variant-b', productId: 'product-b' },
            ],
            totalItems: 2,
        });

        const result = await handler.execute(createContext(), createStep(), [{
            name: 'Product',
            slug: 'product',
            sku: 'DUPLICATE-SKU',
        }]);

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productService.create).not.toHaveBeenCalled();
    });

    it('does not resolve SKU identity when variant management is disabled', async () => {
        const { handler, productVariantService } = createHandler();

        const result = await handler.execute(
            createContext(),
            createStep({ createVariants: false }),
            [{ name: 'Product', slug: 'product', sku: 'SKU-A' }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productVariantService.findAll).not.toHaveBeenCalled();
    });

    it('simulates an existing SKU parent as an update', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productVariantService.findAll.mockResolvedValue({
            items: [{ id: 'variant-a', productId: 'product-a' }],
            totalItems: 1,
        });
        productService.findOne.mockResolvedValue({ id: 'product-a' });

        const result = await handler.simulate(createContext(), createStep(), [{
            name: 'Renamed Product',
            slug: 'renamed-product',
            sku: 'SKU-A',
        }]);

        expect(result.recordDetails[0]).toEqual(expect.objectContaining({
            operation: 'UPDATE',
            recordId: 'renamed-product',
        }));
    });

    it('simulates cross-product identity conflicts as record errors', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productService.findOneBySlug.mockResolvedValue({ id: 'product-b' });
        productVariantService.findAll.mockResolvedValue({
            items: [{ id: 'variant-a', productId: 'product-a' }],
            totalItems: 1,
        });

        const result = await handler.simulate(createContext(), createStep(), [{
            name: 'Conflicting Product',
            slug: 'product-b',
            sku: 'SKU-A',
        }]);

        expect(result.recordDetails[0]).toEqual(expect.objectContaining({
            operation: 'ERROR',
            validationErrors: [expect.stringContaining('resolve to different products')],
        }));
    });
});

describe('ProductHandler facet values', () => {
    it('resolves configured facet value objects and replaces assignments', async () => {
        const { handler, productService } = createHandler();

        const result = await handler.execute(
            createContext(),
            createStep({
                createVariants: false,
                facetValuesField: 'facets',
                facetValuesMode: 'REPLACE_ALL',
            }),
            [{
                name: 'Product',
                slug: 'product',
                facets: [{ facetCode: 'color', code: 'red' }, 'blue'],
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productService.update).toHaveBeenCalledWith(
            expect.anything(),
            { id: 'product-1', facetValueIds: ['facet-red', 'facet-blue'] },
        );
    });

    it('clears assignments for an explicit empty replace-all field', async () => {
        const { handler, productService } = createHandler();

        const result = await handler.execute(
            createContext(),
            createStep({ createVariants: false, facetValuesMode: 'REPLACE_ALL' }),
            [{ name: 'Product', slug: 'product', facetValueCodes: [] }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productService.update).toHaveBeenCalledWith(
            expect.anything(),
            { id: 'product-1', facetValueIds: [] },
        );
    });

    it('does not modify assignments when the record field is absent', async () => {
        const { handler, productService } = createHandler();

        const result = await handler.execute(
            createContext(),
            createStep({ createVariants: false, facetValuesMode: 'REPLACE_ALL' }),
            [{ name: 'Product', slug: 'product' }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productService.update).not.toHaveBeenCalled();
    });

    it('fails the record when the configured facet field is malformed', async () => {
        const { handler, productService } = createHandler();
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        const result = await handler.execute(
            createContext(),
            createStep({ createVariants: false, facetValuesField: 'facets' }),
            [{ name: 'Product', slug: 'product', facets: 'red' }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productService.update).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-products',
            'Product facet values must be an array',
            expect.anything(),
            expect.any(String),
        );
    });
});
