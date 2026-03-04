/**
 * Sink & Feed Pipelines - Multi-engine search indexing and multi-marketplace feed export
 *
 * These pipelines demonstrate:
 * - P11: Search index sync to 5 engines (Meilisearch, Elasticsearch, OpenSearch, Algolia, Typesense)
 *        with multi-language indexing (separate indices per language using languageCode + index templating)
 * - P12: Multi-marketplace product feed export (Google Merchant, Meta Catalog, Amazon, Custom JSON + CSV backup)
 *        with localized feed output (languageCode flattens translations before feed generation)
 * - P13: Operation-aware CRUD sync — event trigger injects __operation (CREATE/UPDATE/DELETE),
 *        sink executor partitions records to upsert vs delete APIs automatically
 */

import { createPipeline } from '../../../src';

// =============================================================================
// P11: SEARCH INDEX SYNC — Multi-engine search indexing
// =============================================================================

/**
 * Search index sync pipeline: extracts product variants from Vendure and indexes
 * them to multiple search engines simultaneously via parallel SINK steps.
 *
 * Features:
 * - Dual triggers: manual + scheduled every 6 hours
 * - Vendure query extraction with rich relations (product, facets, assets, stock)
 * - Validation of required indexing fields (SKU, product name)
 * - Script transform to build search-optimized document with facet flattening
 * - Multi-language indexing: separate Meilisearch indices per language (en/de)
 *   using languageCode to flatten translations + ${languageCode} index templating
 * - Meilisearch settings API: configures searchable, filterable, and sortable fields
 * - Channel filtering: Algolia sink filtered to default channel
 * - 6 parallel sinks: 2x Meilisearch (en/de), Elasticsearch, OpenSearch, Algolia, Typesense
 * - Graph execution with fan-out from transform to all 6 sinks
 */
export const searchIndexSync = createPipeline()
    .name('Search Index Sync')
    .description('Sync product catalog to Meilisearch (en/de), Elasticsearch, OpenSearch, Algolia, and Typesense')
    .capabilities({ requires: ['ReadCatalog'] })
    .parallel({ maxConcurrentSteps: 6, errorPolicy: 'CONTINUE' })

    // Two triggers
    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', { type: 'SCHEDULE', cron: '0 */6 * * *', timezone: 'UTC' })

    // Extract with rich relations — flattenTranslations=false preserves the raw translations
    // array so each sink can flatten to its own languageCode independently
    .extract('query-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations,product.facetValues,featuredAsset,stockLevels,facetValues,facetValues.facet,productVariantPrices',
        flattenTranslations: false,
        batchSize: 200,
    })

    // Validate — only check SKU since product name lives in translations array
    // (flattenTranslations=false preserves raw translations for per-sink language flattening)
    .validate('check-required', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU required for indexing' } },
            { type: 'business', spec: { field: 'product', required: true, error: 'Product relation required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    // Transform: build search-optimized document, preserving translations for per-sink flattening
    .transform('build-search-doc', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Helper: extract translated fields from a translations array
                        function buildTranslations(variantTranslations, productTranslations) {
                            const langMap = {};
                            // Product-level translations (name, slug, description)
                            for (const t of (productTranslations || [])) {
                                const lang = t.languageCode || 'en';
                                if (!langMap[lang]) langMap[lang] = { languageCode: lang };
                                langMap[lang].name = t.name || '';
                                langMap[lang].slug = t.slug || '';
                                langMap[lang].description = (t.description || '').replace(/<[^>]*>/g, '').slice(0, 500);
                            }
                            // Variant-level translations: store as variantName (don't override product name)
                            for (const t of (variantTranslations || [])) {
                                const lang = t.languageCode || 'en';
                                if (!langMap[lang]) langMap[lang] = { languageCode: lang };
                                if (t.name) langMap[lang].variantName = t.name;
                            }
                            return Object.values(langMap);
                        }

                        const doc = {
                            objectID: record.sku,
                            sku: record.sku,
                            price: (record.priceWithTax || record.price || 0) / 100,
                            currency: record.currencyCode || 'EUR',
                            image: record.featuredAsset?.preview || '',
                            inStock: (record.stockLevels || []).some(sl => sl.stockOnHand > 0),
                            stockLevel: (record.stockLevels || []).reduce((sum, sl) => sum + (sl.stockOnHand || 0), 0),
                            facets: {},
                            categories: [],
                            updatedAt: new Date().toISOString(),
                            // Preserve translations array for per-sink languageCode flattening
                            translations: buildTranslations(record.translations, record.product?.translations),
                        };
                        for (const fv of (record.facetValues || [])) {
                            const facetName = fv.facet?.code || fv.code || 'unknown';
                            if (!doc.facets[facetName]) doc.facets[facetName] = [];
                            doc.facets[facetName].push(fv.code);
                        }
                        for (const fv of (record.product?.facetValues || [])) {
                            const facetName = fv.code || 'unknown';
                            if (!doc.facets[facetName]) doc.facets[facetName] = [];
                            if (!doc.facets[facetName].includes(fv.code)) doc.facets[facetName].push(fv.code);
                        }
                        return doc;
                    `,
                },
            },
        ],
    })

    // SINK 1a: Meilisearch (English) — languageCode flattens translations, index name templated
    .sink('index-meili-en', {
        adapterCode: 'meilisearch',
        indexName: 'products-${languageCode}',
        primaryKey: 'objectID',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 100,
        languageCode: 'en',
        channelCode: '__default_channel__',
        searchableFields: ['name', 'description', 'sku'],
        filterableFields: ['inStock', 'currency', 'categories'],
        sortableFields: ['price', 'updatedAt'],
    })

    // SINK 1b: Meilisearch (German) — same index settings, different language
    .sink('index-meili-de', {
        adapterCode: 'meilisearch',
        indexName: 'products-${languageCode}',
        primaryKey: 'objectID',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 100,
        languageCode: 'de',
        channelCode: '__default_channel__',
        searchableFields: ['name', 'description', 'sku'],
        filterableFields: ['inStock', 'currency', 'categories'],
        sortableFields: ['price', 'updatedAt'],
    })

    // SINK 2: Elasticsearch
    .sink('index-elasticsearch', {
        adapterCode: 'elasticsearch',
        indexName: 'products',
        idField: 'objectID',
        node: 'http://localhost:9200',
        apiKeySecretCode: 'elasticsearch-api-key',
        bulkSize: 200,
        languageCode: 'en',
    })

    // SINK 3: OpenSearch
    .sink('index-opensearch', {
        adapterCode: 'opensearch',
        indexName: 'products',
        idField: 'objectID',
        node: 'http://localhost:9201',
        basicSecretCode: 'opensearch-basic-auth',
        bulkSize: 200,
        languageCode: 'en',
    })

    // SINK 4: Algolia (English, filtered to default channel)
    .sink('index-algolia', {
        adapterCode: 'algolia',
        indexName: 'products',
        idField: 'objectID',
        appId: 'demo-algolia-app-id',
        apiKeySecretCode: 'algolia-api-key',
        bulkSize: 100,
        languageCode: 'en',
        channelCode: '__default_channel__',
    })

    // SINK 5: Typesense
    .sink('index-typesense', {
        adapterCode: 'typesense',
        indexName: 'products',
        collectionName: 'products',
        idField: 'objectID',
        host: 'http://localhost:8108',
        port: 8108,
        apiKeySecretCode: 'typesense-api-key',
        bulkSize: 40,
        languageCode: 'en',
    })

    // Graph: triggers → extract → validate → transform → 6 parallel sinks (2 Meili + 4 others)
    .edge('manual', 'query-variants')
    .edge('schedule', 'query-variants')
    .edge('query-variants', 'check-required')
    .edge('check-required', 'build-search-doc')
    .edge('build-search-doc', 'index-meili-en')
    .edge('build-search-doc', 'index-meili-de')
    .edge('build-search-doc', 'index-elasticsearch')
    .edge('build-search-doc', 'index-opensearch')
    .edge('build-search-doc', 'index-algolia')
    .edge('build-search-doc', 'index-typesense')

    .build();

// =============================================================================
// P12: MULTI-FEED EXPORT — Multi-marketplace product feed generation
// =============================================================================

/**
 * Multi-marketplace product feed export: generates feeds for Google Merchant,
 * Meta Catalog, Amazon, and a custom marketplace, plus a CSV backup export.
 *
 * Features:
 * - Dual triggers: manual + daily schedule at 3 AM Berlin time
 * - Vendure query extraction with translations and facet values
 * - Validation of required feed fields (SKU, name, price)
 * - Script transforms for availability detection, category extraction, price formatting
 * - 4 parallel feeds: Google Merchant (XML), Meta Catalog (CSV), Amazon (XML), Custom (JSON)
 * - 1 CSV backup export of all feed data
 * - Graph execution with fan-out from price formatting to all feeds + export
 */
export const multiFeedExport = createPipeline()
    .name('Multi-Feed Export')
    .description('Generate product feeds for Google Merchant, Meta Catalog, Amazon, and custom marketplace')
    .capabilities({ requires: ['ReadCatalog'] })
    .parallel({ maxConcurrentSteps: 5, errorPolicy: 'CONTINUE' })

    // Two triggers
    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', { type: 'SCHEDULE', cron: '0 3 * * *', timezone: 'Europe/Berlin' })

    // Extract all product variants with relations
    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations,featuredAsset,stockLevels,facetValues,productVariantPrices',
        batchSize: 100,
    })

    // Validate
    .validate('check-feed', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU required' } },
            { type: 'business', spec: { field: 'product.name', required: true, error: 'Product name required' } },
            { type: 'business', spec: { field: 'priceWithTax', required: true, min: 1, error: 'Price required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    // Transform: map to common feed fields
    .transform('map-feed-fields', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'copy', args: { source: 'sku', target: 'id' } },
            { op: 'copy', args: { source: 'product.name', target: 'title' } },
            { op: 'copy', args: { source: 'product.description', target: 'description' } },
            { op: 'copy', args: { source: 'product.slug', target: 'slug' } },
            { op: 'copy', args: { source: 'featuredAsset.preview', target: 'imageUrl' } },
            { op: 'copy', args: { source: 'priceWithTax', target: '_rawPrice' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'template', args: { template: 'https://shop.example.com/products/${slug}', target: 'link' } },
            {
                op: 'script',
                args: {
                    code: `
                        const stockLevel = (record.stockLevels || []).reduce((sum, sl) => sum + (sl.stockOnHand || 0), 0);
                        record.availability = stockLevel > 0 ? 'in_stock' : 'out_of_stock';
                        record.stockOnHand = stockLevel;
                        record.condition = 'new';
                        record.brand = 'DataHub Store';
                        record.gtin = record.sku.replace(/[^0-9]/g, '').padStart(13, '0');
                        // Extract category from facet values
                        const categoryFv = (record.facetValues || []).find(fv => fv.facet?.code === 'category');
                        record.category = categoryFv ? categoryFv.name : 'General';
                        return record;
                    `,
                },
            },
        ],
    })

    // Transform: format prices for feed output
    .transform('format-prices', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        const price = record._rawPrice || 0;
                        record.price = (price / 100).toFixed(2);
                        record.priceFormatted = record.price + ' EUR';
                        record.salePrice = (price * 0.9 / 100).toFixed(2) + ' EUR';
                        delete record._rawPrice;
                        return record;
                    `,
                },
            },
            { op: 'truncate', args: { path: 'title', maxLength: 150 } },
            { op: 'truncate', args: { path: 'description', maxLength: 5000 } },
        ],
    })

    // FEED 1: Google Merchant (XML) — languageCode flattens translations to German
    // titleField/imageField must match the field names produced by map-feed-fields transform
    .feed('feed-google', {
        adapterCode: 'googleMerchant',
        outputPath: './feeds/google-shopping.xml',
        format: 'XML',
        storeUrl: 'https://shop.example.com',
        storeName: 'DataHub Store',
        targetCountry: 'DE',
        contentLanguage: 'de',
        currency: 'EUR',
        includeOutOfStock: false,
        languageCode: 'de',
        titleField: 'title',
        imageField: 'imageUrl',
    })

    // FEED 2: Meta Catalog (CSV) - Facebook/Instagram — English translations
    .feed('feed-meta', {
        adapterCode: 'metaCatalog',
        outputPath: './feeds/meta-catalog.csv',
        format: 'CSV',
        currency: 'EUR',
        titleField: 'title',
        imageField: 'imageUrl',
        brandField: 'brand',
        categoryField: 'category',
        includeVariants: true,
        languageCode: 'en',
    })

    // FEED 3: Amazon Feed (XML) — English translations
    .feed('feed-amazon', {
        adapterCode: 'amazonFeed',
        outputPath: './feeds/amazon-inventory.xml',
        currency: 'EUR',
        titleField: 'title',
        descriptionField: 'description',
        priceField: 'price',
        imageField: 'imageUrl',
        brandField: 'brand',
        gtinField: 'gtin',
        languageCode: 'en',
    })

    // FEED 4: Custom Feed (JSON) - for custom marketplace — German translations, default channel only
    .feed('feed-custom', {
        adapterCode: 'customFeed',
        outputPath: './feeds/custom-marketplace.json',
        format: 'JSON',
        customFields: {
            'product_id': 'id',
            'product_title': 'title',
            'product_url': 'link',
            'product_image': 'imageUrl',
            'product_price': 'price',
            'product_brand': 'brand',
            'product_category': 'category',
            'product_availability': 'availability',
            'product_condition': 'condition',
        },
        languageCode: 'de',
        channelCode: '__default_channel__',
    })

    // EXPORT: CSV backup of all feed data — English translations
    .export('export-backup', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'feed-export-backup.csv',
        languageCode: 'en',
    })

    // Graph: triggers → extract → validate → map → format → 4 feeds + 1 export
    .edge('manual', 'query-products')
    .edge('schedule', 'query-products')
    .edge('query-products', 'check-feed')
    .edge('check-feed', 'map-feed-fields')
    .edge('map-feed-fields', 'format-prices')
    .edge('format-prices', 'feed-google')
    .edge('format-prices', 'feed-meta')
    .edge('format-prices', 'feed-amazon')
    .edge('format-prices', 'feed-custom')
    .edge('format-prices', 'export-backup')

    .build();

// =============================================================================
// P13: SEARCH INDEX CRUD SYNC — Operation-aware create/update/delete
// =============================================================================

export const searchIndexCrudSync = createPipeline()
    .name('Search Index CRUD Sync')
    .description('Event-driven search sync with automatic delete support — handles create, update, and delete in one pipeline')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('on-product-change', { type: 'EVENT', event: 'product.*' })

    .extract('query-product', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'translations,featuredAsset',
    })

    .transform('prepare-doc', {
        operators: [
            { op: 'set', args: { field: 'objectID', expression: '`product-${record.id}`' } },
            { op: 'pick', args: { fields: ['objectID', 'name', 'slug', 'description', '__operation'] } },
        ],
    })

    .sink('index-meili', {
        adapterCode: 'meilisearch',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        indexName: 'products',
        primaryKey: 'objectID',
        defaultOperation: 'UPSERT',
    })

    .build();
