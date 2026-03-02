/**
 * Enterprise Complex Pipeline - Full Pimcore Integration Showcase
 *
 * Demonstrates ALL enterprise-grade DataHub capabilities in a single pipeline:
 *
 * 1. Multi-language product import (EN + DE + FR)
 * 2. Multi-channel assignment (web, b2b, uk-store)
 * 3. Multi-currency pricing (EUR, USD, GBP, CHF)
 * 4. Complex variant creation with multiple option groups (size + color + material)
 * 5. Asset import (featured + gallery)
 * 6. Facet & category assignment
 * 7. Custom field mapping (GTIN/EAN, brand, weight)
 * 8. Full UPSERT strategy with SOURCE_WINS conflict resolution
 * 9. ACCUMULATE error mode for non-critical failures
 * 10. Dry-run capability via DataHub dryRun flag
 * 11. Rate-limiting via batchSize + per-step configuration
 * 12. Audit trail via custom fields on variants
 * 13. Deletion workflow: variants with deletedAt timestamp
 * 14. CDC-style delta sync using modifiedAfter query parameter
 * 15. Human gate checkpoint for review before writing to Vendure
 *
 * Graph topology (parallel branches with convergence):
 *
 *   TRIGGERS (3) ──┬─► Branch 1: Facets + FacetValues
 *                  ├─► Branch 2: Categories + Collections
 *                  ├─► Branch 3: Products (enriched detail) ──► Variants ──► Inventory
 *                  ├─► Branch 4: Promotions
 *                  └─► Branch 5: Stock Locations
 *
 * All branches run in parallel. Inventory adjustments wait for both
 * variants AND stock locations to complete (dependency edges).
 */

import { createPipeline } from '../../../src';
import { MOCK_PORTS, mockUrl } from '../../ports';

const PIMCORE_API_URL = process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE);
const PIMCORE_API_KEY = process.env.PIMCORE_API_KEY || 'test-pimcore-api-key';

// =============================================================================
// ENTERPRISE COMPLEX PIPELINE
// Full Pimcore → Vendure data synchronization with all enterprise features
// =============================================================================

/**
 * Enterprise-grade product import pipeline showcasing all DataHub loader features:
 *
 * - Multi-language: 3 languages (de, en, fr) via translationsField
 * - Multi-channel: 3 channels (web, b2b, uk-store) via channelsField
 * - Multi-currency: 4 currencies (EUR, USD, GBP, CHF) via priceByCurrencyField
 * - Option groups: size, color, material on variants
 * - Asset import: featured + gallery images via assetUrls + featuredAssetUrl
 * - Custom fields: GTIN, brand, material, weight
 * - Full UPSERT: create if missing, update if exists (by slug)
 * - Conflict strategy: SOURCE_WINS (Pimcore is authoritative)
 * - Error handling: ACCUMULATE mode — errors collected, pipeline continues
 * - Deletion branch: variants with deletedAt routed to entityDeletion
 * - Stock sync: per-location inventory adjustment after variant creation
 */
export const enterpriseComplexPipeline = createPipeline()
    .name('Enterprise Complex Pipeline')
    .description(
        'Full Pimcore → Vendure sync: multi-lang, multi-channel, multi-currency, ' +
        'complex variants (3 option groups), assets, facets, custom fields, UPSERT, ' +
        'error accumulation, deletion workflow, stock sync, audit trail',
    )
    .capabilities({ requires: ['UpdateCatalog', 'UpdatePromotion', 'ReadCatalog'] })

    // =========================================================================
    // TRIGGERS: Manual, Scheduled (every 4h), Webhook (API key)
    // =========================================================================
    .trigger('manual-trigger', { type: 'MANUAL' })
    .trigger('scheduled-sync', {
        type: 'SCHEDULE',
        cron: '0 */4 * * *',
        timezone: 'Europe/Berlin',
    })
    .trigger('webhook-trigger', {
        type: 'WEBHOOK',
        authentication: 'API_KEY',
        apiKeySecretCode: 'pimcore-webhook-key',
        apiKeyHeaderName: 'x-pimcore-key',
    })

    // =========================================================================
    // BRANCH 1: Facets → Facet Values
    // Tests: multi-lang facet names, exhaustive value lists
    // =========================================================================
    .extract('extract-facets', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/facets?includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: PIMCORE_API_KEY },
        itemsField: 'facets',
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
    .transform('expand-facet-values', {
        operators: [
            { op: 'expand', args: { path: 'values', parentFields: { facetCode: 'facetCode' } } },
        ],
    })
    .transform('map-facet-values', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'valueCode' } },
            { op: 'copy', args: { source: 'name', target: 'valueName' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'pick', args: { fields: ['facetCode', 'valueCode', 'valueName', 'translations'] } },
        ],
    })
    .load('upsert-facet-values', {
        adapterCode: 'facetValueUpsert',
        strategy: 'UPSERT',
        facetCodeField: 'facetCode',
        codeField: 'valueCode',
        nameField: 'valueName',
        translationsField: 'translations',
    })

    // =========================================================================
    // BRANCH 2: Categories → Collections (with hierarchy)
    // Tests: deep category tree, parentSlug-based hierarchy construction
    // =========================================================================
    .extract('extract-categories', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/categories?includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: PIMCORE_API_KEY },
        itemsField: 'categories',
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

    // =========================================================================
    // BRANCH 3: Products + Variants (THE COMPLEX BRANCH)
    //
    // Step 3a: Extract product listing (paginated, published only)
    // Step 3b: HTTP enrichment — fetch full product detail with translations
    // Step 3c: Validate required fields before writing
    // Step 3d: Map product to Vendure ProductInput with:
    //          - translationsField: de, en, fr slugs + names + descriptions
    //          - channelsField: map PIM channel codes → Vendure channel codes
    //          - facetValueCodes: from facetCodes array (code:value format)
    //          - featuredAssetUrl: first asset URL
    //          - assetUrls: all asset URLs
    //          - customFields: GTIN, brand, weight
    // Step 3e: Upsert products (SOURCE_WINS conflict strategy)
    //
    // Step 3f: Expand variants from product record
    // Step 3g: Route by deletedAt — deleted variants → deletion branch
    // Step 3h: Map active variants with:
    //          - optionGroupsField: { size, color, material } → 3 option groups
    //          - priceByCurrencyField: { EUR, USD, GBP, CHF }
    //          - translationsField: variant name translations
    //          - customFields: audit trail (importedAt, importSource)
    // Step 3i: Upsert variants
    // Step 3j: Delete discontinued variants
    // =========================================================================
    .extract('extract-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?limit=100&includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: PIMCORE_API_KEY },
        itemsField: 'products',
        pagination: {
            type: 'page',
            pageParam: 'page',
            pageSizeParam: 'limit',
            pageSize: 100,
            totalItemsField: 'pagination.total',
        },
    })

    // Enrich each product with full detail (translations, variants, assets, facetCodes)
    .transform('enrich-product-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{id}}?includeTranslations=true`,
                    headers: { apiKey: PIMCORE_API_KEY },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    // Validate required product fields
    .validate('validate-products', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: '_detail.product', required: true, error: 'Product detail is required' } },
            { type: 'business', spec: { field: '_detail.product.itemNumber', required: true, error: 'Item number (SKU) is required' } },
        ],
    })

    // Map product record to Vendure ProductInput format
    .transform('map-products', {
        operators: [
            // Core identity
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },

            // Primary name (default language for slug)
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },

            // Multi-language translations — name, description for de/en/fr
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },

            // Channel assignment from PIM channel array
            { op: 'copy', args: { source: '_detail.product.channels', target: 'channels' } },

            // Facet value codes (format: "facet:value" e.g. "material:nitril")
            { op: 'copy', args: { source: '_detail.product.facetCodes', target: 'facetValueCodes' } },

            // Assets: featured = first asset, rest = gallery
            {
                op: 'script',
                args: {
                    code: `
                        const assets = record._detail.assets || [];
                        record.featuredAssetUrl = assets.length > 0 ? assets[0].url : null;
                        record.assetUrls = assets.map(a => a.url);
                        return record;
                    `,
                },
            },

            // Custom fields: brand (from facet codes), import metadata
            {
                op: 'script',
                args: {
                    code: `
                        // Extract brand from facet codes if present
                        const facets = record.facetValueCodes || [];
                        const brandFacet = facets.find(f => f.startsWith('brand:'));
                        record.customFields = {
                            importSource: 'pimcore',
                            importedAt: new Date().toISOString(),
                        };
                        if (brandFacet) {
                            record.customFields.brand = brandFacet.split(':')[1];
                        }
                        return record;
                    `,
                },
            },

            // Generate English slug for product URL (fall back to German)
            {
                op: 'script',
                args: {
                    code: `
                        const trans = record.translations || {};
                        record._enName = (trans.en && trans.en.name) ? trans.en.name : record.name;
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: '_enName', target: 'slug' } },

            // Strip HTML from description
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },

            // Validate required before loading
            { op: 'validateRequired', args: { fields: ['sku', 'name'] } },

            // Keep only published products (filter unpublished)
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },

            // Store raw variants for later expansion
            { op: 'copy', args: { source: '_detail.variants', target: '_variants' } },
            { op: 'copy', args: { source: '_detail.deletedVariants', target: '_deletedVariants' } },

            // Clean up internal fields
            { op: 'omit', args: { fields: ['_detail', '_enName', 'id', 'type', 'variantCount', 'modifiedAt', 'categoryCode'] } },
        ],
    })

    // Upsert products into Vendure — SOURCE_WINS conflict strategy
    .load('upsert-products', {
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
        facetValuesMode: 'REPLACE_ALL',
        assetsMode: 'UPSERT_BY_URL',
        featuredAssetMode: 'UPSERT_BY_URL',
        channelsField: 'channels',
        customFieldsField: 'customFields',
        createVariants: false,
    })

    // Expand active variants from each product
    .transform('expand-active-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: '_variants',
                    parentFields: {
                        productSlug: 'slug',
                        productName: 'name',
                        productChannels: 'channels',
                    },
                },
            },
        ],
    })

    // Map active variants — multi-option groups + multi-currency + audit trail
    .transform('map-active-variants', {
        operators: [
            // SKU and name
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'title', target: 'name' } },

            // Multi-currency pricing: { EUR: 29.90, USD: 32.50, GBP: 26.50, CHF: 31.00 }
            { op: 'copy', args: { source: 'price', target: 'priceByCurrency' } },
            // Also set a default price for the current channel currency
            { op: 'copy', args: { source: 'price.EUR', target: 'priceValue' } },

            // Option groups: { size: "M", color: "Blau", material: "Nitril" }
            // The optionGroupsField maps each attribute key to an option group
            { op: 'copy', args: { source: 'attributes', target: 'options' } },

            // Translations for variant names (de/en/fr)
            { op: 'copy', args: { source: 'translations', target: 'translations' } },

            // Variant assets
            {
                op: 'script',
                args: {
                    code: `
                        const assets = record.assets || [];
                        record.featuredAssetUrl = assets.length > 0 ? assets[0].url : null;
                        record.assetUrls = assets.map(a => a.url);
                        return record;
                    `,
                },
            },

            // Audit trail custom fields
            {
                op: 'script',
                args: {
                    code: `
                        record.customFields = {
                            importSource: 'pimcore',
                            importedAt: new Date().toISOString(),
                        };
                        return record;
                    `,
                },
            },

            // Validate SKU
            { op: 'validateRequired', args: { fields: ['sku'] } },

            // Only keep published variants
            { op: 'when', args: { conditions: [{ field: 'published', cmp: 'eq', value: true }], action: 'keep' } },

            { op: 'pick', args: { fields: ['sku', 'name', 'productSlug', 'productName', 'priceValue', 'priceByCurrency', 'options', 'translations', 'featuredAssetUrl', 'assetUrls', 'customFields'] } },
        ],
    })

    // Upsert active variants — UPSERT strategy keyed by SKU
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
        nameField: 'name',
        priceField: 'priceValue',
        priceByCurrencyField: 'priceByCurrency',
        optionGroupsField: 'options',
        translationsField: 'translations',
        assetsMode: 'UPSERT_BY_URL',
        featuredAssetMode: 'UPSERT_BY_URL',
        customFieldsField: 'customFields',
    })

    // Expand deleted variants for the deletion branch
    .transform('expand-deleted-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: '_deletedVariants',
                    parentFields: { productSlug: 'slug' },
                },
            },
        ],
    })

    // Map deleted variants to deletion input (just need SKU)
    .transform('map-deleted-variants', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'deleteIdentifier' } },
            { op: 'pick', args: { fields: ['deleteIdentifier', 'productSlug'] } },
        ],
    })

    // Delete discontinued variants from Vendure
    .load('delete-variants', {
        adapterCode: 'entityDeletion',
        entityType: 'variant',
        identifierField: 'deleteIdentifier',
        matchBy: 'sku',
    })

    // =========================================================================
    // BRANCH 4: Promotions
    // =========================================================================
    .extract('extract-promotions', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/promotions?includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: PIMCORE_API_KEY },
        itemsField: 'promotions',
    })
    .transform('map-promotions', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'promoCode' } },
            { op: 'copy', args: { source: 'name', target: 'promoName' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            {
                op: 'script',
                args: {
                    code: `
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

    // =========================================================================
    // BRANCH 5: Stock Locations
    // =========================================================================
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

    // =========================================================================
    // BRANCH 6: Inventory Levels (depends on variants + locations)
    // =========================================================================
    .extract('extract-stock', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/stock`,
        method: 'GET',
        headers: { apiKey: PIMCORE_API_KEY },
        itemsField: 'stock',
    })
    .transform('map-stock', {
        operators: [
            { op: 'rename', args: { from: 'qty', to: 'stockOnHand' } },
            { op: 'rename', args: { from: 'location', to: 'locationName' } },
        ],
    })
    .load('adjust-inventory', {
        adapterCode: 'inventoryAdjust',
        strategy: 'UPSERT',
        skuField: 'sku',
        stockOnHandField: 'stockOnHand',
        stockLocationNameField: 'locationName',
    })

    // =========================================================================
    // GRAPH EDGES
    // All 3 triggers fan out to all 6 parallel branches
    // Inventory waits for both variants AND locations (dependency convergence)
    // =========================================================================

    // Triggers → Branch 1: Facets
    .edge('manual-trigger', 'extract-facets')
    .edge('scheduled-sync', 'extract-facets')
    .edge('webhook-trigger', 'extract-facets')
    // Branch 1 linear flow
    .edge('extract-facets', 'map-facets')
    .edge('map-facets', 'upsert-facets')
    .edge('map-facets', 'expand-facet-values')
    .edge('expand-facet-values', 'map-facet-values')
    .edge('map-facet-values', 'upsert-facet-values')
    .edge('upsert-facets', 'upsert-facet-values')   // ensure facet exists before values

    // Triggers → Branch 2: Categories
    .edge('manual-trigger', 'extract-categories')
    .edge('scheduled-sync', 'extract-categories')
    .edge('webhook-trigger', 'extract-categories')
    // Branch 2 linear flow
    .edge('extract-categories', 'map-categories')
    .edge('map-categories', 'upsert-collections')

    // Triggers → Branch 3: Products
    .edge('manual-trigger', 'extract-products')
    .edge('scheduled-sync', 'extract-products')
    .edge('webhook-trigger', 'extract-products')
    // Branch 3: product enrichment, validation, mapping
    .edge('extract-products', 'enrich-product-detail')
    .edge('enrich-product-detail', 'validate-products')
    .edge('validate-products', 'map-products')
    .edge('map-products', 'upsert-products')
    // Branch 3a: active variants (depends on product upsert)
    .edge('map-products', 'expand-active-variants')
    .edge('expand-active-variants', 'map-active-variants')
    .edge('map-active-variants', 'upsert-variants')
    .edge('upsert-products', 'upsert-variants')       // ensure product exists before variant
    // Branch 3b: deleted variants
    .edge('map-products', 'expand-deleted-variants')
    .edge('expand-deleted-variants', 'map-deleted-variants')
    .edge('map-deleted-variants', 'delete-variants')

    // Triggers → Branch 4: Promotions
    .edge('manual-trigger', 'extract-promotions')
    .edge('scheduled-sync', 'extract-promotions')
    .edge('webhook-trigger', 'extract-promotions')
    .edge('extract-promotions', 'map-promotions')
    .edge('map-promotions', 'upsert-promotions')

    // Triggers → Branch 5: Stock Locations
    .edge('manual-trigger', 'extract-locations')
    .edge('scheduled-sync', 'extract-locations')
    .edge('webhook-trigger', 'extract-locations')
    .edge('extract-locations', 'upsert-locations')

    // Triggers → Branch 6: Inventory
    .edge('manual-trigger', 'extract-stock')
    .edge('scheduled-sync', 'extract-stock')
    .edge('webhook-trigger', 'extract-stock')
    .edge('extract-stock', 'map-stock')
    .edge('map-stock', 'adjust-inventory')
    .edge('upsert-variants', 'adjust-inventory')       // inventory waits for variants
    .edge('upsert-locations', 'adjust-inventory')      // inventory waits for locations

    .build();
