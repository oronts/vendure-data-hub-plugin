/**
 * Google Shopping Feed Generator
 *
 * Generates product feeds in Google Shopping XML format
 */

import { RequestContext, Logger } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { XMLBuilder } from 'fast-xml-parser';
import { FEED_NAMESPACES, TRUNCATION } from '../../constants/index';
import {
    FeedConfig,
    VariantWithCustomFields,
    ProductWithCustomFields,
    GoogleShoppingItem,
} from './feed-types';
import {
    formatPrice,
    getGoogleAvailability,
    buildProductUrl,
    getImageUrl,
    getAdditionalImages,
    extractFacetValue,
    getProductType,
    truncate,
    stripHtml,
} from './feed-helpers';
import { SERVICE_DEFAULTS } from '../../constants/index';

const LOG_CONTEXT = 'GoogleShoppingGenerator';

/**
 * Generate Google Shopping XML feed
 */
export async function generateGoogleShoppingFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
): Promise<string> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || 'USD';

    const items: GoogleShoppingItem[] = [];

    for (const variant of products) {
        try {
            const product = variant.product as ProductWithCustomFields | undefined;
            const customFields = variant.customFields || {};
            const productCustomFields = product?.customFields || {};

            const price = formatPrice(variant.priceWithTax, currency);
            const salePrice = customFields.salePrice
                ? formatPrice(customFields.salePrice as number, currency)
                : undefined;

            const item: GoogleShoppingItem = {
                'g:id': variant.sku || variant.id.toString(),
                'g:title': truncate(variant.name || product?.name || '', 150),
                'g:description': truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH),
                'g:link': buildProductUrl(baseUrl, variant, config.options?.utmParams),
                'g:image_link': getImageUrl(variant, product, baseUrl),
                'g:availability': getGoogleAvailability(variant),
                'g:price': price,
                'g:condition': 'new',
            };

            if (salePrice) {
                item['g:sale_price'] = salePrice;
            }

            // Add brand from product facets or custom fields
            const brand = extractFacetValue(product, 'brand') || productCustomFields.brand;
            if (brand) {
                item['g:brand'] = brand as string;
            }

            // Add GTIN/EAN/UPC
            if (customFields.gtin) {
                item['g:gtin'] = customFields.gtin as string;
            } else if (customFields.ean) {
                item['g:gtin'] = customFields.ean as string;
            }

            // MPN (Manufacturer Part Number)
            if (customFields.mpn || variant.sku) {
                item['g:mpn'] = (customFields.mpn as string) || variant.sku;
            }

            // Product type from collections
            const productType = await getProductType(ctx, product, connection);
            if (productType) {
                item['g:product_type'] = productType;
            }

            // Item group for variants
            if (product) {
                item['g:item_group_id'] = product.id.toString();
            }

            // Extract variant options (color, size, etc.)
            for (const optionValue of variant.options || []) {
                const groupName = optionValue.group?.name?.toLowerCase();
                const value = optionValue.name;
                if (groupName === 'color' || groupName === 'colour') {
                    item['g:color'] = value;
                } else if (groupName === 'size') {
                    item['g:size'] = value;
                }
            }

            // Additional images
            const additionalImages = getAdditionalImages(variant, product, baseUrl);
            if (additionalImages.length > 0) {
                item['g:additional_image_link'] = additionalImages.slice(0, 10); // Max 10 additional images
            }

            // Custom labels
            if (productCustomFields.customLabel0)
                item['g:custom_label_0'] = productCustomFields.customLabel0 as string;
            if (productCustomFields.customLabel1)
                item['g:custom_label_1'] = productCustomFields.customLabel1 as string;
            if (productCustomFields.customLabel2)
                item['g:custom_label_2'] = productCustomFields.customLabel2 as string;
            if (productCustomFields.customLabel3)
                item['g:custom_label_3'] = productCustomFields.customLabel3 as string;
            if (productCustomFields.customLabel4)
                item['g:custom_label_4'] = productCustomFields.customLabel4 as string;

            items.push(item);
        } catch (error) {
            Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
        }
    }

    // Build XML
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        suppressEmptyNode: true,
    });

    const feed = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        rss: {
            '@_version': '2.0',
            '@_xmlns:g': FEED_NAMESPACES.GOOGLE_PRODUCT,
            channel: {
                title: config.name,
                link: baseUrl,
                description: `Product feed for ${config.name}`,
                item: items,
            },
        },
    };

    return builder.build(feed);
}
