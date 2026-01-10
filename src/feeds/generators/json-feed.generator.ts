/**
 * JSON Feed Generator
 *
 * Generates product feeds in JSON format for custom integrations
 */

import { RequestContext, Logger } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { SERVICE_DEFAULTS } from '../../constants/index';
import {
    FeedConfig,
    FeedFieldMapping,
    VariantWithCustomFields,
    ProductWithCustomFields,
} from './feed-types';
import {
    buildProductUrl,
    getImageUrl,
    getAdditionalImages,
    extractFacetValue,
    getProductType,
    getStockOnHand,
    stripHtml,
} from './feed-helpers';

const LOG_CONTEXT = 'JSONFeedGenerator';

/**
 * JSON feed item structure
 */
export interface JSONFeedItem {
    id: string;
    sku: string | null;
    name: string;
    description: string;
    price: number;
    currency: string;
    availability: 'in_stock' | 'out_of_stock';
    stockQuantity: number;
    url: string;
    imageUrl: string;
    additionalImages?: string[];
    category?: string;
    brand?: string;
    options?: Array<{
        name: string;
        value: string;
    }>;
    customFields?: Record<string, any>;
    [key: string]: any; // Allow custom properties
}

/**
 * JSON feed structure
 */
export interface JSONFeed {
    metadata: {
        generatedAt: string;
        itemCount: number;
        currency: string;
        version: string;
    };
    items: JSONFeedItem[];
}

/**
 * JSON generator options
 */
export interface JSONGeneratorOptions {
    /** Include additional images */
    includeAdditionalImages?: boolean;
    /** Include custom fields */
    includeCustomFields?: boolean;
    /** Include variant options */
    includeOptions?: boolean;
    /** Custom field mappings to include */
    customMappings?: Record<string, string | FeedFieldMapping>;
    /** Pretty print JSON */
    prettyPrint?: boolean;
    /** Indent spaces for pretty print */
    indentSpaces?: number;
    /** Include metadata wrapper */
    includeMetadata?: boolean;
}

/**
 * Transform a product variant to JSON feed item
 */
async function transformVariantToItem(
    ctx: RequestContext,
    variant: VariantWithCustomFields,
    config: FeedConfig,
    connection: TransactionalConnection,
    options: JSONGeneratorOptions,
): Promise<JSONFeedItem> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || 'USD';
    const product = variant.product as ProductWithCustomFields | undefined;
    const stockOnHand = getStockOnHand(variant);

    const item: JSONFeedItem = {
        id: variant.id.toString(),
        sku: variant.sku || null,
        name: variant.name || product?.name || '',
        description: stripHtml(product?.description || ''),
        price: variant.priceWithTax / 100,
        currency,
        availability: stockOnHand > 0 ? 'in_stock' : 'out_of_stock',
        stockQuantity: stockOnHand,
        url: buildProductUrl(baseUrl, variant, config.options?.utmParams),
        imageUrl: getImageUrl(variant, product, baseUrl),
    };

    // Additional images
    if (options.includeAdditionalImages !== false) {
        const additionalImages = getAdditionalImages(variant, product, baseUrl);
        if (additionalImages.length > 0) {
            item.additionalImages = additionalImages;
        }
    }

    // Category from collections
    const category = await getProductType(ctx, product, connection);
    if (category) {
        item.category = category;
    }

    // Brand
    const brand = extractFacetValue(product, 'brand');
    if (brand) {
        item.brand = brand;
    }

    // Variant options
    if (options.includeOptions !== false && variant.options && variant.options.length > 0) {
        item.options = variant.options.map(o => ({
            name: o.group?.name || 'Unknown',
            value: o.name,
        }));
    }

    // Custom fields
    if (options.includeCustomFields) {
        const customFields: Record<string, any> = {};
        const variantCustomFields = variant.customFields || {};
        const productCustomFields = product?.customFields || {};

        // Merge variant and product custom fields
        Object.entries({ ...productCustomFields, ...variantCustomFields }).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                customFields[key] = value;
            }
        });

        if (Object.keys(customFields).length > 0) {
            item.customFields = customFields;
        }
    }

    // Apply custom mappings
    if (options.customMappings) {
        for (const [targetKey, mapping] of Object.entries(options.customMappings)) {
            const source = typeof mapping === 'string' ? mapping : mapping.source;
            const value = getValueByPath(variant, product, source);
            if (value !== undefined) {
                item[targetKey] = value;
            } else if (typeof mapping === 'object' && mapping.default !== undefined) {
                item[targetKey] = mapping.default;
            }
        }
    }

    return item;
}

/**
 * Get value from variant/product by dot-notation path
 */
function getValueByPath(
    variant: VariantWithCustomFields,
    product: ProductWithCustomFields | undefined,
    path: string,
): any {
    const parts = path.split('.');
    let value: any;

    if (parts[0] === 'variant') {
        value = variant;
        parts.shift();
    } else if (parts[0] === 'product') {
        value = product;
        parts.shift();
    } else {
        // Try variant first, then product
        value = variant;
    }

    for (const part of parts) {
        if (value === null || value === undefined) {
            return undefined;
        }
        value = value[part];
    }

    return value;
}

/**
 * Generate JSON feed
 */
export async function generateJSONFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
    options?: JSONGeneratorOptions,
): Promise<string> {
    const opts: JSONGeneratorOptions = {
        includeAdditionalImages: true,
        includeCustomFields: false,
        includeOptions: true,
        prettyPrint: true,
        indentSpaces: 2,
        includeMetadata: true,
        ...options,
    };

    const currency = config.options?.currency || 'USD';
    const items: JSONFeedItem[] = [];

    for (const variant of products) {
        try {
            const item = await transformVariantToItem(ctx, variant, config, connection, opts);
            items.push(item);
        } catch (error) {
            Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
        }
    }

    // Build output
    let output: JSONFeed | JSONFeedItem[];

    if (opts.includeMetadata) {
        output = {
            metadata: {
                generatedAt: new Date().toISOString(),
                itemCount: items.length,
                currency,
                version: '1.0',
            },
            items,
        };
    } else {
        output = items;
    }

    // Stringify with formatting options
    if (opts.prettyPrint) {
        return JSON.stringify(output, null, opts.indentSpaces);
    }
    return JSON.stringify(output);
}

/**
 * Generate minimal JSON feed (without metadata, compact)
 */
export async function generateMinimalJSONFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
): Promise<string> {
    return generateJSONFeed(ctx, products, config, connection, {
        includeAdditionalImages: false,
        includeCustomFields: false,
        includeOptions: false,
        prettyPrint: false,
        includeMetadata: false,
    });
}

/**
 * Generate full JSON feed with all data
 */
export async function generateFullJSONFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
): Promise<string> {
    return generateJSONFeed(ctx, products, config, connection, {
        includeAdditionalImages: true,
        includeCustomFields: true,
        includeOptions: true,
        prettyPrint: true,
        indentSpaces: 2,
        includeMetadata: true,
    });
}
