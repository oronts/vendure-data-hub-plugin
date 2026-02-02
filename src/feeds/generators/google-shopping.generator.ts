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
    toStringOrUndefined,
    extractCustomLabels,
} from './feed-helpers';
import { SERVICE_DEFAULTS } from '../../constants/index';
import { PRODUCT_CONDITIONS, FEED_LIMITS, FEED_DEFAULTS } from './feed-constants';

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
    const currency = config.options?.currency || FEED_DEFAULTS.CURRENCY;

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
                'g:title': truncate(variant.name || product?.name || '', FEED_LIMITS.TITLE_MAX_LENGTH),
                'g:description': truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH),
                'g:link': buildProductUrl(baseUrl, variant, config.options?.utmParams),
                'g:image_link': getImageUrl(variant, product, baseUrl),
                'g:availability': getGoogleAvailability(variant),
                'g:price': price,
                'g:condition': PRODUCT_CONDITIONS.NEW,
            };

            if (salePrice) {
                item['g:sale_price'] = salePrice;
            }

            // Add brand from product facets or custom fields
            const brand = extractFacetValue(product, 'brand') || toStringOrUndefined(productCustomFields.brand);
            if (brand) {
                item['g:brand'] = brand;
            }

            // Add GTIN/EAN/UPC
            const gtin = toStringOrUndefined(customFields.gtin) || toStringOrUndefined(customFields.ean);
            if (gtin) {
                item['g:gtin'] = gtin;
            }

            // MPN (Manufacturer Part Number)
            const mpn = toStringOrUndefined(customFields.mpn) || variant.sku;
            if (mpn) {
                item['g:mpn'] = mpn;
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
                item['g:additional_image_link'] = additionalImages.slice(0, FEED_LIMITS.GOOGLE_ADDITIONAL_IMAGES_MAX);
            }

            // Custom labels (0-4)
            const customLabels = extractCustomLabels(productCustomFields);
            if (customLabels.customLabel0) item['g:custom_label_0'] = customLabels.customLabel0;
            if (customLabels.customLabel1) item['g:custom_label_1'] = customLabels.customLabel1;
            if (customLabels.customLabel2) item['g:custom_label_2'] = customLabels.customLabel2;
            if (customLabels.customLabel3) item['g:custom_label_3'] = customLabels.customLabel3;
            if (customLabels.customLabel4) item['g:custom_label_4'] = customLabels.customLabel4;

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
