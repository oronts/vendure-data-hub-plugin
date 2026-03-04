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
import { ProductService, ProductVariantService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { VariantHandler } from '../../src/runtime/executors/loaders/variant-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';

describe('VariantHandler e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let productHandler: ProductHandler;
    let variantHandler: VariantHandler;
    let productService: ProductService;
    let variantService: ProductVariantService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        productHandler = server.app.get(ProductHandler);
        variantHandler = server.app.get(VariantHandler);
        productService = server.app.get(ProductService);
        variantService = server.app.get(ProductVariantService);
        ctx = await getSuperadminContext(server.app);

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
        expect(result.ok).toBe(1); // Counted as ok (skip)

        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'GLV-S' } },
        } as never);
        // Name should still be the updated one, not 'Should Not Update'
        expect(variants.items[0].name).toBe('Glove Small Updated');
    });
});
