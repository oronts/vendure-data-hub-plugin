/**
 * Facebook Catalog Feed Generator
 *
 * Generates product feeds in Facebook Catalog CSV/TSV format
 * Supports both XML and CSV output formats
 */

import { RequestContext, Logger } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { XMLBuilder } from 'fast-xml-parser';
import { SERVICE_DEFAULTS, FEED_NAMESPACES, TRUNCATION } from '../../constants/index';
import {
    FeedConfig,
    VariantWithCustomFields,
    ProductWithCustomFields,
    FacebookCatalogItem,
} from './feed-types';
import {
    formatPrice,
    getFacebookAvailability,
    buildProductUrl,
    getImageUrl,
    extractFacetValue,
    getProductType,
    getOptionValue,
    truncate,
    stripHtml,
    csvEscape,
    toStringOrUndefined,
    toStringOrEmpty,
    extractCustomLabels,
} from './feed-helpers';
import { PRODUCT_CONDITIONS, FEED_LIMITS, FEED_DEFAULTS } from './feed-constants';

const LOG_CONTEXT = 'FacebookCatalogGenerator';

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
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || FEED_DEFAULTS.CURRENCY;

    const rows: string[][] = [FACEBOOK_CATALOG_HEADERS];

    for (const variant of products) {
        try {
            const product = variant.product as ProductWithCustomFields | undefined;
            const customFields = variant.customFields || {};
            const productCustomFields = product?.customFields || {};
            const price = formatPrice(variant.priceWithTax, currency);

            // Build sale price if available
            const salePrice = customFields.salePrice
                ? formatPrice(customFields.salePrice as number, currency)
                : '';

            // Get product type from collections
            const productType = await getProductType(ctx, product, connection);

            // Extract custom labels using helper
            const customLabels = extractCustomLabels(productCustomFields);

            const row = [
                variant.sku || variant.id.toString(),
                csvEscape(truncate(variant.name || product?.name || '', FEED_LIMITS.TITLE_MAX_LENGTH)),
                csvEscape(truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH)),
                getFacebookAvailability(variant),
                PRODUCT_CONDITIONS.NEW,
                price,
                buildProductUrl(baseUrl, variant, config.options?.utmParams),
                getImageUrl(variant, product, baseUrl),
                csvEscape(extractFacetValue(product, 'brand') || toStringOrEmpty(productCustomFields.brand)),
                toStringOrEmpty(customFields.gtin) || toStringOrEmpty(customFields.ean),
                variant.sku || '',
                toStringOrEmpty(productCustomFields.googleProductCategory),
                productType || '',
                salePrice,
                product?.id.toString() || '',
                getOptionValue(variant, 'color') || '',
                getOptionValue(variant, 'size') || '',
                toStringOrEmpty(productCustomFields.gender),
                toStringOrEmpty(productCustomFields.ageGroup),
                customLabels.customLabel0 || '',
                customLabels.customLabel1 || '',
                customLabels.customLabel2 || '',
                customLabels.customLabel3 || '',
                customLabels.customLabel4 || '',
            ];

            rows.push(row);
        } catch (error) {
            Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
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
    const currency = config.options?.currency || FEED_DEFAULTS.CURRENCY;

    const items: FacebookCatalogItem[] = [];

    for (const variant of products) {
        try {
            const product = variant.product as ProductWithCustomFields | undefined;
            const customFields = variant.customFields || {};
            const productCustomFields = product?.customFields || {};

            const item: FacebookCatalogItem = {
                id: variant.sku || variant.id.toString(),
                title: truncate(variant.name || product?.name || '', FEED_LIMITS.TITLE_MAX_LENGTH),
                description: truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH),
                availability: getFacebookAvailability(variant),
                condition: PRODUCT_CONDITIONS.NEW,
                price: formatPrice(variant.priceWithTax, currency),
                link: buildProductUrl(baseUrl, variant, config.options?.utmParams),
                image_link: getImageUrl(variant, product, baseUrl),
            };

            // Brand
            const brand = extractFacetValue(product, 'brand') || toStringOrUndefined(productCustomFields.brand);
            if (brand) {
                item.brand = brand;
            }

            // GTIN/EAN
            const gtin = toStringOrUndefined(customFields.gtin) || toStringOrUndefined(customFields.ean);
            if (gtin) {
                item.gtin = gtin;
            }

            // MPN
            if (variant.sku) {
                item.mpn = variant.sku;
            }

            // Google Product Category
            const googleProductCategory = toStringOrUndefined(productCustomFields.googleProductCategory);
            if (googleProductCategory) {
                item.google_product_category = googleProductCategory;
            }

            // Product type from collections
            const productType = await getProductType(ctx, product, connection);
            if (productType) {
                item.product_type = productType;
            }

            // Sale price
            if (customFields.salePrice) {
                item.sale_price = formatPrice(customFields.salePrice as number, currency);
            }

            // Item group for variants
            if (product) {
                item.item_group_id = product.id.toString();
            }

            // Variant options
            const color = getOptionValue(variant, 'color');
            if (color) item.color = color;

            const size = getOptionValue(variant, 'size');
            if (size) item.size = size;

            // Gender and age group from custom fields
            const gender = toStringOrUndefined(productCustomFields.gender);
            if (gender) {
                item.gender = gender;
            }
            const ageGroup = toStringOrUndefined(productCustomFields.ageGroup);
            if (ageGroup) {
                item.age_group = ageGroup;
            }

            // Custom labels (0-4) using helper
            const customLabels = extractCustomLabels(productCustomFields);
            if (customLabels.customLabel0) item.custom_label_0 = customLabels.customLabel0;
            if (customLabels.customLabel1) item.custom_label_1 = customLabels.customLabel1;
            if (customLabels.customLabel2) item.custom_label_2 = customLabels.customLabel2;
            if (customLabels.customLabel3) item.custom_label_3 = customLabels.customLabel3;
            if (customLabels.customLabel4) item.custom_label_4 = customLabels.customLabel4;

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
