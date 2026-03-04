/**
 * Facebook Catalog Feed Generator
 *
 * Generates product feeds in Facebook Catalog CSV/TSV format
 * Supports both XML and CSV output formats
 */

import { RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { XMLBuilder } from 'fast-xml-parser';
import { SERVICE_DEFAULTS, FEED_NAMESPACES } from '../../constants/index';
import {
    FeedConfig,
    VariantWithCustomFields,
    FacebookCatalogItem,
} from './feed-types';
import {
    getFacebookAvailability,
    csvEscape,
} from './feed-helpers';
import { PRODUCT_CONDITIONS } from './feed-constants';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { DataHubLoggerFactory } from '../../services/logger';
import { buildBaseFeedItem } from './feed-item-builder';

const feedLogger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.FEED_GENERATOR);

/**
 * Facebook Catalog CSV headers
 */
export const FACEBOOK_CATALOG_HEADERS = [
    'id',
    'title',
    'description',
    'availability',
    'condition',
    'price',
    'link',
    'image_link',
    'brand',
    'gtin',
    'mpn',
    'google_product_category',
    'product_type',
    'sale_price',
    'item_group_id',
    'color',
    'size',
    'gender',
    'age_group',
    'custom_label_0',
    'custom_label_1',
    'custom_label_2',
    'custom_label_3',
    'custom_label_4',
];

/**
 * Generate Facebook Catalog feed in CSV format (TSV)
 */
export async function generateFacebookCatalogFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
): Promise<string> {
    const rows: string[][] = [FACEBOOK_CATALOG_HEADERS];

    for (const variant of products) {
        try {
            const sku = variant.sku || variant.id.toString();
            const item = await buildBaseFeedItem(ctx, variant, config, connection, getFacebookAvailability, PRODUCT_CONDITIONS.NEW);
            if (!item) {
                feedLogger.warn(`Skipping variant ${sku}: invalid price (${variant.priceWithTax}) or currency ("${config.options?.currency || ''}")`);
                continue;
            }

            const row = [
                item.id,
                csvEscape(item.title),
                csvEscape(item.description),
                item.availability,
                item.condition,
                item.price,
                item.link,
                item.imageUrl,
                csvEscape(item.brand || ''),
                item.gtin || '',
                item.mpn || '',
                item.googleProductCategory || '',
                item.productType || '',
                item.salePrice || '',
                item.itemGroupId || '',
                item.color || '',
                item.size || '',
                item.gender || '',
                item.ageGroup || '',
                item.customLabels.customLabel0 || '',
                item.customLabels.customLabel1 || '',
                item.customLabels.customLabel2 || '',
                item.customLabels.customLabel3 || '',
                item.customLabels.customLabel4 || '',
            ];

            rows.push(row);
        } catch (error) {
            feedLogger.warn(`Failed to process variant ${variant.id}: ${error}`);
        }
    }

    // Facebook uses tab-separated values
    return rows.map(row => row.join('\t')).join('\n');
}

/**
 * Generate Facebook Catalog feed in XML format
 */
export async function generateFacebookCatalogXMLFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
): Promise<string> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;

    const items: FacebookCatalogItem[] = [];

    for (const variant of products) {
        try {
            const sku = variant.sku || variant.id.toString();
            const item = await buildBaseFeedItem(ctx, variant, config, connection, getFacebookAvailability, PRODUCT_CONDITIONS.NEW);
            if (!item) {
                feedLogger.warn(`Skipping variant ${sku}: invalid price (${variant.priceWithTax}) or currency ("${config.options?.currency || ''}")`);
                continue;
            }

            const fbItem: FacebookCatalogItem = {
                id: item.id,
                title: item.title,
                description: item.description,
                availability: getFacebookAvailability(variant),
                condition: PRODUCT_CONDITIONS.NEW,
                price: item.price,
                link: item.link,
                image_link: item.imageUrl,
            };

            if (item.brand) fbItem.brand = item.brand;
            if (item.gtin) fbItem.gtin = item.gtin;
            if (item.mpn) fbItem.mpn = item.mpn;
            if (item.googleProductCategory) fbItem.google_product_category = item.googleProductCategory;
            if (item.productType) fbItem.product_type = item.productType;
            if (item.salePrice) fbItem.sale_price = item.salePrice;
            if (item.itemGroupId) fbItem.item_group_id = item.itemGroupId;
            if (item.color) fbItem.color = item.color;
            if (item.size) fbItem.size = item.size;
            if (item.gender) fbItem.gender = item.gender;
            if (item.ageGroup) fbItem.age_group = item.ageGroup;

            // Custom labels (0-4)
            if (item.customLabels.customLabel0) fbItem.custom_label_0 = item.customLabels.customLabel0;
            if (item.customLabels.customLabel1) fbItem.custom_label_1 = item.customLabels.customLabel1;
            if (item.customLabels.customLabel2) fbItem.custom_label_2 = item.customLabels.customLabel2;
            if (item.customLabels.customLabel3) fbItem.custom_label_3 = item.customLabels.customLabel3;
            if (item.customLabels.customLabel4) fbItem.custom_label_4 = item.customLabels.customLabel4;

            items.push(fbItem);
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
        feed: {
            '@_xmlns': FEED_NAMESPACES.FACEBOOK_CATALOG,
            title: config.name,
            link: baseUrl,
            entry: items.map(item => ({
                ...item,
                // Rename fields for Atom-like structure
            })),
        },
    };

    return builder.build(feed);
}
