import { describe, expect, it, vi } from 'vitest';
import { applyEntityAssetInput } from './entity-asset-input';

vi.mock('../../../loaders/shared-helpers', () => ({
    handleAssets: vi.fn(async () => undefined),
    handleFeaturedAsset: vi.fn(async () => undefined),
}));

describe('entity asset input', () => {
    const dependencies = {
        ctx: {} as never,
        entityId: 1,
        assetService: {} as never,
        entityService: {} as never,
        logger: {} as never,
    };

    it('ignores omitted asset fields and accepts explicit empty replacement input', async () => {
        await expect(applyEntityAssetInput({
            ...dependencies,
            record: {},
            config: {},
        })).resolves.toBeUndefined();
        await expect(applyEntityAssetInput({
            ...dependencies,
            record: { assets: [] },
            config: { assetsField: 'assets', assetsMode: 'REPLACE_ALL' },
        })).resolves.toBeUndefined();
    });

    it('rejects malformed asset fields before calling Vendure', async () => {
        await expect(applyEntityAssetInput({
            ...dependencies,
            record: { assets: ['valid', ''] },
            config: { assetsField: 'assets' },
        })).rejects.toThrow('array of non-empty asset URLs');
        await expect(applyEntityAssetInput({
            ...dependencies,
            record: { featured: null },
            config: { featuredAssetField: 'featured' },
        })).rejects.toThrow('non-empty asset URL');
    });
});
