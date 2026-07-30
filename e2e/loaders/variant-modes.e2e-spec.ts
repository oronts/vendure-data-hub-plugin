/**
 * Variant Modes E2E Tests
 *
 * Tests nested entity modes for the Variant loader:
 * - facetValuesMode (REPLACE_ALL, MERGE, SKIP)
 * - assetsMode (REPLACE_ALL, SKIP)
 * - featuredAssetMode (REPLACE, SKIP)
 * - optionsMode (REPLACE_ALL, MERGE, SKIP)
 *
 * Uses ProductVariantLoader (BaseEntityLoader) which supports configurable modes
 * through LoaderContext.options.config.
 *
 * Each test creates variants under unique auto-created products to avoid
 * Vendure's constraint of requiring option groups for multiple variants
 * under the same product.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
    ID,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    ProductVariant,
    ProductVariantService,
    StockLevelService,
    TransactionalConnection,
} from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import { ProductVariantLoader } from '../../src/loaders/product-variant/product-variant.loader';
import { getSuperadminContext, makeStep, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import type { LoaderContext } from '../../src/types/loader-interfaces';
import type { ProductVariantInput } from '../../src/loaders/product-variant/types';
import * as assetDownload from '../../src/utils/asset-download.utils';

const TEST_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
    'base64',
);

function makeLoaderContext(
    ctx: import('@vendure/core').RequestContext,
    config?: Record<string, unknown>,
): LoaderContext {
    return {
        ctx,
        pipelineId: 'test-pipeline' as ID,
        runId: 'test-run' as ID,
        operation: 'UPSERT',
        lookupFields: ['sku'],
        dryRun: false,
        options: { config: config ?? {} },
    };
}

describe('Variant Modes', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let loader: ProductVariantLoader;
    let connection: TransactionalConnection;
    let productService: ProductService;
    let variantService: ProductVariantService;
    let stockLevelService: StockLevelService;
    let ctx: import('@vendure/core').RequestContext;
    let optionProductId: ID;

    beforeAll(async () => {
        vi.spyOn(assetDownload, 'downloadAsset').mockResolvedValue(TEST_PNG);
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        loader = server.app.get(ProductVariantLoader);
        connection = server.app.get(TransactionalConnection);
        productService = server.app.get(ProductService);
        variantService = server.app.get(ProductVariantService);
        stockLevelService = server.app.get(StockLevelService);
        const facetHandler = server.app.get(FacetHandler);
        const facetValueHandler = server.app.get(FacetValueHandler);
        ctx = await getSuperadminContext(server.app);

        // Setup: create facets + facet values
        const facetStep = makeStep('setup-vm-facets', { strategy: 'UPSERT', codeField: 'code', nameField: 'name' });
        await facetHandler.execute(ctx, facetStep, [{ code: 'vm-material', name: 'Material' }]);
        const fvStep = makeStep('setup-vm-fv', { strategy: 'UPSERT', facetCodeField: 'facetCode', codeField: 'code', nameField: 'name' });
        await facetValueHandler.execute(ctx, fvStep, [
            { facetCode: 'vm-material', code: 'vm-cotton', name: 'Cotton' },
            { facetCode: 'vm-material', code: 'vm-silk', name: 'Silk' },
            { facetCode: 'vm-material', code: 'vm-wool', name: 'Wool' },
        ]);

        const optionProduct = await productService.create(ctx, {
            enabled: true,
            translations: [{
                languageCode: ctx.languageCode,
                name: 'VM Option Product',
                slug: 'vm-option-product',
                description: '',
            }],
        });
        const optionGroup = await server.app.get(ProductOptionGroupService).create(ctx, {
            code: 'vm-size',
            translations: [{ languageCode: ctx.languageCode, name: 'Size' }],
        });
        await server.app.get(ProductOptionService).create(ctx, optionGroup, {
            code: 'vm-small',
            translations: [{ languageCode: ctx.languageCode, name: 'Small' }],
        });
        await productService.addOptionGroupToProduct(ctx, optionProduct.id, optionGroup.id);
        optionProductId = optionProduct.id;
    });

    afterAll(async () => {
        await server.destroy();
        vi.restoreAllMocks();
    });

    async function findVariantWithFacets(sku: string): Promise<ProductVariant | null> {
        const variants = await connection
            .getRepository(ctx, ProductVariant)
            .find({ where: { sku }, relations: ['facetValues'] });
        return variants.length > 0 ? variants[0] : null;
    }

    async function findVariantWithAssets(sku: string): Promise<ProductVariant | null> {
        const variants = await connection
            .getRepository(ctx, ProductVariant)
            .find({ where: { sku }, relations: ['assets', 'featuredAsset'] });
        return variants[0] ?? null;
    }

    describe('facetValuesMode', () => {
        it('should create variant with facet values via REPLACE_ALL', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { facetValuesMode: 'REPLACE_ALL' }), [{
                sku: 'VM-FV-REPLACE-001',
                price: 1000,
                productName: 'VM FV Replace Product',
                facetValueCodes: ['vm-cotton'],
            }]);
            expect(result.created).toBe(1);

            const variant = await findVariantWithFacets('VM-FV-REPLACE-001');
            expect(variant).not.toBeNull();
            expect(variant!.facetValues.length).toBe(1);
        });

        it('should create variant with MERGE mode facet values', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { facetValuesMode: 'MERGE' }), [{
                sku: 'VM-FV-MERGE-001',
                price: 1000,
                productName: 'VM FV Merge Product',
                facetValueCodes: ['vm-cotton', 'vm-silk'],
            }]);
            expect(result.created).toBe(1);

            const variant = await findVariantWithFacets('VM-FV-MERGE-001');
            expect(variant).not.toBeNull();
            const codes = variant!.facetValues.map(fv => fv.code);
            expect(codes).toContain('vm-cotton');
            expect(codes).toContain('vm-silk');
        });

        it('should create variant even with SKIP mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { facetValuesMode: 'SKIP' }), [{
                sku: 'VM-FV-SKIP-001',
                price: 1000,
                productName: 'VM FV Skip Product',
                facetValueCodes: ['vm-cotton'],
            }]);
            expect(result.created).toBe(1);
            const variant = await findVariantWithFacets('VM-FV-SKIP-001');
            expect(variant?.facetValues).toHaveLength(0);
        });
    });

    describe('assetsMode', () => {
        it('should create variant with REPLACE_ALL assets mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' }), [{
                sku: 'VM-ASSET-REPLACE-001',
                price: 1000,
                productName: 'VM Asset Replace Product',
                assetUrls: ['https://assets.example.com/replace.png'],
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
            expect((await findVariantWithAssets('VM-ASSET-REPLACE-001'))?.assets).toHaveLength(1);
        });

        it('should create variant with UPSERT_BY_URL assets mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'UPSERT_BY_URL' }), [{
                sku: 'VM-ASSET-MERGE-001',
                price: 1000,
                productName: 'VM Asset Merge Product',
                assetUrls: ['https://assets.example.com/upsert.png'],
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
            expect((await findVariantWithAssets('VM-ASSET-MERGE-001'))?.assets).toHaveLength(1);
        });
    });

    describe('featuredAssetMode', () => {
        it('should create variant with REPLACE featured asset mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { featuredAssetMode: 'REPLACE' }), [{
                sku: 'VM-FEAT-SET-001',
                price: 1000,
                productName: 'VM Feat Set Product',
                featuredAssetUrl: 'https://assets.example.com/featured.png',
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
            expect((await findVariantWithAssets('VM-FEAT-SET-001'))?.featuredAsset).toBeTruthy();
        });

        it('should create variant with REPLACE mode on different product', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { featuredAssetMode: 'REPLACE' }), [{
                sku: 'VM-FEAT-UPDATE-001',
                price: 1000,
                productName: 'VM Feat Update Product',
                featuredAssetUrl: 'https://assets.example.com/featured-second.png',
            }]);
            expect(result.created).toBe(1);
            expect((await findVariantWithAssets('VM-FEAT-UPDATE-001'))?.featuredAsset).toBeTruthy();
        });

        it('should create variant with SKIP featured asset mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { featuredAssetMode: 'SKIP' }), [{
                sku: 'VM-FEAT-SKIP-001',
                price: 1000,
                productName: 'VM Feat Skip Product',
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
        });
    });

    describe('optionsMode', () => {
        it('passes resolved options into Vendure create for products with option groups', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { optionsMode: 'REPLACE_ALL' }), [{
                sku: 'VM-OPT-REPLACE-001',
                price: 1000,
                productId: optionProductId,
                optionCodes: ['vm-small'],
            }]);
            expect(result).toMatchObject({ created: 1, failed: 0 });
            const variants = await connection.getRepository(ctx, ProductVariant).find({
                where: { sku: 'VM-OPT-REPLACE-001' },
                relations: ['options'],
            });
            expect(variants[0]?.options.map(option => option.code)).toEqual(['vm-small']);
        });

        it('should create variant with MERGE options mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { optionsMode: 'MERGE' }), [{
                sku: 'VM-OPT-MERGE-001',
                price: 1000,
                productName: 'VM Opt Merge Product',
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
        });

        it('should create variant with SKIP options mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { optionsMode: 'SKIP' }), [{
                sku: 'VM-OPT-SKIP-001',
                price: 1000,
                productName: 'VM Opt Skip Product',
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Vendure mutation contracts', () => {
        it('sets the requested absolute stock quantity on update', async () => {
            const context = makeLoaderContext(ctx);
            expect(await loader.load(context, [{
                sku: 'VM-STOCK-001',
                price: 10,
                productName: 'VM Stock Product',
                stockOnHand: 10,
            }])).toMatchObject({ created: 1, failed: 0 });
            expect(await loader.load(context, [{
                sku: 'VM-STOCK-001',
                price: 10,
                productName: 'VM Stock Product',
                stockOnHand: 15,
            }])).toMatchObject({ updated: 1, failed: 0 });

            const [variant] = (await variantService.findAll(ctx, {
                filter: { sku: { eq: 'VM-STOCK-001' } },
            })).items;
            await expect(stockLevelService.getAvailableStock(ctx, variant.id)).resolves.toMatchObject({
                stockOnHand: 15,
            });
        });

        it('persists all translations in Vendure create without a second update', async () => {
            expect(await loader.load(makeLoaderContext(ctx), [{
                sku: 'VM-I18N-001',
                name: 'English name',
                price: 10,
                productName: 'VM Translation Product',
                translations: [{ languageCode: 'de', name: 'Deutscher Name' }],
            }])).toMatchObject({ created: 1, failed: 0 });

            const variants = await connection.getRepository(ctx, ProductVariant).find({
                where: { sku: 'VM-I18N-001' },
                relations: ['translations'],
            });
            expect(variants[0]?.translations).toEqual(expect.arrayContaining([
                expect.objectContaining({ languageCode: ctx.languageCode, name: 'English name' }),
                expect.objectContaining({ languageCode: 'de', name: 'Deutscher Name' }),
            ]));
        });

        it('rolls back an auto-created product when relation resolution fails', async () => {
            const result = await loader.load(makeLoaderContext(ctx), [{
                sku: 'VM-ROLLBACK-001',
                price: 10,
                productName: 'VM Rolled Back Product',
                optionCodes: ['missing-option'],
            }]);
            expect(result).toMatchObject({ created: 0, failed: 1 });
            expect(result.errors[0]?.message).toContain('Option codes not found: missing-option');
            await expect(productService.findAll(ctx, {
                filter: { name: { eq: 'VM Rolled Back Product' } },
            })).resolves.toMatchObject({ totalItems: 0 });
        });
    });

    describe('Combined mode scenarios', () => {
        it('should handle all 4 modes together on create', async () => {
            const result = await loader.load(makeLoaderContext(ctx, {
                facetValuesMode: 'REPLACE_ALL',
                assetsMode: 'SKIP',
                featuredAssetMode: 'REPLACE',
                optionsMode: 'MERGE',
            }), [{
                sku: 'VM-COMBINED-001',
                price: 2500,
                productName: 'VM Combined Product',
                facetValueCodes: ['vm-cotton'],
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
            expect(result.failed).toBe(0);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ variants in <60 seconds', async () => {
            const data: ProductVariantInput[] = Array.from({ length: 100 }, (_, i) => ({
                sku: `VM-PERF-${String(i).padStart(3, '0')}`,
                price: 1000 + i,
                productName: `VM Perf Product ${i}`,
            }));

            const start = Date.now();
            await loader.load(makeLoaderContext(ctx), data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(60000);
        });
    });
});
