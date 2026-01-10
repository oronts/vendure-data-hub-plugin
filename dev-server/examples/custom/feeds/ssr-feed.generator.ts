import { CustomFeedGenerator, FeedGeneratorContext, CustomFeedResult } from '../../../../src/feeds/generators/feed-types';
import { CONTENT_TYPES } from '../../../../src/constants/index';

interface SSRFeedItem {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    availability: 'in_stock' | 'out_of_stock';
    imageUrl: string;
    productUrl: string;
    brand?: string;
    category?: string;
    customAttributes?: Record<string, string>;
}

export const ssrFeedGenerator: CustomFeedGenerator = {
    code: 'ssr-feed',
    name: 'SSR Product Feed',
    description: 'Server-side rendered product feed with custom field mapping',

    async generate(context: FeedGeneratorContext): Promise<CustomFeedResult> {
        const { config, products } = context;
        const baseUrl = config.options?.baseUrl ?? 'https://example.com';
        const currency = config.options?.currency ?? 'USD';

        const items: SSRFeedItem[] = products.map(variant => {
            const product = variant.product;
            const totalStock = variant.stockLevels?.reduce((sum, sl) => sum + sl.stockOnHand, 0) ?? 0;

            // Get brand from facet values
            const brandFacet = product.facetValues?.find(fv => fv.facet?.code === 'brand');
            const categoryFacet = product.facetValues?.find(fv => fv.facet?.code === 'category');

            // Build image URL
            const asset = variant.featuredAsset ?? product.featuredAsset;
            const imageUrl = asset ? `${baseUrl}/assets/${asset.preview}` : '';

            // Apply custom field mappings
            const customAttributes: Record<string, string> = {};
            if (config.fieldMappings) {
                for (const [targetField, mapping] of Object.entries(config.fieldMappings)) {
                    if (typeof mapping === 'string') {
                        const value = getNestedValue(variant, mapping) ?? getNestedValue(product, mapping);
                        if (value !== undefined) {
                            customAttributes[targetField] = String(value);
                        }
                    }
                }
            }

            return {
                id: String(variant.id),
                sku: variant.sku,
                name: variant.name || product.name,
                description: product.description?.replace(/<[^>]*>/g, '') ?? '',
                price: variant.priceWithTax / 100,
                currency,
                availability: totalStock > 0 ? 'in_stock' : 'out_of_stock',
                imageUrl,
                productUrl: `${baseUrl}/products/${product.slug}?variant=${variant.id}`,
                brand: brandFacet?.name,
                category: categoryFacet?.name,
                customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : undefined,
            };
        });

        // Generate XML output (SSR-friendly format)
        const xml = generateSSRXml(items, config.code);

        return {
            content: xml,
            contentType: CONTENT_TYPES.XML,
            fileExtension: 'xml',
        };
    },
};

function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function generateSSRXml(items: SSRFeedItem[], feedCode: string): string {
    const escapeXml = (str: string): string =>
        str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

    const itemsXml = items.map(item => `
    <product>
      <id>${escapeXml(item.id)}</id>
      <sku>${escapeXml(item.sku)}</sku>
      <name>${escapeXml(item.name)}</name>
      <description>${escapeXml(item.description)}</description>
      <price currency="${item.currency}">${item.price.toFixed(2)}</price>
      <availability>${item.availability}</availability>
      <image_url>${escapeXml(item.imageUrl)}</image_url>
      <product_url>${escapeXml(item.productUrl)}</product_url>
      ${item.brand ? `<brand>${escapeXml(item.brand)}</brand>` : ''}
      ${item.category ? `<category>${escapeXml(item.category)}</category>` : ''}
      ${item.customAttributes ? Object.entries(item.customAttributes).map(([k, v]) =>
        `<custom_attribute name="${escapeXml(k)}">${escapeXml(v)}</custom_attribute>`
      ).join('\n      ') : ''}
    </product>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed code="${escapeXml(feedCode)}" generated="${new Date().toISOString()}">
  <products count="${items.length}">${itemsXml}
  </products>
</feed>`;
}

export default ssrFeedGenerator;
