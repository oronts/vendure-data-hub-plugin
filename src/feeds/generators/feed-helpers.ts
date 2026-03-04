/**
 * Feed Helpers
 *
 * Shared utility functions for feed generators
 */

import { Collection, Product, RequestContext } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { VariantWithCustomFields } from './feed-types';
import {
    GOOGLE_AVAILABILITY,
    FACEBOOK_AVAILABILITY,
    GENERIC_AVAILABILITY,
    FEED_DEFAULTS,
    GoogleAvailabilityStatus,
    FacebookAvailabilityStatus,
    GenericAvailabilityStatus,
} from './feed-constants';

/**
 * Extended variant type that may include legacy stockOnHand property
 */
interface VariantWithLegacyStock extends VariantWithCustomFields {
    stockOnHand?: number;
}

/**
 * Get stock on hand from variant or stock levels
 */
export function getStockOnHand(variant: VariantWithCustomFields): number {
    // Try to get from stockLevels if available
    if (variant.stockLevels && variant.stockLevels.length > 0) {
        return variant.stockLevels.reduce((sum, sl) => sum + sl.stockOnHand, 0);
    }
    // Fallback to stockOnHand if it exists as a direct property (legacy support)
    return (variant as VariantWithLegacyStock).stockOnHand ?? 0;
}

/**
 * Format price with currency.
 * Returns null if priceInCents is NaN/undefined/null or currency is empty/undefined.
 */
export function formatPrice(priceInCents: number, currency: string): string | null {
    if (!currency || typeof priceInCents !== 'number' || isNaN(priceInCents)) {
        return null;
    }
    return `${(priceInCents / 100).toFixed(2)} ${currency}`;
}

/**
 * Get Google Shopping availability status
 */
export function getGoogleAvailability(variant: VariantWithCustomFields): GoogleAvailabilityStatus {
    const stockOnHand = getStockOnHand(variant);
    if (stockOnHand > 0) return GOOGLE_AVAILABILITY.IN_STOCK;
    return GOOGLE_AVAILABILITY.OUT_OF_STOCK;
}

/** Valid Facebook availability values, derived from the FACEBOOK_AVAILABILITY constant */
const VALID_FACEBOOK_AVAILABILITY_VALUES: readonly string[] = Object.values(FACEBOOK_AVAILABILITY);

/**
 * Get Facebook Catalog availability status.
 * Checks for explicit availability override in customFields before falling back to stock-based derivation.
 */
export function getFacebookAvailability(variant: VariantWithCustomFields): FacebookAvailabilityStatus {
    // Check for explicit availability override in customFields or direct field
    const customFields = variant.customFields as Record<string, unknown> | undefined;
    const customAvailability = customFields?.availability ?? (variant as unknown as Record<string, unknown>).availability;
    if (typeof customAvailability === 'string') {
        const normalized = customAvailability.toLowerCase().replace(/[_-]/g, ' ');
        if (VALID_FACEBOOK_AVAILABILITY_VALUES.includes(normalized)) {
            return normalized as FacebookAvailabilityStatus;
        }
    }
    // Default: derive from stock
    const stockOnHand = getStockOnHand(variant);
    if (stockOnHand > 0) return FACEBOOK_AVAILABILITY.IN_STOCK;
    return FACEBOOK_AVAILABILITY.OUT_OF_STOCK;
}

/**
 * Build product URL with optional variant and UTM params
 */
export function buildProductUrl(
    baseUrl: string,
    variant: VariantWithCustomFields,
    utmParams?: Record<string, string>,
): string {
    const product = variant.product;
    const slug = product?.slug || variant.id.toString();
    let url = `${baseUrl}/product/${slug}`;

    if (variant.sku) {
        url += `?variant=${variant.sku}`;
    }

    if (utmParams) {
        const params = new URLSearchParams(utmParams);
        url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    return url;
}

/**
 * Get image URL for variant/product
 */
export function getImageUrl(
    variant: VariantWithCustomFields,
    product: Product | undefined,
    baseUrl: string,
): string {
    const asset = variant.featuredAsset || product?.featuredAsset;
    if (asset) {
        // If asset source starts with http, use as-is
        if (asset.source.startsWith('http')) {
            return asset.source;
        }
        return `${baseUrl}/assets/${asset.source}`;
    }
    return `${baseUrl}${FEED_DEFAULTS.PLACEHOLDER_IMAGE_PATH}`;
}

/**
 * Get generic availability status for JSON/XML feeds
 */
export function getGenericAvailability(variant: VariantWithCustomFields): GenericAvailabilityStatus {
    const stockOnHand = getStockOnHand(variant);
    if (stockOnHand > 0) return GENERIC_AVAILABILITY.IN_STOCK;
    return GENERIC_AVAILABILITY.OUT_OF_STOCK;
}

/**
 * Get additional image URLs for variant/product
 */
export function getAdditionalImages(
    _variant: VariantWithCustomFields,
    product: Product | undefined,
    baseUrl: string,
): string[] {
    const images: string[] = [];
    const assets = product?.assets || [];

    for (const productAsset of assets) {
        if (productAsset.asset && productAsset.asset.source) {
            const url = productAsset.asset.source.startsWith('http')
                ? productAsset.asset.source
                : `${baseUrl}/assets/${productAsset.asset.source}`;
            images.push(url);
        }
    }

    return images;
}

/**
 * Extract facet value from product
 */
export function extractFacetValue(
    product: Product | undefined,
    facetCode: string,
): string | undefined {
    if (!product?.facetValues) return undefined;
    const facetValue = product.facetValues.find(
        fv => fv.facet?.code?.toLowerCase() === facetCode.toLowerCase(),
    );
    return facetValue?.name;
}

/**
 * Get product type from collections
 */
export async function getProductType(
    ctx: RequestContext,
    product: Product | undefined,
    connection: TransactionalConnection,
): Promise<string | undefined> {
    if (!product) return undefined;

    // Get product type from collections using channel-scoped repository.
    // NOTE: 'collection_product_variants_product_variant' is the TypeORM-generated join table
    // for the Collection.productVariants ManyToMany relation. If Vendure changes its entity
    // relationships or table naming strategy, this join table name may need updating.
    try {
        const collections = await connection.getRepository(ctx, Collection)
            .createQueryBuilder('c')
            .innerJoin(
                'collection_product_variants_product_variant',
                'cpv',
                'cpv.collectionId = c.id',
            )
            .innerJoin(
                'product_variant',
                'pv',
                'pv.id = cpv.productVariantId AND pv.productId = :productId',
                { productId: product.id },
            )
            .select('c.name', 'name')
            .getRawMany();

        if (collections.length > 0) {
            return collections.map(c => c.name).join(' > ');
        }
    } catch {
        // Collection lookup is optional - return undefined on failure
        // This is expected when product-collection relationships are not loaded
    }

    return undefined;
}

/**
 * Get option value from variant
 */
export function getOptionValue(variant: VariantWithCustomFields, groupName: string): string | undefined {
    const option = variant.options?.find(
        o =>
            o.group?.name?.toLowerCase() === groupName.toLowerCase() ||
            o.group?.code?.toLowerCase() === groupName.toLowerCase(),
    );
    return option?.name;
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Strip HTML tags from text
 */
export function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Escape value for CSV
 */
export function csvEscape(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Safely convert a custom field value to string
 * Returns undefined if the value is null, undefined, or not a string/number
 */
export function toStringOrUndefined(value: unknown): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return String(value);
    }
    return undefined;
}

/**
 * Safely convert a custom field value to string with empty string fallback
 * Returns empty string if the value is null, undefined, or not a string/number
 */
export function toStringOrEmpty(value: unknown): string {
    return toStringOrUndefined(value) ?? '';
}

/**
 * Extract custom labels from product custom fields
 * Returns a record with keys 'customLabel0' through 'customLabel4' where values exist
 */
export function extractCustomLabels(
    customFields: Record<string, unknown> | undefined,
): Record<string, string> {
    if (!customFields) return {};

    const labels: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
        const key = `customLabel${i}`;
        const value = toStringOrUndefined(customFields[key]);
        if (value) {
            labels[key] = value;
        }
    }
    return labels;
}
