import { describe, expect, it } from 'vitest';
import { createPimcoreProductQuery } from './extractors/query-builder';
import { createProductSyncPipeline } from './pipelines/product-sync.pipeline';
import { createAssetSyncPipeline } from './pipelines/asset-sync.pipeline';
import {
    transformAsset,
    transformVariant,
} from './transforms/pimcore-to-vendure.transforms';

const productMapping = {
    skuField: 'itemNumber',
    nameField: 'displayName',
    priceField: 'retailPrice',
    stockQuantityField: 'availableStock',
} as const;

describe('Pimcore public mapping contract', () => {
    it('selects configured variant price and stock fields', () => {
        const query = createPimcoreProductQuery(productMapping);

        expect(query).toMatch(/\bretailPrice\b/);
        expect(query).toMatch(/\bavailableStock\b/);
        expect(query).not.toMatch(/\bstockQuantity\b/);
    });

    it('normalizes configured price and stock fields before variant loading', () => {
        const definition = createProductSyncPipeline({
            connectionCode: 'pimcore-graphql',
            mapping: { product: productMapping },
        });
        const transformStep = definition.steps.find(step => step.key === 'transform-variants');
        const loadStep = definition.steps.find(step => step.key === 'upsert-variants');

        expect(definition.capabilities?.writes).toEqual(['CATALOG', 'INVENTORY']);
        expect(transformStep?.config.operators).toEqual(expect.arrayContaining([
            expect.objectContaining({
                op: 'toNumber',
                args: { source: 'retailPrice', target: 'price' },
            }),
            expect.objectContaining({
                op: 'toNumber',
                args: { source: 'availableStock', target: 'stockQuantity' },
            }),
        ]));
        expect(loadStep?.config).toMatchObject({
            priceField: 'price',
            stockField: 'stockQuantity',
        });
    });

    it('does not declare inventory writes when variant synchronization is disabled', () => {
        const definition = createProductSyncPipeline({
            connectionCode: 'pimcore-graphql',
            sync: { includeVariants: false },
        });

        expect(definition.capabilities?.writes).toEqual(['CATALOG']);
        expect(definition.steps.some(step => step.key === 'upsert-variants')).toBe(false);
    });

    it('uses configured price and stock fields in the transform utility', () => {
        const transformed = transformVariant({
            id: 42,
            key: 'blue-large',
            fullpath: '/Products/blue-large',
            itemNumber: 'BLUE-L',
            displayName: 'Blue Large',
            retailPrice: '19.95',
            availableStock: 7,
        }, 'BLUE', productMapping);

        expect(transformed).toMatchObject({
            sku: 'BLUE-L',
            name: 'Blue Large',
            price: 1995,
            stockOnHand: 7,
        });
    });

    it('only preserves valid absolute HTTP asset URLs', () => {
        const asset = {
            id: 7,
            fullpath: '/Products/image.jpg',
            filename: 'image.jpg',
        };

        expect(transformAsset({
            ...asset,
            url: 'https://cdn.example.com/image.jpg',
        }, { urlField: 'url' }, 'https://pimcore.example.com')).toMatchObject({
            url: 'https://cdn.example.com/image.jpg',
        });
        expect(transformAsset({
            ...asset,
            url: 'http-relative/image.jpg',
        }, { urlField: 'url' }, 'https://pimcore.example.com')).toMatchObject({
            url: 'https://pimcore.example.com/http-relative/image.jpg',
        });
        expect(transformAsset({
            ...asset,
            url: 'ftp://files.example.com/image.jpg',
        }, { urlField: 'url' }, 'https://pimcore.example.com')).toMatchObject({
            url: '/Products/image.jpg',
        });
    });

    it('uses the extractor-normalized asset URL in the generated pipeline', () => {
        const definition = createAssetSyncPipeline({
            connectionCode: 'pimcore-graphql',
            mapping: { asset: { urlField: 'downloadUrl' } },
        });
        const extractStep = definition.steps.find(step => step.key === 'fetch-assets');
        const transformStep = definition.steps.find(step => step.key === 'transform-assets');

        expect(extractStep?.config).toMatchObject({
            assetUrlField: 'downloadUrl',
            sortBy: 'id',
            sortOrder: 'ASC',
        });
        expect(transformStep?.config.operators).toEqual(expect.arrayContaining([
            expect.objectContaining({
                op: 'map',
                args: expect.objectContaining({
                    mapping: expect.objectContaining({ sourceUrl: '_pimcoreSourceUrl' }),
                }),
            }),
        ]));
    });
});
