/**
 * Catalog Pipelines - PIM sync, Magento migration, Shopify inventory sync
 *
 * These pipelines demonstrate:
 * - Full enterprise PIM catalog sync with parallel branches (P1)
 * - One-time Magento migration with human review gate (P2)
 * - Hourly Shopify inventory sync with stock-level routing (P3)
 */

import { createPipeline } from '../../../src';
import {
    getMockApiUrl,
    getMockEndpoint,
    MOCK_ROUTES,
} from '../../ports';
import {
    PIMCORE_API_CONNECTION_CODE,
    PIMCORE_API_URL,
} from '../../pimcore-api';
import {
    SHOPIFY_ADMIN_API_VERSION,
    SHOPIFY_API_CONNECTION_CODE,
} from '../../shopify-api';

// ── External API URLs ───────────────────────────────────────────────────────
const MAGENTO_API_URL = getMockApiUrl('MAGENTO');

// =============================================================================
// P1: PIM CATALOG SYNC — Full enterprise catalog sync from Pimcore mock API
// =============================================================================

/**
 * Full enterprise catalog sync: products, variants (option groups), facets,
 * facet values, collections, promotions, stock locations, inventory.
 *
 * Uses 6 parallel extraction branches with inter-step dependencies
 * (e.g., inventory depends on variants + stock locations being created first).
 *
 * Features:
 * - 3 triggers: manual, scheduled (every 4h), webhook (API key auth)
 * - 6 parallel branches: facets, categories, products, promotions, stock locations, inventory
 * - Multi-language support via translations
 * - Option groups on variants
 * - HTTP lookup enrichment for product details
 * - Graph execution with dependency edges
 */
export const pimCatalogSync = createPipeline()
    .name('PIM Catalog Sync')
    .description('Full enterprise catalog sync: products, variants (option groups), facets, facet values, collections, promotions, stock locations, inventory')
    .capabilities({
        requires: ['UpdateCatalog', 'UpdatePromotion'],
        writes: ['CATALOG', 'PROMOTIONS', 'INVENTORY'],
    })
    // Triggers
    .trigger('manual-trigger', { type: 'MANUAL' })
    .trigger('scheduled-sync', { type: 'SCHEDULE', cron: '0 */4 * * *', timezone: 'Europe/Berlin' })
    .trigger('webhook-trigger', { type: 'WEBHOOK', authentication: 'API_KEY', apiKeySecretCode: 'pimcore-webhook-key', apiKeyHeaderName: 'x-api-key' })

    // Branch 1: Facets + Facet Values
    .extract('extract-facets', {
       adapterCode: 'httpApi',
      url: `${PIMCORE_API_URL}/api/facets?includeTranslations=true`,
      method: 'GET',
        connectionCode: PIMCORE_API_CONNECTION_CODE,
      auth: {
          type: 'API_KEY',
           secretCode: 'pimcore-api-key',
            headerName: 'apiKey',
        },
        dataPath: 'facets',
    })
    .transform('map-facets', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'facetCode' } },
            { op: 'copy', args: { source: 'name', target: 'facetName' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'pick', args: { fields: ['facetCode', 'facetName', 'translations', 'values'] } },
        ],
    })
    .load('upsert-facets', {
        adapterCode: 'facetUpsert',
        strategy: 'UPSERT',
        codeField: 'facetCode',
        nameField: 'facetName',
        translationsField: 'translations',
    })
    .transform('expand-fv', {
        operators: [
            { op: 'expand', args: { path: 'values', parentFields: { facetCode: 'facetCode' } } },
        ],
    })
    .transform('map-fv', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'valueCode' } },
            { op: 'copy', args: { source: 'name', target: 'valueName' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'pick', args: { fields: ['facetCode', 'valueCode', 'valueName', 'translations'] } },
        ],
    })
    .transform('filter-fv-records', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'valueCode', cmp: 'exists' }], action: 'keep' } },
            { op: 'when', args: { conditions: [{ field: 'facetCode', cmp: 'exists' }], action: 'keep' } },
        ],
    })
    .load('upsert-fv', {
        adapterCode: 'facetValueUpsert',
        strategy: 'UPSERT',
        facetCodeField: 'facetCode',
        codeField: 'valueCode',
        nameField: 'valueName',
        translationsField: 'translations',
    })

    // Branch 2: Categories → Collections
    .extract('extract-categories', {
       adapterCode: 'httpApi',
      url: `${PIMCORE_API_URL}/api/categories?includeTranslations=true`,
      method: 'GET',
        connectionCode: PIMCORE_API_CONNECTION_CODE,
      auth: {
          type: 'API_KEY',
           secretCode: 'pimcore-api-key',
            headerName: 'apiKey',
        },
        dataPath: 'categories',
    })
    .transform('map-categories', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'slug' } },
            { op: 'copy', args: { source: 'name', target: 'collName' } },
            { op: 'copy', args: { source: 'description', target: 'collDesc' } },
            { op: 'copy', args: { source: 'parentCode', target: 'parentSlug' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'pick', args: { fields: ['slug', 'collName', 'collDesc', 'parentSlug', 'translations'] } },
        ],
    })
    .load('upsert-collections', {
        adapterCode: 'collectionUpsert',
        strategy: 'UPSERT',
        channel: '__default_channel__',
        slugField: 'slug',
        nameField: 'collName',
        descriptionField: 'collDesc',
        parentSlugField: 'parentSlug',
        translationsField: 'translations',
    })

    // Branch 3: Products + Variants (with option groups)
    .extract('extract-products', {
       adapterCode: 'httpApi',
      url: `${PIMCORE_API_URL}/api/products?limit=100&includeTranslations=true`,
      method: 'GET',
        connectionCode: PIMCORE_API_CONNECTION_CODE,
      auth: {
          type: 'API_KEY',
           secretCode: 'pimcore-api-key',
            headerName: 'apiKey',
        },
        dataPath: 'products',
    })
    .transform('enrich-detail', {
        operators: [
            {
               op: 'httpLookup',
               args: {
                  url: `${PIMCORE_API_URL}/api/products/{{id}}?includeTranslations=true`,
                    connectionCode: PIMCORE_API_CONNECTION_CODE,
                  apiKeySecretCode: 'pimcore-api-key',
                  apiKeyHeader: 'apiKey',
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })
    .transform('map-products', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.variants', target: '_variants' } },
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },
            { op: 'copy', args: { source: '_detail.product.facetCodes', target: 'facetValueCodes' } },
            // Use English name for slug (translations.en.name) so product slug matches across languages
            { op: 'copy', args: { source: 'translations.en.name', target: '_enName' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Fall back to German title if English name not available
                        if (!record._enName) record._enName = record.name;

                        // Map Pimcore channel codes to Vendure channel codes
                        // Pimcore: ['web', 'b2b'] → Vendure: ['__default_channel__']
                        const channelMap = {
                            'web': '__default_channel__',
                            'b2b': '__default_channel__',
                            'uk': 'uk-store',
                            'uk-store': 'uk-store',
                            'de': '__default_channel__',
                        };
                        const pimcoreChannels = record._detail?.product?.channels || [];
                        const vendureChannels = [...new Set(
                            pimcoreChannels.map(c => channelMap[c] || '__default_channel__')
                        )];
                        record.channels = vendureChannels.length > 0 ? vendureChannels : ['__default_channel__'];

                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: '_enName', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'omit', args: { fields: ['_detail', '_enName', 'id', 'type', 'variantCount', 'modifiedAt', 'categoryCode'] } },
        ],
    })
    .transform('filter-product-records', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'name', cmp: 'exists' }], action: 'keep' } },
            { op: 'when', args: { conditions: [{ field: 'slug', cmp: 'exists' }], action: 'keep' } },
        ],
    })
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        translationsField: 'translations',
        customFieldsField: 'customFields',
        channelsField: 'channels',
        facetValuesField: 'facetValueCodes',
        createVariants: false,
    })
    .transform('expand-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: '_variants',
                    parentFields: {
                        productSlug: 'slug',
                        productName: 'name',
                        channels: 'channels',
                    },
                },
            },
        ],
    })
    .transform('map-variants', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'title', target: 'name' } },
            { op: 'copy', args: { source: 'attributes', target: 'options' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'copy', args: { source: 'price', target: 'priceByCurrency' } },
            { op: 'validateRequired', args: { fields: ['sku'] } },
            { op: 'pick', args: { fields: ['sku', 'name', 'productSlug', 'productName', 'options', 'translations', 'priceByCurrency', 'channels'] } },
        ],
    })
    .transform('filter-variant-records', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'sku', cmp: 'exists' }], action: 'keep' } },
            { op: 'when', args: { conditions: [{ field: 'productSlug', cmp: 'exists' }], action: 'keep' } },
        ],
    })
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'name',
        priceByCurrencyField: 'priceByCurrency',
        optionGroupsField: 'options',
        translationsField: 'translations',
        channelsField: 'channels',
    })

    // Branch 4: Promotions
    .extract('extract-promotions', {
       adapterCode: 'httpApi',
      url: `${PIMCORE_API_URL}/api/promotions?includeTranslations=true`,
      method: 'GET',
        connectionCode: PIMCORE_API_CONNECTION_CODE,
      auth: {
          type: 'API_KEY',
           secretCode: 'pimcore-api-key',
            headerName: 'apiKey',
        },
        dataPath: 'promotions',
    })
    .transform('map-promotions', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'promoCode' } },
            { op: 'copy', args: { source: 'name', target: 'promoName' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Build Vendure ConfigurableOperationInput format
                        if (record.type === 'percentage' && record.discountPercent) {
                            record.actions = [{ code: 'order_percentage_discount', arguments: [{ name: 'discount', value: String(record.discountPercent) }] }];
                        } else if (record.type === 'fixed' && record.discountFixed) {
                            record.actions = [{ code: 'order_fixed_discount', arguments: [{ name: 'discount', value: String(record.discountFixed) }] }];
                        } else {
                            record.actions = [];
                        }
                        record.conditions = [];
                        if (record.minQuantity) {
                            record.conditions.push({ code: 'minimum_order_amount', arguments: [{ name: 'amount', value: String(record.minQuantity * 100) }, { name: 'taxInclusive', value: 'false' }] });
                        }
                        return record;
                    `,
                },
            },
            { op: 'pick', args: { fields: ['promoCode', 'promoName', 'enabled', 'startsAt', 'endsAt', 'conditions', 'actions', 'translations'] } },
        ],
    })
    .load('upsert-promotions', {
        adapterCode: 'promotionUpsert',
        strategy: 'UPSERT',
        codeField: 'promoCode',
        nameField: 'promoName',
        enabledField: 'enabled',
        startsAtField: 'startsAt',
        endsAtField: 'endsAt',
        conditionsField: 'conditions',
        actionsField: 'actions',
        translationsField: 'translations',
    })

    // Branch 5: Stock Locations
    .extract('extract-locations', {
        adapterCode: 'csv',
        rows: [
            { locName: 'Hauptlager', locDesc: 'Main warehouse' },
            { locName: 'Aussenlager', locDesc: 'External warehouse' },
        ],
    })
    .load('upsert-locations', {
        adapterCode: 'stockLocationUpsert',
        strategy: 'UPSERT',
        nameField: 'locName',
        descriptionField: 'locDesc',
    })

    // Branch 6: Inventory Levels
    .extract('extract-stock', {
       adapterCode: 'httpApi',
      url: `${PIMCORE_API_URL}/api/stock`,
      method: 'GET',
        connectionCode: PIMCORE_API_CONNECTION_CODE,
      auth: {
          type: 'API_KEY',
           secretCode: 'pimcore-api-key',
            headerName: 'apiKey',
        },
        dataPath: 'stock',
    })
    .transform('map-stock', {
        operators: [
            { op: 'rename', args: { from: 'qty', to: 'stockOnHand' } },
            { op: 'rename', args: { from: 'location', to: 'locationName' } },
        ],
    })
    // Fan-in guard: upsert-variants and upsert-locations edges also pass their records here,
    // so we filter to only actual stock records before adjusting inventory.
    .transform('filter-stock-records', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'stockOnHand', cmp: 'exists' }], action: 'keep' } },
            { op: 'when', args: { conditions: [{ field: 'sku', cmp: 'exists' }], action: 'keep' } },
        ],
    })
    .load('adjust-inventory', {
        adapterCode: 'inventoryAdjust',
        strategy: 'UPSERT',
        skuField: 'sku',
        stockOnHandField: 'stockOnHand',
        stockLocationNameField: 'locationName',
    })

    // Graph edges: all triggers → 6 parallel extract branches
    .edge('manual-trigger', 'extract-facets')
    .edge('manual-trigger', 'extract-categories')
    .edge('manual-trigger', 'extract-products')
    .edge('manual-trigger', 'extract-promotions')
    .edge('manual-trigger', 'extract-locations')
    .edge('manual-trigger', 'extract-stock')
    .edge('scheduled-sync', 'extract-facets')
    .edge('scheduled-sync', 'extract-categories')
    .edge('scheduled-sync', 'extract-products')
    .edge('scheduled-sync', 'extract-promotions')
    .edge('scheduled-sync', 'extract-locations')
    .edge('scheduled-sync', 'extract-stock')
    .edge('webhook-trigger', 'extract-facets')
    .edge('webhook-trigger', 'extract-categories')
    .edge('webhook-trigger', 'extract-products')
    .edge('webhook-trigger', 'extract-promotions')
    .edge('webhook-trigger', 'extract-locations')
    .edge('webhook-trigger', 'extract-stock')
    // Facets
    .edge('extract-facets', 'map-facets')
    .edge('map-facets', 'upsert-facets')
    .edge('map-facets', 'expand-fv')
    .edge('expand-fv', 'map-fv')
    .edge('map-fv', 'filter-fv-records')
    .edge('upsert-facets', 'filter-fv-records')
    .edge('filter-fv-records', 'upsert-fv')
    // Categories
    .edge('extract-categories', 'map-categories')
    .edge('map-categories', 'upsert-collections')
    // Products + Variants
    .edge('extract-products', 'enrich-detail')
    .edge('enrich-detail', 'map-products')
    .edge('map-products', 'filter-product-records')
    .edge('upsert-fv', 'filter-product-records')
    .edge('filter-product-records', 'upsert-products')
    .edge('map-products', 'expand-variants')
    .edge('expand-variants', 'map-variants')
    .edge('map-variants', 'filter-variant-records')
    .edge('upsert-products', 'filter-variant-records')
    .edge('filter-variant-records', 'upsert-variants')
    // Promotions
    .edge('extract-promotions', 'map-promotions')
    .edge('map-promotions', 'upsert-promotions')
    // Stock locations
    .edge('extract-locations', 'upsert-locations')
    // Inventory (depends on variants + locations being created first)
    // Fan-in: map-stock passes stock records; upsert-variants + upsert-locations act as dependency
    // triggers but also pass their records — filter-stock-records filters to only stock records.
    .edge('extract-stock', 'map-stock')
    .edge('map-stock', 'filter-stock-records')
    .edge('upsert-variants', 'filter-stock-records')
    .edge('upsert-locations', 'filter-stock-records')
    .edge('filter-stock-records', 'adjust-inventory')
    .build();

// =============================================================================
// P2: MAGENTO PRODUCT MIGRATION — One-time migration with human review gate
// =============================================================================

/**
 * One-time migration from Magento 2 to Vendure with human review gate.
 *
 * Extracts products from Magento REST API, validates, flattens EAV attributes,
 * enriches with defaults, pauses for human approval, then loads into Vendure.
 *
 * Features:
 * - Bearer token authentication
 * - Offset-based pagination (Magento search criteria)
 * - EAV attribute flattening via script operator
 * - Validation with accumulate mode
 * - GATE step for manual review before import
 * - Migration report export
 */
export const magentoProductMigration = createPipeline()
    .name('Magento Product Migration')
    .description('One-time migration from Magento 2 to Vendure with human review gate')
    .capabilities({ requires: ['UpdateCatalog'], writes: ['CATALOG'] })

    // Manual trigger — one-time migration
    .trigger('manual', { type: 'MANUAL' })

    // Extract products from Magento REST API
    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: `${MAGENTO_API_URL}/rest/V1/products`,
        method: 'GET',
        auth: { type: 'BEARER', secretCode: 'magento-bearer-token' },
        dataPath: 'items',
        pagination: {
            type: 'PAGE',
            pageParam: 'searchCriteria[currentPage]',
            pageSizeParam: 'searchCriteria[pageSize]',
            limit: 50,
        },
    })

    // Validate required fields and data quality
    .validate('check-data', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU is required' } },
            { type: 'business', spec: { field: 'name', required: true, error: 'Product name is required' } },
            { type: 'business', spec: { field: 'price', required: true, min: 0.01, error: 'Price must be at least 0.01' } },
            { type: 'business', spec: { field: 'sku', pattern: '^[A-Z0-9-]+$', error: 'SKU must be uppercase alphanumeric with dashes' } },
        ],
    })

    // Flatten Magento EAV custom_attributes + transform fields
    .transform('flatten-eav', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Flatten Magento custom_attributes array into top-level fields
                        record.custom_attributes?.forEach(attr => {
                            record[attr.attribute_code] = attr.value;
                        });
                        delete record.custom_attributes;
                        return record;
                    `,
                },
            },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'template', args: { template: 'Imported from Magento: ${name}', target: 'importNote' } },
        ],
    })

    // Enrich with default values
    .enrich('add-defaults', {
        sourceType: 'STATIC',
        defaults: {
            taxCategoryName: 'standard-tax',
        },
        set: {
            importSource: 'magento',
            enabled: true,
        },
        computed: {
            slug: '${slug}',
        },
    })

    // Human review gate — pause for manual approval
    .gate('review-gate', {
        approvalType: 'MANUAL',
        previewCount: 10,
    })

    // Map to Vendure product fields
    .transform('map-to-vendure', {
        operators: [
            { op: 'copy', args: { source: 'sku', target: 'sku' } },
            { op: 'copy', args: { source: 'name', target: 'productName' } },
            { op: 'copy', args: { source: 'slug', target: 'productSlug' } },
            { op: 'copy', args: { source: 'description', target: 'productDescription' } },
            { op: 'pick', args: { fields: ['sku', 'productName', 'price', 'productSlug', 'productDescription', 'enabled', 'importSource', 'taxCategoryName'] } },
        ],
    })

    // Upsert products into Vendure
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        nameField: 'productName',
        slugField: 'productSlug',
        descriptionField: 'productDescription',
        enabledField: 'enabled',
        skuField: 'sku',
        priceField: 'price',
    })

    // Export migration report
    .export('migration-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'magento-migration-report.csv',
    })

    // Linear graph: manual → fetch → validate → transform → enrich → gate → map → load → export
    .edge('manual', 'fetch-products')
    .edge('fetch-products', 'check-data')
    .edge('check-data', 'flatten-eav')
    .edge('flatten-eav', 'add-defaults')
    .edge('add-defaults', 'review-gate')
    .edge('review-gate', 'map-to-vendure')
    .edge('map-to-vendure', 'upsert-products')
    .edge('upsert-products', 'migration-report')
    .build();

// =============================================================================
// P3: SHOPIFY INVENTORY SYNC — Hourly sync with stock-level routing
// =============================================================================

/**
 * Hourly inventory sync from Shopify with routing by stock level.
 *
 * Extracts products from Shopify Admin API, expands variants, then routes
 * records by stock level: normal stock gets adjusted, low stock gets adjusted
 * AND triggers an alert webhook, out-of-stock gets exported to a report.
 *
 * Features:
 * - Scheduled trigger (hourly cron)
 * - Shopify cursor-based pagination
 * - X-Shopify-Access-Token header auth
 * - Variant expansion with parent field carry-over
 * - ROUTE step with 3 branches based on stockOnHand
 * - Graph execution with branching edges
 */
export const shopifyInventorySync = createPipeline()
    .name('Shopify Inventory Sync')
    .description('Hourly inventory sync from Shopify with routing by stock level')
    .capabilities({
        requires: ['UpdateCatalog', 'UpdateDataHubSettings'],
        writes: ['INVENTORY', 'CUSTOM'],
    })

    // Hourly schedule
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 * * * *',
        timezone: 'UTC',
    })

    // Extract products from Shopify Admin API
    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: `/admin/api/${SHOPIFY_ADMIN_API_VERSION}/products.json`,
        method: 'GET',
        connectionCode: SHOPIFY_API_CONNECTION_CODE,
        dataPath: 'products',
        pagination: {
            type: 'LINK_HEADER',
            limit: 50,
        },
    })

    // Validate the product envelope before expanding variants
    .validate('check-products', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'variants', required: true, error: 'Variants are required' } },
        ],
    })

    // Expand variants and prepare stock fields
    .transform('prepare-stock', {
        operators: [
            { op: 'expand', args: { path: 'variants', parentFields: { productTitle: 'title' } } },
            { op: 'toNumber', args: { source: 'inventory_quantity', target: 'stockOnHand' } },
            { op: 'pick', args: { fields: ['sku', 'stockOnHand', 'productTitle', 'inventory_item_id'] } },
        ],
    })

    // Shopify product SKUs live on variants, so validate after expansion.
    .validate('check-variants', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'Variant SKU is required' } },
            { type: 'business', spec: { field: 'stockOnHand', required: true, min: 0, error: 'Variant stock is required' } },
        ],
    })

    // Route by stock level
    .route('stock-level-route', {
        branches: [
            {
                name: 'normal-stock',
                when: [{ field: 'stockOnHand', cmp: 'gt' , value: 10 }],
            },
            {
                name: 'low-stock',
                when: [
                    { field: 'stockOnHand', cmp: 'gt' , value: 0 },
                    { field: 'stockOnHand', cmp: 'lte' , value: 10 },
                ],
            },
            {
                name: 'out-of-stock',
                when: [{ field: 'stockOnHand', cmp: 'eq' , value: 0 }],
            },
        ],
    })

    // Adjust stock in Vendure (for normal-stock and low-stock branches)
    .load('adjust-stock', {
        adapterCode: 'inventoryAdjust',
        strategy: 'UPSERT',
        skuField: 'sku',
        stockOnHandField: 'stockOnHand',
    })

    // Alert webhook for low-stock items
    .load('alert-low-stock', {
        adapterCode: 'restPost',
        endpoint: getMockEndpoint('EDGE_CASE', MOCK_ROUTES.EDGE_WEBHOOK),
        method: 'POST',
        batchMode: 'single',
    })

    // Out-of-stock report export
    .export('oos-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'out-of-stock-report.csv',
    })

    // Graph edges
    .edge('schedule', 'fetch-products')
    .edge('fetch-products', 'check-products')
    .edge('check-products', 'prepare-stock')
    .edge('prepare-stock', 'check-variants')
    .edge('check-variants', 'stock-level-route')
    .edge('stock-level-route', 'adjust-stock', 'normal-stock')
    .edge('stock-level-route', 'adjust-stock', 'low-stock')
    .edge('stock-level-route', 'alert-low-stock', 'low-stock')
    .edge('stock-level-route', 'oos-report', 'out-of-stock')
    .build();
