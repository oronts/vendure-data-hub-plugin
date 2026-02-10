/**
 * Sync & Integration Pipelines - Examples for external system integration
 *
 * These pipelines demonstrate:
 * - Generating product feeds for Google Shopping and Facebook
 * - Importing data from external REST APIs
 * - Authentication (Bearer, Basic, HMAC)
 * - Pagination handling
 * - Field mapping for marketplace requirements
 */

import { createPipeline } from '../../../src';

// =============================================================================
// 9. GOOGLE SHOPPING FEED - Full Google Merchant Center feed
// =============================================================================

/**
 * Generates a Google Shopping product feed with all required fields.
 * Outputs RSS 2.0 XML or TSV format for Google Merchant Center.
 *
 * Google Shopping required fields: id, title, description, link, image_link,
 * price, availability, condition, brand, gtin/mpn
 */
export const googleShoppingFeed = createPipeline()
    .name('Google Shopping Feed')
    .description('Generate Google Merchant Center product feed with proper field mapping and price formatting')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,featuredAsset,stockLevels,facetValues',
        languageCode: 'en',
        batchSize: 100,
    })

    .transform('filter-products', {
        operators: [
            // Only include enabled products
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'enabled', cmp: 'eq', value: true },
                        { field: 'product.enabled', cmp: 'eq', value: true },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('map-google-fields', {
        operators: [
            // Core identification
            {
                op: 'map',
                args: {
                    mapping: {
                        id: 'sku',
                        title: 'product.name',
                        description: 'product.description',
                        imageUrl: 'featuredAsset.preview',
                        productImageUrl: 'product.featuredAsset.preview',
                        priceRaw: 'priceWithTax',
                        stockOnHand: 'stockLevels.0.stockOnHand',
                        brandFacet: 'facetValues',
                    },
                },
            },

            // Generate product link
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com/products/${product.slug}?variant=${sku}',
                    target: 'link',
                },
            },

            // Generate image link (use variant image or fall back to product)
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com${imageUrl}',
                    target: 'image_link',
                    missingAsEmpty: true,
                },
            },
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'image_link', cmp: 'eq', value: 'https://your-store.com' }],
                    action: 'keep',
                },
            },
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com${productImageUrl}',
                    target: 'image_link',
                    missingAsEmpty: true,
                },
            },

            // Format price (Google requires "19.99 USD" format)
            {
                op: 'currency',
                args: {
                    source: 'priceRaw',
                    target: 'priceFormatted',
                    decimals: 2,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${priceFormatted} USD',
                    target: 'price',
                },
            },

            // Determine availability
            {
                op: 'lookup',
                args: {
                    source: 'stockOnHand',
                    target: 'availability',
                    map: {}, // Empty map, use default based on value
                    default: 'in_stock',
                },
            },
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stockOnHand', cmp: 'lte', value: 0 }],
                    action: 'keep',
                },
            },
            { op: 'set', args: { path: 'availability', value: 'out_of_stock' } },

            // Set static fields
            { op: 'set', args: { path: 'condition', value: 'new' } },
            { op: 'set', args: { path: 'adult', value: 'no' } },

            // Extract brand from facet values
            {
                op: 'template',
                args: {
                    template: '${brandFacet.*.facet.code|where:"eq","brand"|first.code}',
                    target: 'brand',
                    missingAsEmpty: true,
                },
            },
            {
                op: 'enrich',
                args: {
                    defaults: {
                        brand: 'Your Brand',
                    },
                },
            },

            // GTIN/MPN - use SKU as MPN if no GTIN
            { op: 'set', args: { path: 'identifier_exists', value: 'yes' } },
            {
                op: 'template',
                args: {
                    template: '${sku}',
                    target: 'mpn',
                },
            },

            // Shipping - flat rate example
            { op: 'set', args: { path: 'shipping', value: 'US:::5.99 USD' } },

            // Google Product Category (map from your categories)
            {
                op: 'lookup',
                args: {
                    source: 'product.slug',
                    target: 'google_product_category',
                    map: {
                        'electronics': 'Electronics',
                        'clothing': 'Apparel & Accessories',
                        'home': 'Home & Garden',
                    },
                    default: 'Other',
                },
            },
        ],
    })

    .transform('clean-content', {
        operators: [
            // Strip HTML from description
            { op: 'stripHtml', args: { source: 'description' } },

            // Truncate description to 5000 chars (Google limit)
            {
                op: 'truncate',
                args: {
                    source: 'description',
                    length: 4997,
                    suffix: '...',
                },
            },

            // Truncate title to 150 chars (Google limit)
            {
                op: 'truncate',
                args: {
                    source: 'title',
                    length: 147,
                    suffix: '...',
                },
            },
        ],
    })

    .transform('select-fields', {
        operators: [
            {
                op: 'pick',
                args: {
                    fields: [
                        'id',
                        'title',
                        'description',
                        'link',
                        'image_link',
                        'price',
                        'availability',
                        'condition',
                        'brand',
                        'mpn',
                        'identifier_exists',
                        'google_product_category',
                        'shipping',
                        'adult',
                    ],
                },
            },
        ],
    })

    .feed('generate-feed', {
        adapterCode: 'googleMerchant',
        format: 'XML',
        outputPath: './feeds/google-shopping.xml',
        targetCountry: 'US',
        contentLanguage: 'en',
        currency: 'USD',
        includeOutOfStock: false,
        storeUrl: 'https://your-store.com',
        storeName: 'Your Store Name',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'filter-products')
    .edge('filter-products', 'map-google-fields')
    .edge('map-google-fields', 'clean-content')
    .edge('clean-content', 'select-fields')
    .edge('select-fields', 'generate-feed')
    .build();


// =============================================================================
// 10. FACEBOOK/META CATALOG FEED
// =============================================================================

/**
 * Generates a Facebook/Meta product catalog feed.
 * Supports both CSV and XML formats.
 *
 * Meta required fields: id, title, description, availability, condition,
 * price, link, image_link, brand
 */
export const facebookCatalogFeed = createPipeline()
    .name('Facebook Catalog Feed')
    .description('Generate Meta (Facebook/Instagram) product catalog with required fields')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,featuredAsset,stockLevels',
        languageCode: 'en',
        batchSize: 100,
    })

    .transform('filter-products', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'enabled', cmp: 'eq', value: true },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('map-facebook-fields', {
        operators: [
            // Map core fields
            {
                op: 'map',
                args: {
                    mapping: {
                        id: 'sku',
                        title: 'product.name',
                        description: 'product.description',
                        priceRaw: 'priceWithTax',
                        stockOnHand: 'stockLevels.0.stockOnHand',
                        imageUrl: 'featuredAsset.preview',
                    },
                },
            },

            // Generate URLs
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com/products/${product.slug}',
                    target: 'link',
                },
            },
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com${imageUrl}',
                    target: 'image_link',
                },
            },

            // Format price (Facebook: "19.99 USD")
            {
                op: 'currency',
                args: {
                    source: 'priceRaw',
                    target: 'priceValue',
                    decimals: 2,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${priceValue} USD',
                    target: 'price',
                },
            },

            // Availability (Facebook uses: in stock, out of stock, preorder, available for order)
            {
                op: 'set',
                args: { path: 'availability', value: 'in stock' },
            },
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stockOnHand', cmp: 'lte', value: 0 }],
                    action: 'keep',
                },
            },
            { op: 'set', args: { path: 'availability', value: 'out of stock' } },

            // Static fields
            { op: 'set', args: { path: 'condition', value: 'new' } },
            { op: 'set', args: { path: 'brand', value: 'Your Brand' } },

            // Age group and gender (optional but recommended)
            { op: 'set', args: { path: 'age_group', value: 'adult' } },

            // Inventory tracking
            {
                op: 'template',
                args: {
                    template: '${stockOnHand}',
                    target: 'inventory',
                },
            },
        ],
    })

    .transform('clean-content', {
        operators: [
            { op: 'stripHtml', args: { source: 'description' } },
            {
                op: 'truncate',
                args: {
                    source: 'description',
                    length: 5000,
                    suffix: '...',
                },
            },
        ],
    })

    .transform('select-fields', {
        operators: [
            {
                op: 'pick',
                args: {
                    fields: [
                        'id',
                        'title',
                        'description',
                        'availability',
                        'condition',
                        'price',
                        'link',
                        'image_link',
                        'brand',
                        'inventory',
                    ],
                },
            },
        ],
    })

    .feed('generate-feed', {
        adapterCode: 'metaCatalog',
        format: 'CSV',
        outputPath: './feeds/facebook-catalog.csv',
        currency: 'USD',
        includeVariants: true,
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'filter-products')
    .edge('filter-products', 'map-facebook-fields')
    .edge('map-facebook-fields', 'clean-content')
    .edge('clean-content', 'select-fields')
    .edge('select-fields', 'generate-feed')
    .build();


// =============================================================================
// 11. REST API IMPORT - Import from external REST API with pagination
// =============================================================================

/**
 * Imports product data from an external REST API.
 * Supports pagination, authentication, and field mapping.
 *
 * Example: Importing from a supplier's product API
 */
export const restApiImport = createPipeline()
    .name('REST API Import')
    .description('Import products from external REST API with pagination, auth, and field mapping')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-api', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/v1/products',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-API-Version': '2024-01',
        },
        // Bearer token authentication using secret
        bearerTokenSecretCode: 'supplier-api-token',
        // Pagination configuration
        pageParam: 'page',
        itemsField: 'data.products',
        nextPageField: 'data.pagination.next_page',
        maxPages: 100,
        // Query parameters
        query: {
            per_page: 100,
            status: 'active',
            include: 'images,variants,categories',
        },
    })

    .transform('validate-data', {
        operators: [
            {
                op: 'validateRequired',
                args: {
                    fields: ['external_id', 'name', 'sku'],
                    errorField: '_errors',
                },
            },
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_errors', cmp: 'exists', value: false }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('map-fields', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        externalId: 'external_id',
                        name: 'name',
                        sku: 'sku',
                        description: 'description.html',
                        priceRaw: 'pricing.retail_price',
                        costPrice: 'pricing.cost_price',
                        stockQuantity: 'inventory.quantity',
                        weight: 'shipping.weight_kg',
                        imageUrl: 'images.0.url',
                        categoryPath: 'categories.0.full_path',
                        brand: 'brand.name',
                        barcode: 'identifiers.gtin',
                    },
                },
            },

            // Store external ID in custom field for sync
            {
                op: 'enrich',
                args: {
                    set: {
                        'customFields.externalId': '${externalId}',
                        'customFields.supplier': 'Supplier Name',
                        'customFields.lastSyncedAt': '${@now}',
                    },
                },
            },
        ],
    })

    .transform('transform-data', {
        operators: [
            // Generate slug from name
            { op: 'slugify', args: { source: 'name', target: 'slug' } },

            // Convert price to cents
            { op: 'toNumber', args: { source: 'priceRaw' } },
            { op: 'toCents', args: { source: 'priceRaw', target: 'price' } },

            // Convert weight from kg to grams
            { op: 'toNumber', args: { source: 'weight' } },
            {
                op: 'unit',
                args: {
                    source: 'weight',
                    target: 'weightGrams',
                    from: 'kg',
                    to: 'g',
                },
            },

            // Strip HTML from description
            { op: 'stripHtml', args: { source: 'description' } },

            // Set defaults
            {
                op: 'enrich',
                args: {
                    defaults: {
                        enabled: true,
                        trackInventory: true,
                        taxCategoryCode: 'standard',
                    },
                },
            },
        ],
    })

    .transform('delta-filter', {
        operators: [
            {
                op: 'deltaFilter',
                args: {
                    idPath: 'sku',
                    includePaths: ['name', 'price', 'stockQuantity', 'description'],
                },
            },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictResolution: 'source-wins',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        skuField: 'sku',
        priceField: 'price',
        stockField: 'stockQuantity',
    })

    .edge('start', 'fetch-api')
    .edge('fetch-api', 'validate-data')
    .edge('validate-data', 'map-fields')
    .edge('map-fields', 'transform-data')
    .edge('transform-data', 'delta-filter')
    .edge('delta-filter', 'upsert-products')
    .build();
