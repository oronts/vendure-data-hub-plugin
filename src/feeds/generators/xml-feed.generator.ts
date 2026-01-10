/**
 * XML Feed Generator
 *
 * Generates generic XML product feeds for custom integrations
 */

import { RequestContext, Logger } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { XMLBuilder } from 'fast-xml-parser';
import { SERVICE_DEFAULTS, XML_NAMESPACES, TRANSFORM_LIMITS } from '../../constants/index';
import {
    FeedConfig,
    VariantWithCustomFields,
    ProductWithCustomFields,
} from './feed-types';
import {
    buildProductUrl,
    getImageUrl,
    extractFacetValue,
    getProductType,
    getStockOnHand,
    stripHtml,
} from './feed-helpers';

const LOG_CONTEXT = 'XMLFeedGenerator';

/**
 * XML feed item structure
 */
export interface XMLFeedItem {
    id: string;
    sku?: string;
    name: string;
    description: string;
    price: {
        '@_currency': string;
        '#text': string;
    };
    availability: 'in_stock' | 'out_of_stock';
    url: string;
    image_url: string;
    category?: string;
    brand?: string;
    options?: {
        option: Array<{
            '@_name': string;
            '#text': string;
        }>;
    };
}

/**
 * XML generator options
 */
export interface XMLGeneratorOptions {
    /** Root element name */
    rootElement?: string;
    /** Item element name */
    itemElement?: string;
    /** Include XML declaration */
    includeDeclaration?: boolean;
    /** Format output (pretty print) */
    format?: boolean;
    /** Include additional images */
    includeAdditionalImages?: boolean;
    /** Include variant options */
    includeOptions?: boolean;
    /** Custom namespace */
    namespace?: string;
    /** Namespace prefix */
    namespacePrefix?: string;
}

/**
 * Transform a product variant to XML feed item
 */
async function transformVariantToXMLItem(
    ctx: RequestContext,
    variant: VariantWithCustomFields,
    config: FeedConfig,
    connection: TransactionalConnection,
    options: XMLGeneratorOptions,
): Promise<XMLFeedItem> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || 'USD';
    const product = variant.product as ProductWithCustomFields | undefined;
    const stockOnHand = getStockOnHand(variant);

    const item: XMLFeedItem = {
        id: variant.id.toString(),
        name: variant.name || product?.name || '',
        description: stripHtml(product?.description || ''),
        price: {
            '@_currency': currency,
            '#text': (variant.priceWithTax / TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER).toFixed(TRANSFORM_LIMITS.CURRENCY_DECIMAL_PLACES),
        },
        availability: stockOnHand > 0 ? 'in_stock' : 'out_of_stock',
        url: buildProductUrl(baseUrl, variant, config.options?.utmParams),
        image_url: getImageUrl(variant, product, baseUrl),
    };

    // SKU
    if (variant.sku) {
        item.sku = variant.sku;
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
        item.options = {
            option: variant.options.map(o => ({
                '@_name': o.group?.name || 'Unknown',
                '#text': o.name,
            })),
        };
    }

    return item;
}

/**
 * Generate generic XML feed
 */
export async function generateXMLFeed(
    ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    connection: TransactionalConnection,
    options?: XMLGeneratorOptions,
): Promise<string> {
    const opts: XMLGeneratorOptions = {
        rootElement: 'feed',
        itemElement: 'product',
        includeDeclaration: true,
        format: true,
        includeAdditionalImages: false,
        includeOptions: true,
        ...options,
    };

    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const items: XMLFeedItem[] = [];

    for (const variant of products) {
        try {
            const item = await transformVariantToXMLItem(ctx, variant, config, connection, opts);
            items.push(item);
        } catch (error) {
            Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
        }
    }

    // Build XML
    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: opts.format,
        suppressEmptyNode: true,
    });

    // Build feed structure
    const feedContent: Record<string, any> = {
        '@_generated': new Date().toISOString(),
        title: config.name,
        link: baseUrl,
        [opts.itemElement!]: items,
    };

    // Add namespace if specified
    if (opts.namespace) {
        const prefix = opts.namespacePrefix ? `@_xmlns:${opts.namespacePrefix}` : '@_xmlns';
        feedContent[prefix] = opts.namespace;
    }

    const feed: Record<string, any> = {};

    // Add XML declaration
    if (opts.includeDeclaration) {
        feed['?xml'] = { '@_version': '1.0', '@_encoding': 'UTF-8' };
    }

    // Add root element with content
    feed[opts.rootElement!] = feedContent;

    return builder.build(feed);
}

/**
 * Generate Atom-style XML feed
 */
export async function generateAtomFeed(
    _ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    _connection: TransactionalConnection,
): Promise<string> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;
    const currency = config.options?.currency || 'USD';

    const entries = await Promise.all(
        products.map(async variant => {
            try {
                const product = variant.product as ProductWithCustomFields | undefined;
                const stockOnHand = getStockOnHand(variant);

                return {
                    id: `urn:product:${variant.id}`,
                    title: variant.name || product?.name || '',
                    summary: stripHtml(product?.description || '').slice(0, TRANSFORM_LIMITS.DESCRIPTION_TRUNCATE_LENGTH),
                    link: {
                        '@_href': buildProductUrl(baseUrl, variant, config.options?.utmParams),
                        '@_rel': 'alternate',
                    },
                    updated: new Date().toISOString(),
                    content: {
                        '@_type': 'xhtml',
                        div: {
                            '@_xmlns': XML_NAMESPACES.XHTML,
                            p: stripHtml(product?.description || ''),
                            img: {
                                '@_src': getImageUrl(variant, product, baseUrl),
                                '@_alt': variant.name || product?.name || '',
                            },
                        },
                    },
                    'price:amount': {
                        '@_currency': currency,
                        '#text': (variant.priceWithTax / TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER).toFixed(TRANSFORM_LIMITS.CURRENCY_DECIMAL_PLACES),
                    },
                    'stock:availability': stockOnHand > 0 ? 'in_stock' : 'out_of_stock',
                };
            } catch (error) {
                Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
                return null;
            }
        }),
    );

    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        suppressEmptyNode: true,
    });

    const feed = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        feed: {
            '@_xmlns': XML_NAMESPACES.ATOM_1_0,
            '@_xmlns:price': 'urn:feed:price',
            '@_xmlns:stock': 'urn:feed:stock',
            title: config.name,
            link: { '@_href': baseUrl },
            updated: new Date().toISOString(),
            id: `urn:feed:${config.code}`,
            entry: entries.filter(e => e !== null),
        },
    };

    return builder.build(feed);
}

/**
 * Generate RSS 2.0 feed
 */
export async function generateRSSFeed(
    _ctx: RequestContext,
    products: VariantWithCustomFields[],
    config: FeedConfig,
    _connection: TransactionalConnection,
): Promise<string> {
    const baseUrl = config.options?.baseUrl || SERVICE_DEFAULTS.EXAMPLE_BASE_URL;

    const items = await Promise.all(
        products.map(async variant => {
            try {
                const product = variant.product as ProductWithCustomFields | undefined;

                return {
                    title: variant.name || product?.name || '',
                    link: buildProductUrl(baseUrl, variant, config.options?.utmParams),
                    description: stripHtml(product?.description || '').slice(0, TRANSFORM_LIMITS.DESCRIPTION_TRUNCATE_LENGTH),
                    guid: {
                        '@_isPermaLink': 'false',
                        '#text': variant.id.toString(),
                    },
                    pubDate: new Date().toUTCString(),
                    enclosure: {
                        '@_url': getImageUrl(variant, product, baseUrl),
                        '@_type': 'image/jpeg',
                    },
                };
            } catch (error) {
                Logger.warn(`Failed to process variant ${variant.id}: ${error}`, LOG_CONTEXT);
                return null;
            }
        }),
    );

    const builder = new XMLBuilder({
        ignoreAttributes: false,
        format: true,
        suppressEmptyNode: true,
    });

    const feed = {
        '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
        rss: {
            '@_version': '2.0',
            channel: {
                title: config.name,
                link: baseUrl,
                description: `Product feed for ${config.name}`,
                lastBuildDate: new Date().toUTCString(),
                item: items.filter(i => i !== null),
            },
        },
    };

    return builder.build(feed);
}
