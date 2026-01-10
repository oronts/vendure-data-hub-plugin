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
} from './feed-helpers';

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
    const currency = config.options?.currency || 'USD';

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

            const row = [
                variant.sku || variant.id.toString(),
                csvEscape(truncate(variant.name || product?.name || '', 150)),
                csvEscape(truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH)),
                getFacebookAvailability(variant),
                'new',
                price,
                buildProductUrl(baseUrl, variant, config.options?.utmParams),
                getImageUrl(variant, product, baseUrl),
                csvEscape(extractFacetValue(product, 'brand') || (productCustomFields.brand as string) || ''),
                (customFields.gtin as string) || (customFields.ean as string) || '',
                variant.sku || '',
                (productCustomFields.googleProductCategory as string) || '',
                productType || '',
                salePrice,
                product?.id.toString() || '',
                getOptionValue(variant, 'color') || '',
                getOptionValue(variant, 'size') || '',
                (productCustomFields.gender as string) || '',
                (productCustomFields.ageGroup as string) || '',
                (productCustomFields.customLabel0 as string) || '',
                (productCustomFields.customLabel1 as string) || '',
                (productCustomFields.customLabel2 as string) || '',
                (productCustomFields.customLabel3 as string) || '',
                (productCustomFields.customLabel4 as string) || '',
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
    const currency = config.options?.currency || 'USD';

    const items: FacebookCatalogItem[] = [];

    for (const variant of products) {
        try {
            const product = variant.product as ProductWithCustomFields | undefined;
            const customFields = variant.customFields || {};
            const productCustomFields = product?.customFields || {};

            const item: FacebookCatalogItem = {
                id: variant.sku || variant.id.toString(),
                title: truncate(variant.name || product?.name || '', 150),
                description: truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH),
                availability: getFacebookAvailability(variant),
                condition: 'new',
                price: formatPrice(variant.priceWithTax, currency),
                link: buildProductUrl(baseUrl, variant, config.options?.utmParams),
                image_link: getImageUrl(variant, product, baseUrl),
            };

            // Brand
            const brand = extractFacetValue(product, 'brand') || productCustomFields.brand;
            if (brand) {
                item.brand = brand as string;
            }

            // GTIN/EAN
            if (customFields.gtin || customFields.ean) {
                item.gtin = (customFields.gtin as string) || (customFields.ean as string);
            }

            // MPN
            if (variant.sku) {
                item.mpn = variant.sku;
            }

            // Google Product Category
            if (productCustomFields.googleProductCategory) {
                item.google_product_category = productCustomFields.googleProductCategory as string;
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
            if (productCustomFields.gender) {
                item.gender = productCustomFields.gender as string;
            }
            if (productCustomFields.ageGroup) {
                item.age_group = productCustomFields.ageGroup as string;
            }

            // Custom labels
            if (productCustomFields.customLabel0)
                item.custom_label_0 = productCustomFields.customLabel0 as string;
            if (productCustomFields.customLabel1)
                item.custom_label_1 = productCustomFields.customLabel1 as string;
            if (productCustomFields.customLabel2)
                item.custom_label_2 = productCustomFields.customLabel2 as string;
            if (productCustomFields.customLabel3)
                item.custom_label_3 = productCustomFields.customLabel3 as string;
            if (productCustomFields.customLabel4)
                item.custom_label_4 = productCustomFields.customLabel4 as string;

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
