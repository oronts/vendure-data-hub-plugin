import { describe, expect, it, vi } from 'vitest';
import {
    CurrencyCode,
    GlobalFlag,
    LanguageCode,
} from '@vendure/common/lib/generated-types';
import { ProductVariant, RequestContext } from '@vendure/core';
import {
    DefaultProductVariantPersistenceContext,
    DefaultProductVariantPersistenceDependencies,
    persistDefaultProductVariant,
} from './product-default-variant-persistence';

function createContexts(): {
    sourceContext: RequestContext;
    operationContext: RequestContext;
} {
    return {
        sourceContext: {
            languageCode: LanguageCode.de,
        } as RequestContext,
        operationContext: {
            channelId: 'channel-1',
            channel: {
                code: 'default-channel',
                defaultCurrencyCode: CurrencyCode.USD,
                availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
            },
        } as RequestContext,
    };
}

function createContext(
    overrides: Partial<DefaultProductVariantPersistenceContext> = {},
): DefaultProductVariantPersistenceContext {
    return {
        ...createContexts(),
        stepKey: 'load-products',
        productId: 'product-1',
        config: { adapterCode: 'productUpsert' },
        fields: {
            slug: 'product',
            name: 'Product',
            sku: 'SKU-1',
            priceMinor: 1200,
        },
        ...overrides,
    };
}

function createDependencies(): {
    dependencies: DefaultProductVariantPersistenceDependencies;
    productVariantService: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    taxCategoryService: { findAll: ReturnType<typeof vi.fn> };
    stockLocationService: { findAll: ReturnType<typeof vi.fn> };
    channelService: { assignToChannels: ReturnType<typeof vi.fn> };
    logger: { warn: ReturnType<typeof vi.fn> };
} {
    const productVariantService = {
        create: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
        update: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
    };
    const taxCategoryService = {
        findAll: vi.fn().mockResolvedValue({
            items: [{ id: 'tax-standard', name: 'Standard' }],
        }),
    };
    const stockLocationService = {
        findAll: vi.fn().mockResolvedValue({
            items: [{ id: 'stock-main', name: 'Main' }],
        }),
    };
    const channelService = {
        assignToChannels: vi.fn().mockResolvedValue(undefined),
    };
    const logger = { warn: vi.fn() };

    return {
        dependencies: {
            productVariantService,
            taxCategoryService,
            stockLocationService,
            channelService,
            logger,
        } as unknown as DefaultProductVariantPersistenceDependencies,
        productVariantService,
        taxCategoryService,
        stockLocationService,
        channelService,
        logger,
    };
}

describe('persistDefaultProductVariant', () => {
    it('does nothing when the record has no SKU', async () => {
        const fixture = createDependencies();

        await persistDefaultProductVariant(
            createContext({
                fields: { slug: 'product', name: 'Product' },
            }),
            fixture.dependencies,
        );

        expect(fixture.productVariantService.create).not.toHaveBeenCalled();
        expect(fixture.productVariantService.update).not.toHaveBeenCalled();
        expect(fixture.taxCategoryService.findAll).not.toHaveBeenCalled();
        expect(fixture.stockLocationService.findAll).not.toHaveBeenCalled();
        expect(fixture.channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('rejects currencies that are unavailable in the operation channel', async () => {
        const fixture = createDependencies();

        await expect(persistDefaultProductVariant(
            createContext({
                fields: {
                    slug: 'product',
                    name: 'Product',
                    sku: 'SKU-1',
                    priceByCurrency: { USD: 1200, GBP: 1000 },
                },
            }),
            fixture.dependencies,
        )).rejects.toThrow(
            'Currencies not available in channel "default-channel": GBP',
        );

        expect(fixture.productVariantService.create).not.toHaveBeenCalled();
        expect(fixture.productVariantService.update).not.toHaveBeenCalled();
    });

    it('creates with the default price before persisting all prices and assigning the channel', async () => {
        const fixture = createDependencies();

        await persistDefaultProductVariant(
            createContext({
                config: {
                    adapterCode: 'productUpsert',
                    channel: 'default-channel',
                },
                fields: {
                    slug: 'product',
                    name: 'Produkt',
                    sku: 'SKU-1',
                    priceByCurrency: { USD: 1200, EUR: 1100 },
                },
            }),
            fixture.dependencies,
        );

        expect(fixture.productVariantService.create).toHaveBeenCalledWith(
            expect.anything(),
            [{
                productId: 'product-1',
                sku: 'SKU-1',
                translations: [{
                    languageCode: LanguageCode.de,
                    name: 'Produkt',
                }],
                price: 1200,
            }],
        );
        expect(fixture.productVariantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [{
                id: 'variant-1',
                prices: [
                    { currencyCode: CurrencyCode.USD, price: 1200 },
                    { currencyCode: CurrencyCode.EUR, price: 1100 },
                ],
            }],
        );
        expect(fixture.channelService.assignToChannels).toHaveBeenCalledWith(
            expect.anything(),
            ProductVariant,
            'variant-1',
            ['channel-1'],
        );
        expect(
            fixture.productVariantService.create.mock.invocationCallOrder[0],
        ).toBeLessThan(
            fixture.productVariantService.update.mock.invocationCallOrder[0],
        );
        expect(
            fixture.productVariantService.update.mock.invocationCallOrder[0],
        ).toBeLessThan(
            fixture.channelService.assignToChannels.mock.invocationCallOrder[0],
        );
    });

    it('updates stock, tax, inventory, and custom fields without reassigning an existing channel', async () => {
        const fixture = createDependencies();
        const existingVariant = {
            id: 'variant-1',
            channels: [{ id: 'channel-1' }],
        } as ProductVariant;

        await persistDefaultProductVariant(
            createContext({
                existingVariant,
                config: {
                    adapterCode: 'productUpsert',
                    channel: 'default-channel',
                    taxCategoryName: 'Standard',
                },
                fields: {
                    slug: 'product',
                    name: 'Produkt',
                    sku: 'SKU-1',
                    priceMinor: 1250,
                    stockOnHand: 8,
                    stockByLocation: { Main: 6 },
                    trackInventory: true,
                    customFields: { externalId: 'remote-1' },
                },
            }),
            fixture.dependencies,
        );

        expect(fixture.productVariantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [{
                id: 'variant-1',
                translations: [{
                    languageCode: LanguageCode.de,
                    name: 'Produkt',
                }],
                price: 1250,
                stockOnHand: 8,
                stockLevels: [{
                    stockLocationId: 'stock-main',
                    stockOnHand: 6,
                }],
                trackInventory: GlobalFlag.TRUE,
                taxCategoryId: 'tax-standard',
                customFields: { externalId: 'remote-1' },
            }],
        );
        expect(fixture.productVariantService.create).not.toHaveBeenCalled();
        expect(fixture.channelService.assignToChannels).not.toHaveBeenCalled();
    });

    it('propagates channel assignment failures after logging context', async () => {
        const fixture = createDependencies();
        const error = new Error('assignment failed');
        fixture.channelService.assignToChannels.mockRejectedValue(error);

        await expect(persistDefaultProductVariant(
            createContext({
                config: {
                    adapterCode: 'productUpsert',
                    channel: 'default-channel',
                },
            }),
            fixture.dependencies,
        )).rejects.toBe(error);

        expect(fixture.logger.warn).toHaveBeenCalledWith(
            'Failed to assign created variant to target channel',
            {
                stepKey: 'load-products',
                variantId: 'variant-1',
                targetChannel: 'default-channel',
                error: 'assignment failed',
            },
        );
    });
});
