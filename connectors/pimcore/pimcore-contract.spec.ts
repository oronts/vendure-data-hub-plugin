import { describe, expect, it } from 'vitest';
import { createPimcoreProductQuery } from './extractors/query-builder';
import { createProductSyncPipeline } from './pipelines/product-sync.pipeline';
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
    });
});
