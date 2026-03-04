/**
 * Feed Item Builder
 *
 * Shared logic for building a standard feed item from a product variant.
 * All structured feed generators (Google Shopping, Facebook Catalog) delegate
 * common field extraction here to avoid duplicating brand/gtin/option/customLabel
 * logic across generators.
 */

import { RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import {
    FeedConfig,
    VariantWithCustomFields,
    ProductWithCustomFields,
} from './feed-types';
import {
    formatPrice,
    buildProductUrl,
    getImageUrl,
    getAdditionalImages,
    extractFacetValue,
    getProductType,
    getOptionValue,
    truncate,
    stripHtml,
    toStringOrUndefined,
    extractCustomLabels,
} from './feed-helpers';
import { SERVICE_DEFAULTS, TRUNCATION } from '../../constants/index';
import { FEED_LIMITS, FEED_DEFAULTS } from './feed-constants';

/**
 * Standard feed item containing all common fields that structured
 * feed generators (Google Shopping, Facebook Catalog) need.
 *
 * Each generator maps this into its format-specific structure
 * (e.g., g: prefixed XML for Google, flat CSV for Facebook).
 */
export interface BaseFeedItem {
    id: string;
    title: string;
    description: string;
    price: string;
    link: string;
    imageUrl: string;
    availability: string;
    condition: string;
    brand?: string;
    gtin?: string;
    mpn?: string;
    productType?: string;
    googleProductCategory?: string;
    itemGroupId?: string;
    color?: string;
    size?: string;
    salePrice?: string;
    gender?: string;
    ageGroup?: string;
    additionalImages: string[];
    customLabels: Record<string, string>;
}

/**
 * Build a standard feed item from a variant.
 *
 * Extracts all common fields that structured feed generators need:
 * SKU, price, availability, URL, images, brand, GTIN, MPN, product type,
 * variant options, custom labels, gender, age group, and sale price.
 *
 * Returns null if the variant has an invalid price (required for all feed formats).
 *
 * @param ctx - Vendure request context
 * @param variant - The product variant with custom fields
 * @param config - Feed configuration (baseUrl, currency, UTM params, etc.)
 * @param connection - Database connection for collection lookups
 * @param getAvailability - Platform-specific availability function
 * @param condition - Product condition string (e.g., 'new')
 */
export async function buildBaseFeedItem(
    ctx: RequestContext,
    variant: VariantWithCustomFields,
    config: FeedConfig,
    connection: TransactionalConnection,
    getAvailability: (variant: VariantWithCustomFields) => string,
    condition: string,
): Promise<BaseFeedItem | null> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || FEED_DEFAULTS.CURRENCY;
    const product = variant.product as ProductWithCustomFields | undefined;
    const customFields = variant.customFields || {};
    const productCustomFields = product?.customFields || {};
    const sku = variant.sku || variant.id.toString();

    // Price is required for all feed formats
    const price = formatPrice(variant.priceWithTax, currency);
    if (price === null) {
        return null;
    }

    // Sale price from custom fields
    const salePrice = customFields.salePrice
        ? formatPrice(customFields.salePrice as number, currency) ?? undefined
        : undefined;

    // Brand from facets or custom fields
    const brand = extractFacetValue(product, 'brand') || toStringOrUndefined(productCustomFields.brand);

    // GTIN/EAN from custom fields
    const gtin = toStringOrUndefined(customFields.gtin) || toStringOrUndefined(customFields.ean);

    // MPN from custom fields or SKU fallback
    const mpn = toStringOrUndefined(customFields.mpn) || variant.sku || undefined;

    // Product type from collections
    const productType = await getProductType(ctx, product, connection);

    // Google product category from custom fields
    const googleProductCategory = toStringOrUndefined(productCustomFields.googleProductCategory);

    // Item group ID from parent product
    const itemGroupId = product ? product.id.toString() : undefined;

    // Variant options (color, size)
    const color = getOptionValue(variant, 'color') || getOptionValue(variant, 'colour');
    const size = getOptionValue(variant, 'size');

    // Additional images from product assets
    const additionalImages = getAdditionalImages(variant, product, baseUrl);

    // Custom labels (0-4) from product custom fields
    const customLabels = extractCustomLabels(productCustomFields);

    // Gender and age group from product custom fields
    const gender = toStringOrUndefined(productCustomFields.gender);
    const ageGroup = toStringOrUndefined(productCustomFields.ageGroup);

    return {
        id: sku,
        title: truncate(variant.name || product?.name || '', FEED_LIMITS.TITLE_MAX_LENGTH),
        description: truncate(stripHtml(product?.description || ''), TRUNCATION.FEED_DESCRIPTION_MAX_LENGTH),
        price,
        link: buildProductUrl(baseUrl, variant, config.options?.utmParams),
        imageUrl: getImageUrl(variant, product, baseUrl),
        availability: getAvailability(variant),
        condition,
        brand,
        gtin,
        mpn,
        productType,
        googleProductCategory,
        itemGroupId,
        color: color || undefined,
        size: size || undefined,
        salePrice,
        gender,
        ageGroup,
        additionalImages,
        customLabels,
    };
}
