import { describe, expect, it, vi } from 'vitest';
import { CurrencyCode, LanguageCode } from '@vendure/common/lib/generated-types';
import { ConfigService, Permission, RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../../types';
import { DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { VariantHandler } from './variant-handler';

function createHandler(
    precision = 2,
    variantsByChannel: Record<string, Array<Record<string, unknown>>> = {},
) {
    const productService = {
        findOneBySlug: vi.fn().mockResolvedValue({ id: 'product-1' }),
        findOne: vi.fn(),
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
    };
    const productVariantService = {
        findAll: vi.fn().mockImplementation(async (ctx) => {
            const items = variantsByChannel[ctx.channel.code] ?? [];
            return { items, totalItems: items.length };
        }),
        create: vi.fn().mockResolvedValue([{ id: 'variant-1' }]),
        update: vi.fn(),
        assignProductVariantsToChannel: vi.fn().mockResolvedValue([]),
    };
    const productOptionGroupService = {
        getOptionGroupsByProductId: vi.fn().mockResolvedValue([]),
    };
    const productOptionService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        create: vi.fn(),
    };
    const configService = {
        entityOptions: {
            moneyStrategy: { precision },
        },
    } as ConfigService;
    const channels = [
        {
            id: 'channel-1',
            code: 'default-channel',
            defaultLanguageCode: LanguageCode.en,
            availableLanguageCodes: [LanguageCode.en],
            defaultCurrencyCode: CurrencyCode.USD,
            availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
        },
        { id: 'channel-2', code: 'b2b' },
        { id: 'channel-3', code: 'uk-store' },
    ];
    const channelService = {
        findAll: vi.fn().mockImplementation(async (_ctx, options) => {
            const codeFilter = options?.filter?.code;
            const codes = codeFilter?.eq
                ? [codeFilter.eq]
                : codeFilter?.in ?? channels.map(channel => channel.code);
            return {
                items: channels.filter(channel => codes.includes(channel.code)),
                totalItems: channels.length,
            };
        }),
        getDefaultChannel: vi.fn().mockResolvedValue(channels[0]),
    };
    const taxCategoryService = {
        findAll: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
    };
    const requestContextService = {
        create: vi.fn().mockImplementation(async ({ channelOrToken }) => {
            const channelCode = typeof channelOrToken === 'string'
                ? channelOrToken
                : channelOrToken.code;
            const channelId = channelCode === 'uk-store'
                ? 'channel-3'
                : channelCode === 'b2b'
                    ? 'channel-2'
                    : 'channel-1';
            return {
                channel: {
                    id: channelId,
                    code: channelCode,
                    defaultLanguageCode: LanguageCode.en,
                    availableLanguageCodes: [LanguageCode.en],
                    defaultCurrencyCode: channelCode === 'uk-store'
                        ? CurrencyCode.GBP
                        : CurrencyCode.USD,
                    availableCurrencyCodes: channelCode === 'uk-store'
                        ? [CurrencyCode.GBP]
                        : [CurrencyCode.USD, CurrencyCode.EUR],
                },
                languageCode: LanguageCode.en,
                currencyCode: channelCode === 'uk-store'
                    ? CurrencyCode.GBP
                    : CurrencyCode.USD,
            };
        }),
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
            productOptionGroupService as never,
            productOptionService as never,
            requestContextService as never,
            taxCategoryService as never,
            channelService as never,
            {} as never,
            configService,
            {} as never,
            loggerFactory,
        ),
        productVariantService,
        channelService,
        requestContextService,
        productService,
        productOptionGroupService,
        productOptionService,
        taxCategoryService,
    };
}

function createContext(): RequestContext {
    return {
        languageCode: LanguageCode.en,
        apiType: 'admin',
        channel: {
            id: 'channel-1',
            code: 'default-channel',
            defaultLanguageCode: LanguageCode.en,
            availableLanguageCodes: [LanguageCode.en],
            defaultCurrencyCode: CurrencyCode.USD,
            availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
        },
        channelId: 'channel-1',
        session: {
            user: {
                id: 'user-1',
                channelPermissions: ['channel-1', 'channel-2', 'channel-3'].map(id => ({
                    id,
                    permissions: [Permission.UpdateCatalog],
                })),
            },
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

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
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

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
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

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Currency prices must include the default currency "USD" for channel "default-channel"',
            expect.anything(),
            expect.anything(),
        );
    });

    it('reports a failed record when channel assignment fails', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn().mockResolvedValue(undefined);
        productVariantService.assignProductVariantsToChannel.mockRejectedValue(
            new Error('channel assignment failed'),
        );

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

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'channel assignment failed',
            expect.anything(),
            expect.any(String),
        );
    });

    it('creates in the source channel and persists explicit target-channel prices', async () => {
        const {
            handler,
            productVariantService,
            requestContextService,
        } = createHandler();
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({
                priceByCurrencyField: 'prices',
                channelsField: 'channels',
            }),
            [{
                sku: 'SKU-UK',
                name: 'UK Variant',
                prices: { USD: 175, GBP: 149.99 },
                productSlug: 'product',
                channels: ['uk-store'],
            }],
            onRecordError,
        );

        expect(onRecordError).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(requestContextService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                channelOrToken: expect.objectContaining({ code: 'uk-store' }),
            }),
        );
        expect(productVariantService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: expect.objectContaining({
                    code: 'default-channel',
                    defaultCurrencyCode: CurrencyCode.USD,
                }),
            }),
            [expect.objectContaining({ price: 17500 })],
        );
        expect(productVariantService.assignProductVariantsToChannel).toHaveBeenCalledWith(
            expect.objectContaining({ channel: expect.objectContaining({ code: 'default-channel' }) }),
            { channelId: 'channel-3', productVariantIds: ['variant-1'] },
        );
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.objectContaining({ channel: expect.objectContaining({ code: 'uk-store' }) }),
            [{
                id: 'variant-1',
                prices: [{ currencyCode: CurrencyCode.GBP, price: 14999 }],
            }],
        );
    });

    it('rejects target-only create prices instead of inventing a source amount', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices', channelsField: 'channels' }),
            [{
                sku: 'SKU-UK-ONLY',
                name: 'UK Variant',
                prices: { GBP: 149.99 },
                productSlug: 'product',
                channels: ['uk-store'],
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Currency prices must include the default currency "USD" for channel "default-channel"',
            expect.anything(),
            expect.anything(),
        );
    });

    it('finds an existing source variant before target assignment', async () => {
        const existing = {
            id: 'variant-existing',
            sku: 'SKU-EXISTING',
            channels: [{ id: 'channel-1', code: 'default-channel' }],
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [existing],
            'uk-store': [],
        });

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices', channelsField: 'channels' }),
            [{
                sku: 'SKU-EXISTING',
                name: 'Existing Variant',
                prices: { USD: 175, GBP: 149.99 },
                channels: ['uk-store'],
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.objectContaining({ channel: expect.objectContaining({ code: 'default-channel' }) }),
            [expect.objectContaining({ id: 'variant-existing' })],
        );
    });

    it('updates option assignments on an existing variant', async () => {
        const existing = {
            id: 'variant-existing',
            productId: 'product-1',
            sku: 'SKU-OPTIONS',
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [existing],
        });

        const result = await handler.execute(
            createContext(),
            createStep({ optionIdsField: 'optionIds' }),
            [{
                sku: 'SKU-OPTIONS',
                name: 'Existing Variant',
                price: 10,
                optionIds: ['option-blue', 42],
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({
                id: 'variant-existing',
                optionIds: ['option-blue', 42],
            })],
        );
    });

    it('rejects malformed option IDs before calling Vendure', async () => {
        const existing = {
            id: 'variant-existing',
            productId: 'product-1',
            sku: 'SKU-BAD-OPTIONS',
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [existing],
        });
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-BAD-OPTIONS',
            name: 'Existing Variant',
            price: 10,
            optionIds: [{ id: 'option-blue' }],
        };

        await expect(handler.execute(
            createContext(),
            createStep({ optionIdsField: 'optionIds' }),
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.update).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant option ID at index 0 must be a non-empty string or finite number',
            record,
            expect.any(String),
        );
    });

    it('rejects malformed option collections before calling Vendure', async () => {
        const existing = {
            id: 'variant-existing',
            productId: 'product-1',
            sku: 'SKU-BAD-OPTION-COLLECTIONS',
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [existing],
        });
        const onRecordError = vi.fn();

        await expect(handler.execute(
            createContext(),
            createStep({ optionGroupsField: 'options' }),
            [{
                sku: 'SKU-BAD-OPTION-COLLECTIONS',
                name: 'Existing Variant',
                price: 10,
                options: { color: { name: 'Blue' } },
            }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.update).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant option groups must map non-empty group names to non-empty string values',
            expect.anything(),
            expect.any(String),
        );

        onRecordError.mockClear();
        await expect(handler.execute(
            createContext(),
            createStep({ optionCodesField: 'optionCodes' }),
            [{
                sku: 'SKU-BAD-OPTION-COLLECTIONS',
                name: 'Existing Variant',
                price: 10,
                optionCodes: 'blue',
            }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant field "optionCodes" must be an array of option codes',
            expect.anything(),
            expect.any(String),
        );
    });

    it('does not reassign a variant already visible in the target channel', async () => {
        const existing = {
            id: 'variant-existing',
            sku: 'SKU-ASSIGNED',
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [existing],
            'uk-store': [existing],
        });

        const result = await handler.execute(
            createContext(),
            createStep({ priceByCurrencyField: 'prices', channelsField: 'channels' }),
            [{
                sku: 'SKU-ASSIGNED',
                name: 'Assigned Variant',
                prices: { GBP: 149.99 },
                channels: ['uk-store'],
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(productVariantService.assignProductVariantsToChannel).not.toHaveBeenCalled();
        expect(productVariantService.update).toHaveBeenCalledWith(
            expect.objectContaining({ channel: expect.objectContaining({ code: 'uk-store' }) }),
            [{
                id: 'variant-existing',
                prices: [{ currencyCode: CurrencyCode.GBP, price: 14999 }],
            }],
        );
    });

    it('refuses a target-only SKU instead of creating a duplicate', async () => {
        const targetVariant = {
            id: 'variant-target-only',
            sku: 'SKU-TARGET-ONLY',
            channels: [{ id: 'channel-3', code: 'uk-store' }],
        };
        const { handler, productVariantService } = createHandler(2, {
            'default-channel': [],
            'uk-store': [targetVariant],
        });
        const onRecordError = vi.fn();

        const result = await handler.execute(
            createContext(),
            createStep({ channelsField: 'channels' }),
            [{
                sku: 'SKU-TARGET-ONLY',
                name: 'Target Variant',
                price: 10,
                productSlug: 'product',
                channels: ['uk-store'],
            }],
            onRecordError,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant "SKU-TARGET-ONLY" exists in channel "uk-store" but is not assigned to source channel "default-channel"',
            expect.anything(),
            expect.anything(),
        );
    });

    it('uses the same per-record target-channel plan during simulation', async () => {
        const { handler, requestContextService } = createHandler();

        const result = await handler.simulate(
            createContext(),
            createStep({ priceByCurrencyField: 'prices', channelsField: 'channels' }),
            [{
                sku: 'SKU-SIMULATE-UK',
                name: 'UK Variant',
                prices: { USD: 175, GBP: 149.99 },
                productSlug: 'product',
                channels: ['uk-store'],
            }],
        );

        expect(result.recordsIn).toBe(1);
        expect(requestContextService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                channelOrToken: expect.objectContaining({ code: 'uk-store' }),
            }),
        );
        expect(result.recordDetails[0].operation).toBe('CREATE');
    });

    it('reports a target-only SKU as a record error and continues simulation', async () => {
        const targetVariant = {
            id: 'variant-target-only',
            sku: 'SKU-SIM-TARGET-ONLY',
            channels: [{ id: 'channel-3', code: 'uk-store' }],
        };
        const { handler } = createHandler(2, {
            'default-channel': [],
            'uk-store': [targetVariant],
        });

        const result = await handler.simulate(
            createContext(),
            createStep({ channelsField: 'channels' }),
            [
                {
                    sku: 'SKU-SIM-TARGET-ONLY',
                    name: 'Target Variant',
                    price: 10,
                    productSlug: 'product',
                    channels: ['uk-store'],
                },
                {
                    sku: 'SKU-SIM-VALID',
                    name: 'Valid Variant',
                    price: 12,
                    productSlug: 'product',
                },
            ],
        );

        expect(result.recordDetails.map(detail => detail.operation)).toEqual([
            'ERROR',
            'CREATE',
        ]);
        expect(result.recordDetails[0].validationErrors).toEqual([
            'Variant "SKU-SIM-TARGET-ONLY" exists in channel "uk-store" but is not assigned to source channel "default-channel"',
        ]);
        expect(result.wouldFail).toBe(1);
        expect(result.wouldCreate).toBe(1);
    });

    it('validates required default currencies during simulation', async () => {
        const { handler } = createHandler();

        const result = await handler.simulate(
            createContext(),
            createStep({ priceByCurrencyField: 'prices', channelsField: 'channels' }),
            [{
                sku: 'SKU-SIM-UK-ONLY',
                name: 'UK Variant',
                prices: { GBP: 149.99 },
                productSlug: 'product',
                channels: ['uk-store'],
            }],
        );

        expect(result.recordDetails[0].operation).toBe('ERROR');
        expect(result.recordDetails[0].validationErrors).toEqual([
            'Currency prices must include the default currency "USD" for channel "default-channel"',
        ]);
    });

    it('validates currency-map values during simulation', async () => {
        const { handler } = createHandler();

        const result = await handler.simulate(
            createContext(),
            createStep({ priceByCurrencyField: 'prices' }),
            [{
                sku: 'SKU-SIM-INVALID-PRICE',
                name: 'Invalid Price Variant',
                prices: { USD: 'not-a-price' },
                productSlug: 'product',
            }],
        );

        expect(result.recordDetails[0].operation).toBe('ERROR');
        expect(result.recordDetails[0].validationErrors).toEqual([
            'Price must be a finite number',
        ]);
    });

    it('rejects ambiguous enabled values during execution and simulation', async () => {
        const { handler, productVariantService } = createHandler();
        const record = {
            sku: 'SKU-INVALID-ENABLED',
            name: 'Invalid Enabled Variant',
            price: 10,
            productSlug: 'product',
            enabled: 'yes',
        };
        const onRecordError = vi.fn();

        await expect(
            handler.execute(createContext(), createStep(), [record], onRecordError),
        ).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant enabled value must be a boolean or "true"/"false" string',
            record,
            expect.any(String),
        );

        const simulation = await handler.simulate(createContext(), createStep(), [record]);
        expect(simulation.recordDetails[0]).toMatchObject({
            operation: 'ERROR',
            validationErrors: [
                'Variant enabled value must be a boolean or "true"/"false" string',
            ],
        });
    });

    it('reports missing parent products through the record error callback', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productService.findOneBySlug.mockResolvedValue(undefined);
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-NO-PARENT',
            name: 'No Parent Variant',
            price: 10,
            productSlug: 'missing-product',
        };

        await expect(
            handler.execute(createContext(), createStep(), [record], onRecordError),
        ).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Cannot create variant "SKU-NO-PARENT" without a parent product',
            record,
            expect.any(String),
        );
    });

    it('rejects an explicitly configured tax category that cannot be resolved', async () => {
        const { handler, productVariantService, taxCategoryService } = createHandler();
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-TAX-MISSING',
            name: 'Missing Tax Variant',
            price: 10,
            productSlug: 'product',
        };

        await expect(handler.execute(
            createContext(),
            createStep({ taxCategoryName: 'Missing Tax' }),
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(taxCategoryService.findAll).toHaveBeenCalled();
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Tax category "Missing Tax" was not found',
            record,
            expect.any(String),
        );
    });

    it('rejects an ambiguous configured tax-category name', async () => {
        const { handler, productVariantService, taxCategoryService } = createHandler();
        taxCategoryService.findAll.mockResolvedValue({
            items: [{ id: 'tax-1' }, { id: 'tax-2' }],
            totalItems: 2,
        });
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-TAX-AMBIGUOUS',
            name: 'Ambiguous Tax Variant',
            price: 10,
            productSlug: 'product',
        };

        await expect(handler.execute(
            createContext(),
            createStep({ taxCategoryName: 'Duplicated Tax' }),
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Multiple tax categories use name "Duplicated Tax"',
            record,
            expect.any(String),
        );
    });

    it('rejects non-finite stock before calling Vendure', async () => {
        const { handler, productVariantService } = createHandler();
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-BAD-STOCK',
            name: 'Bad Stock Variant',
            price: 10,
            stockOnHand: Number.POSITIVE_INFINITY,
            productSlug: 'product',
        };

        await expect(
            handler.execute(createContext(), createStep(), [record], onRecordError),
        ).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Variant field "stockOnHand" must be a finite number',
            record,
            expect.any(String),
        );

        const simulation = await handler.simulate(createContext(), createStep(), [record]);
        expect(simulation.recordDetails[0].validationErrors).toEqual([
            'Variant field "stockOnHand" must be a finite number',
        ]);
    });

    it('rejects ambiguous product-name resolution', async () => {
        const { handler, productService, productVariantService } = createHandler();
        productService.findAll.mockResolvedValue({
            items: [{ id: 'product-1' }, { id: 'product-2' }],
            totalItems: 2,
        });
        const onRecordError = vi.fn();
        const record = {
            sku: 'SKU-AMBIGUOUS-PARENT',
            name: 'Ambiguous Parent Variant',
            price: 10,
            productName: 'Duplicate Product Name',
        };

        await expect(
            handler.execute(createContext(), createStep(), [record], onRecordError),
        ).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productVariantService.create).not.toHaveBeenCalled();
        expect(onRecordError).toHaveBeenCalledWith(
            'load-variants',
            'Multiple products use name "Duplicate Product Name"',
            record,
            expect.any(String),
        );
    });
});
