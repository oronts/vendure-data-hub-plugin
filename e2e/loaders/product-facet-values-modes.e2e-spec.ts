import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProductService, RequestContext } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { ProductHandler } from '../../src/runtime/executors/loaders/product-handler';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import {
    getSuperadminContext,
    makeStep,
    createErrorCollector,
    LOADER_TEST_INITIAL_DATA,
} from './loader-test-helpers';

type FacetValuesMode = 'REPLACE_ALL' | 'MERGE' | 'REMOVE' | 'SKIP';

describe('ProductHandler facet value modes', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let handler: ProductHandler;
    let productService: ProductService;
    let ctx: RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();

        handler = server.app.get(ProductHandler);
        productService = server.app.get(ProductService);
        ctx = await getSuperadminContext(server.app);

        const facetHandler = server.app.get(FacetHandler);
        const facetValueHandler = server.app.get(FacetValueHandler);
        await facetHandler.execute(
            ctx,
            makeStep('setup-product-facets', {
                strategy: 'UPSERT',
                codeField: 'code',
                nameField: 'name',
            }),
            [
                { code: 'product-color', name: 'Product Color' },
                { code: 'product-size', name: 'Product Size' },
            ],
        );
        await facetValueHandler.execute(
            ctx,
            makeStep('setup-product-facet-values', {
                strategy: 'UPSERT',
                facetCodeField: 'facetCode',
                codeField: 'code',
                nameField: 'name',
            }),
            [
                { facetCode: 'product-color', code: 'product-red', name: 'Product Red' },
                { facetCode: 'product-color', code: 'product-blue', name: 'Product Blue' },
                { facetCode: 'product-color', code: 'product-green', name: 'Product Green' },
                { facetCode: 'product-size', code: 'product-small', name: 'Product Small' },
            ],
        );
    });

    afterAll(async () => {
        await server.destroy();
    });

    async function loadFacetValues(
        slug: string,
        facetValues: Array<string | { facetCode: string; code: string }>,
        mode: FacetValuesMode,
    ) {
        return handler.execute(
            ctx,
            makeStep(`product-facets-${slug}-${mode.toLowerCase()}`, {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facets',
                facetValuesMode: mode,
            }),
            [{
                name: `Facet Product ${slug}`,
                slug,
                facets: facetValues,
            }],
        );
    }

    async function getFacetCodes(slug: string): Promise<string[]> {
        const product = await productService.findOneBySlug(ctx, slug);
        expect(product).toBeDefined();
        const productWithFacets = await productService.findOne(ctx, product!.id, ['facetValues']);
        return (productWithFacets?.facetValues ?? [])
            .map(facetValue => facetValue.code)
            .sort();
    }

    it('replaces product facet values and remains idempotent', async () => {
        const first = await loadFacetValues('product-facets-replace', [
            { facetCode: 'product-color', code: 'product-red' },
            'product-blue',
        ], 'REPLACE_ALL');
        expect(first).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-replace')).toEqual([
            'product-blue',
            'product-red',
        ]);

        await loadFacetValues('product-facets-replace', [
            'product-green',
            'product-small',
        ], 'REPLACE_ALL');
        await loadFacetValues('product-facets-replace', [
            'product-green',
            'product-small',
        ], 'REPLACE_ALL');

        expect(await getFacetCodes('product-facets-replace')).toEqual([
            'product-green',
            'product-small',
        ]);
    });

    it('clears all product facet values for an explicit empty replacement', async () => {
        await loadFacetValues('product-facets-clear', ['product-red'], 'REPLACE_ALL');
        expect(await getFacetCodes('product-facets-clear')).toEqual(['product-red']);

        const result = await loadFacetValues('product-facets-clear', [], 'REPLACE_ALL');

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-clear')).toEqual([]);
    });

    it('merges and deduplicates product facet values', async () => {
        await loadFacetValues('product-facets-merge', ['product-red'], 'REPLACE_ALL');
        await loadFacetValues('product-facets-merge', [
            'product-red',
            'product-blue',
            'product-small',
        ], 'MERGE');
        await loadFacetValues('product-facets-merge', ['product-blue'], 'MERGE');

        expect(await getFacetCodes('product-facets-merge')).toEqual([
            'product-blue',
            'product-red',
            'product-small',
        ]);
    });

    it('removes only the requested product facet values', async () => {
        await loadFacetValues('product-facets-remove', [
            'product-red',
            'product-blue',
            'product-green',
        ], 'REPLACE_ALL');

        const result = await loadFacetValues(
            'product-facets-remove',
            ['product-blue'],
            'REMOVE',
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-remove')).toEqual([
            'product-green',
            'product-red',
        ]);
    });

    it('preserves product facet values in skip mode', async () => {
        await loadFacetValues('product-facets-skip', ['product-red'], 'REPLACE_ALL');

        const result = await loadFacetValues(
            'product-facets-skip',
            ['product-blue'],
            'SKIP',
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-skip')).toEqual(['product-red']);
    });

    it('uses facetValueCodes when no field override is configured', async () => {
        const result = await handler.execute(
            ctx,
            makeStep('product-facets-default-field', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesMode: 'REPLACE_ALL',
            }),
            [{
                name: 'Facet Product Default Field',
                slug: 'product-facets-default-field',
                facetValueCodes: ['product-small'],
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-default-field')).toEqual(['product-small']);
    });

    it('does not change assignments when the configured record field is absent', async () => {
        await loadFacetValues('product-facets-absent', ['product-red'], 'REPLACE_ALL');

        const result = await handler.execute(
            ctx,
            makeStep('product-facets-absent-field', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facets',
                facetValuesMode: 'REPLACE_ALL',
            }),
            [{
                name: 'Facet Product product-facets-absent',
                slug: 'product-facets-absent',
            }],
        );

        expect(result).toEqual({ ok: 1, fail: 0, skipped: 0 });
        expect(await getFacetCodes('product-facets-absent')).toEqual(['product-red']);
    });

    it('reports malformed configured facet input as a record failure', async () => {
        const errors = createErrorCollector();
        const result = await handler.execute(
            ctx,
            makeStep('product-facets-invalid', {
                strategy: 'UPSERT',
                createVariants: false,
                facetValuesField: 'facets',
            }),
            [{
                name: 'Facet Product Invalid',
                slug: 'product-facets-invalid',
                facets: [{ facetCode: 'product-color' }],
            }],
            errors.callback,
        );

        expect(result).toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(errors.errors).toHaveLength(1);
        expect(errors.errors[0]?.message).toContain('Invalid product facet value at index 0');
    });
});
