/**
 * Variant Modes E2E Tests
 *
 * Tests nested entity modes for the Variant loader:
 * - facetValuesMode (REPLACE_ALL, MERGE, SKIP)
 * - assetsMode (REPLACE_ALL, SKIP)
 * - featuredAssetMode (SET, SKIP)
 * - optionsMode (REPLACE_ALL, MERGE, SKIP)
 *
 * Uses ProductVariantLoader (BaseEntityLoader) which supports configurable modes
 * through LoaderContext.options.config.
 *
 * Each test creates variants under unique auto-created products to avoid
 * Vendure's constraint of requiring option groups for multiple variants
 * under the same product.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TransactionalConnection, ProductVariant, ID } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import { ProductVariantLoader } from '../../src/loaders/product-variant/product-variant.loader';
import { getSuperadminContext, makeStep, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import type { LoaderContext } from '../../src/types/loader-interfaces';
import type { ProductVariantInput } from '../../src/loaders/product-variant/types';

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
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        loader = server.app.get(ProductVariantLoader);
        connection = server.app.get(TransactionalConnection);
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
    });

    afterAll(async () => {
        await server.destroy();
    });

    async function findVariantWithFacets(sku: string): Promise<ProductVariant | null> {
        const variants = await connection
            .getRepository(ctx, ProductVariant)
            .find({ where: { sku }, relations: ['facetValues'] });
        return variants.length > 0 ? variants[0] : null;
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
        });
    });

    describe('assetsMode', () => {
        it('should create variant with REPLACE_ALL assets mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' }), [{
                sku: 'VM-ASSET-REPLACE-001',
                price: 1000,
                productName: 'VM Asset Replace Product',
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
        });

        it('should create variant with MERGE assets mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'MERGE' }), [{
                sku: 'VM-ASSET-MERGE-001',
                price: 1000,
                productName: 'VM Asset Merge Product',
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
        });
    });

    describe('featuredAssetMode', () => {
        it('should create variant with SET featured asset mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { featuredAssetMode: 'SET' }), [{
                sku: 'VM-FEAT-SET-001',
                price: 1000,
                productName: 'VM Feat Set Product',
            }]);
            expect(result.created).toBe(1);
            expect(result.failed).toBe(0);
        });

        it('should create variant with SET mode on different product', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { featuredAssetMode: 'SET' }), [{
                sku: 'VM-FEAT-UPDATE-001',
                price: 1000,
                productName: 'VM Feat Update Product',
            }]);
            expect(result.created).toBe(1);
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
        it('should create variant with REPLACE_ALL options mode', async () => {
            const result = await loader.load(makeLoaderContext(ctx, { optionsMode: 'REPLACE_ALL' }), [{
                sku: 'VM-OPT-REPLACE-001',
                price: 1000,
                productName: 'VM Opt Replace Product',
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
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

    describe('Combined mode scenarios', () => {
        it('should handle all 4 modes together on create', async () => {
            const result = await loader.load(makeLoaderContext(ctx, {
                facetValuesMode: 'REPLACE_ALL',
                assetsMode: 'SKIP',
                featuredAssetMode: 'SET',
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
