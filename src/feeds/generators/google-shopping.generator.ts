/**
 * Google Shopping Feed Generator
 *
 * Generates product feeds in Google Shopping XML format
 */

import { RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { XMLBuilder } from 'fast-xml-parser';
import { FEED_NAMESPACES } from '../../constants/index';
import {
    FeedConfig,
    VariantWithCustomFields,
    GoogleShoppingItem,
} from './feed-types';
import { getGoogleAvailability } from './feed-helpers';
import { SERVICE_DEFAULTS } from '../../constants/index';
import { PRODUCT_CONDITIONS, FEED_LIMITS } from './feed-constants';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { DataHubLoggerFactory } from '../../services/logger';
import { buildBaseFeedItem } from './feed-item-builder';

const feedLogger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.FEED_GENERATOR);

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

    const items: GoogleShoppingItem[] = [];

    for (const variant of products) {
        try {
            const sku = variant.sku || variant.id.toString();
            const item = await buildBaseFeedItem(ctx, variant, config, connection, getGoogleAvailability, PRODUCT_CONDITIONS.NEW);
            if (!item) {
                feedLogger.warn(`Skipping variant ${sku}: invalid price (${variant.priceWithTax}) or currency ("${config.options?.currency || ''}")`);
                continue;
            }

            // Validate price format matches Google's requirement: number + space + 3-letter currency code
            if (!/^\d+\.\d{2}\s[A-Z]{3}$/.test(item.price)) {
                feedLogger.warn(`Invalid price format for SKU ${item.id}: "${item.price}"`);
            }

            const googleItem: GoogleShoppingItem = {
                'g:id': item.id,
                'g:title': item.title,
                'g:description': item.description,
                'g:link': item.link,
                'g:image_link': item.imageUrl,
                'g:availability': getGoogleAvailability(variant),
                'g:price': item.price,
                'g:condition': PRODUCT_CONDITIONS.NEW,
            };

            if (item.salePrice) {
                googleItem['g:sale_price'] = item.salePrice;
            }

            if (item.brand) {
                googleItem['g:brand'] = item.brand;
            }

            if (item.gtin) {
                googleItem['g:gtin'] = item.gtin;
            }

            if (item.mpn) {
                googleItem['g:mpn'] = item.mpn;
            }

            if (item.productType) {
                googleItem['g:product_type'] = item.productType;
            }

            if (item.itemGroupId) {
                googleItem['g:item_group_id'] = item.itemGroupId;
            }

            if (item.color) {
                googleItem['g:color'] = item.color;
            }

            if (item.size) {
                googleItem['g:size'] = item.size;
            }

            // Additional images
            if (item.additionalImages.length > 0) {
                googleItem['g:additional_image_link'] = item.additionalImages.slice(0, FEED_LIMITS.GOOGLE_ADDITIONAL_IMAGES_MAX);
            }

            // Custom labels (0-4)
            if (item.customLabels.customLabel0) googleItem['g:custom_label_0'] = item.customLabels.customLabel0;
            if (item.customLabels.customLabel1) googleItem['g:custom_label_1'] = item.customLabels.customLabel1;
            if (item.customLabels.customLabel2) googleItem['g:custom_label_2'] = item.customLabels.customLabel2;
            if (item.customLabels.customLabel3) googleItem['g:custom_label_3'] = item.customLabels.customLabel3;
            if (item.customLabels.customLabel4) googleItem['g:custom_label_4'] = item.customLabels.customLabel4;

            items.push(googleItem);
        } catch (error) {
            feedLogger.warn(`Failed to process variant ${variant.id}: ${error}`);
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
