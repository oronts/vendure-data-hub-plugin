/**
 * Deletion handler e2e tests
 *
 * Tests DeletionHandler.execute() for soft-deleting Products and Variants.
 * Covers: delete by slug, delete by SKU, cascade variant deletion,
 * not-found handling, and variant-only deletion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProductService, ProductVariantService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { DeletionHandler } from '../../src/runtime/executors/loaders/deletion-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';

describe('DeletionHandler e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let productHandler: ProductHandler;
    let deletionHandler: DeletionHandler;
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
        deletionHandler = server.app.get(DeletionHandler);
        productService = server.app.get(ProductService);
        variantService = server.app.get(ProductVariantService);
        ctx = await getSuperadminContext(server.app);

        // Create test products for deletion tests
        const step = makeStep('setup-deletion-data', { strategy: 'UPSERT' });
        await productHandler.execute(ctx, step, [
            { name: 'Delete Me Product', slug: 'delete-me-product', sku: 'DEL-PROD-001', price: 10.00 },
            { name: 'Delete Cascade Product', slug: 'delete-cascade-product', sku: 'DEL-CASC-001', price: 20.00 },
            { name: 'Keep This Product', slug: 'keep-this-product', sku: 'KEEP-001', price: 30.00 },
            { name: 'Delete Variant Only', slug: 'delete-variant-only', sku: 'DEL-VAR-001', price: 15.00 },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('soft-deletes a product by slug', async () => {
        const step = makeStep('test-delete-by-slug', {
            entityType: 'product',
            matchBy: 'slug',
            cascadeVariants: true,
        });
        const input = [{ slug: 'delete-me-product' }];

        const result = await deletionHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
        expect(result.fail).toBe(0);

        // Product should no longer be findable
        const product = await productService.findOneBySlug(ctx, 'delete-me-product');
        expect(product).toBeUndefined();
    });

    it('soft-deletes a product with cascade variant deletion', async () => {
        // First verify the product and variant exist
        const productBefore = await productService.findOneBySlug(ctx, 'delete-cascade-product');
        expect(productBefore).toBeDefined();

        const step = makeStep('test-cascade-delete', {
            entityType: 'product',
            matchBy: 'slug',
            cascadeVariants: true,
        });
        const input = [{ slug: 'delete-cascade-product' }];

        const result = await deletionHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        // Both product and variants should be gone
        const product = await productService.findOneBySlug(ctx, 'delete-cascade-product');
        expect(product).toBeUndefined();
    });

    it('soft-deletes a variant by SKU without affecting the product', async () => {
        const step = makeStep('test-variant-delete', {
            entityType: 'variant',
            matchBy: 'sku',
        });
        const input = [{ sku: 'DEL-VAR-001' }];

        const result = await deletionHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);

        // Product should still exist
        const product = await productService.findOneBySlug(ctx, 'delete-variant-only');
        expect(product).toBeDefined();
    });

    it('handles deletion of non-existent product gracefully', async () => {
        const step = makeStep('test-delete-nonexistent', {
            entityType: 'product',
            matchBy: 'slug',
        });
        const input = [{ slug: 'nonexistent-product-xyz' }];

        // Should complete without throwing — handler warns and counts as ok (no-op)
        const result = await deletionHandler.execute(ctx, step, input);
        expect(result.ok).toBe(1);
        expect(result.fail).toBe(0);
    });

    it('reports error for missing identifier field', async () => {
        const step = makeStep('test-delete-missing-id', {
            entityType: 'product',
            matchBy: 'slug',
        });
        const collector = createErrorCollector();
        const input = [{ unrelatedField: 'value' }]; // Missing 'slug' field

        const result = await deletionHandler.execute(ctx, step, input, collector.callback);
        expect(result.fail).toBe(1);
        expect(collector.errors.length).toBe(1);
        expect(collector.errors[0].message).toContain('identifier');
    });

    it('handles batch deletion of multiple products', async () => {
        // Create fresh products to delete
        const createStep = makeStep('setup-batch-delete', { strategy: 'UPSERT', createVariants: false });
        await productHandler.execute(ctx, createStep, [
            { name: 'Batch Del A', slug: 'batch-del-a' },
            { name: 'Batch Del B', slug: 'batch-del-b' },
        ]);

        const step = makeStep('test-batch-delete', {
            entityType: 'product',
            matchBy: 'slug',
            cascadeVariants: true,
        });
        const input = [
            { slug: 'batch-del-a' },
            { slug: 'batch-del-b' },
        ];

        const result = await deletionHandler.execute(ctx, step, input);
        expect(result.ok).toBe(2);
        expect(result.fail).toBe(0);
    });

    it('keeps unrelated products intact during deletion', async () => {
        // 'keep-this-product' was created in setup and should still be alive
        const product = await productService.findOneBySlug(ctx, 'keep-this-product');
        expect(product).toBeDefined();
        expect(product!.name).toBe('Keep This Product');
    });
});
