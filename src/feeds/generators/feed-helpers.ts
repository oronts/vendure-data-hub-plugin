/**
 * Feed Helpers
 *
 * Shared utility functions for feed generators
 */

import { Product } from '@vendure/core';
import { VariantWithCustomFields } from './feed-types';
import {
    GOOGLE_AVAILABILITY,
    FACEBOOK_AVAILABILITY,
    GENERIC_AVAILABILITY,
    FEED_DEFAULTS,
    FEED_LIMITS,
    GoogleAvailabilityStatus,
    FacebookAvailabilityStatus,
    GenericAvailabilityStatus,
} from './feed-constants';
import { minorToMajorUnits } from '../../utils/money.utils';

export function getSaleableStockLevel(variant: VariantWithCustomFields): number {
    return Math.max(0, variant.saleableStockLevel ?? 0);
}

export function getFeedStockQuantity(variant: VariantWithCustomFields): number | null {
    const stockLevel = getSaleableStockLevel(variant);
    return stockLevel === Number.MAX_SAFE_INTEGER ? null : stockLevel;
}

/** Format a validated Vendure minor-unit price with its currency. */
export function formatPrice(minorUnits: number, currency: string, precision: number): string | null {
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
        return null;
    }
    try {
        return `${minorToMajorUnits(minorUnits, precision).toFixed(precision)} ${normalizedCurrency}`;
    } catch {
        return null;
    }
}

/**
 * Get Google Shopping availability status
 */
export function getGoogleAvailability(variant: VariantWithCustomFields): GoogleAvailabilityStatus {
    const stockOnHand = getSaleableStockLevel(variant);
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
    const stockOnHand = getSaleableStockLevel(variant);
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
    imageSize: 'preview' | 'original' = 'preview',
): string {
    const asset = variant.featuredAsset || product?.featuredAsset;
    if (asset) {
        const assetPath = imageSize === 'original' ? asset.source : asset.preview;
        if (assetPath.startsWith('http')) {
            return assetPath;
        }
        return `${baseUrl}/assets/${assetPath}`;
    }
    return `${baseUrl}${FEED_DEFAULTS.PLACEHOLDER_IMAGE_PATH}`;
}

/**
 * Get generic availability status for JSON/XML feeds
 */
export function getGenericAvailability(variant: VariantWithCustomFields): GenericAvailabilityStatus {
    const stockOnHand = getSaleableStockLevel(variant);
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
    imageSize: 'preview' | 'original' = 'preview',
): string[] {
    const images: string[] = [];
    const assets = product?.assets || [];

    for (const productAsset of assets) {
        if (productAsset.asset) {
            const assetPath = imageSize === 'original'
                ? productAsset.asset.source
                : productAsset.asset.preview;
            const url = assetPath.startsWith('http')
                ? assetPath
                : `${baseUrl}/assets/${assetPath}`;
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
export function getProductType(product: Product | undefined): string | undefined {
    const collections = (product as Product & {
        feedCollections?: Array<{ name: string }>;
    } | undefined)?.feedCollections;
    return collections && collections.length > 0
        ? collections.map(collection => collection.name).join(' > ')
        : undefined;
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
    for (let i = 0; i < FEED_LIMITS.MAX_CUSTOM_LABELS; i++) {
        const key = `customLabel${i}`;
        const value = toStringOrUndefined(customFields[key]);
        if (value) {
            labels[key] = value;
        }
    }
    return labels;
}
