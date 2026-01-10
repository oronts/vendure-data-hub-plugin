import { CustomFeedGenerator, FeedGeneratorContext, CustomFeedResult } from '../../../../src/feeds/generators/feed-types';
import { CONTENT_TYPES } from '../../../../src/constants/index';

interface ShopifyProductRow {
    Handle: string;
    Title: string;
    'Body (HTML)': string;
    Vendor: string;
    Type: string;
    Tags: string;
    Published: string;
    'Option1 Name': string;
    'Option1 Value': string;
    'Option2 Name': string;
    'Option2 Value': string;
    'Option3 Name': string;
    'Option3 Value': string;
    'Variant SKU': string;
    'Variant Grams': string;
    'Variant Inventory Tracker': string;
    'Variant Inventory Qty': string;
    'Variant Inventory Policy': string;
    'Variant Fulfillment Service': string;
    'Variant Price': string;
    'Variant Compare At Price': string;
    'Variant Requires Shipping': string;
    'Variant Taxable': string;
    'Variant Barcode': string;
    'Image Src': string;
    'Image Position': string;
    'Image Alt Text': string;
    'Gift Card': string;
    'SEO Title': string;
    'SEO Description': string;
    'Variant Image': string;
    'Variant Weight Unit': string;
    'Variant Tax Code': string;
    'Cost per item': string;
    Status: string;
}

export const shopifyExportGenerator: CustomFeedGenerator = {
    code: 'shopify-export',
    name: 'Shopify Product Export',
    description: 'Export products in Shopify CSV import format',

    async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
        const { config, products } = context;
        const baseUrl = config.options?.baseUrl ?? '';

        // Group variants by product
        const productGroups = new Map<string, typeof products>();
        for (const variant of products) {
            const productId = String(variant.product?.id);
            if (!productGroups.has(productId)) {
                productGroups.set(productId, []);
            }
            productGroups.get(productId)!.push(variant);
        }

        const rows: Partial<ShopifyProductRow>[] = [];

        for (const [, variants] of productGroups) {
            const firstVariant = variants[0];
            const product = firstVariant.product;

            // Get brand and type from facet values
            const brandFacet = product.facetValues?.find(fv => fv.facet?.code === 'brand');
            const typeFacet = product.facetValues?.find(fv => fv.facet?.code === 'category' || fv.facet?.code === 'type');
            const tags = product.facetValues?.map(fv => fv.name).join(', ') ?? '';

            let isFirstVariant = true;
            for (const variant of variants) {
                const totalStock = variant.stockLevels?.reduce((sum, sl) => sum + sl.stockOnHand, 0) ?? 0;
                const asset = variant.featuredAsset ?? product.featuredAsset;
                const imageUrl = asset ? `${baseUrl}/assets/${asset.preview}` : '';

                // Parse options from variant options
                const options = variant.options ?? [];
                const option1 = options[0];
                const option2 = options[1];
                const option3 = options[2];

                const row: Partial<ShopifyProductRow> = {
                    Handle: product.slug,
                    'Variant SKU': variant.sku,
                    'Variant Price': (variant.priceWithTax / 100).toFixed(2),
                    'Variant Inventory Qty': String(totalStock),
                    'Variant Inventory Policy': 'deny',
                    'Variant Fulfillment Service': 'manual',
                    'Variant Requires Shipping': 'true',
                    'Variant Taxable': 'true',
                    'Variant Weight Unit': 'kg',
                    'Variant Image': imageUrl,
                    Status: variant.enabled ? 'active' : 'draft',
                };

                // Add option values
                if (option1) {
                    row['Option1 Name'] = option1.group?.name ?? 'Option 1';
                    row['Option1 Value'] = option1.name;
                }
                if (option2) {
                    row['Option2 Name'] = option2.group?.name ?? 'Option 2';
                    row['Option2 Value'] = option2.name;
                }
                if (option3) {
                    row['Option3 Name'] = option3.group?.name ?? 'Option 3';
                    row['Option3 Value'] = option3.name;
                }

                // Only include product-level data on first variant
                if (isFirstVariant) {
                    row.Title = product.name;
                    row['Body (HTML)'] = product.description ?? '';
                    row.Vendor = brandFacet?.name ?? '';
                    row.Type = typeFacet?.name ?? '';
                    row.Tags = tags;
                    row.Published = product.enabled ? 'true' : 'false';
                    row['Image Src'] = imageUrl;
                    row['Image Position'] = '1';
                    row['Image Alt Text'] = product.name;
                    row['Gift Card'] = 'false';
                    row['SEO Title'] = product.name;
                    row['SEO Description'] = product.description?.replace(/<[^>]*>/g, '').slice(0, 320) ?? '';
                    isFirstVariant = false;
                }

                rows.push(row);
            }
        }

        // Generate CSV
        const headers: (keyof ShopifyProductRow)[] = [
            'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
            'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
            'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
            'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
            'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode', 'Image Src', 'Image Position',
            'Image Alt Text', 'Gift Card', 'SEO Title', 'SEO Description', 'Variant Image', 'Variant Weight Unit',
            'Variant Tax Code', 'Cost per item', 'Status',
        ];

        const csvContent = [
            headers.join(','),
            ...rows.map(row => headers.map(h => escapeCsvField(row[h] ?? '')).join(',')),
        ].join('\n');

        return {
            content: csvContent,
            contentType: CONTENT_TYPES.CSV,
            fileExtension: 'csv',
        };
    },
};

function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export default shopifyExportGenerator;
