/**
 * Feed Constants
 *
 * Constants for product feed generation including product conditions
 * and availability statuses for different platforms.
 */

/**
 * Product conditions for feed generation
 * Used across Google Shopping, Facebook Catalog, and other feed formats
 */
export const PRODUCT_CONDITIONS = {
    NEW: 'new',
    REFURBISHED: 'refurbished',
    USED: 'used',
} as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[keyof typeof PRODUCT_CONDITIONS];

/**
 * Google Shopping availability status values
 * @see https://support.google.com/merchants/answer/6324448
 */
export const GOOGLE_AVAILABILITY = {
    IN_STOCK: 'in_stock',
    OUT_OF_STOCK: 'out_of_stock',
    PREORDER: 'preorder',
    BACKORDER: 'backorder',
} as const;

export type GoogleAvailabilityStatus = (typeof GOOGLE_AVAILABILITY)[keyof typeof GOOGLE_AVAILABILITY];

/**
 * Facebook Catalog availability status values
 * @see https://developers.facebook.com/docs/marketing-api/catalog/reference
 */
export const FACEBOOK_AVAILABILITY = {
    IN_STOCK: 'in stock',
    OUT_OF_STOCK: 'out of stock',
    PREORDER: 'preorder',
    AVAILABLE_FOR_ORDER: 'available for order',
} as const;

export type FacebookAvailabilityStatus = (typeof FACEBOOK_AVAILABILITY)[keyof typeof FACEBOOK_AVAILABILITY];

/**
 * Field source prefixes for dynamic field resolution
 * Used in CSV, JSON, and other feed generators for custom field mappings
 */
export const FIELD_PREFIX = {
    /** Custom fields on variant or product (e.g., customFields.gtin) */
    CUSTOM_FIELDS: 'customFields.',
    /** Variant option values (e.g., option.color) */
    OPTION: 'option.',
    /** Facet values (e.g., facet.brand) */
    FACET: 'facet.',
    /** Variant-specific path (e.g., variant.sku) */
    VARIANT: 'variant.',
    /** Product-specific path (e.g., product.slug) */
    PRODUCT: 'product.',
} as const;

export type FieldPrefix = (typeof FIELD_PREFIX)[keyof typeof FIELD_PREFIX];

/**
 * Feed generation limits and defaults
 */
export const FEED_LIMITS = {
    /** Maximum title length for Google Shopping/Facebook (150 chars per spec) */
    TITLE_MAX_LENGTH: 150,
    /** Maximum additional images for Google Shopping */
    GOOGLE_ADDITIONAL_IMAGES_MAX: 10,
    /** Default JSON indent spaces */
    JSON_INDENT_SPACES: 2,
    /** Maximum number of custom labels supported (0-4) */
    MAX_CUSTOM_LABELS: 5,
} as const;

/**
 * Feed default values
 */
export const FEED_DEFAULTS = {
    /** Default currency code for feeds */
    CURRENCY: 'USD',
    /** Default placeholder image path */
    PLACEHOLDER_IMAGE_PATH: '/placeholder.jpg',
} as const;

/**
 * Generic availability status values (used for JSON/XML feeds)
 */
export const GENERIC_AVAILABILITY = {
    IN_STOCK: 'in_stock',
    OUT_OF_STOCK: 'out_of_stock',
} as const;

export type GenericAvailabilityStatus = (typeof GENERIC_AVAILABILITY)[keyof typeof GENERIC_AVAILABILITY];

/**
 * Custom label field names (0-4 per spec)
 */
export const CUSTOM_LABEL_FIELDS = [
    'customLabel0',
    'customLabel1',
    'customLabel2',
    'customLabel3',
    'customLabel4',
] as const;

export type CustomLabelField = (typeof CUSTOM_LABEL_FIELDS)[number];
