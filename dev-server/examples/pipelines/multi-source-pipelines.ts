/**
 * Multi-Source API Aggregation Pipelines
 *
 * Five advanced scenarios testing multi-API data aggregation, cross-system
 * enrichment, and fan-out patterns:
 *
 * MS-1: Multi-Source Product Aggregation — Parallel extraction from Pimcore + Magento,
 *        normalize to unified format, deduplicate by SKU, load to Vendure, sink to Meilisearch,
 *        export reconciliation report.
 *
 * MS-2: Webhook-Triggered Multi-API Enrichment — Webhook receives product SKU, enriches
 *        from Pimcore and Shopify, merges data, loads to Vendure, sinks to Meilisearch.
 *
 * MS-3: Cross-System Order Sync — Extract orders from Pimcore, enrich with Shopify customer
 *        details, transform for Vendure, route by order status.
 *
 * MS-4: Bi-Directional Sync Trigger Chain — Pipeline A imports from Pimcore to Vendure,
 *        Pipeline B (event-triggered) sinks changed products to Meilisearch.
 *
 * MS-5: Multi-Sink Fan-Out — Extract from Pimcore, transform, fan-out to Meilisearch +
 *        webhook notification + CSV export simultaneously.
 */

import { createPipeline } from '../../../src';
import { MOCK_PORTS, mockUrl } from '../../ports';

// ── External API URLs ───────────────────────────────────────────────────────
const PIMCORE_API_URL = process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE);
const MAGENTO_API_URL = process.env.MAGENTO_API_URL || mockUrl(MOCK_PORTS.MAGENTO);
const SHOPIFY_API_URL = process.env.SHOPIFY_API_URL || mockUrl(MOCK_PORTS.SHOPIFY);

// =============================================================================
// MS-1: MULTI-SOURCE PRODUCT AGGREGATION
// Parallel Pimcore + Magento extraction → normalize → dedup → enrich → load → sink → export
// =============================================================================

/**
 * Multi-source product aggregation pipeline using graph execution mode.
 *
 * Graph topology:
 *   trigger → extract-pimcore → normalize-pimcore ─┐
 *                                                    ├→ dedup-by-sku → enrich-categories → load-products → sink-meili-unified → export-report
 *   trigger → extract-magento → normalize-magento ──┘
 *
 * Features:
 * - Parallel extraction from 2 different API formats (Pimcore REST + Magento REST)
 * - Per-source normalization (field mapping to unified schema)
 * - Deduplication by SKU via `unique` operator (Pimcore preferred over Magento)
 * - Category enrichment via Vendure collection lookup
 * - UPSERT to Vendure with SOURCE_WINS conflict strategy
 * - Meilisearch indexing with custom `products-unified` index
 * - CSV reconciliation report export
 */
export const multiSourceProductAggregation = createPipeline()
    .name('Multi-Source Product Aggregation')
    .description('Parallel extraction from Pimcore + Magento, normalize, dedup by SKU, load to Vendure, sink to Meilisearch')
    .capabilities({ requires: ['UpdateCatalog'] })
    .parallel({ maxConcurrentSteps: 4, errorPolicy: 'CONTINUE' })

    // Single trigger → both extraction branches
    .trigger('start', { type: 'MANUAL' })

    // ── Branch A: Pimcore extraction ────────────────────────────────────────
    .extract('extract-pimcore', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    // Enrich with product detail (to get variant-level prices)
    .transform('enrich-pimcore-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    // Normalize Pimcore fields to unified format
    .transform('normalize-pimcore', {
        operators: [
            // Map Pimcore's nested structure to flat unified format
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: '_titleMap' } },
            { op: 'copy', args: { source: '_detail.product.description', target: '_descMap' } },
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.product.categoryCode', target: 'categoryCode' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Extract English/German name from title map
                        const titleMap = record._titleMap || {};
                        if (typeof titleMap === 'object' && !Array.isArray(titleMap)) {
                            record.name = titleMap.en || titleMap.de || String(titleMap);
                            record.name_de = titleMap.de || titleMap.en || String(titleMap);
                        } else {
                            record.name = String(titleMap);
                            record.name_de = String(titleMap);
                        }

                        // Extract description
                        const descMap = record._descMap || {};
                        if (typeof descMap === 'object' && !Array.isArray(descMap)) {
                            record.description = descMap.en || descMap.de || '';
                        } else {
                            record.description = String(descMap || '');
                        }

                        // Get first variant price as the product price
                        const variants = record._detail?.variants || [];
                        if (variants.length > 0) {
                            const firstVariant = variants[0];
                            record.price = firstVariant.price?.EUR || 0;
                            record.priceInCents = Math.round((firstVariant.price?.EUR || 0) * 100);
                        } else {
                            record.price = 0;
                            record.priceInCents = 0;
                        }

                        record._source = 'pimcore';
                        record._sourcePriority = 1; // Higher priority for dedup
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'omit', args: { fields: ['_detail', '_titleMap', '_descMap', 'id', 'type', 'variantCount', 'modifiedAt', 'title', 'channels', 'published'] } },
        ],
    })

    // ── Branch B: Magento extraction ────────────────────────────────────────
    .extract('extract-magento', {
        adapterCode: 'httpApi',
        url: `${MAGENTO_API_URL}/rest/V1/products`,
        method: 'GET',
        bearerTokenSecretCode: 'magento-bearer-token',
        itemsField: 'items',
        pagination: {
            type: 'offset',
            pageParam: 'searchCriteria[currentPage]',
            pageSizeParam: 'searchCriteria[pageSize]',
            pageSize: 50,
            maxPages: 2, // Limit to 100 products for testing
        },
    })

    // Normalize Magento fields to unified format
    .transform('normalize-magento', {
        operators: [
            // Magento fields are already flat — sku is kept as-is
            { op: 'copy', args: { source: 'name', target: 'name' } },
            { op: 'copy', args: { source: 'price', target: 'price' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Flatten Magento custom_attributes
                        const attrs = record.custom_attributes || [];
                        for (const attr of attrs) {
                            record['_attr_' + attr.attribute_code] = attr.value;
                        }

                        // Map to unified format
                        record.description = record._attr_description || record._attr_short_description || '';
                        record.name_de = record.name; // Magento is single-locale in this mock
                        record.priceInCents = Math.round((record.price || 0) * 100);
                        record.enabled = record.status === 1;
                        record.categoryCode = '';

                        record._source = 'magento';
                        record._sourcePriority = 2; // Lower priority for dedup

                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            // Remove Magento-specific fields
            { op: 'omit', args: { fields: [
                'id', 'attribute_set_id', 'status', 'visibility', 'type_id',
                'created_at', 'updated_at', 'weight', 'extension_attributes',
                'product_links', 'options', 'media_gallery_entries', 'tier_prices',
                'custom_attributes',
            ] } },
            // Remove _attr_ prefixed fields
            {
                op: 'script',
                args: {
                    code: `
                        for (const key of Object.keys(record)) {
                            if (key.startsWith('_attr_')) delete record[key];
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    // ── Fan-in: Deduplicate by SKU ──────────────────────────────────────────
    // Records from both normalize steps arrive here.
    // Use script to dedup: Pimcore wins if duplicate SKU (lower _sourcePriority = wins)
    .transform('dedup-by-sku', {
        operators: [
            { op: 'unique', args: { field: 'sku', strategy: 'first' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
        ],
    })

    // ── Enrich: Category lookup ─────────────────────────────────────────────
    .transform('enrich-categories', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Default category assignment for products without one
                        if (!record.categoryCode) {
                            record.categoryCode = 'uncategorized';
                        }
                        // Ensure clean data for loading
                        record.name = (record.name || '').substring(0, 255);
                        record.description = (record.description || '').substring(0, 5000);
                        return record;
                    `,
                },
            },
        ],
    })

    // ── Load to Vendure ─────────────────────────────────────────────────────
    .load('load-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        skuField: 'sku',
        priceField: 'priceInCents',
    })

    // ── Sink to Meilisearch ─────────────────────────────────────────────────
    .sink('sink-meili-unified', {
        adapterCode: 'meilisearch',
        indexName: 'products-unified',
        primaryKey: 'sku',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 100,
        languageCode: 'en',
        searchableFields: ['name', 'description', 'sku', 'categoryCode'],
        filterableFields: ['_source', 'enabled', 'categoryCode'],
        sortableFields: ['price', 'name'],
    })

    // ── Export reconciliation report ─────────────────────────────────────────
    .export('export-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'multi-source-reconciliation.csv',
    })

    // ── Graph edges ─────────────────────────────────────────────────────────
    // Trigger fans out to both extraction branches
    .edge('start', 'extract-pimcore')
    .edge('start', 'extract-magento')

    // Pimcore branch
    .edge('extract-pimcore', 'enrich-pimcore-detail')
    .edge('enrich-pimcore-detail', 'normalize-pimcore')
    .edge('normalize-pimcore', 'dedup-by-sku')

    // Magento branch
    .edge('extract-magento', 'normalize-magento')
    .edge('normalize-magento', 'dedup-by-sku')

    // Fan-in to pipeline tail
    .edge('dedup-by-sku', 'enrich-categories')
    .edge('enrich-categories', 'load-products')
    .edge('load-products', 'sink-meili-unified')
    .edge('sink-meili-unified', 'export-report')
    .build();


// =============================================================================
// MS-2: WEBHOOK-TRIGGERED MULTI-API ENRICHMENT
// Webhook → enrich from Pimcore + Shopify → merge → load → sink
// =============================================================================

/**
 * Webhook-triggered multi-API enrichment pipeline.
 *
 * When a webhook arrives with a product SKU, the pipeline:
 * 1. Enriches from Pimcore (product details, translations)
 * 2. Enriches from Shopify (inventory, pricing)
 * 3. Merges into unified format
 * 4. Loads to Vendure (UPSERT)
 * 5. Sinks to Meilisearch (update search index)
 *
 * Graph topology (linear for webhook-triggered single-record flow):
 *   webhook → enrich-pimcore → enrich-shopify → merge-data → load-product → sink-search
 */
export const webhookMultiApiEnrichment = createPipeline()
    .name('Webhook Multi-API Enrichment')
    .description('Webhook receives SKU, enriches from Pimcore + Shopify, loads to Vendure, sinks to Meilisearch')
    .capabilities({ requires: ['UpdateCatalog'] })

    // Webhook trigger — receives { sku: "...", source: "..." }
    .trigger('webhook', {
        type: 'WEBHOOK',
        authentication: 'API_KEY',
        apiKeySecretCode: 'webhook-api-key',
        apiKeyHeaderName: 'x-api-key',
    })

    // Enrich from Pimcore — lookup product by itemNumber
    .transform('enrich-pimcore', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_pimcoreProducts',
                    cacheTtlSec: 60,
                },
            },
            {
                op: 'script',
                args: {
                    code: `
                        // Find matching product from Pimcore by SKU
                        const products = record._pimcoreProducts?.products || [];
                        const match = products.find(p => p.itemNumber === record.sku);
                        if (match) {
                            record._pimcore = {
                                found: true,
                                name: match.title,
                                categoryCode: match.categoryCode,
                                channels: match.channels,
                            };
                        } else {
                            record._pimcore = { found: false };
                        }
                        delete record._pimcoreProducts;
                        return record;
                    `,
                },
            },
        ],
    })

    // Enrich from Shopify — lookup inventory/pricing
    .transform('enrich-shopify', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${SHOPIFY_API_URL}/admin/api/2024-01/products.json?limit=50`,
                    headers: { 'X-Shopify-Access-Token': 'shpat_test_mock_access_token_123456' },
                    target: '_shopifyProducts',
                    cacheTtlSec: 60,
                },
            },
            {
                op: 'script',
                args: {
                    code: `
                        // Search Shopify products for matching SKU (in variants)
                        const shopifyProducts = record._shopifyProducts?.products || [];
                        let shopifyMatch = null;
                        for (const sp of shopifyProducts) {
                            const matchingVariant = (sp.variants || []).find(v => v.sku === record.sku);
                            if (matchingVariant) {
                                shopifyMatch = {
                                    found: true,
                                    shopifyProductId: sp.id,
                                    shopifyPrice: matchingVariant.price,
                                    shopifyInventory: matchingVariant.inventory_quantity,
                                    shopifyTitle: sp.title,
                                };
                                break;
                            }
                        }
                        record._shopify = shopifyMatch || { found: false };
                        delete record._shopifyProducts;
                        return record;
                    `,
                },
            },
        ],
    })

    // Merge enriched data into unified product format
    .transform('merge-data', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Build unified product from enrichment results
                        const pim = record._pimcore || {};
                        const shop = record._shopify || {};

                        // Prefer Pimcore for product info, Shopify for pricing/inventory
                        record.name = (typeof pim.name === 'object' ? (pim.name.en || pim.name.de) : pim.name) || shop.shopifyTitle || record.sku;
                        record.price = shop.shopifyPrice ? Math.round(parseFloat(shop.shopifyPrice) * 100) : 0;
                        record.stockLevel = shop.shopifyInventory || 0;
                        record.categoryCode = pim.categoryCode || 'uncategorized';
                        record.enrichedFrom = [
                            pim.found ? 'pimcore' : null,
                            shop.found ? 'shopify' : null,
                        ].filter(Boolean).join(',');
                        record.enabled = true;

                        // Clean up internal fields
                        delete record._pimcore;
                        delete record._shopify;
                        delete record.source;
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
        ],
    })

    // Load to Vendure
    .load('load-product', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        enabledField: 'enabled',
        skuField: 'sku',
        priceField: 'price',
    })

    // Sink to Meilisearch
    .sink('sink-search', {
        adapterCode: 'meilisearch',
        indexName: 'products-enriched',
        primaryKey: 'sku',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 10,
        languageCode: 'en',
        searchableFields: ['name', 'sku'],
        filterableFields: ['categoryCode', 'enrichedFrom'],
        sortableFields: ['price'],
    })

    // Linear graph
    .edge('webhook', 'enrich-pimcore')
    .edge('enrich-pimcore', 'enrich-shopify')
    .edge('enrich-shopify', 'merge-data')
    .edge('merge-data', 'load-product')
    .edge('load-product', 'sink-search')
    .build();


// =============================================================================
// MS-3: CROSS-SYSTEM ORDER SYNC
// Extract Pimcore orders → enrich with Shopify customers → transform → route by status
// =============================================================================

/**
 * Cross-system order sync pipeline.
 *
 * Extracts orders from Pimcore, enriches each with customer data from Shopify
 * (lookup by email), transforms to Vendure order format, then routes by status:
 * - new/settled orders → create in Vendure
 * - processing/shipped orders → update existing
 * - cancelled orders → cancel in Vendure
 * All branches converge to an export step for the sync report.
 *
 * Graph topology:
 *   trigger → extract-orders → enrich-customers → transform-orders → route-by-status
 *     route:settled    → load-create-orders ──┐
 *     route:processing → load-update-orders ──┼→ export-sync-report
 *     route:cancelled  → load-cancel-orders ──┘
 */
export const crossSystemOrderSync = createPipeline()
    .name('Cross-System Order Sync')
    .description('Extract Pimcore orders, enrich with Shopify customer data, route by status, sync to Vendure')
    .capabilities({ requires: ['UpdateOrder'] })

    .trigger('start', { type: 'MANUAL' })

    // Extract orders from Pimcore
    .extract('extract-orders', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/orders`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'orders',
    })

    // Enrich with Shopify customer data (lookup by email)
    .transform('enrich-customers', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${SHOPIFY_API_URL}/admin/api/2024-01/customers.json?limit=100`,
                    headers: { 'X-Shopify-Access-Token': 'shpat_test_mock_access_token_123456' },
                    target: '_shopifyCustomers',
                    cacheTtlSec: 300,
                },
            },
            {
                op: 'script',
                args: {
                    code: `
                        // Match Shopify customer by email
                        const customers = record._shopifyCustomers?.customers || [];
                        const match = customers.find(c => c.email === record.customerEmail);
                        if (match) {
                            record._shopifyCustomer = {
                                found: true,
                                shopifyId: match.id,
                                firstName: match.first_name,
                                lastName: match.last_name,
                                totalSpent: match.total_spent,
                                ordersCount: match.orders_count,
                                tags: match.tags,
                            };
                        } else {
                            record._shopifyCustomer = { found: false };
                        }
                        delete record._shopifyCustomers;
                        return record;
                    `,
                },
            },
        ],
    })

    // Transform: compute totals, format for Vendure
    .transform('transform-orders', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Compute order total from line items
                        const lines = record.lines || [];
                        const subtotal = lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
                        record.orderTotal = subtotal;
                        record.lineCount = lines.length;

                        // Determine order status bucket for routing
                        const state = record.state || '';
                        if (['PaymentSettled', 'PaymentAuthorized', 'ArrangingPayment'].includes(state)) {
                            record._routeStatus = 'settled';
                        } else if (['Shipped', 'PartiallyShipped', 'PartiallyDelivered', 'Delivered'].includes(state)) {
                            record._routeStatus = 'processing';
                        } else if (state === 'Cancelled') {
                            record._routeStatus = 'cancelled';
                        } else {
                            record._routeStatus = 'settled'; // Default: treat as new order
                        }

                        // Merge Shopify customer insights
                        const shopCustomer = record._shopifyCustomer || {};
                        record.customerNote = shopCustomer.found
                            ? 'Shopify customer (orders: ' + shopCustomer.ordersCount + ', spent: ' + shopCustomer.totalSpent + ')'
                            : 'Customer not found in Shopify';

                        delete record._shopifyCustomer;
                        return record;
                    `,
                },
            },
            { op: 'template', args: { template: 'Order ${code}: ${lineCount} items, total ${orderTotal} cents', target: 'syncSummary' } },
        ],
    })

    // Route by order status
    .route('route-by-status', {
        branches: [
            { name: 'settled', when: [{ field: '_routeStatus', cmp: 'eq', value: 'settled' }] },
            { name: 'processing', when: [{ field: '_routeStatus', cmp: 'eq', value: 'processing' }] },
            { name: 'cancelled', when: [{ field: '_routeStatus', cmp: 'eq', value: 'cancelled' }] },
        ],
    })

    // Settled orders → create in Vendure
    .transform('prepare-create', {
        operators: [
            { op: 'set', args: { path: 'syncAction', value: 'CREATE' } },
            { op: 'omit', args: { fields: ['_routeStatus'] } },
        ],
    })

    // Processing orders → update in Vendure
    .transform('prepare-update', {
        operators: [
            { op: 'set', args: { path: 'syncAction', value: 'UPDATE' } },
            { op: 'omit', args: { fields: ['_routeStatus'] } },
        ],
    })

    // Cancelled orders → cancel in Vendure
    .transform('prepare-cancel', {
        operators: [
            { op: 'set', args: { path: 'syncAction', value: 'CANCEL' } },
            { op: 'omit', args: { fields: ['_routeStatus'] } },
        ],
    })

    // Export sync report (fan-in from all 3 branches)
    .export('export-sync-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'order-sync-report.csv',
    })

    // Graph edges
    .edge('start', 'extract-orders')
    .edge('extract-orders', 'enrich-customers')
    .edge('enrich-customers', 'transform-orders')
    .edge('transform-orders', 'route-by-status')
    // Route branches
    .edge('route-by-status', 'prepare-create', 'settled')
    .edge('route-by-status', 'prepare-update', 'processing')
    .edge('route-by-status', 'prepare-cancel', 'cancelled')
    // Fan-in to export report
    .edge('prepare-create', 'export-sync-report')
    .edge('prepare-update', 'export-sync-report')
    .edge('prepare-cancel', 'export-sync-report')
    .build();


// =============================================================================
// MS-4: BI-DIRECTIONAL SYNC TRIGGER CHAIN
// Pipeline A: Pimcore → Vendure + change log export
// Pipeline B: Event-triggered → extract changed product → Meilisearch
// =============================================================================

/**
 * Pipeline A: Imports products from Pimcore into Vendure and exports a change log.
 * This pipeline's product load triggers Vendure ProductEvents, which in turn
 * trigger Pipeline B (event-driven chain).
 */
export const biDirectionalSyncA = createPipeline()
    .name('Bi-Directional Sync A: Import')
    .description('Import products from Pimcore to Vendure, export change log (triggers Pipeline B via events)')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    // Extract products from Pimcore
    .extract('extract-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    // Enrich with detail
    .transform('enrich-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    // Map to Vendure format
    .transform('map-products', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: '_titleMap' } },
            { op: 'copy', args: { source: '_detail.product.description', target: '_descMap' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },
            {
                op: 'script',
                args: {
                    code: `
                        const titleMap = record._titleMap || {};
                        record.name = typeof titleMap === 'object' ? (titleMap.en || titleMap.de || '') : String(titleMap);
                        const descMap = record._descMap || {};
                        record.description = typeof descMap === 'object' ? (descMap.en || descMap.de || '') : String(descMap || '');
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
            { op: 'omit', args: { fields: ['_detail', '_titleMap', '_descMap', 'id', 'type', 'variantCount', 'modifiedAt', 'title', 'channels', 'published', 'categoryCode'] } },
        ],
    })

    // Load to Vendure (triggers ProductEvent for Pipeline B)
    .load('load-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        translationsField: 'translations',
    })

    // Export change log
    .export('export-change-log', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'bidi-sync-import-log.csv',
    })

    // Graph edges
    .edge('start', 'extract-products')
    .edge('extract-products', 'enrich-detail')
    .edge('enrich-detail', 'map-products')
    .edge('map-products', 'load-products')
    .edge('load-products', 'export-change-log')
    .build();

/**
 * Pipeline B: Event-triggered pipeline that reacts to Vendure product changes
 * and sinks the updated product data to Meilisearch for search index refresh.
 *
 * This completes the bi-directional chain:
 *   Pimcore → Pipeline A → Vendure → ProductEvent → Pipeline B → Meilisearch
 */
export const biDirectionalSyncB = createPipeline()
    .name('Bi-Directional Sync B: Event → Search')
    .description('Event-triggered: react to Vendure product changes, sink to Meilisearch')
    .capabilities({ requires: ['ReadCatalog'] })

    // Event trigger: listens for Vendure ProductEvent
    .trigger('product-event', {
        type: 'EVENT',
        event: 'ProductEvent',
    })

    // Extract updated products from Vendure
    .extract('query-updated-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        batchSize: 50,
    })

    // Transform for search index
    .transform('build-search-doc', {
        operators: [
            { op: 'copy', args: { source: 'slug', target: 'objectID' } },
            { op: 'copy', args: { source: 'name', target: 'name' } },
            { op: 'copy', args: { source: 'description', target: 'description' } },
            { op: 'copy', args: { source: 'slug', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'truncate', args: { path: 'description', maxLength: 500 } },
            { op: 'script', args: { code: 'record.updatedAt = new Date().toISOString(); return record;' } },
            { op: 'set', args: { path: 'syncSource', value: 'bidi-event-chain' } },
        ],
    })

    // Sink to Meilisearch
    .sink('index-search', {
        adapterCode: 'meilisearch',
        indexName: 'products-bidi',
        primaryKey: 'objectID',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 50,
        languageCode: 'en',
        searchableFields: ['name', 'description', 'slug'],
        filterableFields: ['syncSource', 'enabled'],
        sortableFields: ['updatedAt'],
    })

    // Graph edges
    .edge('product-event', 'query-updated-products')
    .edge('query-updated-products', 'build-search-doc')
    .edge('build-search-doc', 'index-search')
    .build();


// =============================================================================
// MS-5: MULTI-SINK FAN-OUT
// Extract from Pimcore → transform → fan-out to Meilisearch + webhook + export
// =============================================================================

/**
 * Multi-sink fan-out pipeline demonstrating parallel output to 3 different
 * destinations from a single data source.
 *
 * Graph topology:
 *   trigger → extract → transform ──┬→ sink-meilisearch
 *                                    ├→ sink-webhook
 *                                    └→ export-backup
 *
 * Features:
 * - Single extraction from Pimcore
 * - Unified transform to search-optimized format
 * - 3 parallel sinks: Meilisearch (search), webhook (notification), CSV export (backup)
 * - Graph execution with fan-out edges
 */
export const multiSinkFanOut = createPipeline()
    .name('Multi-Sink Fan-Out')
    .description('Extract from Pimcore, transform, fan-out to Meilisearch + webhook + CSV export')
    .capabilities({ requires: ['ReadCatalog'] })
    .parallel({ maxConcurrentSteps: 3, errorPolicy: 'CONTINUE' })

    .trigger('start', { type: 'MANUAL' })

    // Extract products from Pimcore
    .extract('extract-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    // Enrich with product detail for complete data
    .transform('enrich-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    // Transform to unified output format
    .transform('transform-unified', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: '_titleMap' } },
            { op: 'copy', args: { source: '_detail.product.description', target: '_descMap' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.product.categoryCode', target: 'category' } },
            {
                op: 'script',
                args: {
                    code: `
                        const titleMap = record._titleMap || {};
                        record.name = typeof titleMap === 'object' ? (titleMap.en || titleMap.de || '') : String(titleMap);
                        const descMap = record._descMap || {};
                        record.description = typeof descMap === 'object' ? (descMap.en || descMap.de || '') : String(descMap || '');

                        // Get price from first variant
                        const variants = record._detail?.variants || [];
                        record.price = variants.length > 0 ? (variants[0].price?.EUR || 0) : 0;
                        record.variantCount = variants.length;

                        record.syncTimestamp = new Date().toISOString();
                        record.source = 'pimcore-fanout';

                        delete record._detail;
                        delete record._titleMap;
                        delete record._descMap;
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
            { op: 'omit', args: { fields: ['id', 'type', 'variantCount', 'modifiedAt', 'title', 'channels', 'published', 'categoryCode'] } },
        ],
    })

    // ── Sink 1: Meilisearch (search index) ──────────────────────────────────
    .sink('sink-meilisearch', {
        adapterCode: 'meilisearch',
        indexName: 'products-fanout',
        primaryKey: 'sku',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 50,
        languageCode: 'en',
        searchableFields: ['name', 'description', 'sku'],
        filterableFields: ['category', 'enabled', 'source'],
        sortableFields: ['price', 'syncTimestamp'],
    })

    // ── Load 2: Webhook notification via REST POST ─────────────────────────
    .load('sink-webhook', {
        adapterCode: 'restPost',
        endpoint: `${PIMCORE_API_URL}/api/webhook/notify`,
        method: 'POST',
        batchMode: 'single',
    })

    // ── Sink 3: CSV export backup ───────────────────────────────────────────
    .export('export-backup', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'pimcore-fanout-backup.csv',
    })

    // Graph edges
    .edge('start', 'extract-products')
    .edge('extract-products', 'enrich-detail')
    .edge('enrich-detail', 'transform-unified')

    // Fan-out to 3 parallel outputs
    .edge('transform-unified', 'sink-meilisearch')
    .edge('transform-unified', 'sink-webhook')
    .edge('transform-unified', 'export-backup')
    .build();
