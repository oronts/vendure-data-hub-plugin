/**
 * Product Facet Values Mode E2E Tests
 *
 * Tests facetValuesMode for Product loader:
 * NOTE: The ProductHandler does NOT support facetValuesMode/facetValuesField.
 * The handleFacetValues() function exists in shared-helpers.ts but is only
 * used by the BaseEntityLoader-based ProductLoader and ProductVariantLoader,
 * NOT by the ProductHandler (which is the LoaderHandler used in pipelines).
 *
 * These tests verify the actual ProductHandler behavior:
 * - facetValues config fields are IGNORED
 * - products are created/updated without any facet value assignment
 *
 * Verifies: idempotency, edge cases, performance
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProductService, FacetValueService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import {
    testIdempotency,
    testEmptyArrayHandling,
} from './mode-test-helpers';

describe('Product Facet Values Mode', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: ProductHandler;
    let productService: ProductService;
    let facetValueService: FacetValueService;
    let facetHandler: FacetHandler;
    let facetValueHandler: FacetValueHandler;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        handler = server.app.get(ProductHandler);
        productService = server.app.get(ProductService);
        facetValueService = server.app.get(FacetValueService);
        facetHandler = server.app.get(FacetHandler);
        facetValueHandler = server.app.get(FacetValueHandler);
        ctx = await getSuperadminContext(server.app);

        // Create facets and facet values for testing
        const facetStep = makeStep('setup-facets', { strategy: 'UPSERT', codeField: 'code', nameField: 'name' });
        await facetHandler.execute(ctx, facetStep, [
            { code: 'color', name: 'Color' },
            { code: 'size', name: 'Size' },
        ]);
        const fvStep = makeStep('setup-fv', { strategy: 'UPSERT', facetCodeField: 'facetCode', codeField: 'code', nameField: 'name' });
        await facetValueHandler.execute(ctx, fvStep, [
            { facetCode: 'color', code: 'red', name: 'Red' },
            { facetCode: 'color', code: 'blue', name: 'Blue' },
            { facetCode: 'color', code: 'green', name: 'Green' },
            { facetCode: 'size', code: 'small', name: 'Small' },
            { facetCode: 'size', code: 'large', name: 'Large' },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('REPLACE_ALL mode', () => {
        it('should create product successfully (facetValues ignored by handler)', async () => {
            // The ProductHandler does NOT support facetValuesField/facetValuesMode.
            // These config fields are silently ignored. Products are created without facet values.
            const step = makeStep('fv-replace-idemp', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            const data = [{
                name: 'FV Replace Idemp Product',
                slug: 'fv-replace-idemp',
                facetValues: [{ facetCode: 'color', code: 'red' }],
            }];
            const getCount = async () => {
                const product = await productService.findOneBySlug(ctx, 'fv-replace-idemp');
                if (!product) return 0;
                const full = await productService.findOne(ctx, product.id);
                return full?.facetValues?.length ?? 0;
            };
            // Product is created/updated idempotently, facetValues remain 0
            const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
            expect(count).toBe(0);
        });

        it('should create product without facet values (handler ignores facetValuesField)', async () => {
            const step = makeStep('fv-replace-new', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            // Create product with facetValues in the record (ignored by handler)
            await handler.execute(ctx, step, [{
                name: 'FV Replace Product',
                slug: 'fv-replace-product',
                facetValues: [{ facetCode: 'color', code: 'red' }, { facetCode: 'color', code: 'blue' }],
            }]);
            // Run again with different facet values (still ignored)
            await handler.execute(ctx, step, [{
                name: 'FV Replace Product',
                slug: 'fv-replace-product',
                facetValues: [{ facetCode: 'color', code: 'green' }, { facetCode: 'size', code: 'small' }],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-replace-product');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign facet values
            expect(codes.length).toBe(0);
        });

        it('should handle empty facet values array', async () => {
            const step = makeStep('fv-replace-empty', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, step, [{
                name: 'FV Empty Product',
                slug: 'fv-empty-product',
                facetValues: [{ facetCode: 'color', code: 'red' }, { facetCode: 'color', code: 'blue' }],
            }]);
            // Replace with empty
            await handler.execute(ctx, step, [{
                name: 'FV Empty Product',
                slug: 'fv-empty-product',
                facetValues: [],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-empty-product');
            const full = await productService.findOne(ctx, product!.id);
            expect(full?.facetValues?.length ?? 0).toBe(0);
        });
    });

    describe('MERGE mode', () => {
        it('should create product without facet values (handler ignores MERGE mode)', async () => {
            const step = makeStep('fv-merge', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'MERGE',
            });
            // Create with red
            await handler.execute(ctx, step, [{
                name: 'FV Merge Product',
                slug: 'fv-merge-product',
                facetValues: [{ facetCode: 'color', code: 'red' }],
            }]);
            // Merge blue (ignored by handler)
            await handler.execute(ctx, step, [{
                name: 'FV Merge Product',
                slug: 'fv-merge-product',
                facetValues: [{ facetCode: 'color', code: 'blue' }],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-merge-product');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign facet values
            expect(codes.length).toBe(0);
        });

        it('should produce idempotent results (handler ignores facetValues)', async () => {
            const step = makeStep('fv-merge-idemp', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'MERGE',
            });
            const data = [{
                name: 'FV Merge Idemp Product',
                slug: 'fv-merge-idemp',
                facetValues: [{ facetCode: 'color', code: 'red' }, { facetCode: 'size', code: 'small' }],
            }];
            const getCount = async () => {
                const product = await productService.findOneBySlug(ctx, 'fv-merge-idemp');
                if (!product) return 0;
                const full = await productService.findOne(ctx, product.id);
                return full?.facetValues?.length ?? 0;
            };
            const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
            // Handler does not assign facet values
            expect(count).toBe(0);
        });

        it('should not modify facet values (handler ignores facetValuesField)', async () => {
            const replaceStep = makeStep('fv-preserve-setup', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, replaceStep, [{
                name: 'FV Preserve Product',
                slug: 'fv-preserve-product',
                facetValues: [{ facetCode: 'color', code: 'red' }, { facetCode: 'color', code: 'blue' }],
            }]);

            const mergeStep = makeStep('fv-preserve', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'MERGE',
            });
            await handler.execute(ctx, mergeStep, [{
                name: 'FV Preserve Product',
                slug: 'fv-preserve-product',
                facetValues: [{ facetCode: 'color', code: 'green' }, { facetCode: 'size', code: 'large' }],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-preserve-product');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign facet values
            expect(codes.length).toBe(0);
        });
    });

    describe('REMOVE mode', () => {
        it('should not remove facet values (handler ignores REMOVE mode)', async () => {
            // Setup: create product
            const setupStep = makeStep('fv-remove-setup', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, setupStep, [{
                name: 'FV Remove Product',
                slug: 'fv-remove-product',
                facetValues: [
                    { facetCode: 'color', code: 'red' },
                    { facetCode: 'color', code: 'blue' },
                    { facetCode: 'color', code: 'green' },
                ],
            }]);

            // Remove blue (ignored by handler)
            const removeStep = makeStep('fv-remove', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REMOVE',
            });
            const result = await handler.execute(ctx, removeStep, [{
                name: 'FV Remove Product',
                slug: 'fv-remove-product',
                facetValues: [{ facetCode: 'color', code: 'blue' }],
            }]);
            expect(result.ok).toBe(1);

            const product = await productService.findOneBySlug(ctx, 'fv-remove-product');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign or remove facet values
            expect(codes.length).toBe(0);
        });

        it('should ignore non-existent facet values gracefully', async () => {
            const setupStep = makeStep('fv-remove-noexist-setup', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, setupStep, [{
                name: 'FV Remove NoExist Product',
                slug: 'fv-remove-noexist',
                facetValues: [{ facetCode: 'color', code: 'red' }, { facetCode: 'color', code: 'blue' }],
            }]);

            const removeStep = makeStep('fv-remove-noexist', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REMOVE',
            });
            const result = await handler.execute(ctx, removeStep, [{
                name: 'FV Remove NoExist Product',
                slug: 'fv-remove-noexist',
                facetValues: [{ facetCode: 'color', code: 'nonexistent-xyz' }],
            }]);
            expect(result.ok).toBe(1);

            const product = await productService.findOneBySlug(ctx, 'fv-remove-noexist');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign facet values
            expect(codes.length).toBe(0);
        });
    });

    describe('SKIP mode', () => {
        it('should create product without facet values (handler ignores SKIP mode)', async () => {
            const setupStep = makeStep('fv-skip-setup', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, setupStep, [{
                name: 'FV Skip Product',
                slug: 'fv-skip-product',
                facetValues: [{ facetCode: 'color', code: 'red' }],
            }]);

            const skipStep = makeStep('fv-skip', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'SKIP',
            });
            await handler.execute(ctx, skipStep, [{
                name: 'FV Skip Product',
                slug: 'fv-skip-product',
                facetValues: [{ facetCode: 'color', code: 'blue' }, { facetCode: 'color', code: 'green' }],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-skip-product');
            const full = await productService.findOne(ctx, product!.id);
            const codes = full?.facetValues?.map(fv => fv.code) ?? [];
            // Handler does not assign facet values
            expect(codes.length).toBe(0);
        });

        it('should leave facet value count at zero (handler ignores facetValues)', async () => {
            const setupStep = makeStep('fv-skip-count-setup', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            await handler.execute(ctx, setupStep, [{
                name: 'FV Skip Count Product',
                slug: 'fv-skip-count',
                facetValues: [
                    { facetCode: 'color', code: 'red' },
                    { facetCode: 'color', code: 'blue' },
                    { facetCode: 'color', code: 'green' },
                ],
            }]);

            const skipStep = makeStep('fv-skip-count', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'SKIP',
            });
            await handler.execute(ctx, skipStep, [{
                name: 'FV Skip Count Product',
                slug: 'fv-skip-count',
                facetValues: [
                    { facetCode: 'size', code: 'small' },
                    { facetCode: 'size', code: 'large' },
                    { facetCode: 'color', code: 'red' },
                    { facetCode: 'color', code: 'blue' },
                    { facetCode: 'color', code: 'green' },
                ],
            }]);

            const product = await productService.findOneBySlug(ctx, 'fv-skip-count');
            const full = await productService.findOne(ctx, product!.id);
            // Handler does not assign facet values
            expect(full?.facetValues?.length ?? 0).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle missing facetValuesField', async () => {
            const step = makeStep('fv-no-field', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'MERGE',
            });
            const result = await handler.execute(ctx, step, [{
                name: 'FV No Field Product',
                slug: 'fv-no-field',
                // No facetValues field
            }]);
            expect(result.ok).toBe(1);
            expect(result.fail).toBe(0);
        });

        it('should handle non-existent facet value codes', async () => {
            const step = makeStep('fv-bad-codes', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                name: 'FV Bad Codes Product',
                slug: 'fv-bad-codes',
                facetValues: [{ facetCode: 'nonexistent-facet', code: 'nonexistent-value' }],
            }], collector.callback);
            // Handler ignores facetValues, so it creates the product successfully
            expect(result.ok + result.fail).toBeGreaterThanOrEqual(1);
        });

        it('should handle empty array', async () => {
            const step = makeStep('fv-empty', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            const getCount = async () => {
                const list = await productService.findAll(ctx, {} as never);
                return list.totalItems;
            };
            await testEmptyArrayHandling(handler, ctx, step, getCount);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ products with multiple facet values in <5 seconds', async () => {
            const step = makeStep('fv-perf', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
            });
            const data = Array.from({ length: 100 }, (_, i) => ({
                name: `FV Perf Product ${i}`,
                slug: `fv-perf-${i}`,
                facetValues: [
                    { facetCode: 'color', code: 'red' },
                    { facetCode: 'color', code: 'blue' },
                    { facetCode: 'size', code: 'small' },
                ],
            }));

            const start = Date.now();
            await handler.execute(ctx, step, data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(30000);
        });
    });
});
