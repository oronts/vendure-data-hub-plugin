import { describe, expect, it, vi } from 'vitest';
import type { ExtractContext, RecordEnvelope } from '../../../../src';
import {
    shopifyProductGeneratorExtractor,
    shopifyProductGeneratorSchema,
} from './shopify-product-generator.extractor';

function createContext(): ExtractContext {
    return {
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    } as unknown as ExtractContext;
}

async function extractRecords(
    config: Parameters<typeof shopifyProductGeneratorExtractor.extract>[1],
): Promise<RecordEnvelope[]> {
    const records: RecordEnvelope[] = [];
    for await (const record of shopifyProductGeneratorExtractor.extract(
        createContext(),
        config,
    )) {
        records.push(record);
    }
    return records;
}

describe('Shopify-shaped product generator', () => {
    it('exposes only generated-data options', () => {
        expect(shopifyProductGeneratorSchema.fields.map(field => field.key)).toEqual([
            'productStatus',
            'limit',
        ]);
    });

    it('emits reproducible records without network or clock inputs', async () => {
        const first = await extractRecords({ productStatus: 'active', limit: 2 });
        const second = await extractRecords({ productStatus: 'active', limit: 2 });

        expect(first).toEqual(second);
        expect(first).toHaveLength(2);
        expect(first[0]).toMatchObject({
            data: {
                id: 'gid://shopify/Product/1',
                status: 'ACTIVE',
                createdAt: '2023-12-31T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
                publishedAt: '2024-01-01T00:00:00.000Z',
                variants: {
                    edges: expect.arrayContaining([{
                        node: expect.objectContaining({
                            sku: 'SHOP-001-1', inventoryQuantity: 55, weight: '1.50',
                        }),
                    }]),
                },
            },
            meta: {
                sourceId: 'gid://shopify/Product/1',
                sequence: 0,
                hash: 'shopify-gid://shopify/Product/1',
            },
        });
    });
});
