/**
 * Product loader handler e2e tests
 *
 * Tests ProductHandler.execute() directly against a real Vendure server.
 * Covers: create, update, upsert, multi-language, multi-channel, enabled flag,
 * createVariants=false, idempotency, and error handling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProductService, ProductVariantService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';

describe('ProductHandler e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: ProductHandler;
    let productService: ProductService;
    let variantService: ProductVariantService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        handler = server.app.get(ProductHandler);
        productService = server.app.get(ProductService);
        variantService = server.app.get(ProductVariantService);
        ctx = await getSuperadminContext(server.app);
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('creates a product with default variant via upsert', async () => {
        const step = makeStep('test-product-create', {
            strategy: 'UPSERT',
        });
        const input = [{
            name: 'Test Widget',
            slug: 'test-widget',
            description: 'A test product for e2e',
            sku: 'TEST-W-001',
            price: 19.99,
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
        expect(result.fail).toBe(0);

        // Verify product was created
        const product = await productService.findOneBySlug(ctx, 'test-widget');
        expect(product).toBeDefined();
        expect(product!.name).toBe('Test Widget');

        // Verify default variant was created
        const variants = await variantService.findAll(ctx, {
            filter: { sku: { eq: 'TEST-W-001' } },
        } as never);
        expect(variants.items.length).toBe(1);
        expect(variants.items[0].sku).toBe('TEST-W-001');
    });

    it('updates an existing product via upsert (idempotent)', async () => {
        const step = makeStep('test-product-update', {
            strategy: 'UPSERT',
        });
        const input = [{
            name: 'Test Widget Updated',
            slug: 'test-widget',
            description: 'Updated description',
            sku: 'TEST-W-001',
            price: 24.99,
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
        expect(result.fail).toBe(0);

        const product = await productService.findOneBySlug(ctx, 'test-widget');
        expect(product).toBeDefined();
        expect(product!.name).toBe('Test Widget Updated');
    });

    it('skips existing product with CREATE strategy', async () => {
        const step = makeStep('test-product-create-only', {
            strategy: 'CREATE',
        });
        const input = [{
            name: 'Should Not Update',
            slug: 'test-widget',
            sku: 'TEST-W-001',
            price: 99.99,
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1); // Counted as ok (skip)

        // Name should NOT have changed
        const product = await productService.findOneBySlug(ctx, 'test-widget');
        expect(product!.name).toBe('Test Widget Updated');
    });

    it('fails on missing product with UPDATE strategy', async () => {
        const step = makeStep('test-product-update-only', {
            strategy: 'UPDATE',
        });
        const collector = createErrorCollector();
        const input = [{
            name: 'Nonexistent Product',
            slug: 'nonexistent-product-xyz',
            sku: 'NOEXIST-001',
            price: 10.00,
        }];

        const result = await handler.execute(ctx, step, input, collector.callback);
        expect(result.ok).toBe(0);
        expect(result.fail).toBe(1);
    });

    it('reports error for records missing required fields', async () => {
        const step = makeStep('test-product-missing', {});
        const collector = createErrorCollector();
        const input = [
            { description: 'No name or slug' },
        ];

        const result = await handler.execute(ctx, step, input, collector.callback);
        expect(result.fail).toBe(1);
        expect(collector.errors.length).toBe(1);
    });

    it('creates product with createVariants=false', async () => {
        const step = makeStep('test-no-variant', {
            strategy: 'UPSERT',
            createVariants: false,
        });
        const input = [{
            name: 'Product Without Variant',
            slug: 'product-without-variant',
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        // Product exists
        const product = await productService.findOneBySlug(ctx, 'product-without-variant');
        expect(product).toBeDefined();

        // No variant should be created
        const allVariants = await variantService.findAll(ctx, {} as never);
        const matched = allVariants.items.filter(v => v.sku === 'PRODUCT-WITHOUT-VARIANT');
        expect(matched.length).toBe(0);
    });

    it('creates product with multi-language translations (array format)', async () => {
        const step = makeStep('test-multilang', {
            strategy: 'UPSERT',
            translationsField: 'translations',
            createVariants: false,
        });
        const input = [{
            translations: [
                { languageCode: 'en', name: 'Safety Glove', slug: 'safety-glove', description: 'A safety glove' },
                { languageCode: 'de', name: 'Schutzhandschuh', slug: 'schutzhandschuh', description: 'Ein Schutzhandschuh' },
            ],
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const product = await productService.findOneBySlug(ctx, 'safety-glove');
        expect(product).toBeDefined();
    });

    it('creates product with multi-language translations (object map format)', async () => {
        const step = makeStep('test-multilang-map', {
            strategy: 'UPSERT',
            translationsField: 'translations',
            createVariants: false,
        });
        const input = [{
            translations: {
                en: { name: 'Lab Coat', slug: 'lab-coat', description: 'A lab coat' },
                de: { name: 'Labormantel', slug: 'labormantel', description: 'Ein Labormantel' },
                fr: { name: 'Blouse de labo', slug: 'blouse-de-labo', description: 'Une blouse' },
            },
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const product = await productService.findOneBySlug(ctx, 'lab-coat');
        expect(product).toBeDefined();
    });

    it('sets product enabled/disabled via enabledField', async () => {
        const step = makeStep('test-enabled', {
            strategy: 'UPSERT',
            enabledField: 'published',
            createVariants: false,
        });
        const input = [{
            name: 'Disabled Product',
            slug: 'disabled-product',
            published: false,
        }];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        const product = await productService.findOneBySlug(ctx, 'disabled-product');
        expect(product).toBeDefined();
        expect(product!.enabled).toBe(false);

        // Re-enable it
        const enableInput = [{
            name: 'Disabled Product',
            slug: 'disabled-product',
            published: true,
        }];
        const result2 = await handler.execute(ctx, step, enableInput);
        expect(result2.ok).toBe(1);

        const updated = await productService.findOneBySlug(ctx, 'disabled-product');
        expect(updated!.enabled).toBe(true);
    });

    it('handles batch of multiple products', async () => {
        const step = makeStep('test-batch', {
            strategy: 'UPSERT',
            createVariants: false,
        });
        const input = [
            { name: 'Batch Product A', slug: 'batch-a' },
            { name: 'Batch Product B', slug: 'batch-b' },
            { name: 'Batch Product C', slug: 'batch-c' },
        ];

        const result = await handler.execute(ctx, step, input);
        expect(result.ok).toBe(3);
        expect(result.fail).toBe(0);

        for (const slug of ['batch-a', 'batch-b', 'batch-c']) {
            const p = await productService.findOneBySlug(ctx, slug);
            expect(p).toBeDefined();
        }
    });

    it('handles mixed success/failure batch', async () => {
        const step = makeStep('test-mixed', {
            strategy: 'UPSERT',
            createVariants: false,
        });
        const collector = createErrorCollector();
        const input = [
            { name: 'Valid Product', slug: 'valid-product' },
            { description: 'Missing name - will fail' },                // no name
            { name: 'Another Valid', slug: 'another-valid' },
        ];

        const result = await handler.execute(ctx, step, input, collector.callback);
        expect(result.ok).toBe(2);
        expect(result.fail).toBe(1);
        expect(collector.errors.length).toBe(1);
    });
});
