/**
 * Variant loader handler e2e tests
 *
 * Tests VariantHandler.execute() directly against a real Vendure server.
 * Covers: create, update, upsert, multi-currency prices, option groups,
 * enabled flag, multi-language, stock, and error handling.
 *
 * Note: Vendure only allows one variant without option groups per product.
 * Tests that need multiple variants use optionGroupsField, and tests
 * that need isolated products use separate parent products.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    ChannelService,
    CurrencyCode,
    ProductVariantService,
    ProductService,
    RequestContext,
    RequestContextService,
    SessionService,
} from '@vendure/core';
import gql from 'graphql-tag';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { VariantHandler } from '../../src/runtime/executors/loaders/variant-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import { createChannelCodeRequestContext } from '../../src/runtime/helpers/channel-request-context';
import { StepType, RunStatus } from '../../src/constants/enums';
import { waitForSuccessfulQueueRun } from '../../src/services/events/message-run-waiter';
import { publishPipeline } from '../pipeline-lifecycle';

describe('VariantHandler e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let productHandler: ProductHandler;
    let variantHandler: VariantHandler;
    let variantService: ProductVariantService;
    let productService: ProductService;
    let ctx: import('@vendure/core').RequestContext;
    let ukCtx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        const { activeChannel, zones } = await adminClient.query(gql`
            query VariantChannelSetup {
                activeChannel {
                    defaultLanguageCode
                    defaultTaxZone { id }
                    defaultShippingZone { id }
                }
                zones(options: { take: 1 }) { items { id } }
            }
        `);
        const zoneId = activeChannel.defaultTaxZone?.id
            ?? activeChannel.defaultShippingZone?.id
            ?? zones.items[0]?.id;
        if (!zoneId) throw new Error('Variant channel test requires a zone');
        const { createChannel } = await adminClient.query(gql`
            mutation CreateVariantUkChannel($input: CreateChannelInput!) {
                createChannel(input: $input) {
                    ... on Channel { id code token }
                    ... on ErrorResult { errorCode message }
                }
            }
        `, {
            input: {
                code: 'variant-uk-store',
                token: 'variant-uk-store',
                defaultLanguageCode: activeChannel.defaultLanguageCode,
                defaultCurrencyCode: CurrencyCode.GBP,
                availableCurrencyCodes: [CurrencyCode.GBP],
                defaultTaxZoneId: zoneId,
                defaultShippingZoneId: zoneId,
                pricesIncludeTax: false,
            },
        });
        if (!createChannel.id) {
            throw new Error(`Failed to create variant UK channel: ${createChannel.message}`);
        }
        productHandler = server.app.get(ProductHandler);
        variantHandler = server.app.get(VariantHandler);
        variantService = server.app.get(ProductVariantService);
        productService = server.app.get(ProductService);
        const channelService = server.app.get(ChannelService);
        ctx = await getSuperadminContext(server.app);
        await channelService.update(ctx, {
            id: ctx.channelId,
            availableCurrencyCodes: [CurrencyCode.USD, CurrencyCode.EUR],
        });
        ctx = await getSuperadminContext(server.app);
        const session = await server.app
            .get(SessionService)
            .getSessionFromToken(adminClient.getAuthToken());
        if (!session) throw new Error('Superadmin session not found');
        ctx = new RequestContext({
            apiType: 'admin',
            channel: ctx.channel,
            session,
            languageCode: ctx.languageCode,
            currencyCode: ctx.currencyCode,
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
        });
        ukCtx = await createChannelCodeRequestContext(
            server.app.get(RequestContextService),
            channelService,
            ctx,
            'variant-uk-store',
        );

        // Create separate parent products so each test group has a clean product
        // (Vendure only allows one variant without option groups per product)
        const productStep = makeStep('setup-products', {
            strategy: 'UPSERT',
            createVariants: false,
        });
        await productHandler.execute(ctx, productStep, [
            { name: 'Glove Group', slug: 'glove-group' },
            { name: 'Filter Product', slug: 'filter-product' },
            { name: 'Enabled Test Product', slug: 'enabled-test-product' },
            { name: 'Translation Test Product', slug: 'translation-test-product' },
            { name: 'Currency Test Product', slug: 'currency-test-product' },
            { name: 'Channel Price Product', slug: 'channel-price-product' },
            { name: 'Queued Channel Product', slug: 'queued-channel-product' },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('creates variant for existing product via upsert', async () => {
        const step = makeStep('test-variant-create', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceField: 'price',
        });
        const input = [{
            sku: 'GLV-S',
            name: 'Glove Small',
            price: 29.90,
            productSlug: 'glove-group',
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'GLV-S' } },
        } as never);
        expect(variants.items.length).toBe(1);
        expect(variants.items[0].sku).toBe('GLV-S');
    });

    it('updates existing variant via upsert (idempotent)', async () => {
        const step = makeStep('test-variant-update', {
            strategy: 'UPSERT',
            skuField: 'sku',
            nameField: 'name',
            priceField: 'price',
        });
        const input = [{
            sku: 'GLV-S',
            name: 'Glove Small Updated',
            price: 34.90,
            productSlug: 'glove-group',
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'GLV-S' } },
        } as never);
        expect(variants.items[0].name).toBe('Glove Small Updated');
    });

    it('creates multiple variants with option groups for the same product', async () => {
        const step = makeStep('test-multi-variant', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceField: 'price',
            optionGroupsField: 'options',
        });
        const input = [
            { sku: 'GLV-M', name: 'Glove Medium', price: 29.90, productSlug: 'glove-group', options: { size: 'Medium' } },
            { sku: 'GLV-L', name: 'Glove Large', price: 31.90, productSlug: 'glove-group', options: { size: 'Large' } },
            { sku: 'GLV-XL', name: 'Glove XL', price: 33.90, productSlug: 'glove-group', options: { size: 'XL' } },
        ];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(3);
        expect(result.fail).toBe(0);
    });

    it('creates variant with multi-currency prices', async () => {
        const step = makeStep('test-multi-currency', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceByCurrencyField: 'prices',
        });
        const input = [{
            sku: 'FIL-001',
            name: 'PTFE Filter',
            prices: { EUR: 78.00, USD: 86.00 },
            productSlug: 'currency-test-product',
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'FIL-001' } },
        } as never);
        expect(variants.items.length).toBe(1);
        const prices = await variantService.getProductVariantPrices(ctx, variants.items[0].id);
        expect(prices).toEqual(expect.arrayContaining([
            expect.objectContaining({ currencyCode: CurrencyCode.EUR, price: 7800 }),
            expect.objectContaining({ currencyCode: CurrencyCode.USD, price: 8600 }),
        ]));
    });

    it('creates one source variant with exact USD and GBP channel prices', async () => {
        const step = makeStep('test-cross-channel-currency', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceByCurrencyField: 'prices',
            channelsField: 'channels',
        });
        const input = [{
            sku: 'CHANNEL-PRICE-001',
            name: 'Channel Price Variant',
            prices: { USD: 175, GBP: 149.99 },
            productSlug: 'channel-price-product',
            channels: ['variant-uk-store'],
        }];

        expect(await variantHandler.execute(ctx, step, input)).toEqual({
            ok: 1,
            fail: 0,
            skipped: 0,
        });
        expect(await variantHandler.execute(ctx, step, input)).toEqual({
            ok: 1,
            fail: 0,
            skipped: 0,
        });

        const sourceVariants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'CHANNEL-PRICE-001' } },
        } as never);
        const targetVariants = await variantService.findAll(ukCtx, {
            filter: { sku: { eq: 'CHANNEL-PRICE-001' } },
        } as never);
        expect(sourceVariants.items).toHaveLength(1);
        expect(targetVariants.items).toHaveLength(1);
        expect(targetVariants.items[0].id).toBe(sourceVariants.items[0].id);

        const sourcePrices = await variantService.getProductVariantPrices(
            ctx,
            sourceVariants.items[0].id,
        );
        const targetPrices = await variantService.getProductVariantPrices(
            ukCtx,
            sourceVariants.items[0].id,
        );
        expect(sourcePrices).toEqual([
            expect.objectContaining({ currencyCode: CurrencyCode.USD, price: 17500 }),
        ]);
        expect(targetPrices).toEqual([
            expect.objectContaining({ currencyCode: CurrencyCode.GBP, price: 14999 }),
        ]);
    });

    it('restores the initiating user for queued cross-channel assignment', async () => {
        const product = await productService.findOneBySlug(ctx, 'queued-channel-product');
        if (!product) throw new Error('Queued channel product was not created');
        const { createDataHubPipeline } = await adminClient.query(gql`
            mutation CreateQueuedVariantPipeline($input: CreateDataHubPipelineInput!) {
                createDataHubPipeline(input: $input) { id }
            }
        `, {
            input: {
                code: 'queued-cross-channel-variant',
                name: 'Queued Cross-channel Variant',
                definition: {
                    version: 1,
                    steps: [
                        {
                            key: 'extract-product',
                            type: StepType.EXTRACT,
                            config: {
                                adapterCode: 'vendureQuery',
                                entity: 'PRODUCT',
                                relations: ['translations'],
                                filters: [{ field: 'id', operator: 'eq', value: product.id }],
                            },
                        },
                        {
                            key: 'prepare-variant',
                            type: StepType.TRANSFORM,
                            config: {
                                operators: [
                                    { op: 'set', args: { path: 'sku', value: 'QUEUE-CHANNEL-001' } },
                                    { op: 'set', args: { path: 'name', value: 'Queued Channel Variant' } },
                                    { op: 'set', args: { path: 'productId', value: product.id } },
                                    { op: 'set', args: { path: 'prices', value: { USD: 175, GBP: 149.99 } } },
                                    { op: 'set', args: { path: 'channels', value: ['variant-uk-store'] } },
                                ],
                            },
                        },
                        {
                            key: 'load-variant',
                            type: StepType.LOAD,
                            config: {
                                adapterCode: 'variantUpsert',
                                strategy: 'UPSERT',
                                skuField: 'sku',
                                priceByCurrencyField: 'prices',
                                channelsField: 'channels',
                            },
                        },
                    ],
                    edges: [
                        { from: 'extract-product', to: 'prepare-variant' },
                        { from: 'prepare-variant', to: 'load-variant' },
                    ],
                },
            },
        });

        try {
            await publishPipeline(adminClient, createDataHubPipeline.id);
            const { startDataHubPipelineRun } = await adminClient.query(gql`
                mutation StartQueuedVariantPipeline($id: ID!) {
                    startDataHubPipelineRun(pipelineId: $id) { id }
                }
            `, { id: createDataHubPipeline.id });

            await waitForSuccessfulQueueRun(
                startDataHubPipelineRun.id,
                async runId => {
                    const { dataHubPipelineRun } = await adminClient.query(gql`
                        query QueuedVariantRun($id: ID!) {
                            dataHubPipelineRun(id: $id) { status error }
                        }
                    `, { id: runId });
                    return dataHubPipelineRun
                        ? {
                            status: dataHubPipelineRun.status as RunStatus,
                            error: dataHubPipelineRun.error ?? null,
                        }
                        : null;
                },
            );

            const sourceVariants = await variantService.findAll(ctx, {
                filter: { sku: { eq: 'QUEUE-CHANNEL-001' } },
            } as never);
            const targetVariants = await variantService.findAll(ukCtx, {
                filter: { sku: { eq: 'QUEUE-CHANNEL-001' } },
            } as never);
            expect(sourceVariants.items).toHaveLength(1);
            expect(targetVariants.items).toHaveLength(1);
            expect(targetVariants.items[0].id).toBe(sourceVariants.items[0].id);

            expect(await variantService.getProductVariantPrices(
                ctx,
                sourceVariants.items[0].id,
            )).toEqual([
                expect.objectContaining({ currencyCode: CurrencyCode.USD, price: 17500 }),
            ]);
            expect(await variantService.getProductVariantPrices(
                ukCtx,
                sourceVariants.items[0].id,
            )).toEqual([
                expect.objectContaining({ currencyCode: CurrencyCode.GBP, price: 14999 }),
            ]);
        } finally {
            await adminClient.query(gql`
                mutation DeleteQueuedVariantPipeline($id: ID!) {
                    deleteDataHubPipeline(id: $id) { result }
                }
            `, { id: createDataHubPipeline.id });
        }
    });

    it('creates variant with option groups (auto-create)', async () => {
        const step = makeStep('test-option-groups', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceField: 'price',
            optionGroupsField: 'options',
        });
        const input = [{
            sku: 'FIL-OPT-001',
            name: 'Filter Small Red',
            price: 32.90,
            productSlug: 'filter-product',
            options: { size: 'Small', color: 'Red' },
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
    });

    it('sets variant enabled/disabled via enabledField', async () => {
        const step = makeStep('test-variant-enabled', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceField: 'price',
            enabledField: 'active',
        });

        // Create disabled variant on a dedicated product (no existing variants)
        const input = [{
            sku: 'EN-TEST-001',
            name: 'Disabled Variant',
            price: 42.00,
            productSlug: 'enabled-test-product',
            active: false,
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'EN-TEST-001' } },
        } as never);
        expect(variants.items[0].enabled).toBe(false);

        // Re-enable
        const enableInput = [{
            sku: 'EN-TEST-001',
            name: 'Disabled Variant',
            price: 42.00,
            productSlug: 'enabled-test-product',
            active: true,
        }];
        const result2 = await variantHandler.execute(ctx, step, enableInput);
        expect(result2.ok).toBe(1);

        const updated = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'EN-TEST-001' } },
        } as never);
        expect(updated.items[0].enabled).toBe(true);
    });

    it('creates variant with multi-language translations (array)', async () => {
        const step = makeStep('test-variant-translations', {
            strategy: 'UPSERT',
            skuField: 'sku',
            priceField: 'price',
            translationsField: 'translations',
        });
        const input = [{
            sku: 'TRANS-001',
            price: 68.00,
            productSlug: 'translation-test-product',
            translations: [
                { languageCode: 'en', name: 'PTFE Filter 1.0µm' },
                { languageCode: 'de', name: 'PTFE Filter 1.0µm' },
            ],
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
    });

    it('fails for variant missing SKU', async () => {
        const step = makeStep('test-no-sku', {
            strategy: 'UPSERT',
            skuField: 'sku',
        });
        const collector = createErrorCollector();
        const input = [
            { name: 'No SKU variant', productSlug: 'filter-product' },
        ];

        const result = await variantHandler.execute(ctx, step, input, collector.callback);
        expect(result.fail).toBe(1);
    });

    it('skips existing variant with CREATE strategy', async () => {
        const step = makeStep('test-variant-create-only', {
            strategy: 'CREATE',
            skipDuplicates: true,
            skuField: 'sku',
            priceField: 'price',
        });
        const input = [{
            sku: 'GLV-S',
            name: 'Should Not Update',
            price: 99.99,
            productSlug: 'glove-group',
        }];

        const result = await variantHandler.execute(ctx, step, input);
        expect(result).toEqual({ ok: 0, fail: 0, skipped: 1 });

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'GLV-S' } },
        } as never);
        // Name should still be the updated one, not 'Should Not Update'
        expect(variants.items[0].name).toBe('Glove Small Updated');
    });
});
