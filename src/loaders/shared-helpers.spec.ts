import { describe, expect, it, vi } from 'vitest';
import type { DataHubLogger } from '../services/logger/datahub-logger';
import {
    buildConfigurableOperation,
    handleAssets,
    handleFeaturedAsset,
    resolveFacetValueIds,
} from './shared-helpers';

const logger = {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as unknown as DataHubLogger;

describe('shared loader integrity helpers', () => {
    it('fails when any requested facet value is unresolved', async () => {
        const ctx = { languageCode: 'en' } as never;
        const facetValueService = {
            findAll: vi.fn(async () => [{
                id: 1,
                code: 'red',
                name: 'Red',
                facet: { code: 'color' },
            }]),
        };
        await expect(resolveFacetValueIds(
            ctx,
            facetValueService as never,
            ['red', 'missing'],
            logger,
        )).rejects.toThrow('Facet values not found: missing');
        expect(facetValueService.findAll).toHaveBeenCalledWith(ctx, 'en');
    });

    it('resolves qualified facet values without cross-facet collisions', async () => {
        const facetValueService = {
            findAll: vi.fn(async () => [
                { id: 1, code: 'red', name: 'Red', facet: { code: 'color' } },
                { id: 2, code: 'red', name: 'Red', facet: { code: 'finish' } },
            ]),
        };

        await expect(resolveFacetValueIds(
            { languageCode: 'en' } as never,
            facetValueService as never,
            ['finish:red', 'color:red', 'finish:red'],
            logger,
        )).resolves.toEqual([2, 1]);
    });

    it('rejects ambiguous unqualified facet values', async () => {
        const facetValueService = {
            findAll: vi.fn(async () => [
                { id: 1, code: 'red', name: 'Red', facet: { code: 'color' } },
                { id: 2, code: 'red', name: 'Red', facet: { code: 'finish' } },
            ]),
        };

        await expect(resolveFacetValueIds(
            { languageCode: 'en' } as never,
            facetValueService as never,
            ['red'],
            logger,
        )).rejects.toThrow(
            'Ambiguous facet values: red; use facet:value references',
        );
    });

    it('fails when the target entity is missing', async () => {
        const service = { findOne: vi.fn(async () => undefined), update: vi.fn() };
        await expect(handleAssets(
            {} as never,
            {} as never,
            service as never,
            1,
            ['https://assets.example.com/product.jpg'],
            'UPSERT_BY_URL',
            logger,
        )).rejects.toThrow('Entity 1 not found');
        expect(service.update).not.toHaveBeenCalled();
    });

    it('propagates Vendure update error results', async () => {
        const url = 'https://assets.example.com/product.jpg';
        const service = {
            findOne: vi.fn(async () => ({ assets: [{ asset: { id: 5, source: url } }] })),
            update: vi.fn(async () => ({ errorCode: 'UPDATE_FAILED', message: 'Update failed' })),
        };
        const assetService = {
            findAll: vi.fn(async () => ({ items: [{ id: 5 }], totalItems: 1 })),
        };
        await expect(handleAssets(
            {} as never,
            assetService as never,
            service as never,
            1,
            [url],
            'UPSERT_BY_URL',
            logger,
        )).rejects.toThrow('Update failed');
    });

    it('preserves existing attachments when upserting a new asset URL', async () => {
        const service = {
            findOne: vi.fn(async () => ({
                assets: [{ asset: { id: 5, source: 'stored-existing.jpg' } }],
            })),
            update: vi.fn(async () => ({ id: 1 })),
        };
        const assetService = {
            findAll: vi.fn(async () => ({ items: [{ id: 6 }], totalItems: 1 })),
        };

        await handleAssets(
            {} as never,
            assetService as never,
            service as never,
            1,
            ['https://assets.example.com/new.jpg'],
            'UPSERT_BY_URL',
            logger,
        );

        expect(service.update).toHaveBeenCalledWith(
            expect.anything(),
            { id: 1, assetIds: [5, 6] },
        );
    });

    it('rejects non-serializable configurable operation arguments', () => {
        expect(() => buildConfigurableOperation({
            code: 'checker',
            args: { threshold: undefined },
        })).toThrow('argument "threshold" is not JSON-serializable');
    });

    it('rejects unsupported featured asset modes', async () => {
        await expect(handleFeaturedAsset(
            {} as never,
            {} as never,
            {} as never,
            1,
            'https://assets.example.com/product.jpg',
            'UNKNOWN' as never,
            logger,
        )).rejects.toThrow('Unknown featured asset mode');
    });
});
