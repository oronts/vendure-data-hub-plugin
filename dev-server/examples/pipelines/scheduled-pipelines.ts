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
        type: 'schedule',
        cron: '0 6 * * *',  // minute hour day month weekday
        timezone: 'UTC',
    })

    .extract('fetch-erp-stock', {
        adapterCode: 'rest',
        endpoint: 'https://erp.company.com/api/v1/inventory',
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
        pipelineCompleted: [
            {
                type: 'webhook',
                name: 'Notify Slack on completion',
                url: 'https://slack.company.com/webhooks/stock-sync',
            },
        ],
        pipelineFailed: [
            {
                type: 'webhook',
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
        type: 'schedule',
        cron: '0 * * * *',  // Every hour at minute 0
        timezone: 'UTC',
    })

    .extract('fetch-prices', {
        adapterCode: 'rest',
        endpoint: 'https://pricing.company.com/api/v1/prices',
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
        type: 'schedule',
        cron: '0 2 * * 0',  // Every Sunday at 2 AM
        timezone: 'UTC',
    })

    .extract('fetch-customers', {
        adapterCode: 'vendure-query',
        entity: 'Customer',
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
        type: 'webhook',
        path: '/webhooks/external-orders',
        signature: 'hmac-sha256',
        idempotencyKey: 'X-Order-Id',
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
        endpoint: 'https://your-system.com/api/orders/log',
        method: 'POST',
    })

    .edge('start', 'parse-webhook')
    .edge('parse-webhook', 'transform-orders')
    .edge('transform-orders', 'log-orders')

    .hooks({
        pipelineCompleted: [
            {
                type: 'webhook',
                name: 'Callback on completion',
                url: 'https://callback.example.com/orders/complete',
            },
        ],
        pipelineFailed: [
            {
                type: 'webhook',
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
        type: 'event',
        event: 'ProductVariantEvent.updated',
        filter: {
            'stockOnHand': { '$lt': '${outOfStockThreshold}' },
        },
    })

    // Note: Deep relations like stockLevels.stockLocation don't work with TypeORM
    .extract('get-variant-details', {
        adapterCode: 'vendure-query',
        entity: 'ProductVariant',
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
