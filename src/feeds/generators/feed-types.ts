/**
 * Feed Types
 *
 * Shared type definitions for feed generators
 */

import { StockLevel, ProductVariant, Product } from '@vendure/core';

import { RequestContext, TransactionalConnection } from '@vendure/core';

/**
 * Built-in feed format types
 */
export type BuiltInFeedFormat = 'google_shopping' | 'facebook_catalog' | 'csv' | 'json' | 'xml';

/**
 * Feed format types - includes custom formats
 */
export type FeedFormat = BuiltInFeedFormat | 'custom' | string;

/**
 * Helper type for variants with optional customFields
 */
export type VariantWithCustomFields = ProductVariant & {
    customFields?: Record<string, any>;
    stockLevels?: StockLevel[];
};

/**
 * Helper type for products with optional customFields
 */
export type ProductWithCustomFields = Product & {
    customFields?: Record<string, any>;
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
    default?: any;
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
    'g:availability': 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder';
    'g:price': string;
    'g:sale_price'?: string;
    'g:brand'?: string;
    'g:gtin'?: string;
    'g:mpn'?: string;
    'g:condition': 'new' | 'refurbished' | 'used';
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
    availability: 'in stock' | 'out of stock' | 'preorder' | 'available for order';
    condition: 'new' | 'refurbished' | 'used';
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
