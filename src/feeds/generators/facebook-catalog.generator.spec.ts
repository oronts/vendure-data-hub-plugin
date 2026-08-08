import { describe, expect, it } from 'vitest';
import { parseCSVLine } from '../../../shared/utils/csv-parse';
import { FACEBOOK_CATALOG_HEADERS, generateFacebookCatalogFeed } from './facebook-catalog.generator';
import type {
    FeedConfig,
    FeedGenerationDiagnostics,
    VariantWithCustomFields,
} from './feed-types';

describe('Facebook catalog TSV generation', () => {
    it('preserves tabs inside quoted fields without changing the column contract', async () => {
        const config: FeedConfig = {
            code: 'meta-catalog',
            name: 'Meta Catalog',
            format: 'facebook_catalog',
            options: { baseUrl: 'https://shop.example.com', currency: 'USD' },
        };
        const variant = {
            id: 1,
            sku: 'SKU\t1',
            name: 'Title\tInjected',
            priceWithTax: 1000,
            currencyCode: 'USD',
            saleableStockLevel: 1,
            customFields: {},
            options: [],
            product: {
                id: 10,
                slug: 'safe-product',
                name: 'Safe product',
                description: 'Description',
                enabled: true,
                customFields: {},
                facetValues: [],
                assets: [],
            },
        } as unknown as VariantWithCustomFields;

        const diagnostics: FeedGenerationDiagnostics = { itemCount: 0, warnings: [] };
        const content = await generateFacebookCatalogFeed(
            {} as never,
            [variant],
            config,
            {} as never,
            2,
            diagnostics,
        );

        const rows = content.split('\n');
        expect(rows).toHaveLength(2);
        const data = parseCSVLine(rows[1], '\t');
        expect(data).toHaveLength(FACEBOOK_CATALOG_HEADERS.length);
        expect(data[0]).toBe('SKU\t1');
        expect(data[1]).toBe('Title\tInjected');
        expect(diagnostics).toEqual({ itemCount: 1, warnings: [] });
    });
});
