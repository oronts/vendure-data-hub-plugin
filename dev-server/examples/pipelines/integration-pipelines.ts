/**
 * Integration Pipelines
 *
 * Advanced integration scenarios demonstrating:
 * - P7: CDC product sync with route-based upsert/delete branching
 * - P8: Event-driven stock alerts with HTTP enrichment and GraphQL mutation
 * - P9: Customer analytics with RFM scoring, multi-source extraction, and tax rate sync
 * - P10: Comprehensive entity lifecycle ops (shipping, payment, channels, assets, stock locations, deletions)
 */

import { createPipeline } from '../../../src';
import { MOCK_PORTS, mockUrl } from '../../ports';

const PIMCORE_API_URL = process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE);

// =============================================================================
// P7: CDC PRODUCT SYNC - Near-real-time CDC with deletion support
// =============================================================================

/**
 * Near-real-time CDC sync from PostgreSQL with route-based upsert/delete branching.
 * Polls the products table every 5 minutes using the updated_at tracking column.
 * Records with a non-null deleted_at are routed to deletion; others to upsert.
 */
export const cdcProductSync = createPipeline()
    .name('CDC Product Sync')
    .description('Near-real-time CDC sync from PostgreSQL with route-based upsert and deletion')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/5 * * * *',
    })

    .extract('cdc-extract', {
        adapterCode: 'cdc',
        connectionCode: 'demo-postgres',
        databaseType: 'POSTGRESQL',
        table: 'products',
        primaryKey: 'id',
        trackingColumn: 'updated_at',
        trackingType: 'TIMESTAMP',
        includeDeletes: true,
        deleteColumn: 'deleted_at',
    })

    .validate('check-data', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU is required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .route('upsert-or-delete', {
        branches: [
            { name: 'upsert', when: [{ field: 'deleted_at', cmp: 'eq' , value: null }] },
            { name: 'delete', when: [{ field: 'deleted_at', cmp: 'ne' , value: null }] },
        ],
    })

    // Upsert branch: transform and load products
    .transform('map-for-upsert', {
        operators: [
            { op: 'trim', args: { path: 'name' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        skuField: 'sku',
        priceField: 'priceInCents',
        enabledField: 'enabled',
    })

    // Delete branch: prepare identifier and delete products by slug
    .transform('map-for-delete', {
        operators: [
            { op: 'slugify', args: { source: 'name', target: 'deleteSlug' } },
            { op: 'pick', args: { fields: ['deleteSlug'] } },
        ],
    })

    .load('delete-products', {
        adapterCode: 'entityDeletion',
        entityType: 'product',
        identifierField: 'deleteSlug',
        matchBy: 'slug',
    })

    // Graph edges
    .edge('schedule', 'cdc-extract')
    .edge('cdc-extract', 'check-data')
    .edge('check-data', 'upsert-or-delete')
    .edge('upsert-or-delete', 'map-for-upsert', 'upsert')
    .edge('map-for-upsert', 'upsert-products')
    .edge('upsert-or-delete', 'map-for-delete', 'delete')
    .edge('map-for-delete', 'delete-products')

    .build();

// =============================================================================
// P8: EVENT STOCK ALERT - Event-driven low stock alerting
// =============================================================================

/**
 * When product variants are updated, check stock levels, enrich with warehouse data,
 * compute alert levels, filter critical items, send alerts via GraphQL mutation,
 * and export an alert log.
 */
export const eventStockAlert = createPipeline()
    .name('Event Stock Alert')
    .description('Event-driven stock level check with HTTP enrichment, alerting, and export')
    .capabilities({ requires: ['ReadCatalog', 'UpdateDataHubSettings'] })

    .trigger('on-variant-update', {
        type: 'EVENT',
        event: 'ProductVariantEvent.updated',
    })

    .extract('query-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'product,stockLevels',
        batchSize: 10,
    })

    .transform('enrich-with-warehouse', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: PIMCORE_API_URL + '/api/stock?sku={{sku}}',
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_warehouseData',
                    cacheTtlSec: 60,
                },
            },
        ],
    })

    .enrich('compute-alert', {
        sourceType: 'STATIC',
        computed: {
            totalStock: '${stockOnHand || 0}',
            alertLevel: '${stockOnHand < 5 ? "CRITICAL" : stockOnHand < 10 ? "WARNING" : "OK"}',
        },
    })

    .transform('filter-critical', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stockOnHand', cmp: 'lt', value: 10 }],
                    action: 'keep',
                },
            },
            {
                op: 'template',
                args: {
                    template: 'Low stock alert: ${sku} has ${stockOnHand} units (${alertLevel})',
                    target: 'alertMessage',
                },
            },
        ],
    })

    .load('send-alert', {
        adapterCode: 'graphqlMutation',
        endpoint: 'http://localhost:4100/api/graphql',
        mutation: 'mutation CreateAlert($input: AlertInput!) { createAlert(input: $input) { id } }',
        variableMapping: {
            'input.sku': 'sku',
            'input.message': 'alertMessage',
            'input.level': 'alertLevel',
            'input.stockOnHand': 'stockOnHand',
        },
    })

    .export('alert-log', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'stock-alerts.json',
    })

    // Linear graph
    .edge('on-variant-update', 'query-variants')
    .edge('query-variants', 'enrich-with-warehouse')
    .edge('enrich-with-warehouse', 'compute-alert')
    .edge('compute-alert', 'filter-critical')
    .edge('filter-critical', 'send-alert')
    .edge('send-alert', 'alert-log')

    .build();

// =============================================================================
// P9: CUSTOMER ANALYTICS EXPORT - RFM scoring with multi-source extraction
// =============================================================================

/**
 * Extract orders and customers from Vendure, compute RFM analytics,
 * update customer groups, export reports, and sync tax rates from external API.
 * Demonstrates multi-source parallel extraction and complex script transforms.
 */
export const customerAnalyticsExport = createPipeline()
    .name('Customer Analytics Export')
    .description('RFM analytics with multi-source extraction, customer group updates, and tax rate sync')
    .capabilities({ requires: ['ReadOrder', 'ReadCustomer', 'UpdateCustomer', 'UpdateSettings'] })

    .trigger('manual', { type: 'MANUAL' })

    // Source 1: Orders
    .extract('query-orders', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'customer,lines,surcharges',
        batchSize: 100,
    })

    // Source 2: Customers (demonstrates multi-source extraction)
    .extract('query-customers', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'groups,addresses',
        batchSize: 100,
    })

    // Source 3: Tax rates from external API
    .extract('fetch-tax-config', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/tax-rates',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'taxRates',
    })

    .transform('compute-metrics', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Compute per-customer metrics
                        const orderCount = (record.lines || []).length;
                        const totalSpend = (record.lines || []).reduce((sum, l) => sum + (l.unitPriceWithTax || 0) * (l.quantity || 1), 0);
                        record.orderCount = orderCount;
                        record.totalSpend = totalSpend;
                        record.lastOrderDate = record.orderPlacedAt || record.createdAt;
                        return record;
                    `,
                },
            },
        ],
    })

    .transform('rfm-scoring', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Simple RFM segmentation
                        const daysSinceOrder = record.lastOrderDate ? Math.floor((Date.now() - new Date(record.lastOrderDate).getTime()) / 86400000) : 999;
                        const recency = daysSinceOrder < 30 ? 5 : daysSinceOrder < 90 ? 4 : daysSinceOrder < 180 ? 3 : daysSinceOrder < 365 ? 2 : 1;
                        const frequency = record.orderCount > 10 ? 5 : record.orderCount > 5 ? 4 : record.orderCount > 3 ? 3 : record.orderCount > 1 ? 2 : 1;
                        const monetary = record.totalSpend > 50000 ? 5 : record.totalSpend > 20000 ? 4 : record.totalSpend > 10000 ? 3 : record.totalSpend > 5000 ? 2 : 1;
                        record.rfmScore = recency + frequency + monetary;
                        record.segment = record.rfmScore >= 13 ? 'champion' : record.rfmScore >= 10 ? 'loyal' : record.rfmScore >= 7 ? 'potential' : record.rfmScore >= 4 ? 'at-risk' : 'lost';
                        return record;
                    `,
                },
            },
        ],
    })

    .enrich('add-labels', {
        sourceType: 'STATIC',
        computed: {
            segmentLabel: '${segment}',
            engagementLevel: '${rfmScore >= 10 ? "high" : rfmScore >= 7 ? "medium" : "low"}',
        },
    })

    .load('update-groups', {
        adapterCode: 'customerUpsert',
        strategy: 'UPDATE',
        emailField: 'customer.emailAddress',
        groupsField: 'segment',
        dryRun: true,
    })

    .export('analytics-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'customer-analytics.csv',
    })

    .load('sync-tax-rates', {
        adapterCode: 'taxRateUpsert',
        strategy: 'UPSERT',
        nameField: 'name',
        valueField: 'rate',
        enabledField: 'enabled',
        taxCategoryCodeField: 'category',
        zoneCodeField: 'zone',
    })

    // Graph edges: 3 parallel branches from trigger
    // Branch 1: Orders → metrics → RFM → labels → update groups → export
    .edge('manual', 'query-orders')
    .edge('query-orders', 'compute-metrics')
    .edge('compute-metrics', 'rfm-scoring')
    .edge('rfm-scoring', 'add-labels')
    .edge('add-labels', 'update-groups')
    .edge('update-groups', 'analytics-report')

    // Branch 2: Customers (multi-source demonstration)
    .edge('manual', 'query-customers')

    // Branch 3: Tax rates from external API
    .edge('manual', 'fetch-tax-config')
    .edge('fetch-tax-config', 'sync-tax-rates')

    .build();

// =============================================================================
// P10: ENTITY LIFECYCLE OPS - Comprehensive entity management
// =============================================================================

/**
 * Comprehensive entity management pipeline: import shipping methods, payment methods,
 * channels, assets, stock locations (from inline CSV), and run multi-type deletions
 * routed by entity type. Demonstrates 6 parallel branches from a single trigger,
 * route-based fan-out for deletions, and lifecycle hooks.
 */
export const entityLifecycleOps = createPipeline()
    .name('Entity Lifecycle Operations')
    .description('Comprehensive entity management: shipping, payments, channels, assets, stock locations, and multi-type deletions')
    .capabilities({ requires: ['UpdateCatalog', 'UpdateShippingMethod', 'UpdateSettings', 'UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    // =========================================================================
    // Branch 1: Shipping Methods
    // =========================================================================
    .extract('fetch-shipping', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/shipping-methods?includeTranslations=true',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'shippingMethods',
    })

    .transform('map-shipping', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'methodCode' } },
            { op: 'copy', args: { source: 'name', target: 'methodName' } },
            { op: 'copy', args: { source: 'description', target: 'methodDesc' } },
            { op: 'copy', args: { source: 'calculator', target: 'calcConfig' } },
            { op: 'copy', args: { source: 'checker', target: 'checkerConfig' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'set', args: { path: 'fulfillHandler', value: 'manual-fulfillment' } },
            { op: 'pick', args: { fields: ['methodCode', 'methodName', 'methodDesc', 'calcConfig', 'checkerConfig', 'translations', 'fulfillHandler'] } },
        ],
    })

    .load('upsert-shipping', {
        adapterCode: 'shippingMethodUpsert',
        strategy: 'UPSERT',
        codeField: 'methodCode',
        nameField: 'methodName',
        descriptionField: 'methodDesc',
        fulfillmentHandlerField: 'fulfillHandler',
        calculatorField: 'calcConfig',
        checkerField: 'checkerConfig',
        translationsField: 'translations',
    })

    // =========================================================================
    // Branch 2: Payment Methods
    // =========================================================================
    .extract('fetch-payments', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/payment-methods?includeTranslations=true',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'paymentMethods',
    })

    .transform('map-payments', {
        operators: [
            { op: 'copy', args: { source: 'code', target: 'payCode' } },
            { op: 'copy', args: { source: 'name', target: 'payName' } },
            { op: 'copy', args: { source: 'description', target: 'payDesc' } },
            { op: 'copy', args: { source: 'handler', target: 'handlerConfig' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            { op: 'set', args: { path: 'payEnabled', value: true } },
            { op: 'pick', args: { fields: ['payCode', 'payName', 'payDesc', 'handlerConfig', 'translations', 'payEnabled'] } },
        ],
    })

    .load('upsert-payments', {
        adapterCode: 'paymentMethodUpsert',
        strategy: 'UPSERT',
        codeField: 'payCode',
        nameField: 'payName',
        descriptionField: 'payDesc',
        handlerField: 'handlerConfig',
        enabledField: 'payEnabled',
        translationsField: 'translations',
    })

    // =========================================================================
    // Branch 3: Channels
    // =========================================================================
    .extract('fetch-channels', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/channels',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'channels',
    })

    .load('upsert-channels', {
        adapterCode: 'channelUpsert',
        strategy: 'UPSERT',
        codeField: 'code',
        defaultLanguageCodeField: 'defaultLanguage',
        defaultCurrencyCodeField: 'defaultCurrency',
        availableCurrencyCodesField: 'availableCurrencies',
    })

    // =========================================================================
    // Branch 4: Stock Locations (inline CSV)
    // =========================================================================
    .extract('locations-csv', {
        adapterCode: 'csv',
        rows: [
            { locName: 'Hauptlager', locDesc: 'Main warehouse Berlin' },
            { locName: 'Aussenlager', locDesc: 'External warehouse Hamburg' },
            { locName: 'Retoure', locDesc: 'Returns processing center' },
        ],
    })

    .load('upsert-locations', {
        adapterCode: 'stockLocationUpsert',
        strategy: 'UPSERT',
        nameField: 'locName',
        descriptionField: 'locDesc',
    })

    // =========================================================================
    // Branch 5: Assets
    // =========================================================================
    .extract('fetch-assets', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/assets',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'assets',
    })

    .transform('map-assets', {
        operators: [
            { op: 'copy', args: { source: 'url', target: 'sourceUrl' } },
            { op: 'copy', args: { source: 'name', target: 'assetName' } },
            { op: 'pick', args: { fields: ['sourceUrl', 'assetName'] } },
        ],
    })

    .load('import-assets', {
        adapterCode: 'assetImport',
        sourceUrlField: 'sourceUrl',
        nameField: 'assetName',
    })

    // =========================================================================
    // Branch 6: Deletions (fan-out by entity type via ROUTE)
    // =========================================================================
    .extract('fetch-deletions', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/deletions',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'deletions',
    })

    .transform('prep-deletion', {
        operators: [
            { op: 'copy', args: { source: 'identifier', target: 'identifierValue' } },
        ],
    })

    .route('route-by-entity', {
        branches: [
            { name: 'variant', when: [{ field: 'entityType', cmp: 'eq' , value: 'variant' }] },
            { name: 'product', when: [{ field: 'entityType', cmp: 'eq' , value: 'product' }] },
            { name: 'collection', when: [{ field: 'entityType', cmp: 'eq' , value: 'collection' }] },
            { name: 'facet', when: [{ field: 'entityType', cmp: 'eq' , value: 'facet' }] },
            { name: 'facet-value', when: [{ field: 'entityType', cmp: 'eq' , value: 'facet-value' }] },
            { name: 'promotion', when: [{ field: 'entityType', cmp: 'eq' , value: 'promotion' }] },
            { name: 'shipping-method', when: [{ field: 'entityType', cmp: 'eq' , value: 'shipping-method' }] },
            { name: 'customer', when: [{ field: 'entityType', cmp: 'eq' , value: 'customer' }] },
            { name: 'payment-method', when: [{ field: 'entityType', cmp: 'eq' , value: 'payment-method' }] },
            { name: 'customer-group', when: [{ field: 'entityType', cmp: 'eq' , value: 'customer-group' }] },
            { name: 'tax-rate', when: [{ field: 'entityType', cmp: 'eq' , value: 'tax-rate' }] },
            { name: 'asset', when: [{ field: 'entityType', cmp: 'eq' , value: 'asset' }] },
            { name: 'stock-location', when: [{ field: 'entityType', cmp: 'eq' , value: 'stock-location' }] },
        ],
    })

    .load('delete-variants', {
        adapterCode: 'entityDeletion',
        entityType: 'variant',
        identifierField: 'identifierValue',
        matchBy: 'sku',
    })

    .load('delete-products', {
        adapterCode: 'entityDeletion',
        entityType: 'product',
        identifierField: 'identifierValue',
        matchBy: 'slug',
    })

    .load('delete-collections', {
        adapterCode: 'entityDeletion',
        entityType: 'collection',
        identifierField: 'identifierValue',
        matchBy: 'slug',
    })

    .load('delete-facets', {
        adapterCode: 'entityDeletion',
        entityType: 'facet',
        identifierField: 'identifierValue',
        matchBy: 'code',
    })

    .load('delete-facet-values', {
        adapterCode: 'entityDeletion',
        entityType: 'facet-value',
        identifierField: 'identifierValue',
        matchBy: 'code',
    })

    .load('delete-promotions', {
        adapterCode: 'entityDeletion',
        entityType: 'promotion',
        identifierField: 'identifierValue',
        matchBy: 'code',
    })

    .load('delete-shipping-methods', {
        adapterCode: 'entityDeletion',
        entityType: 'shipping-method',
        identifierField: 'identifierValue',
        matchBy: 'code',
    })

    .load('delete-customers', {
        adapterCode: 'entityDeletion',
        entityType: 'customer',
        identifierField: 'identifierValue',
        matchBy: 'email',
    })

    .load('delete-payment-methods', {
        adapterCode: 'entityDeletion',
        entityType: 'payment-method',
        identifierField: 'identifierValue',
        matchBy: 'code',
    })

    .load('delete-customer-groups', {
        adapterCode: 'entityDeletion',
        entityType: 'customer-group',
        identifierField: 'identifierValue',
        matchBy: 'name',
    })

    .load('delete-tax-rates', {
        adapterCode: 'entityDeletion',
        entityType: 'tax-rate',
        identifierField: 'identifierValue',
        matchBy: 'name',
    })

    .load('delete-assets', {
        adapterCode: 'entityDeletion',
        entityType: 'asset',
        identifierField: 'identifierValue',
        matchBy: 'name',
    })

    .load('delete-stock-locations', {
        adapterCode: 'entityDeletion',
        entityType: 'stock-location',
        identifierField: 'identifierValue',
        matchBy: 'name',
    })

    // =========================================================================
    // Graph edges: 6 parallel branches from trigger
    // =========================================================================

    // Branch 1: Shipping Methods
    .edge('manual', 'fetch-shipping')
    .edge('fetch-shipping', 'map-shipping')
    .edge('map-shipping', 'upsert-shipping')

    // Branch 2: Payment Methods
    .edge('manual', 'fetch-payments')
    .edge('fetch-payments', 'map-payments')
    .edge('map-payments', 'upsert-payments')

    // Branch 3: Channels
    .edge('manual', 'fetch-channels')
    .edge('fetch-channels', 'upsert-channels')

    // Branch 4: Stock Locations
    .edge('manual', 'locations-csv')
    .edge('locations-csv', 'upsert-locations')

    // Branch 5: Assets
    .edge('manual', 'fetch-assets')
    .edge('fetch-assets', 'map-assets')
    .edge('map-assets', 'import-assets')

    // Branch 6: Deletions with route fan-out (all 13 entity types)
    .edge('manual', 'fetch-deletions')
    .edge('fetch-deletions', 'prep-deletion')
    .edge('prep-deletion', 'route-by-entity')
    .edge('route-by-entity', 'delete-variants', 'variant')
    .edge('route-by-entity', 'delete-products', 'product')
    .edge('route-by-entity', 'delete-collections', 'collection')
    .edge('route-by-entity', 'delete-facets', 'facet')
    .edge('route-by-entity', 'delete-facet-values', 'facet-value')
    .edge('route-by-entity', 'delete-promotions', 'promotion')
    .edge('route-by-entity', 'delete-shipping-methods', 'shipping-method')
    .edge('route-by-entity', 'delete-customers', 'customer')
    .edge('route-by-entity', 'delete-payment-methods', 'payment-method')
    .edge('route-by-entity', 'delete-customer-groups', 'customer-group')
    .edge('route-by-entity', 'delete-tax-rates', 'tax-rate')
    .edge('route-by-entity', 'delete-assets', 'asset')
    .edge('route-by-entity', 'delete-stock-locations', 'stock-location')

    // Hooks: lifecycle logging and error handling
    .hooks({
        BEFORE_EXTRACT: [
            {
                type: 'LOG',
                level: 'INFO',
                message: 'Starting entity extraction...',
            },
        ],
        AFTER_LOAD: [
            {
                type: 'LOG',
                level: 'INFO',
                message: 'Entity load batch completed',
            },
        ],
        ON_ERROR: [
            {
                type: 'LOG',
                level: 'ERROR',
                message: 'Entity lifecycle error occurred',
            },
        ],
    })

    .build();

// =============================================================================
// P13: PIM CUSTOMER SYNC — Customer + group import from Pimcore
// =============================================================================

export const pimCustomerSync = createPipeline()
    .name('PIM Customer Sync')
    .description('Sync customers and customer groups from Pimcore PIM with address building and group assignment')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', { type: 'SCHEDULE', cron: '0 6 * * *', timezone: 'Europe/Berlin' })

    // Branch 1: Customer groups
    .extract('fetch-groups', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/customer-groups',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'customerGroups',
    })

    .load('upsert-groups', {
        adapterCode: 'customerGroupUpsert',
        strategy: 'UPSERT',
        nameField: 'name',
    })

    // Branch 2: Customers with addresses
    .extract('fetch-customers', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/customers?includeTranslations=true',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'customers',
    })

    .validate('check-customers', {
        rules: [
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid email required' } },
            { type: 'business', spec: { field: 'firstName', required: true, error: 'First name required' } },
            { type: 'business', spec: { field: 'lastName', required: true, error: 'Last name required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .transform('build-addresses', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'firstName' } },
            { op: 'trim', args: { path: 'lastName' } },
            {
                op: 'script',
                args: {
                    code: `
                        if (record.addresses && Array.isArray(record.addresses)) {
                            record.addresses = record.addresses.map(a => ({
                                fullName: a.fullName || (record.firstName + ' ' + record.lastName),
                                streetLine1: a.street || a.streetLine1 || '',
                                city: a.city || '',
                                postalCode: a.postalCode || a.zip || '',
                                countryCode: a.countryCode || a.country || 'DE',
                                province: a.province || a.state || '',
                                phoneNumber: a.phone || record.phone || '',
                                defaultShippingAddress: !!a.defaultShipping,
                                defaultBillingAddress: !!a.defaultBilling,
                            }));
                        }
                        if (record.groups && Array.isArray(record.groups)) {
                            record.groupNames = record.groups.map(g => typeof g === 'string' ? g : g.name);
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    .load('upsert-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groupNames',
        addressesMode: 'UPSERT_BY_MATCH',
    })

    .export('customer-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'pim-customer-sync.csv',
    })

    // Graph: groups first, then customers
    .edge('manual', 'fetch-groups')
    .edge('schedule', 'fetch-groups')
    .edge('fetch-groups', 'upsert-groups')
    .edge('upsert-groups', 'fetch-customers')
    .edge('fetch-customers', 'check-customers')
    .edge('check-customers', 'build-addresses')
    .edge('build-addresses', 'upsert-customers')
    .edge('upsert-customers', 'customer-report')

    .build();

// =============================================================================
// P14: PIM ORDER IMPORT — Import orders from Pimcore with state transitions
// =============================================================================

export const pimOrderImport = createPipeline()
    .name('PIM Order Import')
    .description('Import orders from Pimcore PIM with line items, state transitions, notes, and coupon application')
    .capabilities({ requires: ['UpdateOrder', 'UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    .extract('fetch-orders', {
        adapterCode: 'httpApi',
        url: PIMCORE_API_URL + '/api/orders',
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'orders',
    })

    .validate('check-orders', {
        rules: [
            { type: 'business', spec: { field: 'code', required: true, error: 'Order code required' } },
            { type: 'business', spec: { field: 'customerEmail', required: true, error: 'Customer email required' } },
            { type: 'business', spec: { field: 'lines', required: true, error: 'Order lines required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .enrich('set-defaults', {
        defaults: {
            shippingMethodCode: 'standard-shipping',
            paymentMethodCode: 'standard-payment',
        },
        set: {
            importSource: 'pimcore-erp',
        },
    })

    .transform('prepare-orders', {
        operators: [
            {
                op: 'template',
                args: {
                    template: 'Imported from Pimcore ERP. Order: ${code}, Customer: ${customerEmail}',
                    target: 'importNote',
                },
            },
        ],
    })

    .load('create-orders', {
        adapterCode: 'orderUpsert',
        lookupFields: 'code',
        state: 'PaymentSettled',
        orderPlacedAtField: 'orderPlacedAt',
    })

    .load('add-notes', {
        adapterCode: 'orderNote',
        orderCodeField: 'code',
        noteField: 'importNote',
        isPrivate: true,
    })

    .load('transition-shipped', {
        adapterCode: 'orderTransition',
        orderCodeField: 'code',
        state: 'Shipped',
    })

    .export('order-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'pim-order-import.csv',
    })

    .edge('manual', 'fetch-orders')
    .edge('fetch-orders', 'check-orders')
    .edge('check-orders', 'set-defaults')
    .edge('set-defaults', 'prepare-orders')
    .edge('prepare-orders', 'create-orders')
    .edge('create-orders', 'add-notes')
    .edge('add-notes', 'transition-shipped')
    .edge('transition-shipped', 'order-report')

    .build();

// =============================================================================
// P15: MAGENTO CUSTOMER MIGRATION — One-time customer import from Magento
// =============================================================================

const MAGENTO_API_URL = process.env.MAGENTO_API_URL || mockUrl(MOCK_PORTS.MAGENTO);

export const magentoCustomerMigration = createPipeline()
    .name('Magento Customer Migration')
    .description('One-time migration of customers from Magento 2 with address conversion and group mapping')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    .extract('fetch-magento-customers', {
        adapterCode: 'httpApi',
        url: MAGENTO_API_URL + '/rest/V1/customers/search?searchCriteria[pageSize]=100&searchCriteria[currentPage]=1',
        method: 'GET',
        bearerTokenSecretCode: 'magento-bearer-token',
        itemsField: 'items',
    })

    .validate('check-customer-data', {
        rules: [
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid email required' } },
            { type: 'business', spec: { field: 'firstname', required: true, error: 'First name required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .transform('map-magento-customer', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'rename', args: { from: 'firstname', to: 'firstName' } },
            { op: 'rename', args: { from: 'lastname', to: 'lastName' } },
            {
                op: 'script',
                args: {
                    code: `
                        const addresses = (record.addresses || []).map(a => ({
                            fullName: (a.firstname || '') + ' ' + (a.lastname || ''),
                            streetLine1: (a.street || [''])[0],
                            streetLine2: (a.street || ['', ''])[1] || undefined,
                            city: a.city || '',
                            postalCode: a.postcode || '',
                            countryCode: a.country_id || 'US',
                            province: a.region?.region || '',
                            phoneNumber: a.telephone || '',
                            defaultShippingAddress: !!a.default_shipping,
                            defaultBillingAddress: !!a.default_billing,
                        }));
                        record.addresses = addresses;
                        record.groups = [];
                        if (record.group_id === 2) record.groups.push('wholesale');
                        if (record.group_id === 3) record.groups.push('retailer');
                        return record;
                    `,
                },
            },
        ],
    })

    .gate('review-customers', {
        approvalType: 'MANUAL',
        previewCount: 5,
    })

    .load('import-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groups',
        addressesMode: 'REPLACE_ALL',
    })

    .export('migration-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'magento-customer-migration.csv',
    })

    .edge('manual', 'fetch-magento-customers')
    .edge('fetch-magento-customers', 'check-customer-data')
    .edge('check-customer-data', 'map-magento-customer')
    .edge('map-magento-customer', 'review-customers')
    .edge('review-customers', 'import-customers')
    .edge('import-customers', 'migration-report')

    .build();

// =============================================================================
// P16: RESILIENCE TEST — Edge case API with failure simulation
// =============================================================================

const EDGE_API_URL = process.env.EDGE_API_URL || mockUrl(MOCK_PORTS.EDGE_CASE);

export const resilienceTest = createPipeline()
    .name('Resilience Test Pipeline')
    .description('Tests error handling, retries, and partial failures using the edge-case mock API')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('manual', { type: 'MANUAL' })

    // Branch 1: Partial failure products (30% records have errors)
    .extract('fetch-partial-fail', {
        adapterCode: 'httpApi',
        url: EDGE_API_URL + '/api/products?partialFail=0.3',
        method: 'GET',
        itemsField: 'data',
    })

    .validate('check-products', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU required' } },
            { type: 'business', spec: { field: 'price', required: true, min: 0, error: 'Valid price required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .route('split-by-validity', {
        branches: [
            { name: 'valid', when: [{ field: '_validationErrors', cmp: 'eq', value: null }] },
            { name: 'errors', when: [{ field: '_validationErrors', cmp: 'ne', value: null }] },
        ],
    })

    .transform('map-valid', {
        operators: [
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } },
        ],
    })

    .load('upsert-valid', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        skuField: 'sku',
        priceField: 'priceInCents',
    })

    .export('error-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'resilience-errors.csv',
    })

    // Branch 2: Bulk data stress test
    .extract('fetch-bulk', {
        adapterCode: 'httpApi',
        url: EDGE_API_URL + '/api/products/bulk?count=200',
        method: 'GET',
        itemsField: 'data',
    })

    .transform('map-bulk', {
        operators: [
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'toNumber', args: { source: 'price' } },
        ],
    })

    .export('bulk-report', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'bulk-test-results.json',
    })

    // Branch 3: Paginated extraction (cursor + offset)
    .extract('fetch-paginated', {
        adapterCode: 'httpApi',
        url: EDGE_API_URL + '/api/products/paginated?limit=25',
        method: 'GET',
        itemsField: 'data',
        pagination: {
            type: 'OFFSET',
            pageSize: 25,
            totalPath: 'meta.total',
            offsetParam: 'offset',
            limitParam: 'limit',
        },
    })

    .export('paginated-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'paginated-extract.csv',
    })

    // Graph edges
    .edge('manual', 'fetch-partial-fail')
    .edge('manual', 'fetch-bulk')
    .edge('manual', 'fetch-paginated')

    // Branch 1: partial fail → validate → route → valid/errors
    .edge('fetch-partial-fail', 'check-products')
    .edge('check-products', 'split-by-validity')
    .edge('split-by-validity', 'map-valid', 'valid')
    .edge('map-valid', 'upsert-valid')
    .edge('split-by-validity', 'error-report', 'errors')

    // Branch 2: bulk → transform → export
    .edge('fetch-bulk', 'map-bulk')
    .edge('map-bulk', 'bulk-report')

    // Branch 3: paginated → export
    .edge('fetch-paginated', 'paginated-report')

    .build();
