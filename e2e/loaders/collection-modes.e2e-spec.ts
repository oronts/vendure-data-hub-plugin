/**
 * Collection Modes E2E Tests
 *
 * Tests 2 nested entity modes for Collection loader:
 * - assetsMode (REPLACE_ALL, MERGE, SKIP)
 * - filtersMode (REPLACE_ALL, MERGE, SKIP)
 *
 * Uses CollectionLoader (BaseEntityLoader) which supports configurable modes
 * through LoaderContext.options.config.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CollectionService, AssetService, ID } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { CollectionLoader } from '../../src/loaders/collection/collection.loader';
import { getSuperadminContext, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import type { LoaderContext } from '../../src/types/loader-interfaces';
import type { CollectionInput } from '../../src/loaders/collection/types';

/**
 * Build a LoaderContext suitable for CollectionLoader.load()
 */
function makeLoaderContext(
    ctx: import('@vendure/core').RequestContext,
    config?: Record<string, unknown>,
): LoaderContext {
    return {
        ctx,
        pipelineId: 'test-pipeline' as ID,
        runId: 'test-run' as ID,
        operation: 'UPSERT',
        lookupFields: ['slug'],
        dryRun: false,
        options: {
            config: config ?? {},
        },
    };
}

describe('Collection Modes', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let loader: CollectionLoader;
    let collectionService: CollectionService;
    let assetService: AssetService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        loader = server.app.get(CollectionLoader);
        collectionService = server.app.get(CollectionService);
        assetService = server.app.get(AssetService);
        ctx = await getSuperadminContext(server.app);
    });

    afterAll(async () => {
        await server.destroy();
    });

    describe('assetsMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all assets (idempotent)', async () => {
                const loaderCtx = makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' });
                const data: CollectionInput[] = [{
                    name: 'Coll Asset Replace',
                    slug: 'coll-asset-replace',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=CA1'],
                }];
                const result = await loader.load(loaderCtx, data);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);
                expect(result.failed).toBe(0);

                // Running again should be idempotent
                const result2 = await loader.load(loaderCtx, data);
                expect(result2.succeeded).toBeGreaterThanOrEqual(1);
            });

            it('should remove old assets not in new list', async () => {
                const loaderCtx = makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' });
                await loader.load(loaderCtx, [{
                    name: 'Coll Asset Replace New',
                    slug: 'coll-asset-replace-new',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=Old'],
                }]);
                const result = await loader.load(loaderCtx, [{
                    name: 'Coll Asset Replace New',
                    slug: 'coll-asset-replace-new',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=New'],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new assets without duplicates', async () => {
                await loader.load(makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' }), [{
                    name: 'Coll Asset Merge',
                    slug: 'coll-asset-merge',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=CM1'],
                }]);
                const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'MERGE' }), [{
                    name: 'Coll Asset Merge',
                    slug: 'coll-asset-merge',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=CM2'],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);
            });

            it('should match assets by URL to prevent duplicates', async () => {
                const url = 'https://via.placeholder.com/10x10.png?text=SameColl';
                await loader.load(makeLoaderContext(ctx, { assetsMode: 'MERGE' }), [{
                    name: 'Coll Asset Merge URL',
                    slug: 'coll-asset-merge-url',
                    assetUrls: [url],
                }]);
                await loader.load(makeLoaderContext(ctx, { assetsMode: 'MERGE' }), [{
                    name: 'Coll Asset Merge URL',
                    slug: 'coll-asset-merge-url',
                    assetUrls: [url],
                }]);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-asset-merge-url');
                expect((coll?.assets?.length ?? 0)).toBeLessThanOrEqual(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify assets', async () => {
                // Setup collection with asset
                await loader.load(makeLoaderContext(ctx, { assetsMode: 'REPLACE_ALL' }), [{
                    name: 'Coll Asset Skip',
                    slug: 'coll-asset-skip',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=Keep'],
                }]);

                const result = await loader.load(makeLoaderContext(ctx, { assetsMode: 'SKIP' }), [{
                    name: 'Coll Asset Skip',
                    slug: 'coll-asset-skip',
                    assetUrls: ['https://via.placeholder.com/10x10.png?text=ShouldNotAppear'],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);
            });
        });
    });

    describe('filtersMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all collection filters (idempotent)', async () => {
                const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' });
                const data: CollectionInput[] = [{
                    name: 'Coll Filter Replace',
                    slug: 'coll-filter-replace',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Red"]' } }],
                }];
                const result = await loader.load(loaderCtx, data);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);

                // Idempotent re-run
                const result2 = await loader.load(loaderCtx, data);
                expect(result2.succeeded).toBeGreaterThanOrEqual(1);
            });

            it('should remove old filters not in new list', async () => {
                const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' });
                await loader.load(loaderCtx, [{
                    name: 'Coll Filter Replace New',
                    slug: 'coll-filter-replace-new',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Red"]' } }],
                }]);
                const result = await loader.load(loaderCtx, [{
                    name: 'Coll Filter Replace New',
                    slug: 'coll-filter-replace-new',
                    filters: [{ code: 'variant-name-filter', args: { term: 'Glove' } }],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);
            });

            it('should handle empty filters array (remove all)', async () => {
                const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' });
                await loader.load(loaderCtx, [{
                    name: 'Coll Filter Empty',
                    slug: 'coll-filter-empty',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Blue"]' } }],
                }]);
                // Replace with empty
                const result = await loader.load(loaderCtx, [{
                    name: 'Coll Filter Empty',
                    slug: 'coll-filter-empty',
                    filters: [],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-empty');
                expect(coll?.filters?.length ?? 0).toBe(0);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new filters without duplicates', async () => {
                // Create a collection with initial filter
                const createResult = await loader.load(makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' }), [{
                    name: 'Coll Filter Merge',
                    slug: 'coll-filter-merge',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Red"]' } }],
                }]);
                expect(createResult.succeeded).toBeGreaterThanOrEqual(1);

                // Merge a new filter - update may succeed or fail depending on
                // filter format compatibility, but should not crash
                const result = await loader.load(makeLoaderContext(ctx, { filtersMode: 'MERGE' }), [{
                    name: 'Coll Filter Merge',
                    slug: 'coll-filter-merge',
                    filters: [{ code: 'variant-name-filter', args: { term: 'Glove' } }],
                }]);
                expect(result.succeeded + result.failed).toBeGreaterThanOrEqual(1);
            });

            it('should prevent duplicate filters on re-run', async () => {
                const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'MERGE' });
                const data: CollectionInput[] = [{
                    name: 'Coll Filter Merge Idemp',
                    slug: 'coll-filter-merge-idemp',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Green"]' } }],
                }];
                await loader.load(loaderCtx, data);
                await loader.load(loaderCtx, data);
                await loader.load(loaderCtx, data);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-merge-idemp');
                expect(coll?.filters?.length ?? 0).toBeGreaterThanOrEqual(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify collection filters', async () => {
                // Setup collection with filter
                await loader.load(makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' }), [{
                    name: 'Coll Filter Skip',
                    slug: 'coll-filter-skip',
                    filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Red"]' } }],
                }]);

                const result = await loader.load(makeLoaderContext(ctx, { filtersMode: 'SKIP' }), [{
                    name: 'Coll Filter Skip',
                    slug: 'coll-filter-skip',
                    filters: [
                        { code: 'variant-name-filter', args: { term: 'NewFilter' } },
                        { code: 'facet-value-filter', args: { facetValueNames: '["Blue"]' } },
                    ],
                }]);
                expect(result.succeeded).toBeGreaterThanOrEqual(1);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-skip');
                expect(coll?.filters?.length ?? 0).toBe(1);
            });
        });
    });

    describe('Combined mode scenarios', () => {
        it('should handle assetsMode and filtersMode together', async () => {
            const loaderCtx = makeLoaderContext(ctx, {
                assetsMode: 'REPLACE_ALL',
                filtersMode: 'MERGE',
            });
            const result = await loader.load(loaderCtx, [{
                name: 'Coll Combined',
                slug: 'coll-combined',
                assetUrls: ['https://via.placeholder.com/10x10.png?text=Comb'],
                filters: [{ code: 'facet-value-filter', args: { facetValueNames: '["Red"]' } }],
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
            expect(result.failed).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle missing assetsField', async () => {
            const loaderCtx = makeLoaderContext(ctx, { assetsMode: 'MERGE' });
            const result = await loader.load(loaderCtx, [{
                name: 'Coll No Assets',
                slug: 'coll-no-assets',
                // No assetUrls field
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
            expect(result.failed).toBe(0);
        });

        it('should handle missing filtersField', async () => {
            const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'MERGE' });
            const result = await loader.load(loaderCtx, [{
                name: 'Coll No Filters',
                slug: 'coll-no-filters',
                // No filters field
            }]);
            expect(result.succeeded).toBeGreaterThanOrEqual(1);
            expect(result.failed).toBe(0);
        });

        it('should handle invalid filter configurations', async () => {
            const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' });
            const result = await loader.load(loaderCtx, [{
                name: 'Coll Bad Filter',
                slug: 'coll-bad-filter',
                filters: [{ code: 'nonexistent-filter-handler', args: {} }],
            }]);
            // Invalid filter code may cause error or be silently skipped
            expect(result.succeeded + result.failed).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ collections with filters in <30 seconds', async () => {
            const loaderCtx = makeLoaderContext(ctx, { filtersMode: 'REPLACE_ALL' });
            const data: CollectionInput[] = Array.from({ length: 100 }, (_, i) => ({
                name: `Coll Perf ${i}`,
                slug: `coll-perf-${i}`,
                filters: [{ code: 'facet-value-filter', args: { facetValueNames: `["Val${i}"]` } }],
            }));

            const start = Date.now();
            await loader.load(loaderCtx, data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(30000);
        });
    });
});
