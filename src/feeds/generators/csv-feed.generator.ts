/**
 * CSV Feed Generator
 *
 * Generates generic CSV product feeds with configurable field mappings
 */

import { RequestContext, Logger } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { SERVICE_DEFAULTS, TRANSFORM_LIMITS } from '../../constants/index';
import {
    FeedConfig,
    FeedFieldMapping,
    VariantWithCustomFields,
    ProductWithCustomFields,
    CustomFieldValue,
} from './feed-types';
import {
    formatPrice,
    buildProductUrl,
    getImageUrl,
    extractFacetValue,
    getProductType,
    getOptionValue,
    getStockOnHand,
    stripHtml,
    csvEscape,
} from './feed-helpers';
import { FIELD_PREFIX, FEED_DEFAULTS, GENERIC_AVAILABILITY } from './feed-constants';

const LOG_CONTEXT = 'CSVFeedGenerator';

/**
 * Default CSV field configuration
 */
export interface CSVFieldConfig {
    header: string;
    source: string;
    transform?: (value: CustomFieldValue | string, variant: VariantWithCustomFields, product?: ProductWithCustomFields) => string;
}

/**
 * Default CSV fields for product feeds
 */
const DEFAULT_CSV_FIELDS: CSVFieldConfig[] = [
    { header: 'id', source: 'id' },
    { header: 'sku', source: 'sku' },
    { header: 'name', source: 'name' },
    { header: 'description', source: 'description' },
    { header: 'price', source: 'price' },
    { header: 'currency', source: 'currency' },
    { header: 'availability', source: 'availability' },
    { header: 'url', source: 'url' },
    { header: 'image_url', source: 'image_url' },
    { header: 'category', source: 'category' },
];

/**
 * CSV generation options
 */
export interface CSVGeneratorOptions {
    /** Field delimiter (default: comma) */
    delimiter?: ',' | '\t' | ';' | '|';
    /** Include header row */
    includeHeader?: boolean;
    /** Quote all fields */
    quoteAll?: boolean;
    /** Line ending */
    lineEnding?: '\n' | '\r\n';
    /** Custom fields to include */
    fields?: CSVFieldConfig[];
}

/**
 * Get field value from variant/product based on source path
 */
function getFieldValue(
    source: string,
    variant: VariantWithCustomFields,
    product: ProductWithCustomFields | undefined,
    _ctx: RequestContext,
    config: FeedConfig,
    _connection: TransactionalConnection,
    productType?: string,
): string {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || FEED_DEFAULTS.CURRENCY;

    switch (source) {
        case 'id':
            return variant.id.toString();
        case 'sku':
            return variant.sku || '';
        case 'name':
            return csvEscape(variant.name || product?.name || '');
        case 'description':
            return csvEscape(stripHtml(product?.description || ''));
        case 'price':
            return (variant.priceWithTax / TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER).toFixed(TRANSFORM_LIMITS.CURRENCY_DECIMAL_PLACES);
        case 'price_formatted':
            return formatPrice(variant.priceWithTax, currency);
        case 'currency':
            return currency;
        case 'availability':
            return getStockOnHand(variant) > 0 ? GENERIC_AVAILABILITY.IN_STOCK : GENERIC_AVAILABILITY.OUT_OF_STOCK;
        case 'stock':
            return getStockOnHand(variant).toString();
        case 'url':
            return buildProductUrl(baseUrl, variant, config.options?.utmParams);
        case 'image_url':
            return getImageUrl(variant, product, baseUrl);
        case 'category':
            return productType || '';
        case 'brand':
            return extractFacetValue(product, 'brand') || '';
        case 'color':
            return getOptionValue(variant, 'color') || '';
        case 'size':
            return getOptionValue(variant, 'size') || '';
        case 'weight': {
            const weightValue = product?.customFields?.weight;
            return weightValue !== null && weightValue !== undefined ? String(weightValue) : '';
        }
        case 'product_id':
            return product?.id.toString() || '';
        case 'slug':
            return product?.slug || '';
        default:
            // Check for customFields path
            if (source.startsWith(FIELD_PREFIX.CUSTOM_FIELDS)) {
                const fieldName = source.replace(FIELD_PREFIX.CUSTOM_FIELDS, '');
                const customFields = variant.customFields || {};
                const productCustomFields = product?.customFields || {};
                const fieldValue = customFields[fieldName] ?? productCustomFields[fieldName];
                return fieldValue !== null && fieldValue !== undefined ? String(fieldValue) : '';
            }
            // Check for options path
            if (source.startsWith(FIELD_PREFIX.OPTION)) {
                const optionName = source.replace(FIELD_PREFIX.OPTION, '');
                return getOptionValue(variant, optionName) || '';
            }
            // Check for facet path
            if (source.startsWith(FIELD_PREFIX.FACET)) {
                const facetCode = source.replace(FIELD_PREFIX.FACET, '');
                return extractFacetValue(product, facetCode) || '';
            }
            return '';
    }
}

/**
 * Build CSV fields from config field mappings
 */
function buildFieldsFromMappings(
    fieldMappings: Record<string, string | FeedFieldMapping>,
): CSVFieldConfig[] {
    return Object.entries(fieldMappings).map(([header, mapping]) => {
        if (typeof mapping === 'string') {
            return { header, source: mapping };
        }
        return {
            header,
            source: mapping.source,
        };
    });
}

/**
 * Generate generic CSV feed
 */
export async function generateCSVFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
    options?: CSVGeneratorOptions,
): Promise<string> {
    const delimiter = options?.delimiter ?? ',';
    const includeHeader = options?.includeHeader ?? true;
    const lineEnding = options?.lineEnding ?? '\n';

    // Determine fields to use
    let fields: CSVFieldConfig[];
    if (options?.fields && options.fields.length > 0) {
        fields = options.fields;
    } else if (config.fieldMappings && Object.keys(config.fieldMappings).length > 0) {
        fields = buildFieldsFromMappings(config.fieldMappings);
    } else {
        fields = DEFAULT_CSV_FIELDS;
    }

    const rows: string[][] = [];

    // Add header row
    if (includeHeader) {
        rows.push(fields.map(f => f.header));
    }

    // Pre-fetch product types for all products
    const productTypeCache = new Map<string, string | undefined>();

    for (const variant of products) {
        try {
            const product = variant.product as ProductWithCustomFields | undefined;

            // Get product type (with caching)
            let productType: string | undefined;
            if (product) {
                const cacheKey = product.id.toString();
                if (productTypeCache.has(cacheKey)) {
                    productType = productTypeCache.get(cacheKey);
                } else {
                    productType = await getProductType(ctx, product, connection);
                    productTypeCache.set(cacheKey, productType);
                }
            }

            const row = fields.map(field => {
                if (field.transform) {
                    return field.transform(
                        getFieldValue(field.source, variant, product, ctx, config, connection, productType),
                        variant,
                        product,
                    );
                }
                return getFieldValue(field.source, variant, product, ctx, config, connection, productType);
            });

            rows.push(row);
        } catch (error) {
            Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
        }
    }

    // Escape and format based on delimiter
    const formatValue = (value: string): string => {
        if (options?.quoteAll) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        // Auto-quote if contains delimiter, quotes, or newlines
        if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    };

    return rows.map(row => row.map(formatValue).join(delimiter)).join(lineEnding);
}

/**
 * Generate CSV feed with custom field mappings
 */
export async function generateCustomCSVFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
    customFields: CSVFieldConfig[],
    options?: Omit<CSVGeneratorOptions, 'fields'>,
): Promise<string> {
    return generateCSVFeed(ctx, products, config, connection, {
        ...options,
        fields: customFields,
    });
}
