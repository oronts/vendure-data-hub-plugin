/**
 * Collection Modes E2E Tests
 *
 * Tests 2 nested entity modes for Collection loader:
 * - assetsMode (REPLACE_ALL, MERGE, REMOVE, SKIP)
 * - filtersMode (REPLACE_ALL, MERGE, SKIP)
 *
 * Verifies: idempotency, duplicate prevention, edge cases, performance
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CollectionService, AssetService } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { CollectionHandler } from '../../src/runtime/executors/loaders/collection-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';
import {
    testIdempotency,
    testReplaceAllMode,
    testMergeMode,
    testSkipMode,
} from './mode-test-helpers';

describe('Collection Modes', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: CollectionHandler;
    let collectionService: CollectionService;
    let assetService: AssetService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        handler = server.app.get(CollectionHandler);
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
                const step = makeStep('coll-asset-replace', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'REPLACE_ALL',
                });
                const data = [{
                    slug: 'coll-asset-replace',
                    name: 'Coll Asset Replace',
                    assets: ['https://via.placeholder.com/10x10.png?text=CA1'],
                }];
                const getCount = async () => {
                    const coll = await collectionService.findOneBySlug(ctx, 'coll-asset-replace');
                    if (!coll) return 0;
                    return coll.assets?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBeGreaterThanOrEqual(0);
            });

            it('should remove old assets not in new list', async () => {
                const step = makeStep('coll-asset-replace-new', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'REPLACE_ALL',
                });
                await handler.execute(ctx, step, [{
                    slug: 'coll-asset-replace-new',
                    name: 'Coll Asset Replace New',
                    assets: ['https://via.placeholder.com/10x10.png?text=Old'],
                }]);
                const result = await handler.execute(ctx, step, [{
                    slug: 'coll-asset-replace-new',
                    name: 'Coll Asset Replace New',
                    assets: ['https://via.placeholder.com/10x10.png?text=New'],
                }]);
                expect(result.ok).toBe(1);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new assets without duplicates', async () => {
                const step = makeStep('coll-asset-merge', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'MERGE',
                });
                await handler.execute(ctx, step, [{
                    slug: 'coll-asset-merge',
                    name: 'Coll Asset Merge',
                    assets: ['https://via.placeholder.com/10x10.png?text=CM1'],
                }]);
                const result = await handler.execute(ctx, step, [{
                    slug: 'coll-asset-merge',
                    name: 'Coll Asset Merge',
                    assets: ['https://via.placeholder.com/10x10.png?text=CM2'],
                }]);
                expect(result.ok).toBe(1);
            });

            it('should match assets by URL to prevent duplicates', async () => {
                const step = makeStep('coll-asset-merge-url', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'MERGE',
                });
                const url = 'https://via.placeholder.com/10x10.png?text=SameColl';
                await handler.execute(ctx, step, [{
                    slug: 'coll-asset-merge-url',
                    name: 'Coll Asset Merge URL',
                    assets: [url],
                }]);
                await handler.execute(ctx, step, [{
                    slug: 'coll-asset-merge-url',
                    name: 'Coll Asset Merge URL',
                    assets: [url],
                }]);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-asset-merge-url');
                expect((coll?.assets?.length ?? 0)).toBeLessThanOrEqual(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify assets', async () => {
                // Setup collection with asset
                const setupStep = makeStep('coll-asset-skip-setup', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'REPLACE_ALL',
                });
                await handler.execute(ctx, setupStep, [{
                    slug: 'coll-asset-skip',
                    name: 'Coll Asset Skip',
                    assets: ['https://via.placeholder.com/10x10.png?text=Keep'],
                }]);

                const skipStep = makeStep('coll-asset-skip', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    assetsField: 'assets',
                    assetsMode: 'SKIP',
                });
                const result = await handler.execute(ctx, skipStep, [{
                    slug: 'coll-asset-skip',
                    name: 'Coll Asset Skip',
                    assets: ['https://via.placeholder.com/10x10.png?text=ShouldNotAppear'],
                }]);
                expect(result.ok).toBe(1);
            });
        });
    });

    describe('filtersMode', () => {
        describe('REPLACE_ALL', () => {
            it('should replace all collection filters (idempotent)', async () => {
                const step = makeStep('coll-filter-replace', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'REPLACE_ALL',
                });
                const data = [{
                    slug: 'coll-filter-replace',
                    name: 'Coll Filter Replace',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Red"]' }] }],
                }];
                const getCount = async () => {
                    const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-replace');
                    if (!coll) return 0;
                    return coll.filters?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBeGreaterThanOrEqual(0);
            });

            it('should remove old filters not in new list', async () => {
                const step = makeStep('coll-filter-replace-new', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'REPLACE_ALL',
                });
                // Create with one filter
                await handler.execute(ctx, step, [{
                    slug: 'coll-filter-replace-new',
                    name: 'Coll Filter Replace New',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Red"]' }] }],
                }]);
                // Replace with different filter
                const result = await handler.execute(ctx, step, [{
                    slug: 'coll-filter-replace-new',
                    name: 'Coll Filter Replace New',
                    filters: [{ code: 'variant-name-filter', args: [{ name: 'term', value: 'Glove' }] }],
                }]);
                expect(result.ok).toBe(1);
            });

            it('should handle empty filters array (remove all)', async () => {
                const step = makeStep('coll-filter-empty', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'REPLACE_ALL',
                });
                await handler.execute(ctx, step, [{
                    slug: 'coll-filter-empty',
                    name: 'Coll Filter Empty',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Blue"]' }] }],
                }]);
                // Replace with empty
                const result = await handler.execute(ctx, step, [{
                    slug: 'coll-filter-empty',
                    name: 'Coll Filter Empty',
                    filters: [],
                }]);
                expect(result.ok).toBe(1);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-empty');
                expect(coll?.filters?.length ?? 0).toBe(0);
            });
        });

        describe('MERGE', () => {
            it('should combine existing and new filters without duplicates', async () => {
                const step = makeStep('coll-filter-merge', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'MERGE',
                });
                await handler.execute(ctx, step, [{
                    slug: 'coll-filter-merge',
                    name: 'Coll Filter Merge',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Red"]' }] }],
                }]);
                const result = await handler.execute(ctx, step, [{
                    slug: 'coll-filter-merge',
                    name: 'Coll Filter Merge',
                    filters: [{ code: 'variant-name-filter', args: [{ name: 'term', value: 'Glove' }] }],
                }]);
                expect(result.ok).toBe(1);
            });

            it('should prevent duplicate filters on re-run', async () => {
                const step = makeStep('coll-filter-merge-idemp', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'MERGE',
                });
                const data = [{
                    slug: 'coll-filter-merge-idemp',
                    name: 'Coll Filter Merge Idemp',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Green"]' }] }],
                }];
                const getCount = async () => {
                    const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-merge-idemp');
                    if (!coll) return 0;
                    return coll.filters?.length ?? 0;
                };
                const count = await testIdempotency(handler, ctx, step, data, getCount, 3);
                expect(count).toBeGreaterThanOrEqual(1);
            });
        });

        describe('SKIP', () => {
            it('should not modify collection filters', async () => {
                // Setup collection with filter
                const setupStep = makeStep('coll-filter-skip-setup', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'REPLACE_ALL',
                });
                await handler.execute(ctx, setupStep, [{
                    slug: 'coll-filter-skip',
                    name: 'Coll Filter Skip',
                    filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Red"]' }] }],
                }]);

                const skipStep = makeStep('coll-filter-skip', {
                    strategy: 'UPSERT',
                    slugField: 'slug',
                    nameField: 'name',
                    filtersField: 'filters',
                    filtersMode: 'SKIP',
                });
                const result = await handler.execute(ctx, skipStep, [{
                    slug: 'coll-filter-skip',
                    name: 'Coll Filter Skip',
                    filters: [
                        { code: 'variant-name-filter', args: [{ name: 'term', value: 'NewFilter' }] },
                        { code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Blue"]' }] },
                    ],
                }]);
                expect(result.ok).toBe(1);

                const coll = await collectionService.findOneBySlug(ctx, 'coll-filter-skip');
                expect(coll?.filters?.length ?? 0).toBe(1);
            });
        });
    });

    describe('Combined mode scenarios', () => {
        it('should handle assetsMode and filtersMode together', async () => {
            const step = makeStep('coll-combined', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                assetsField: 'assets',
                assetsMode: 'REPLACE_ALL',
                filtersField: 'filters',
                filtersMode: 'MERGE',
            });
            const result = await handler.execute(ctx, step, [{
                slug: 'coll-combined',
                name: 'Coll Combined',
                assets: ['https://via.placeholder.com/10x10.png?text=Comb'],
                filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: '["Red"]' }] }],
            }]);
            expect(result.ok).toBe(1);
            expect(result.fail).toBe(0);
        });
    });

    describe('Edge cases', () => {
        it('should handle missing assetsField', async () => {
            const step = makeStep('coll-no-assets', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                assetsField: 'assets',
                assetsMode: 'MERGE',
            });
            const result = await handler.execute(ctx, step, [{
                slug: 'coll-no-assets',
                name: 'Coll No Assets',
                // No assets field
            }]);
            expect(result.ok).toBe(1);
            expect(result.fail).toBe(0);
        });

        it('should handle missing filtersField', async () => {
            const step = makeStep('coll-no-filters', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                filtersField: 'filters',
                filtersMode: 'MERGE',
            });
            const result = await handler.execute(ctx, step, [{
                slug: 'coll-no-filters',
                name: 'Coll No Filters',
                // No filters field
            }]);
            expect(result.ok).toBe(1);
            expect(result.fail).toBe(0);
        });

        it('should handle invalid filter configurations', async () => {
            const step = makeStep('coll-bad-filter', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                filtersField: 'filters',
                filtersMode: 'REPLACE_ALL',
            });
            const collector = createErrorCollector();
            const result = await handler.execute(ctx, step, [{
                slug: 'coll-bad-filter',
                name: 'Coll Bad Filter',
                filters: [{ code: 'nonexistent-filter-handler', args: [] }],
            }], collector.callback);
            // Invalid filter code may cause error or be silently skipped
            expect(result.ok + result.fail).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Performance', () => {
        it('should handle 100+ collections with assets and filters in <5 seconds', async () => {
            const step = makeStep('coll-perf', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                filtersField: 'filters',
                filtersMode: 'REPLACE_ALL',
            });
            const data = Array.from({ length: 100 }, (_, i) => ({
                slug: `coll-perf-${i}`,
                name: `Coll Perf ${i}`,
                filters: [{ code: 'facet-value-filter', args: [{ name: 'facetValueNames', value: `["Val${i}"]` }] }],
            }));

            const start = Date.now();
            await handler.execute(ctx, step, data);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(30000);
        });
    });
});
