import { CustomFeedGenerator, FeedGeneratorContext, CustomFeedResult, VariantWithCustomFields } from '../../../../src/feeds/generators/feed-types';
import { CONTENT_TYPES } from '../../../../src/constants/index';
import { getNestedValue } from '../../../../shared/utils/object-path';
import { xmlEscape } from '../../../../src/runtime/utils';

const LOG_CONTEXT = 'SSRFeedGenerator';

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

        const items: SSRFeedItem[] = [];

        for (const variant of products) {
            try {
                const item = transformVariantToSSRItem(variant, baseUrl, currency, config.fieldMappings);
                items.push(item);
            } catch (error) {
                // Log and continue processing other variants
                console.warn(`[${LOG_CONTEXT}] Failed to process variant ${variant.id}: ${error}`);
            }
        }

        // Generate XML output (SSR-friendly format)
        const xml = generateSSRXml(items, config.code);

        return {
            content: xml,
            contentType: CONTENT_TYPES.XML,
            fileExtension: 'xml',
        };
    },
};

/**
 * Transform a variant to SSR feed item format
 */
function transformVariantToSSRItem(
    variant: VariantWithCustomFields,
    baseUrl: string,
    currency: string,
    fieldMappings?: Record<string, string | { source: string; default?: unknown }>,
): SSRFeedItem {
    const product = variant.product;
    const totalStock = variant.stockLevels?.reduce((sum, sl) => sum + sl.stockOnHand, 0) ?? 0;

    // Get brand from facet values
    const brandFacet = product?.facetValues?.find(fv => fv.facet?.code === 'brand');
    const categoryFacet = product?.facetValues?.find(fv => fv.facet?.code === 'category');

    // Build image URL
    const asset = variant.featuredAsset ?? product?.featuredAsset;
    const imageUrl = asset ? `${baseUrl}/assets/${asset.preview}` : '';

    // Apply custom field mappings
    const customAttributes: Record<string, string> = {};
    if (fieldMappings) {
        for (const [targetField, mapping] of Object.entries(fieldMappings)) {
            if (typeof mapping === 'string') {
                const value = getNestedValue(variant as unknown as Record<string, unknown>, mapping) ?? getNestedValue(product as unknown as Record<string, unknown>, mapping);
                if (value !== undefined) {
                    customAttributes[targetField] = String(value);
                }
            }
        }
    }

    return {
        id: String(variant.id),
        sku: variant.sku ?? '',
        name: variant.name || product?.name || '',
        description: product?.description?.replace(/<[^>]*>/g, '') ?? '',
        price: variant.priceWithTax / 100,
        currency,
        availability: totalStock > 0 ? 'in_stock' : 'out_of_stock',
        imageUrl,
        productUrl: `${baseUrl}/products/${product?.slug ?? variant.id}?variant=${variant.id}`,
        brand: brandFacet?.name,
        category: categoryFacet?.name,
        customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : undefined,
    };
}

function generateSSRXml(items: SSRFeedItem[], feedCode: string): string {
    const itemsXml = items.map(item => `
    <product>
      <id>${xmlEscape(item.id)}</id>
      <sku>${xmlEscape(item.sku)}</sku>
      <name>${xmlEscape(item.name)}</name>
      <description>${xmlEscape(item.description)}</description>
      <price currency="${item.currency}">${item.price.toFixed(2)}</price>
      <availability>${item.availability}</availability>
      <image_url>${xmlEscape(item.imageUrl)}</image_url>
      <product_url>${xmlEscape(item.productUrl)}</product_url>
      ${item.brand ? `<brand>${xmlEscape(item.brand)}</brand>` : ''}
      ${item.category ? `<category>${xmlEscape(item.category)}</category>` : ''}
      ${item.customAttributes ? Object.entries(item.customAttributes).map(([k, v]) =>
        `<custom_attribute name="${xmlEscape(k)}">${xmlEscape(v)}</custom_attribute>`
      ).join('\n      ') : ''}
    </product>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed code="${xmlEscape(feedCode)}" generated="${new Date().toISOString()}">
  <products count="${items.length}">${itemsXml}
  </products>
</feed>`;
}
