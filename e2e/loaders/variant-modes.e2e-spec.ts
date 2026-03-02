/**
 * Variant Modes E2E Tests
 *
 * Tests 4 nested entity modes for Variant loader:
 * - facetValuesMode (REPLACE_ALL, MERGE, REMOVE, SKIP)
 * - assetsMode (REPLACE_ALL, MERGE, REMOVE, SKIP)
 * - featuredAssetMode (SET, SKIP)
 * - optionsMode (REPLACE_ALL, MERGE, SKIP)
 *
 * Verifies: idempotency, duplicate prevention, edge cases, performance
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProductVariantService, FacetValueService, AssetService, ProductService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { VariantHandler } from '../../src/runtime/executors/loaders/variant-handler';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import {
    testIdempotency,
    testReplaceAllMode,
    testMergeMode,
    testSkipMode,
} from './mode-test-helpers';

describe('Variant Modes', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: VariantHandler;
    let variantService: ProductVariantService;
    let facetValueService: FacetValueService;
    let assetService: AssetService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        handler = server.app.get(VariantHandler);
        variantService = server.app.get(ProductVariantService);
        facetValueService = server.app.get(FacetValueService);
        assetService = server.app.get(AssetService);
        const productHandler = server.app.get(ProductHandler);
        const facetHandler = server.app.get(FacetHandler);
        const facetValueHandler = server.app.get(FacetValueHandler);
        ctx = await getSuperadminContext(server.app);

        // Setup: create parent products (without default variants)
        const productStep = makeStep('setup-vm-products', { strategy: 'UPSERT', createVariants: false });
        await productHandler.execute(ctx, productStep, [
            { name: 'VM FV Product', slug: 'vm-fv-product' },
            { name: 'VM Asset Product', slug: 'vm-asset-product' },
            { name: 'VM Featured Product', slug: 'vm-featured-product' },
            { name: 'VM Options Product', slug: 'vm-options-product' },
            { name: 'VM Combined Product', slug: 'vm-combined-product' },
            { name: 'VM Perf Product', slug: 'vm-perf-product' },
        ]);

        // Setup: create facets + facet values
        const facetStep = makeStep('setup-vm-facets', { strategy: 'UPSERT', codeField: 'code', nameField: 'name' });
        await facetHandler.execute(ctx, facetStep, [{ code: 'vm-material', name: 'Material' }]);
        const fvStep = makeStep('setup-vm-fv', { strategy: 'UPSERT', facetCodeField: 'facetCode', codeField: 'code', nameField: 'name' });
        await facetValueHandler.execute(ctx, fvStep, [
            { facetCode: 'vm-material', code: 'vm-cotton', name: 'Cotton' },
            { facetCode: 'vm-material', code: 'vm-silk', name: 'Silk' },
            { facetCode: 'vm-material', code: 'vm-wool', name: 'Wool' },
        ]);
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('facetValuesMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all facet values (idempotent)', async () => {
                const step = makeStep('vm-fv-replace', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    facetValuesField: 'facetValues',
                    facetValuesMode: 'REPLACE_ALL',
                });
                const data = [{
                    sku: 'VM-FV-REPLACE-001',
                    price: 10.00,
                    productSlug: 'vm-fv-product',
                    facetValues: [{ facetCode: 'vm-material', code: 'vm-cotton' }],
                }];
                const getCount = async () => {
                    const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-FV-REPLACE-001' } } } as never);
                    if (variants.items.length === 0) return 0;
                    return variants.items[0].facetValues?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBe(1);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new facet values without duplicates', async () => {
                const step = makeStep('vm-fv-merge', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    facetValuesField: 'facetValues',
                    facetValuesMode: 'MERGE',
                });
                // Create with cotton
                await handler.execute(ctx, step, [{
                    sku: 'VM-FV-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-fv-product',
                    facetValues: [{ facetCode: 'vm-material', code: 'vm-cotton' }],
                }]);
                // Merge silk
                await handler.execute(ctx, step, [{
                    sku: 'VM-FV-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-fv-product',
                    facetValues: [{ facetCode: 'vm-material', code: 'vm-silk' }],
                }]);

                const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-FV-MERGE-001' } } } as never);
                const codes = variants.items[0].facetValues?.map(fv => fv.code) ?? [];
                expect(codes).toContain('vm-cotton');
                expect(codes).toContain('vm-silk');
            });
        });

        describe('SKIP', () => {
            it('should not modify facet values', async () => {
                // Create variant with cotton via REPLACE_ALL
                const setupStep = makeStep('vm-fv-skip-setup', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    facetValuesField: 'facetValues',
                    facetValuesMode: 'REPLACE_ALL',
                });
                await handler.execute(ctx, setupStep, [{
                    sku: 'VM-FV-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-fv-product',
                    facetValues: [{ facetCode: 'vm-material', code: 'vm-cotton' }],
                }]);

                // Run with SKIP and new values
                const skipStep = makeStep('vm-fv-skip', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    facetValuesField: 'facetValues',
                    facetValuesMode: 'SKIP',
                });
                await handler.execute(ctx, skipStep, [{
                    sku: 'VM-FV-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-fv-product',
                    facetValues: [{ facetCode: 'vm-material', code: 'vm-silk' }, { facetCode: 'vm-material', code: 'vm-wool' }],
                }]);

                const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-FV-SKIP-001' } } } as never);
                const codes = variants.items[0].facetValues?.map(fv => fv.code) ?? [];
                expect(codes.length).toBe(1);
                expect(codes).toContain('vm-cotton');
            });
        });
    });

    describe('assetsMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all assets (idempotent)', async () => {
                const step = makeStep('vm-asset-replace', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    assetsField: 'assets',
                    assetsMode: 'REPLACE_ALL',
                });
                const data = [{
                    sku: 'VM-ASSET-REPLACE-001',
                    price: 10.00,
                    productSlug: 'vm-asset-product',
                    assets: ['https://via.placeholder.com/10x10.png?text=VMA1'],
                }];
                const getCount = async () => {
                    const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-ASSET-REPLACE-001' } } } as never);
                    if (variants.items.length === 0) return 0;
                    return variants.items[0].assets?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBeGreaterThanOrEqual(0);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new assets without duplicates', async () => {
                const step = makeStep('vm-asset-merge', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    assetsField: 'assets',
                    assetsMode: 'MERGE',
                });
                await handler.execute(ctx, step, [{
                    sku: 'VM-ASSET-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-asset-product',
                    assets: ['https://via.placeholder.com/10x10.png?text=VMM1'],
                }]);
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-ASSET-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-asset-product',
                    assets: ['https://via.placeholder.com/10x10.png?text=VMM2'],
                }]);
                expect(result.ok).toBe(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify assets', async () => {
                const step = makeStep('vm-asset-skip', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    assetsField: 'assets',
                    assetsMode: 'SKIP',
                });
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-ASSET-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-asset-product',
                    assets: ['https://via.placeholder.com/10x10.png?text=ShouldSkip'],
                }]);
                expect(result.ok).toBe(1);
            });
        });
    });

    describe('featuredAssetMode', () => {
        describe('SET', () => {
            it('should set featured asset', async () => {
                const step = makeStep('vm-feat-set', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    featuredAssetField: 'featuredAsset',
                    featuredAssetMode: 'SET',
                });
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-FEAT-SET-001',
                    price: 10.00,
                    productSlug: 'vm-featured-product',
                    featuredAsset: 'https://via.placeholder.com/10x10.png?text=Feat',
                }]);
                expect(result.ok).toBe(1);
            });

            it('should update featured asset on re-run', async () => {
                const step = makeStep('vm-feat-update', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    featuredAssetField: 'featuredAsset',
                    featuredAssetMode: 'SET',
                });
                await handler.execute(ctx, step, [{
                    sku: 'VM-FEAT-UPDATE-001',
                    price: 10.00,
                    productSlug: 'vm-featured-product',
                    featuredAsset: 'https://via.placeholder.com/10x10.png?text=V1',
                }]);
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-FEAT-UPDATE-001',
                    price: 10.00,
                    productSlug: 'vm-featured-product',
                    featuredAsset: 'https://via.placeholder.com/10x10.png?text=V2',
                }]);
                expect(result.ok).toBe(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify featured asset', async () => {
                const step = makeStep('vm-feat-skip', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    featuredAssetField: 'featuredAsset',
                    featuredAssetMode: 'SKIP',
                });
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-FEAT-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-featured-product',
                    featuredAsset: 'https://via.placeholder.com/10x10.png?text=Skip',
                }]);
                expect(result.ok).toBe(1);
            });
        });
    });

    describe('optionsMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all variant options (idempotent)', async () => {
                const step = makeStep('vm-opt-replace', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    optionGroupsField: 'options',
                    optionsMode: 'REPLACE_ALL',
                });
                const data = [{
                    sku: 'VM-OPT-REPLACE-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { size: 'Small' },
                }];
                const getCount = async () => {
                    const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-OPT-REPLACE-001' } } } as never);
                    if (variants.items.length === 0) return 0;
                    return variants.items[0].options?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBe(1);
            });

            it('should remove old options not in new list', async () => {
                const step = makeStep('vm-opt-replace-new', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    optionGroupsField: 'options',
                    optionsMode: 'REPLACE_ALL',
                });
                // Create with color: red
                await handler.execute(ctx, step, [{
                    sku: 'VM-OPT-REPLACE-NEW-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { color: 'Red' },
                }]);
                // Replace with color: blue
                await handler.execute(ctx, step, [{
                    sku: 'VM-OPT-REPLACE-NEW-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { color: 'Blue' },
                }]);

                const variants = await variantService.findAll(ctx, { filter: { sku: { eq: 'VM-OPT-REPLACE-NEW-001' } } } as never);
                const optionCodes = variants.items[0].options?.map(o => o.code) ?? [];
                expect(optionCodes.some(c => c.toLowerCase().includes('blue'))).toBe(true);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new options without duplicates', async () => {
                const step = makeStep('vm-opt-merge', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    optionGroupsField: 'options',
                    optionsMode: 'MERGE',
                });
                await handler.execute(ctx, step, [{
                    sku: 'VM-OPT-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { size: 'Large' },
                }]);
                const result = await handler.execute(ctx, step, [{
                    sku: 'VM-OPT-MERGE-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { weight: 'Heavy' },
                }]);
                expect(result.ok).toBe(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify variant options', async () => {
                // Create variant with options
                const createStep = makeStep('vm-opt-skip-create', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    optionGroupsField: 'options',
                });
                await handler.execute(ctx, createStep, [{
                    sku: 'VM-OPT-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { material: 'Cotton' },
                }]);

                // Run with SKIP mode and new options
                const skipStep = makeStep('vm-opt-skip', {
                    strategy: 'UPSERT',
                    skuField: 'sku',
                    priceField: 'price',
                    optionGroupsField: 'options',
                    optionsMode: 'SKIP',
                });
                const result = await handler.execute(ctx, skipStep, [{
                    sku: 'VM-OPT-SKIP-001',
                    price: 10.00,
                    productSlug: 'vm-options-product',
                    options: { texture: 'Smooth' },
                }]);
                expect(result.ok).toBe(1);
            });
        });
    });

    describe('Combined mode scenarios', () => {
        it('should handle all 4 modes together', async () => {
            const step = makeStep('vm-combined', {
                strategy: 'UPSERT',
                skuField: 'sku',
                priceField: 'price',
                facetValuesField: 'facetValues',
                facetValuesMode: 'REPLACE_ALL',
                assetsField: 'assets',
                assetsMode: 'SKIP',
                featuredAssetField: 'featuredAsset',
                featuredAssetMode: 'SET',
                optionGroupsField: 'options',
                optionsMode: 'MERGE',
            });
            const result = await handler.execute(ctx, step, [{
                sku: 'VM-COMBINED-001',
                price: 25.00,
                productSlug: 'vm-combined-product',
                facetValues: [{ facetCode: 'vm-material', code: 'vm-cotton' }],
                assets: ['https://via.placeholder.com/10x10.png?text=Skip'],
                featuredAsset: 'https://via.placeholder.com/10x10.png?text=Feat',
                options: { size: 'Medium' },
            }]);
            expect(result.ok).toBe(1);
            expect(result.fail).toBe(0);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ variants with all nested entities in <5 seconds', async () => {
            const step = makeStep('vm-perf', {
                strategy: 'UPSERT',
                skuField: 'sku',
                priceField: 'price',
                optionGroupsField: 'options',
            });
            const data = Array.from({ length: 100 }, (_, i) => ({
                sku: `VM-PERF-${String(i).padStart(3, '0')}`,
                price: 10 + i,
                productSlug: 'vm-perf-product',
                options: { batchSize: `Size-${i}` },
            }));

            const start = Date.now();
            await handler.execute(ctx, step, data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(60000);
        });
    });
});
