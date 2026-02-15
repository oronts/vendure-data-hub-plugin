/**
 * Data Processing Pipelines - Data enrichment and analytics
 *
 * These pipelines demonstrate:
 * - VALIDATE steps with rules
 * - ENRICH steps with defaults, set, and computed fields
 * - Parallel processing branches for different enrichment paths
 * - Data transformation and aggregation
 */

import { createPipeline } from '../../../src';

/**
 * Advanced Product Enrichment Pipeline
 *
 * Demonstrates:
 * - VALIDATE step to ensure data quality before enrichment
 * - Parallel branches: SEO enrichment + Pricing enrichment running concurrently
 * - ENRICH steps with computed fields
 * - Merge of parallel branches before final load
 */
export const productEnrichment = createPipeline()
    .name('Product Enrichment')
    .description('Enrich products with VALIDATE, parallel SEO/Pricing enrichment, and computed fields')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,facetValues',
        languageCode: 'en',
        batchSize: 50,
    })

    // VALIDATE step - ensure data quality before processing
    .validate('validate-products', {
        rules: [
            // Required fields for enrichment
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU is required for enrichment' } },
            { type: 'business', spec: { field: 'priceWithTax', required: true, error: 'Price is required' } },
            { type: 'business', spec: { field: 'product.name', required: true, error: 'Product name is required' } },
            // Price must be positive
            { type: 'business', spec: { field: 'priceWithTax', min: 0, error: 'Price cannot be negative' } },
            // SKU format validation
            { type: 'business', spec: { field: 'sku', pattern: '^[A-Za-z0-9_-]+$', error: 'SKU must be alphanumeric' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
        validationMode: 'STRICT',
    })

    .transform('filter-valid', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'enabled', cmp: 'eq', value: true },
                        { field: '_errors', cmp: 'exists', value: false },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    // =====================================================
    // PARALLEL BRANCH 1: SEO Enrichment
    // =====================================================
    .transform('generate-slugs', {
        operators: [
            { op: 'slugify', args: { source: 'product.name', target: 'productSlug' } },
            { op: 'template', args: { template: '${productSlug}-${sku}', target: 'variantSlug' } },
            { op: 'slugify', args: { source: 'variantSlug' } },
        ],
    })

    // ENRICH step for SEO metadata with computed fields
    .enrich('enrich-seo', {
        sourceType: 'STATIC',
        // Computed fields using expressions
        computed: {
            // Generate SEO title from product name
            seoTitle: 'record.product?.name ? record.product.name.substring(0, 50) + " - Buy Online | Store" : "Product | Store"',
            // Generate canonical URL
            canonicalUrl: '"https://store.example.com/products/" + record.productSlug',
            // Check if needs SEO review (missing description)
            needsSeoReview: '!record.product?.description || record.product.description.length < 50',
        },
        // Set fixed values
        set: {
            seoEnrichedAt: '${@now}',
            seoVersion: '2.0',
        },
    })

    .transform('generate-seo-description', {
        operators: [
            { op: 'stripHtml', args: { source: 'product.description', target: 'descriptionClean' } },
            { op: 'truncate', args: { source: 'descriptionClean', target: 'seoDescription', length: 155, suffix: '...' } },
            {
                op: 'template',
                args: {
                    template: '{"@type": "Product", "name": "${product.name}", "sku": "${sku}", "url": "${canonicalUrl}"}',
                    target: 'structuredData',
                },
            },
        ],
    })

    // =====================================================
    // PARALLEL BRANCH 2: Pricing Enrichment
    // =====================================================
    .transform('prepare-pricing', {
        operators: [
            { op: 'toNumber', args: { source: 'customFields.costPrice' } },
            { op: 'toNumber', args: { source: 'priceWithTax' } },
        ],
    })

    // ENRICH step for pricing calculations with computed fields
    .enrich('enrich-pricing', {
        sourceType: 'STATIC',
        // Default cost price if not set
        defaults: {
            'customFields.costPrice': 0,
        },
        // Computed pricing metrics
        computed: {
            // Calculate margin percentage
            marginPercent: 'record.customFields?.costPrice > 0 ? Math.round((record.priceWithTax - record.customFields.costPrice) / record.priceWithTax * 10000) / 100 : 0',
            // Calculate markup percentage
            markupPercent: 'record.customFields?.costPrice > 0 ? Math.round((record.priceWithTax - record.customFields.costPrice) / record.customFields.costPrice * 10000) / 100 : 0',
            // Profit per unit
            profitPerUnit: 'record.priceWithTax - (record.customFields?.costPrice || 0)',
            // Determine price tier
            priceTier: 'record.priceWithTax < 2500 ? "budget" : record.priceWithTax >= 10000 ? "premium" : "standard"',
            // Flag low-margin products (< 20%)
            isLowMargin: 'record.customFields?.costPrice > 0 && ((record.priceWithTax - record.customFields.costPrice) / record.priceWithTax * 100) < 20',
        },
        set: {
            pricingEnrichedAt: '${@now}',
        },
    })

    // =====================================================
    // MERGE: Combine SEO and Pricing enrichments
    // =====================================================
    .transform('merge-enrichments', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        // SEO fields
                        'customFields.seoTitle': 'seoTitle',
                        'customFields.seoDescription': 'seoDescription',
                        'customFields.canonicalUrl': 'canonicalUrl',
                        'customFields.structuredData': 'structuredData',
                        'customFields.needsSeoReview': 'needsSeoReview',
                        // Pricing fields
                        'customFields.marginPercent': 'marginPercent',
                        'customFields.markupPercent': 'markupPercent',
                        'customFields.profitPerUnit': 'profitPerUnit',
                        'customFields.priceTier': 'priceTier',
                        'customFields.isLowMargin': 'isLowMargin',
                        // Timestamps
                        'customFields.enrichedAt': '@now',
                    },
                },
            },
        ],
    })

    .load('update-variants', {
        adapterCode: 'variantUpsert',
        skuField: 'sku',
    })

    // =====================================================
    // PARALLEL BRANCH 3: Export low-margin products report
    // =====================================================
    .transform('filter-low-margin', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'isLowMargin', cmp: 'eq', value: true }],
                    action: 'keep',
                },
            },
            {
                op: 'pick',
                args: {
                    fields: ['sku', 'product.name', 'priceWithTax', 'customFields.costPrice', 'marginPercent', 'priceTier'],
                },
            },
        ],
    })

    .export('export-low-margin', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './reports',
        filenamePattern: 'low-margin-products-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    // Define the flow with parallel branches
    .edge('start', 'fetch-products')
    .edge('fetch-products', 'validate-products')
    .edge('validate-products', 'filter-valid')

    // Parallel Branch 1: SEO Enrichment
    .edge('filter-valid', 'generate-slugs')
    .edge('generate-slugs', 'enrich-seo')
    .edge('enrich-seo', 'generate-seo-description')

    // Parallel Branch 2: Pricing Enrichment
    .edge('filter-valid', 'prepare-pricing')
    .edge('prepare-pricing', 'enrich-pricing')

    // Merge point: Both branches feed into merge-enrichments
    .edge('generate-seo-description', 'merge-enrichments')
    .edge('enrich-pricing', 'merge-enrichments')

    // After merge: update variants
    .edge('merge-enrichments', 'update-variants')

    // Parallel Branch 3: Export low-margin report (branches from enrich-pricing)
    .edge('enrich-pricing', 'filter-low-margin')
    .edge('filter-low-margin', 'export-low-margin')

    .build();

export const orderAnalytics = createPipeline()
    .name('Order Analytics')
    .description('Extract orders, calculate totals, and generate analytics')
    .capabilities({ requires: ['ReadOrder'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-orders', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'customer,lines,channels',
        batchSize: 100,
    })

    .transform('filter-orders', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'state', cmp: 'in', value: ['PaymentSettled', 'Shipped', 'Delivered', 'Completed'] },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('extract-metrics', {
        operators: [
            {
                op: 'dateFormat',
                args: {
                    source: 'orderPlacedAt',
                    target: 'orderDate',
                    format: 'YYYY-MM-DD',
                },
            },
            {
                op: 'dateFormat',
                args: {
                    source: 'orderPlacedAt',
                    target: 'orderMonth',
                    format: 'YYYY-MM',
                },
            },
            {
                op: 'dateFormat',
                args: {
                    source: 'orderPlacedAt',
                    target: 'orderWeek',
                    format: 'YYYY-WW',
                },
            },
            { op: 'count', args: { source: 'lines', target: 'lineItemCount' } },
            {
                op: 'aggregate',
                args: {
                    op: 'sum',
                    source: 'lines.*.quantity',
                    target: 'totalQuantity',
                },
            },
            { op: 'currency', args: { source: 'subTotalWithTax', target: 'subtotal', decimals: 2 } },
            { op: 'currency', args: { source: 'shippingWithTax', target: 'shipping', decimals: 2 } },
            { op: 'currency', args: { source: 'totalWithTax', target: 'total', decimals: 2 } },
            { op: 'rename', args: { from: 'channels.0.code', to: 'channelCode' } },
        ],
    })

    .transform('enrich-customer', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        orderId: 'id',
                        orderCode: 'code',
                        orderDate: 'orderDate',
                        orderMonth: 'orderMonth',
                        orderWeek: 'orderWeek',
                        customerId: 'customer.id',
                        customerEmail: 'customer.emailAddress',
                        customerName: 'customer.firstName',
                        lineItemCount: 'lineItemCount',
                        totalQuantity: 'totalQuantity',
                        subtotal: 'subtotal',
                        shipping: 'shipping',
                        total: 'total',
                        channelCode: 'channelCode',
                        state: 'state',
                    },
                },
            },
            {
                op: 'template',
                args: {
                    template: '${customer.firstName} ${customer.lastName}',
                    target: 'customerFullName',
                },
            },
        ],
    })

    .transform('calculate-aggregates', {
        operators: [
            {
                op: 'aggregate',
                args: {
                    op: 'count',
                    target: 'totalOrderCount',
                },
            },
            {
                op: 'aggregate',
                args: {
                    op: 'sum',
                    source: 'total',
                    target: 'runningTotal',
                },
            },
            {
                op: 'template',
                args: {
                    template: '${runningTotal / totalOrderCount}',
                    target: 'averageOrderValue',
                },
            },
            { op: 'toNumber', args: { source: 'averageOrderValue' } },
            {
                op: 'round',
                args: {
                    source: 'averageOrderValue',
                    decimals: 2,
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
                        'orderId',
                        'orderCode',
                        'orderDate',
                        'orderMonth',
                        'customerEmail',
                        'customerFullName',
                        'lineItemCount',
                        'totalQuantity',
                        'subtotal',
                        'shipping',
                        'total',
                        'channelCode',
                        'state',
                        'averageOrderValue',
                    ],
                },
            },
        ],
    })

    .export('write-analytics', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './analytics',
        filenamePattern: 'order-analytics-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-orders')
    .edge('fetch-orders', 'filter-orders')
    .edge('filter-orders', 'extract-metrics')
    .edge('extract-metrics', 'enrich-customer')
    .edge('enrich-customer', 'calculate-aggregates')
    .edge('calculate-aggregates', 'select-fields')
    .edge('select-fields', 'write-analytics')
    .build();

/**
 * Advanced Customer Segmentation Pipeline
 *
 * Demonstrates:
 * - VALIDATE step for data quality
 * - ENRICH step with computed RFM scores
 * - Parallel branches: Update customer groups + Export segment reports
 * - Advanced computed expressions for business logic
 */
export const customerSegmentation = createPipeline()
    .name('Customer Segmentation')
    .description('Segment customers with VALIDATE, ENRICH computed RFM, and parallel reporting')
    .capabilities({ requires: ['ReadCustomer', 'ReadOrder', 'UpdateCustomer'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-customers', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'orders,groups',
        batchSize: 100,
    })

    // VALIDATE step - ensure customer data quality
    .validate('validate-customers', {
        rules: [
            { type: 'business', spec: { field: 'emailAddress', required: true, error: 'Email is required' } },
            { type: 'business', spec: { field: 'emailAddress', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', error: 'Invalid email format' } },
            { type: 'business', spec: { field: 'id', required: true, error: 'Customer ID is required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
        validationMode: 'STRICT',
    })

    .transform('filter-active', {
        operators: [
            { op: 'count', args: { source: 'orders', target: 'orderCount' } },
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'orderCount', cmp: 'gt', value: 0 },
                        { field: '_errors', cmp: 'exists', value: false },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('calculate-base-metrics', {
        operators: [
            { op: 'first', args: { source: 'orders', target: 'lastOrder' } },
            { op: 'dateFormat', args: { source: 'lastOrder.orderPlacedAt', target: 'lastOrderDate', format: 'YYYY-MM-DD' } },
            { op: 'now', args: { target: 'today', format: 'YYYY-MM-DD' } },
            { op: 'aggregate', args: { op: 'sum', source: 'orders.*.totalWithTax', target: 'totalSpentRaw' } },
        ],
    })

    // ENRICH step - compute RFM scores and segments using expressions
    .enrich('enrich-rfm-scores', {
        sourceType: 'STATIC',
        // Computed RFM metrics using JavaScript expressions
        computed: {
            // Lifetime value formatted
            lifetimeValue: 'Math.round(record.totalSpentRaw) / 100',
            // Average order value
            avgOrderValue: 'record.orderCount > 0 ? Math.round(record.totalSpentRaw / record.orderCount) / 100 : 0',
            // Frequency Score (1-5)
            frequencyScore: 'record.orderCount >= 20 ? 5 : record.orderCount >= 10 ? 4 : record.orderCount >= 5 ? 3 : record.orderCount >= 2 ? 2 : 1',
            // Monetary Score (1-5) - based on total spent in cents
            monetaryScore: 'record.totalSpentRaw >= 100000 ? 5 : record.totalSpentRaw >= 50000 ? 4 : record.totalSpentRaw >= 25000 ? 3 : record.totalSpentRaw >= 10000 ? 2 : 1',
            // Combined RFM score
            rfmScore: '(record.orderCount >= 20 ? 5 : record.orderCount >= 10 ? 4 : record.orderCount >= 5 ? 3 : record.orderCount >= 2 ? 2 : 1) + (record.totalSpentRaw >= 100000 ? 5 : record.totalSpentRaw >= 50000 ? 4 : record.totalSpentRaw >= 25000 ? 3 : record.totalSpentRaw >= 10000 ? 2 : 1)',
            // Segment assignment
            segment: 'record.orderCount === 1 ? "new" : ((record.orderCount >= 20 ? 5 : record.orderCount >= 10 ? 4 : record.orderCount >= 5 ? 3 : record.orderCount >= 2 ? 2 : 1) + (record.totalSpentRaw >= 100000 ? 5 : record.totalSpentRaw >= 50000 ? 4 : record.totalSpentRaw >= 25000 ? 3 : record.totalSpentRaw >= 10000 ? 2 : 1)) >= 8 ? "champion" : ((record.orderCount >= 20 ? 5 : record.orderCount >= 10 ? 4 : record.orderCount >= 5 ? 3 : record.orderCount >= 2 ? 2 : 1) + (record.totalSpentRaw >= 100000 ? 5 : record.totalSpentRaw >= 50000 ? 4 : record.totalSpentRaw >= 25000 ? 3 : record.totalSpentRaw >= 10000 ? 2 : 1)) >= 5 ? "loyal" : "standard"',
            // Engagement level for marketing
            engagementLevel: 'record.orderCount >= 10 ? "high" : record.orderCount >= 3 ? "medium" : "low"',
            // Churn risk indicator
            isHighValue: 'record.totalSpentRaw >= 50000',
        },
        set: {
            segmentedAt: '${@now}',
            segmentVersion: 'rfm-v2',
        },
    })

    .transform('assign-group-codes', {
        operators: [
            {
                op: 'lookup',
                args: {
                    source: 'segment',
                    target: 'groupCode',
                    map: {
                        champion: 'segment-champions',
                        loyal: 'segment-loyal',
                        standard: 'segment-standard',
                        new: 'segment-new',
                        at_risk: 'segment-at-risk',
                        dormant: 'segment-dormant',
                    },
                    default: 'segment-standard',
                },
            },
        ],
    })

    // =====================================================
    // PARALLEL BRANCH 1: Update customer groups
    // =====================================================
    .transform('prepare-update', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        email: 'emailAddress',
                        segment: 'segment',
                        groupCode: 'groupCode',
                        rfmScore: 'rfmScore',
                        frequencyScore: 'frequencyScore',
                        monetaryScore: 'monetaryScore',
                        lifetimeValue: 'lifetimeValue',
                        orderCount: 'orderCount',
                        avgOrderValue: 'avgOrderValue',
                        engagementLevel: 'engagementLevel',
                    },
                },
            },
            {
                op: 'enrich',
                args: {
                    set: {
                        groupCodes: ['${groupCode}'],
                    },
                },
            },
        ],
    })

    .load('update-customers', {
        adapterCode: 'customerUpsert',
        emailField: 'email',
        groupsField: 'groupCodes',
        groupsMode: 'add',
    })

    // =====================================================
    // PARALLEL BRANCH 2: Export champion customers report
    // =====================================================
    .transform('filter-champions', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'segment', cmp: 'eq', value: 'champion' }],
                    action: 'keep',
                },
            },
            {
                op: 'pick',
                args: {
                    fields: ['emailAddress', 'firstName', 'lastName', 'rfmScore', 'lifetimeValue', 'orderCount', 'avgOrderValue'],
                },
            },
        ],
    })

    .export('export-champions', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './reports/segments',
        filenamePattern: 'champion-customers-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    // =====================================================
    // PARALLEL BRANCH 3: Export high-value at-risk report
    // =====================================================
    .transform('filter-high-value', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'isHighValue', cmp: 'eq', value: true },
                        { field: 'segment', cmp: 'ne', value: 'champion' },
                    ],
                    action: 'keep',
                },
            },
            {
                op: 'pick',
                args: {
                    fields: ['emailAddress', 'firstName', 'lastName', 'segment', 'rfmScore', 'lifetimeValue', 'lastOrderDate'],
                },
            },
        ],
    })

    .export('export-high-value-non-champions', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './reports/segments',
        filenamePattern: 'high-value-opportunities-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    // Flow with parallel branches
    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'validate-customers')
    .edge('validate-customers', 'filter-active')
    .edge('filter-active', 'calculate-base-metrics')
    .edge('calculate-base-metrics', 'enrich-rfm-scores')
    .edge('enrich-rfm-scores', 'assign-group-codes')

    // Parallel Branch 1: Update customer groups
    .edge('assign-group-codes', 'prepare-update')
    .edge('prepare-update', 'update-customers')

    // Parallel Branch 2: Export champion customers
    .edge('assign-group-codes', 'filter-champions')
    .edge('filter-champions', 'export-champions')

    // Parallel Branch 3: Export high-value non-champions (marketing opportunities)
    .edge('assign-group-codes', 'filter-high-value')
    .edge('filter-high-value', 'export-high-value-non-champions')

    .build();
