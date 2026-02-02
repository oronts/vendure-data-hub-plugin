/**
 * Feed Types
 *
 * Shared type definitions for feed generators
 */

import { StockLevel, ProductVariant, Product } from '@vendure/core';

import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ProductCondition,
    GoogleAvailabilityStatus,
    FacebookAvailabilityStatus,
} from './feed-constants';

/**
 * Built-in feed format types
 */
export type BuiltInFeedFormat = 'google_shopping' | 'facebook_catalog' | 'csv' | 'json' | 'xml';

/**
 * Feed format types - includes custom formats
 */
export type FeedFormat = BuiltInFeedFormat | 'custom' | string;

/**
 * Custom field value types supported in feeds
 */
export type CustomFieldValue = string | number | boolean | null | undefined;

/**
 * Custom fields record type for feed entities
 * Uses unknown to be compatible with Vendure's CustomFields types
 */
export type CustomFieldsRecord = Record<string, CustomFieldValue>;

/**
 * Helper type for variants with optional customFields
 * Uses Record<string, unknown> to be compatible with Vendure's CustomProductVariantFields
 */
export type VariantWithCustomFields = ProductVariant & {
    customFields?: Record<string, unknown>;
    stockLevels?: StockLevel[];
};

/**
 * Helper type for products with optional customFields
 * Uses Record<string, unknown> to be compatible with Vendure's CustomProductFields
 */
export type ProductWithCustomFields = Product & {
    customFields?: Record<string, unknown>;
};

/**
 * Feed configuration
 */
export interface FeedConfig {
    code: string;
    name: string;
    format: FeedFormat;
    customGeneratorCode?: string;
    channelToken?: string;
    filters?: FeedFilters;
    fieldMappings?: Record<string, string | FeedFieldMapping>;
    options?: FeedOptions;
    schedule?: {
        enabled: boolean;
        cron: string;
    };
}

/**
 * Feed filters
 */
export interface FeedFilters {
    enabled?: boolean;
    inStock?: boolean;
    hasPrice?: boolean;
    categories?: string[];
    excludeCategories?: string[];
    minPrice?: number;
    maxPrice?: number;
    customFilter?: string; // JavaScript expression
}

/**
 * Feed field mapping
 */
export interface FeedFieldMapping {
    source: string;
    transform?: string;
    default?: CustomFieldValue;
}

/**
 * Feed options
 */
export interface FeedOptions {
    includeVariants?: boolean;
    imageSize?: 'thumbnail' | 'preview' | 'detail' | 'original';
    currency?: string;
    language?: string;
    baseUrl?: string;
    utmParams?: Record<string, string>;
}

/**
 * Generated feed result
 */
export interface GeneratedFeed {
    content: string | Buffer;
    contentType: string;
    filename: string;
    itemCount: number;
    generatedAt: Date;
    errors: string[];
    warnings: string[];
}

/**
 * Google Shopping product item
 */
export interface GoogleShoppingItem {
    'g:id': string;
    'g:title': string;
    'g:description': string;
    'g:link': string;
    'g:image_link': string;
    'g:additional_image_link'?: string[];
    'g:availability': GoogleAvailabilityStatus;
    'g:price': string;
    'g:sale_price'?: string;
    'g:brand'?: string;
    'g:gtin'?: string;
    'g:mpn'?: string;
    'g:condition': ProductCondition;
    'g:product_type'?: string;
    'g:google_product_category'?: string;
    'g:item_group_id'?: string;
    'g:color'?: string;
    'g:size'?: string;
    'g:gender'?: string;
    'g:age_group'?: string;
    'g:material'?: string;
    'g:pattern'?: string;
    'g:shipping'?: {
        'g:country': string;
        'g:service': string;
        'g:price': string;
    };
    'g:custom_label_0'?: string;
    'g:custom_label_1'?: string;
    'g:custom_label_2'?: string;
    'g:custom_label_3'?: string;
    'g:custom_label_4'?: string;
}

/**
 * Facebook Catalog product item
 */
export interface FacebookCatalogItem {
    id: string;
    title: string;
    description: string;
    availability: FacebookAvailabilityStatus;
    condition: ProductCondition;
    price: string;
    link: string;
    image_link: string;
    brand?: string;
    gtin?: string;
    mpn?: string;
    google_product_category?: string;
    product_type?: string;
    sale_price?: string;
    sale_price_effective_date?: string;
    item_group_id?: string;
    color?: string;
    size?: string;
    gender?: string;
    age_group?: string;
    custom_label_0?: string;
    custom_label_1?: string;
    custom_label_2?: string;
    custom_label_3?: string;
    custom_label_4?: string;
}

/**
 * Context passed to custom feed generators
 */
export interface FeedGeneratorContext {
    ctx: RequestContext;
    connection: TransactionalConnection;
    config: FeedConfig;
    products: VariantWithCustomFields[];
}

/**
 * Result from a custom feed generator
 */
export interface CustomFeedResult {
    content: string;
    contentType: string;
    fileExtension: string;
}

/**
 * Custom feed generator interface for creating custom feed formats
 */
export interface CustomFeedGenerator {
    code: string;
    name: string;
    description?: string;
    generate(context: FeedGeneratorContext): Promise<CustomFeedResult>;
}
