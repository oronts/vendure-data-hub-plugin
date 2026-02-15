/**
 * Scheduled Pipelines - Examples for automated, recurring data operations
 *
 * These pipelines demonstrate:
 * - Cron-based scheduling
 * - Delta detection for incremental sync
 * - Webhook triggers
 * - Event-based triggers
 * - Error handling and retry logic
 */

import { createPipeline } from '../../../src';

// =============================================================================
// 15. DAILY STOCK SYNC - Scheduled stock level synchronization
// =============================================================================

/**
 * Scheduled pipeline that syncs stock levels from an external ERP system.
 * Runs daily at 6 AM, uses delta detection to only process changed records.
 *
 * Features:
 * - Cron schedule (daily at 6 AM)
 * - Delta detection using hash comparison
 * - Multi-location stock support
 * - Error handling with notifications
 * - Checkpoint for incremental processing
 */
export const dailyStockSync = createPipeline()
    .name('Daily Stock Sync')
    .description('Scheduled stock level sync from ERP with delta detection')
    .capabilities({ requires: ['UpdateCatalog'] })

    // Schedule: Run daily at 6 AM UTC
    .trigger('start', {
        type: 'SCHEDULE',
        cron: '0 6 * * *',  // minute hour day month weekday
        timezone: 'UTC',
    })

    .extract('fetch-erp-stock', {
        adapterCode: 'httpApi',
        url: 'https://erp.company.com/api/v1/inventory',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-ERP-Version': '2024.1',
        },
        bearerTokenSecretCode: 'erp-api-token',
        itemsField: 'data.inventory_items',
        pageParam: 'page',
        nextPageField: 'meta.next_page',
        maxPages: 50,
        query: {
            per_page: 500,
            updated_since: '${checkpoint.lastSyncTime}',  // Incremental since last sync
            include_locations: true,
        },
    })

    .transform('validate-data', {
        operators: [
            {
                op: 'validateRequired',
                args: {
                    fields: ['sku', 'quantity', 'location_code'],
                    errorField: '_validationErrors',
                },
            },
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_validationErrors', cmp: 'exists', value: false }],
                    action: 'keep',
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
                    includePaths: ['quantity', 'location_code', 'reserved', 'available'],
                    excludePaths: ['last_updated', 'sync_id'],
                },
            },
        ],
    })

    .transform('transform-stock', {
        operators: [
            // Normalize SKU
            { op: 'trim', args: { source: 'sku' } },
            { op: 'uppercase', args: { source: 'sku' } },

            // Convert quantities to numbers
            { op: 'toNumber', args: { source: 'quantity' } },
            { op: 'toNumber', args: { source: 'reserved' } },
            { op: 'toNumber', args: { source: 'available' } },

            // Calculate stock on hand (quantity - reserved)
            {
                op: 'template',
                args: {
                    template: '${quantity - reserved}',
                    target: 'stockOnHand',
                },
            },
            { op: 'toNumber', args: { source: 'stockOnHand' } },

            // Ensure non-negative
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stockOnHand', cmp: 'lt', value: 0 }],
                    action: 'keep',
                },
            },
            { op: 'set', args: { path: 'stockOnHand', value: 0 } },

            // Map ERP location code to Vendure stock location
            {
                op: 'lookup',
                args: {
                    source: 'location_code',
                    target: 'vendureLocationCode',
                    map: {
                        'WH-MAIN': 'main-warehouse',
                        'WH-EAST': 'east-warehouse',
                        'WH-WEST': 'west-warehouse',
                        'STORE-01': 'store-location-1',
                        'STORE-02': 'store-location-2',
                    },
                    default: 'main-warehouse',
                },
            },

            // Build stock by location map
            {
                op: 'template',
                args: {
                    template: '{"${vendureLocationCode}": ${stockOnHand}}',
                    target: 'stockByLocationJson',
                },
            },
            {
                op: 'parseJson',
                args: {
                    source: 'stockByLocationJson',
                    target: 'stockByLocation',
                },
            },

            // Add sync metadata
            { op: 'now', args: { target: 'syncedAt', format: 'ISO' } },
            { op: 'set', args: { path: 'syncSource', value: 'erp-daily-sync' } },
        ],
    })

    .transform('map-to-vendure', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        stockByLocation: 'stockByLocation',
                        syncedAt: 'syncedAt',
                        syncSource: 'syncSource',
                    },
                },
            },
        ],
    })

    .load('adjust-stock', {
        adapterCode: 'stockAdjust',
        skuField: 'sku',
        stockByLocationField: 'stockByLocation',
        absolute: true, // Set absolute value from ERP (source of truth)
    })

    .edge('start', 'fetch-erp-stock')
    .edge('fetch-erp-stock', 'validate-data')
    .edge('validate-data', 'delta-filter')
    .edge('delta-filter', 'transform-stock')
    .edge('transform-stock', 'map-to-vendure')
    .edge('map-to-vendure', 'adjust-stock')

    // Configure hooks for monitoring
    .hooks({
        PIPELINE_COMPLETED: [
            {
                type: 'WEBHOOK',
                name: 'Notify Slack on completion',
                url: 'https://slack.company.com/webhooks/stock-sync',
            },
        ],
        PIPELINE_FAILED: [
            {
                type: 'WEBHOOK',
                name: 'Notify PagerDuty on error',
                url: 'https://pagerduty.com/webhooks/stock-sync-error',
            },
        ],
    })

    .build();


// =============================================================================
// BONUS EXAMPLES: Additional Scheduled Pipelines
// =============================================================================

/**
 * Hourly Price Sync - Updates prices from pricing engine
 */
export const hourlyPriceSync = createPipeline()
    .name('Hourly Price Sync')
    .description('Sync prices from pricing engine every hour')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', {
        type: 'SCHEDULE',
        cron: '0 * * * *',  // Every hour at minute 0
        timezone: 'UTC',
    })

    .extract('fetch-prices', {
        adapterCode: 'httpApi',
        url: 'https://pricing.company.com/api/v1/prices',
        method: 'GET',
        bearerTokenSecretCode: 'pricing-api-token',
        itemsField: 'prices',
        query: {
            updated_since: '${checkpoint.lastRun}',
            currency: 'USD',
        },
    })

    .transform('transform-prices', {
        operators: [
            // Delta filter - only changed prices
            {
                op: 'deltaFilter',
                args: {
                    idPath: 'sku',
                    includePaths: ['price', 'sale_price', 'currency'],
                },
            },
            // Convert to cents
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'toCents', args: { source: 'price', target: 'priceInCents' } },
            { op: 'toNumber', args: { source: 'sale_price' } },
            { op: 'toCents', args: { source: 'sale_price', target: 'salePriceInCents' } },
        ],
    })

    .load('update-prices', {
        adapterCode: 'variantUpsert',
        skuField: 'sku',
        priceField: 'priceInCents',
    })

    .edge('start', 'fetch-prices')
    .edge('fetch-prices', 'transform-prices')
    .edge('transform-prices', 'update-prices')
    .build();


/**
 * Weekly Customer Cleanup - Archive inactive customers
 */
export const weeklyCustomerCleanup = createPipeline()
    .name('Weekly Customer Cleanup')
    .description('Archive customers with no orders in 2 years')
    .capabilities({ requires: ['ReadCustomer', 'UpdateCustomer'] })
    .trigger('start', {
        type: 'SCHEDULE',
        cron: '0 2 * * 0',  // Every Sunday at 2 AM
        timezone: 'UTC',
    })

    .extract('fetch-customers', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'orders',
        batchSize: 100,
    })

    .transform('find-inactive', {
        operators: [
            // Count orders
            { op: 'count', args: { source: 'orders', target: 'orderCount' } },

            // Get last order date
            { op: 'first', args: { source: 'orders', target: 'lastOrder' } },
            {
                op: 'formatDate',
                args: {
                    source: 'lastOrder.orderPlacedAt',
                    target: 'lastOrderDate',
                    format: 'YYYY-MM-DD',
                },
            },

            // Filter customers with no orders or old orders
            // (simplified - real implementation would calculate date difference)
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'orderCount', cmp: 'eq', value: 0 },
                    ],
                    action: 'keep',
                },
            },

            // Mark for archival
            { op: 'set', args: { path: 'shouldArchive', value: true } },
        ],
    })

    .transform('prepare-update', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        email: 'emailAddress',
                        'customFields.archivedAt': '@now',
                        'customFields.archiveReason': 'inactive-2-years',
                    },
                },
            },
        ],
    })

    .load('update-customers', {
        adapterCode: 'customerUpsert',
        emailField: 'email',
    })

    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'find-inactive')
    .edge('find-inactive', 'prepare-update')
    .edge('prepare-update', 'update-customers')
    .build();


/**
 * Webhook-triggered Order Sync - Process orders from external system
 */
export const webhookOrderSync = createPipeline()
    .name('Webhook Order Sync')
    .description('Process incoming orders from external system via webhook')
    .capabilities({ requires: ['UpdateOrder', 'UpdateCustomer'] })
    .trigger('start', {
        type: 'WEBHOOK',
        webhookCode: 'external-orders',
        // Authentication: HMAC-SHA256 signature verification
        authentication: 'HMAC',
        secretCode: 'webhook-hmac-secret',  // Reference to DataHub Secret
        hmacHeaderName: 'x-webhook-signature',
        hmacAlgorithm: 'SHA256',
        // Require idempotency key to prevent duplicate processing
        requireIdempotencyKey: true,
        // Rate limit: 100 requests per minute
        rateLimit: 100,
    })

    // The webhook payload is the initial extract
    // Use inMemory extractor for webhook data - rows is passed as the records
    .extract('parse-webhook', {
        adapterCode: 'inMemory',
        // Records from triggerData will be injected at runtime
    })

    .transform('transform-orders', {
        operators: [
            // Validate required fields
            {
                op: 'validateRequired',
                args: {
                    fields: ['external_order_id', 'customer_email', 'items'],
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

            // Map external order to Vendure format
            {
                op: 'map',
                args: {
                    mapping: {
                        code: 'external_order_id',
                        customerEmail: 'customer_email',
                        lines: 'items',
                        shippingAddress: 'shipping',
                        billingAddress: 'billing',
                    },
                },
            },

            // Store external ID for reference
            {
                op: 'enrich',
                args: {
                    set: {
                        'customFields.externalOrderId': '${external_order_id}',
                        'customFields.importedAt': '@now',
                    },
                },
            },
        ],
    })

    // Note: orderCreate loader is not yet implemented
    // For now, this example demonstrates logging the transformed order data
    // In production, you would use Vendure's order APIs or create a custom loader
    .load('log-orders', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/orders/log',
        method: 'POST',
    })

    .edge('start', 'parse-webhook')
    .edge('parse-webhook', 'transform-orders')
    .edge('transform-orders', 'log-orders')

    .hooks({
        PIPELINE_COMPLETED: [
            {
                type: 'WEBHOOK',
                name: 'Callback on completion',
                url: 'https://callback.example.com/orders/complete',
            },
        ],
        PIPELINE_FAILED: [
            {
                type: 'WEBHOOK',
                name: 'Error callback',
                url: 'https://callback.example.com/orders/error',
            },
        ],
    })

    .build();


/**
 * Event-triggered Inventory Alert - React to low stock events
 */
export const lowStockAlert = createPipeline()
    .name('Low Stock Alert')
    .description('Send alerts when stock falls below threshold')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', {
        type: 'EVENT',
        event: 'ProductVariantEvent.updated',
        filter: {
            'stockOnHand': { '$lt': '${outOfStockThreshold}' },
        },
    })

    // Note: Deep relations like stockLevels.stockLocation don't work with TypeORM
    .extract('get-variant-details', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'product,stockLevels',
        batchSize: 1,
    })

    .transform('prepare-alert', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        productName: 'product.name',
                        variantName: 'name',
                        stockOnHand: 'stockLevels.0.stockOnHand',
                        stockLocationId: 'stockLevels.0.stockLocationId',
                        threshold: 'outOfStockThreshold',
                    },
                },
            },
            {
                op: 'template',
                args: {
                    template: 'LOW STOCK ALERT: ${productName} (${sku}) is at ${stockOnHand} units (location ID: ${stockLocationId}). Threshold: ${threshold}',
                    target: 'alertMessage',
                },
            },
        ],
    })

    .load('send-alert', {
        adapterCode: 'restPost',
        endpoint: 'https://slack.company.com/webhooks/inventory-alerts',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    })

    .edge('start', 'get-variant-details')
    .edge('get-variant-details', 'prepare-alert')
    .edge('prepare-alert', 'send-alert')
    .build();


// =============================================================================
// WEBHOOK AUTHENTICATION EXAMPLES
// =============================================================================

/**
 * Webhook with API Key Authentication
 * Simple header-based API key validation
 */
export const webhookApiKeyAuth = createPipeline()
    .name('Webhook API Key Example')
    .description('Webhook triggered pipeline with API Key authentication')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', {
        type: 'WEBHOOK',
        webhookCode: 'api-key-webhook',
        // Authentication: API Key in header
        authentication: 'API_KEY',
        apiKeySecretCode: 'webhook-api-key',  // Reference to DataHub Secret
        apiKeyHeaderName: 'x-api-key',        // Custom header name (default: x-api-key)
        // Rate limit: 50 requests per minute
        rateLimit: 50,
    })

    .extract('parse-data', {
        adapterCode: 'inMemory',
    })

    .transform('process', {
        operators: [
            { op: 'now', args: { target: 'processedAt', format: 'ISO' } },
        ],
    })

    .load('log-result', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/log',
        method: 'POST',
    })

    .edge('start', 'parse-data')
    .edge('parse-data', 'process')
    .edge('process', 'log-result')
    .build();


/**
 * Webhook with JWT Authentication
 * Bearer token validation with HS256 signature
 */
export const webhookJwtAuth = createPipeline()
    .name('Webhook JWT Example')
    .description('Webhook triggered pipeline with JWT Bearer token authentication')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', {
        type: 'WEBHOOK',
        webhookCode: 'jwt-webhook',
        // Authentication: JWT Bearer token
        authentication: 'JWT',
        jwtSecretCode: 'webhook-jwt-secret',  // Reference to DataHub Secret (HS256 key)
        jwtHeaderName: 'Authorization',       // Standard Authorization header
        // Rate limit: 200 requests per minute
        rateLimit: 200,
    })

    .extract('parse-data', {
        adapterCode: 'inMemory',
    })

    .transform('process', {
        operators: [
            { op: 'now', args: { target: 'processedAt', format: 'ISO' } },
        ],
    })

    .load('log-result', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/log',
        method: 'POST',
    })

    .edge('start', 'parse-data')
    .edge('parse-data', 'process')
    .edge('process', 'log-result')
    .build();


/**
 * Webhook with Basic Authentication
 * HTTP Basic Auth validation
 */
export const webhookBasicAuth = createPipeline()
    .name('Webhook Basic Auth Example')
    .description('Webhook triggered pipeline with HTTP Basic authentication')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', {
        type: 'WEBHOOK',
        webhookCode: 'basic-auth-webhook',
        // Authentication: HTTP Basic Auth
        authentication: 'BASIC',
        basicSecretCode: 'webhook-basic-creds',  // Secret contains "username:password"
        // Rate limit: 30 requests per minute (more restrictive for basic auth)
        rateLimit: 30,
    })

    .extract('parse-data', {
        adapterCode: 'inMemory',
    })

    .transform('process', {
        operators: [
            { op: 'now', args: { target: 'processedAt', format: 'ISO' } },
        ],
    })

    .load('log-result', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/log',
        method: 'POST',
    })

    .edge('start', 'parse-data')
    .edge('parse-data', 'process')
    .edge('process', 'log-result')
    .build();

// =============================================================================
// 22. MULTI-TRIGGER PIPELINE - Multiple triggers for the same pipeline
// =============================================================================

/**
 * Pipeline with multiple triggers demonstrating different execution patterns.
 * Can be triggered by:
 * - Manual trigger (from dashboard or API)
 * - Hourly schedule (for regular updates)
 * - Daily schedule (for full sync)
 * - Webhook (for immediate external triggers)
 *
 * All triggers invoke the same pipeline logic - useful when you need:
 * - Regular scheduled sync + on-demand manual runs
 * - Multiple schedules at different intervals
 * - Both scheduled and webhook-based triggering
 */
export const multiTriggerPipeline = createPipeline()
    .name('Multi-Trigger Inventory Sync')
    .description('Pipeline with manual, scheduled, and webhook triggers for maximum flexibility')
    .capabilities({ requires: ['UpdateCatalog'] })

    // Context configuration for parallel step execution
    .context({
        parallelExecution: {
            enabled: true,
            maxConcurrentSteps: 4,
            errorPolicy: 'CONTINUE',
        },
    })

    // Trigger 1: Manual trigger for on-demand execution
    .trigger('manual-trigger', {
        type: 'MANUAL',
        enabled: true,
    })

    // Trigger 2: Hourly incremental sync
    .trigger('hourly-sync', {
        type: 'SCHEDULE',
        cron: '0 * * * *',  // Every hour at minute 0
        timezone: 'UTC',
        enabled: true,
    })

    // Trigger 3: Daily full sync at 2 AM
    .trigger('daily-full-sync', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',  // Daily at 2 AM
        timezone: 'UTC',
        enabled: true,
    })

    // Trigger 4: Webhook for external system integration
    .trigger('webhook-trigger', {
        type: 'WEBHOOK',
        authentication: 'API_KEY',
        apiKeySecretCode: 'inventory-webhook-key',
        apiKeyHeaderName: 'x-api-key',
        rateLimit: 60,
        enabled: true,
    })

    // Extract from multiple sources (parallel execution when enabled)
    .extract('fetch-primary', {
        adapterCode: 'httpApi',
        url: 'https://primary.erp.com/api/inventory',
        method: 'GET',
        bearerTokenSecretCode: 'primary-erp-token',
    })

    .extract('fetch-secondary', {
        adapterCode: 'httpApi',
        url: 'https://secondary.erp.com/api/inventory',
        method: 'GET',
        bearerTokenSecretCode: 'secondary-erp-token',
    })

    .transform('merge-and-normalize', {
        operators: [
            { op: 'now', args: { target: 'syncedAt', format: 'ISO' } },
            { op: 'coalesce', args: { paths: ['sku', 'productCode', 'itemId'], target: 'sku' } },
        ],
    })

    .validate('check-stock', {
        mode: 'FAIL_FAST',
        rules: [
            { type: 'business', spec: { field: 'sku', test: { op: 'present' }, error: 'SKU is required' } },
            { type: 'business', spec: { field: 'quantity', test: { op: 'gte', value: 0 }, error: 'Quantity must be non-negative' } },
        ],
    })

    .load('update-inventory', {
        adapterCode: 'stockAdjust',
        strategy: 'UPSERT',
        locationStrategy: 'default',
    })

    // Load to multiple destinations (parallel when enabled)
    .load('notify-warehouse', {
        adapterCode: 'restPost',
        endpoint: 'https://warehouse.internal/api/stock-updates',
        method: 'POST',
    })

    // Edges: All triggers connect to both extracts (parallel entry)
    // Both extracts feed into the merge step
    .edge('manual-trigger', 'fetch-primary')
    .edge('manual-trigger', 'fetch-secondary')
    .edge('hourly-sync', 'fetch-primary')
    .edge('hourly-sync', 'fetch-secondary')
    .edge('daily-full-sync', 'fetch-primary')
    .edge('daily-full-sync', 'fetch-secondary')
    .edge('webhook-trigger', 'fetch-primary')
    .edge('webhook-trigger', 'fetch-secondary')
    .edge('fetch-primary', 'merge-and-normalize')
    .edge('fetch-secondary', 'merge-and-normalize')
    .edge('merge-and-normalize', 'check-stock')
    .edge('check-stock', 'update-inventory')
    .edge('check-stock', 'notify-warehouse')
    .build();

// =============================================================================
// 18. CUSTOMER IMPORT WITH VALIDATION & ENRICHMENT
// =============================================================================

/**
 * Pipeline demonstrating VALIDATE and ENRICH step usage.
 * Imports customers from CSV, validates required fields and formats,
 * enriches with default values and computed fields, then loads to Vendure.
 *
 * Features:
 * - VALIDATE: Required fields, email format, phone format
 * - ENRICH: Static defaults, computed fullName, set timestamps
 * - Error accumulation mode to catch all validation issues
 */
export const customerImportWithValidationAndEnrichment = createPipeline()
    .name('Customer Import with Validation & Enrichment')
    .description('Import customers with validation and data enrichment')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual-trigger', {
        type: 'MANUAL',
    })

    .extract('load-csv', {
        adapterCode: 'csv',
        filePath: '/imports/customers.csv',
        hasHeader: true,
    })

    // VALIDATE step with rules array (UI format)
    .validate('validate-customers', {
        mode: 'ACCUMULATE', // Collect all errors instead of failing on first
        rules: [
            // Required fields
            { type: 'business', spec: { field: 'email', required: true } },
            { type: 'business', spec: { field: 'firstName', required: true } },
            { type: 'business', spec: { field: 'lastName', required: true } },
            // Email format validation
            { type: 'business', spec: { field: 'email', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' } },
            // Phone format validation (optional field, only validate if present)
            { type: 'business', spec: { field: 'phone', pattern: '^[+]?[0-9]{10,15}$' } },
        ],
    })

    // ENRICH step with built-in static enrichment (no adapter needed)
    .enrich('enrich-customer-data', {
        sourceType: 'STATIC',
        // Set default values for missing fields
        defaults: {
            country: 'US',
            currency: 'USD',
            marketingOptIn: false,
            customerGroup: 'default',
        },
        // Always set these values (overwrites existing)
        set: {
            importedAt: new Date().toISOString(),
            source: 'csv-import',
        },
        // Computed fields using template syntax
        computed: {
            fullName: '${firstName} ${lastName}',
            displayName: '${firstName} ${lastName} (${email})',
        },
    })

    .load('create-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        lookupField: 'emailAddress',
    })

    .edge('manual-trigger', 'load-csv')
    .edge('load-csv', 'validate-customers')
    .edge('validate-customers', 'enrich-customer-data')
    .edge('enrich-customer-data', 'create-customers')
    .build();

// =============================================================================
// 19. PRODUCT CATALOG ENRICHMENT
// =============================================================================

/**
 * Pipeline demonstrating product data enrichment with multiple sources.
 * Fetches products, enriches with SEO defaults and computed slugs,
 * validates required catalog fields.
 *
 * Features:
 * - ENRICH: Generate SEO-friendly slugs, add default metadata
 * - VALIDATE: Ensure products have required catalog fields
 */
export const productCatalogEnrichment = createPipeline()
    .name('Product Catalog Enrichment')
    .description('Enrich product data with SEO defaults and computed fields')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('webhook', {
        type: 'WEBHOOK',
        webhookCode: 'product-enrichment',
    })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://pim.company.com/api/products',
        method: 'GET',
        itemsField: 'products',
    })

    // First enrich with computed SEO fields
    .enrich('add-seo-fields', {
        sourceType: 'STATIC',
        computed: {
            // Generate URL-friendly slug from name
            slug: '${name}',
            // Generate meta title
            metaTitle: '${name} | Shop Now',
            // Generate meta description from description or use name
            metaDescription: 'Buy ${name} online. ${shortDescription}',
        },
        defaults: {
            // Default SEO settings
            metaKeywords: '',
            canonicalUrl: '',
            robotsIndex: true,
            robotsFollow: true,
        },
    })

    // Then validate required catalog fields
    .validate('validate-catalog-fields', {
        mode: 'FAIL_FAST',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true } },
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', required: true, min: 0 } },
            { type: 'business', spec: { field: 'slug', required: true } },
        ],
    })

    .transform('format-price', {
        operators: [
            { op: 'coerce', args: { path: 'price', type: 'number' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        lookupField: 'slug',
    })

    .edge('webhook', 'fetch-products')
    .edge('fetch-products', 'add-seo-fields')
    .edge('add-seo-fields', 'validate-catalog-fields')
    .edge('validate-catalog-fields', 'format-price')
    .edge('format-price', 'upsert-products')
    .build();
