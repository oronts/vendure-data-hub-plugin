import { describe, expect, it, vi } from 'vitest';
import type { PipelineStepDefinition } from '../../../types';
import { AssetImportHandler } from './asset-import-handler';
import { AssetAttachHandler } from './asset-handler';
import { FacetHandler, FacetValueHandler } from './facet-handler';

function step(
    adapterCode: string,
    config: Record<string, unknown> = {},
): PipelineStepDefinition {
    return {
        key: `load-${adapterCode}`,
        type: 'LOAD',
        config: { adapterCode, ...config },
    } as PipelineStepDefinition;
}

const loggerFactory = {
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
};

describe('loader string field integrity', () => {
    it('rejects a structured asset URL without calling Vendure', async () => {
        const assetService = { findAll: vi.fn(), create: vi.fn() };
        const handler = new AssetImportHandler(assetService as never, {} as never, {} as never);
        const onRecordError = vi.fn().mockResolvedValue(undefined);
        const record = { sourceUrl: { url: 'https://assets.example.com/image.jpg' } };

        await expect(handler.execute(
            {} as never,
            step('assetImport'),
            [record],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-assetImport',
            'Missing required field: sourceUrl',
            record,
        );
        expect(assetService.findAll).not.toHaveBeenCalled();
        expect(assetService.create).not.toHaveBeenCalled();
    });

    it('rejects invalid asset tags before lookup or download', async () => {
        const assetService = { findAll: vi.fn(), create: vi.fn() };
        const handler = new AssetImportHandler(assetService as never, {} as never, {} as never);
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(handler.execute(
            {} as never,
            step('assetImport', { tagsField: 'tags' }),
            [{ sourceUrl: 'https://assets.example.com/image.jpg', tags: ['valid', { name: 'invalid' }] }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(onRecordError).toHaveBeenCalledWith(
            'load-assetImport',
            'Asset tags field "tags" must be an array of nonblank strings',
            expect.anything(),
            expect.any(String),
        );
        expect(assetService.findAll).not.toHaveBeenCalled();
        expect(assetService.create).not.toHaveBeenCalled();
    });

    it('rejects structured asset-attachment identifiers before Vendure lookup', async () => {
        const productService = { findAll: vi.fn() };
        const collectionService = { findOneBySlug: vi.fn() };
        const assetService = { updateFeaturedAsset: vi.fn() };
        const handler = new AssetAttachHandler(
            productService as never,
            collectionService as never,
            assetService as never,
            {} as never,
            {} as never,
        );
        const onRecordError = vi.fn().mockResolvedValue(undefined);

        await expect(handler.execute(
            {} as never,
            step('assetAttach', { entity: 'product' }),
            [{ slug: { value: 'product' }, assetId: ['1'] }],
            onRecordError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(productService.findAll).not.toHaveBeenCalled();
        expect(collectionService.findOneBySlug).not.toHaveBeenCalled();
        expect(assetService.updateFeaturedAsset).not.toHaveBeenCalled();
    });

    it('rejects structured facet and facet-value identifiers', async () => {
        const facetService = { findByCode: vi.fn(), create: vi.fn(), update: vi.fn() };
        const facetValueService = {
            findByFacetId: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        };
        const facetHandler = new FacetHandler(
            facetService as never,
            {} as never,
            {} as never,
            {} as never,
            loggerFactory as never,
        );
        const valueHandler = new FacetValueHandler(
            facetService as never,
            facetValueService as never,
            {} as never,
            {} as never,
            loggerFactory as never,
        );
        const facetError = vi.fn().mockResolvedValue(undefined);
        const valueError = vi.fn().mockResolvedValue(undefined);

        await expect(facetHandler.execute(
            {} as never,
            step('facetUpsert'),
            [{ code: { nested: 'color' }, name: 'Color' }],
            facetError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        await expect(valueHandler.execute(
            {} as never,
            step('facetValueUpsert'),
            [{ facetCode: ['color'], code: 'blue', name: 'Blue' }],
            valueError,
        )).resolves.toEqual({ ok: 0, fail: 1, skipped: 0 });
        expect(facetError).toHaveBeenCalledWith(
            'load-facetUpsert',
            'Missing required field: code',
            expect.anything(),
        );
        expect(valueError).toHaveBeenCalledWith(
            'load-facetValueUpsert',
            'Missing required field: facetCode or code',
            expect.anything(),
        );
        expect(facetService.findByCode).not.toHaveBeenCalled();
    });
});
