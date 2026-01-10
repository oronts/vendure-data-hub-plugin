/**
 * Data Processing Pipelines - Data enrichment and analytics
 */

import { createPipeline } from '../../../src';

export const productEnrichment = createPipeline()
    .name('Product Enrichment')
    .description('Enrich products with calculated fields, slugs, and SEO metadata')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-products', {
        adapterCode: 'vendure-query',
        entity: 'ProductVariant',
        relations: 'translations,product,facetValues',
        languageCode: 'en',
        batchSize: 50,
    })

    .transform('filter-products', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'enabled', cmp: 'eq', value: true }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('generate-slugs', {
        operators: [
            { op: 'slugify', args: { source: 'product.name', target: 'productSlug' } },
            {
                op: 'template',
                args: {
                    template: '${productSlug}-${sku}',
                    target: 'variantSlug',
                },
            },
            { op: 'slugify', args: { source: 'variantSlug' } },
            {
                op: 'template',
                args: {
                    template: 'https://your-store.com/products/${productSlug}',
                    target: 'canonicalUrl',
                },
            },
        ],
    })

    .transform('calculate-pricing', {
        operators: [
            { op: 'toNumber', args: { source: 'customFields.costPrice' } },
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'customFields.costPrice', cmp: 'gt', value: 0 }],
                    action: 'keep',
                },
            },
            {
                op: 'template',
                args: {
                    template: '${(priceWithTax - customFields.costPrice) / priceWithTax * 100}',
                    target: 'marginPercentRaw',
                },
            },
            { op: 'toNumber', args: { source: 'marginPercentRaw' } },
            {
                op: 'round',
                args: {
                    source: 'marginPercentRaw',
                    target: 'marginPercent',
                    decimals: 2,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${(priceWithTax - customFields.costPrice) / customFields.costPrice * 100}',
                    target: 'markupPercentRaw',
                },
            },
            { op: 'toNumber', args: { source: 'markupPercentRaw' } },
            {
                op: 'round',
                args: {
                    source: 'markupPercentRaw',
                    target: 'markupPercent',
                    decimals: 2,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${priceWithTax - customFields.costPrice}',
                    target: 'profitPerUnit',
                },
            },
            { op: 'toNumber', args: { source: 'profitPerUnit' } },
        ],
    })

    .transform('generate-seo', {
        operators: [
            {
                op: 'template',
                args: {
                    template: '${product.name} - Buy Online | Your Store',
                    target: 'seoTitle',
                },
            },
            {
                op: 'truncate',
                args: {
                    source: 'seoTitle',
                    length: 60,
                    suffix: '',
                },
            },
            { op: 'stripHtml', args: { source: 'product.description', target: 'descriptionClean' } },
            {
                op: 'truncate',
                args: {
                    source: 'descriptionClean',
                    target: 'seoDescription',
                    length: 155,
                    suffix: '...',
                },
            },
            {
                op: 'template',
                args: {
                    template: '{"@type": "Product", "name": "${product.name}", "sku": "${sku}"}',
                    target: 'structuredData',
                },
            },
        ],
    })

    .transform('auto-categorize', {
        operators: [
            {
                op: 'currency',
                args: {
                    source: 'priceWithTax',
                    target: 'priceFormatted',
                    decimals: 2,
                },
            },
            // Set default tier
            { op: 'set', args: { path: 'priceTier', value: 'standard' } },
            // Budget tier: priceWithTax < 2500 cents ($25)
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'priceWithTax', cmp: 'lt', value: 2500 },
                    thenValue: 'budget',
                    target: 'priceTier',
                },
            },
            // Premium tier: priceWithTax >= 10000 cents ($100)
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'priceWithTax', cmp: 'gte', value: 10000 },
                    thenValue: 'premium',
                    target: 'priceTier',
                },
            },
        ],
    })

    .transform('prepare-update', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        'customFields.seoTitle': 'seoTitle',
                        'customFields.seoDescription': 'seoDescription',
                        'customFields.canonicalUrl': 'canonicalUrl',
                        'customFields.marginPercent': 'marginPercent',
                        'customFields.priceTier': 'priceTier',
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

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'filter-products')
    .edge('filter-products', 'generate-slugs')
    .edge('generate-slugs', 'calculate-pricing')
    .edge('calculate-pricing', 'generate-seo')
    .edge('generate-seo', 'auto-categorize')
    .edge('auto-categorize', 'prepare-update')
    .edge('prepare-update', 'update-variants')
    .build();

export const orderAnalytics = createPipeline()
    .name('Order Analytics')
    .description('Extract orders, calculate totals, and generate analytics')
    .capabilities({ requires: ['ReadOrder'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-orders', {
        adapterCode: 'vendure-query',
        entity: 'Order',
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
                op: 'formatDate',
                args: {
                    source: 'orderPlacedAt',
                    target: 'orderDate',
                    format: 'YYYY-MM-DD',
                },
            },
            {
                op: 'formatDate',
                args: {
                    source: 'orderPlacedAt',
                    target: 'orderMonth',
                    format: 'YYYY-MM',
                },
            },
            {
                op: 'formatDate',
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
        format: 'csv',
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

export const customerSegmentation = createPipeline()
    .name('Customer Segmentation')
    .description('Segment customers based on purchase history using RFM analysis')
    .capabilities({ requires: ['ReadCustomer', 'ReadOrder', 'UpdateCustomer'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-customers', {
        adapterCode: 'vendure-query',
        entity: 'Customer',
        relations: 'orders,groups',
        batchSize: 100,
    })

    .transform('filter-active', {
        operators: [
            { op: 'count', args: { source: 'orders', target: 'orderCount' } },
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'orderCount', cmp: 'gt', value: 0 }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('calculate-rfm', {
        operators: [
            { op: 'first', args: { source: 'orders', target: 'lastOrder' } },
            {
                op: 'formatDate',
                args: {
                    source: 'lastOrder.orderPlacedAt',
                    target: 'lastOrderDate',
                    format: 'YYYY-MM-DD',
                },
            },
            { op: 'now', args: { target: 'today', format: 'YYYY-MM-DD' } },
            {
                op: 'aggregate',
                args: {
                    op: 'sum',
                    source: 'orders.*.totalWithTax',
                    target: 'totalSpentRaw',
                },
            },
            {
                op: 'currency',
                args: {
                    source: 'totalSpentRaw',
                    target: 'lifetimeValue',
                    decimals: 2,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${totalSpentRaw / orderCount}',
                    target: 'avgOrderValueRaw',
                },
            },
            { op: 'toNumber', args: { source: 'avgOrderValueRaw' } },
            {
                op: 'currency',
                args: {
                    source: 'avgOrderValueRaw',
                    target: 'avgOrderValue',
                    decimals: 2,
                },
            },
        ],
    })

    .transform('score-rfm', {
        operators: [
            // Frequency Score (1-5 based on order count)
            { op: 'set', args: { path: 'frequencyScore', value: 1 } },
            { op: 'ifThenElse', args: { condition: { field: 'orderCount', cmp: 'gte', value: 2 }, thenValue: 2, target: 'frequencyScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'orderCount', cmp: 'gte', value: 5 }, thenValue: 3, target: 'frequencyScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'orderCount', cmp: 'gte', value: 10 }, thenValue: 4, target: 'frequencyScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'orderCount', cmp: 'gte', value: 20 }, thenValue: 5, target: 'frequencyScore' } },
            // Monetary Score (1-5 based on total spent in cents)
            { op: 'set', args: { path: 'monetaryScore', value: 1 } },
            { op: 'ifThenElse', args: { condition: { field: 'totalSpentRaw', cmp: 'gte', value: 10000 }, thenValue: 2, target: 'monetaryScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'totalSpentRaw', cmp: 'gte', value: 25000 }, thenValue: 3, target: 'monetaryScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'totalSpentRaw', cmp: 'gte', value: 50000 }, thenValue: 4, target: 'monetaryScore' } },
            { op: 'ifThenElse', args: { condition: { field: 'totalSpentRaw', cmp: 'gte', value: 100000 }, thenValue: 5, target: 'monetaryScore' } },
            // Calculate combined RFM score
            {
                op: 'template',
                args: {
                    template: '${frequencyScore + monetaryScore}',
                    target: 'rfmScore',
                },
            },
            { op: 'toNumber', args: { source: 'rfmScore' } },
        ],
    })

    .transform('assign-segment', {
        operators: [
            // Assign segment based on RFM score
            { op: 'set', args: { path: 'segment', value: 'standard' } },
            // New customers (only 1 order) - check first to override later
            { op: 'ifThenElse', args: { condition: { field: 'orderCount', cmp: 'eq', value: 1 }, thenValue: 'new', target: 'segment' } },
            // Loyal customers (5-7 RFM score)
            { op: 'ifThenElse', args: { condition: { field: 'rfmScore', cmp: 'gte', value: 5 }, thenValue: 'loyal', target: 'segment' } },
            // Champions (8+ RFM score) - highest priority, checked last
            { op: 'ifThenElse', args: { condition: { field: 'rfmScore', cmp: 'gte', value: 8 }, thenValue: 'champion', target: 'segment' } },
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

    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'filter-active')
    .edge('filter-active', 'calculate-rfm')
    .edge('calculate-rfm', 'score-rfm')
    .edge('score-rfm', 'assign-segment')
    .edge('assign-segment', 'prepare-update')
    .edge('prepare-update', 'update-customers')
    .build();
