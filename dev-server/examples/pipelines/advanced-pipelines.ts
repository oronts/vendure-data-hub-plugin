/**
 * Advanced Pipelines - Examples for hooks, scripts, and custom adapters
 *
 * These pipelines demonstrate:
 * - Interceptor hooks that modify data
 * - Script hooks for programmatic processing
 * - Script operator for inline transformations
 * - Custom adapter patterns via SDK
 */

import { createPipeline } from '../../../src';

// =============================================================================
// 1. INTERCEPTOR HOOKS - Modify data during pipeline execution
// =============================================================================

/**
 * Pipeline demonstrating interceptor hooks that can modify records.
 *
 * Interceptor hooks run at specific stages and can transform the data
 * before it continues to the next step. Unlike observation-only hooks,
 * interceptors return modified records.
 *
 * Use cases:
 * - Add computed fields before load
 * - Filter records based on external conditions
 * - Enrich data with external API calls
 * - Apply business rules programmatically
 */
export const interceptorHooksPipeline = createPipeline()
    .name('Interceptor Hooks Example')
    .description('Demonstrates interceptor hooks that modify records during pipeline execution')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'product,stockLevels',
        batchSize: 50,
    })

    .transform('basic-transform', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        name: 'name',
                        price: 'priceWithTax',
                        stock: 'stockLevels.0.stockOnHand',
                    },
                },
            },
        ],
    })

    .load('log-output', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/products/log',
        method: 'POST',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'basic-transform')
    .edge('basic-transform', 'log-output')

    // Interceptor hooks that modify data
    .hooks({
        // After extract: Add metadata to all records
        AFTER_EXTRACT: [
            {
                type: 'INTERCEPTOR',
                name: 'Add extraction metadata',
                code: `
                    return records.map(record => ({
                        ...record,
                        _metadata: {
                            extractedAt: new Date().toISOString(),
                            source: 'vendure',
                            version: '1.0',
                        }
                    }));
                `,
            },
        ],

        // Before transform: Filter based on conditions
        BEFORE_TRANSFORM: [
            {
                type: 'INTERCEPTOR',
                name: 'Filter low stock items',
                code: `
                    // Only process items with stock > 0
                    return records.filter(record => {
                        const stock = record.stockLevels?.[0]?.stockOnHand ?? 0;
                        return stock > 0;
                    });
                `,
            },
        ],

        // After transform: Add computed fields
        AFTER_TRANSFORM: [
            {
                type: 'INTERCEPTOR',
                name: 'Add computed fields',
                code: `
                    return records.map(record => ({
                        ...record,
                        priceFormatted: (record.price / 100).toFixed(2),
                        inStock: (record.stock || 0) > 0,
                        stockStatus: record.stock > 10 ? 'high' : record.stock > 0 ? 'low' : 'out',
                        processedAt: new Date().toISOString(),
                    }));
                `,
            },
        ],

        // Before load: Final validation
        BEFORE_LOAD: [
            {
                type: 'INTERCEPTOR',
                name: 'Validate before load',
                code: `
                    return records.filter(record => {
                        // Skip records missing required fields
                        if (!record.sku || !record.name) {
                            console.warn('Skipping record with missing sku or name:', record);
                            return false;
                        }
                        return true;
                    });
                `,
                failOnError: false,
            },
        ],

        // Observation hooks (don't modify data)
        PIPELINE_COMPLETED: [
            {
                type: 'LOG',
                level: 'INFO',
                message: 'Pipeline completed with interceptor hooks',
            },
        ],
    })

    .build();


// =============================================================================
// 2. SCRIPT HOOKS - Registered functions for reusable logic
// =============================================================================

/**
 * Pipeline demonstrating script hooks.
 *
 * Script hooks reference pre-registered functions by name.
 * This is preferred over inline code for:
 * - Type-safety
 * - Reusability
 * - Testing
 * - Version control
 *
 * To register scripts, use HookService.registerScript() in your plugin:
 *
 * @example
 * ```typescript
 * // In your plugin's onModuleInit:
 * hookService.registerScript('addCustomerSegment', async (records, context, args) => {
 *     const threshold = args?.spendThreshold || 1000;
 *     return records.map(r => ({
 *         ...r,
 *         segment: r.totalSpent > threshold ? 'premium' : 'standard'
 *     }));
 * });
 * ```
 */
export const scriptHooksPipeline = createPipeline()
    .name('Script Hooks Example')
    .description('Demonstrates registered script hooks for type-safe data modification')
    .capabilities({ requires: ['ReadCustomer'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-customers', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'orders',
        batchSize: 100,
    })

    .transform('calculate-totals', {
        operators: [
            { op: 'count', args: { source: 'orders', target: 'orderCount' } },
            {
                op: 'aggregate',
                args: {
                    op: 'sum',
                    source: 'orders.*.totalWithTax',
                    target: 'totalSpent',
                },
            },
        ],
    })

    .load('log-output', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/customers/log',
        method: 'POST',
    })

    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'calculate-totals')
    .edge('calculate-totals', 'log-output')

    .hooks({
        AFTER_TRANSFORM: [
            // Script hook - references a registered function
            {
                type: 'SCRIPT',
                name: 'Add customer segment',
                scriptName: 'addCustomerSegment',
                args: {
                    spendThreshold: 50000, // in cents
                    premiumLabel: 'VIP',
                    standardLabel: 'Regular',
                },
                timeout: 5000,
            },
        ],

        BEFORE_LOAD: [
            // Another script hook
            {
                type: 'SCRIPT',
                name: 'Enrich with external data',
                scriptName: 'enrichWithCRM',
                args: {
                    crmEndpoint: 'https://crm.example.com/api/lookup',
                },
                timeout: 10000,
                failOnError: false,
            },
        ],
    })

    .build();


// =============================================================================
// 3. SCRIPT OPERATOR - Inline JavaScript in transforms
// =============================================================================

/**
 * Pipeline demonstrating the script operator for complex transformations.
 *
 * The script operator allows inline JavaScript when standard operators
 * aren't sufficient. Use for:
 * - Complex conditional logic
 * - Custom calculations
 * - Data restructuring
 * - Cross-record operations (batch mode)
 */
export const scriptOperatorPipeline = createPipeline()
    .name('Script Operator Example')
    .description('Demonstrates inline JavaScript for complex transformations')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants',
        batchSize: 50,
    })

    // Transform using script operator for single records
    .transform('calculate-metrics', {
        operators: [
            // Use script operator for complex per-record logic
            {
                op: 'script',
                args: {
                    code: `
                        // Calculate product metrics from variants
                        const variants = record.variants || [];
                        const totalStock = variants.reduce((sum, v) => {
                            const stock = v.stockLevels?.[0]?.stockOnHand || 0;
                            return sum + stock;
                        }, 0);

                        const prices = variants.map(v => v.priceWithTax || 0);
                        const minPrice = Math.min(...prices);
                        const maxPrice = Math.max(...prices);

                        return {
                            id: record.id,
                            name: record.name,
                            slug: record.slug,
                            variantCount: variants.length,
                            totalStock,
                            priceRange: {
                                min: minPrice / 100,
                                max: maxPrice / 100,
                            },
                            hasStock: totalStock > 0,
                            isConfigurable: variants.length > 1,
                        };
                    `,
                    failOnError: false,
                },
            },
        ],
    })

    // Transform using script operator in batch mode
    .transform('sort-and-rank', {
        operators: [
            {
                op: 'script',
                args: {
                    batch: true,
                    code: `
                        // Sort by total stock descending and add rank
                        const sorted = records
                            .slice()
                            .sort((a, b) => (b.totalStock || 0) - (a.totalStock || 0));

                        return sorted.map((record, index) => ({
                            ...record,
                            stockRank: index + 1,
                            stockPercentile: Math.round((1 - index / sorted.length) * 100),
                        }));
                    `,
                },
            },
        ],
    })

    // Filter using script (return null to exclude)
    .transform('filter-active', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Only keep products with stock and multiple variants
                        if (!record.hasStock) return null;
                        if (record.variantCount < 1) return null;
                        return record;
                    `,
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './exports',
        filenamePattern: 'product-metrics-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'calculate-metrics')
    .edge('calculate-metrics', 'sort-and-rank')
    .edge('sort-and-rank', 'filter-active')
    .edge('filter-active', 'write-csv')

    .build();


// =============================================================================
// 4. COMBINING ALL APPROACHES - Real-world example
// =============================================================================

/**
 * Pipeline combining interceptors, scripts, and operators.
 *
 * This pipeline demonstrates a real-world scenario:
 * - Extract orders from Vendure
 * - Use interceptor to add external data
 * - Use script operator for complex calculations
 * - Use script hook for final enrichment
 * - Export to multiple formats
 */
export const advancedValidationPipeline = createPipeline()
    .name('Advanced Validation Pipeline')
    .description('Real-world example combining hooks, scripts, and custom logic')
    .capabilities({ requires: ['ReadOrder', 'ReadCustomer'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-orders', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'customer,lines,payments',
        batchSize: 50,
    })

    // Filter to completed orders
    .transform('filter-completed', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'state', cmp: 'in', value: ['PaymentSettled', 'Shipped', 'Delivered'] },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    // Use script operator for complex order analysis
    .transform('analyze-orders', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        const lines = record.lines || [];
                        const payments = record.payments || [];

                        // Calculate line item metrics
                        const itemCount = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
                        const uniqueProducts = new Set(lines.map(l => l.productVariantId)).size;

                        // Payment analysis
                        const paymentMethods = [...new Set(payments.map(p => p.method))];
                        const totalPaid = payments
                            .filter(p => p.state === 'Settled')
                            .reduce((sum, p) => sum + (p.amount || 0), 0);

                        return {
                            orderId: record.id,
                            orderCode: record.code,
                            state: record.state,
                            customerId: record.customer?.id,
                            customerEmail: record.customer?.emailAddress,
                            orderDate: record.orderPlacedAt,
                            subtotal: record.subTotalWithTax,
                            shipping: record.shippingWithTax,
                            total: record.totalWithTax,
                            itemCount,
                            uniqueProducts,
                            lineCount: lines.length,
                            paymentMethods: paymentMethods.join(', '),
                            totalPaid,
                            isPaid: totalPaid >= (record.totalWithTax || 0),
                        };
                    `,
                },
            },
        ],
    })

    // Standard operators for formatting
    .transform('format-output', {
        operators: [
            { op: 'currency', args: { source: 'subtotal', target: 'subtotalFormatted', decimals: 2 } },
            { op: 'currency', args: { source: 'shipping', target: 'shippingFormatted', decimals: 2 } },
            { op: 'currency', args: { source: 'total', target: 'totalFormatted', decimals: 2 } },
            {
                op: 'dateFormat',
                args: {
                    source: 'orderDate',
                    target: 'orderDateFormatted',
                    format: 'YYYY-MM-DD HH:mm',
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './exports',
        filenamePattern: 'orders-analysis-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-orders')
    .edge('fetch-orders', 'filter-completed')
    .edge('filter-completed', 'analyze-orders')
    .edge('analyze-orders', 'format-output')
    .edge('format-output', 'write-csv')

    .hooks({
        // Interceptor: Add customer lifetime value
        AFTER_EXTRACT: [
            {
                type: 'INTERCEPTOR',
                name: 'Add order sequence number',
                code: `
                    // Group orders by customer and add sequence number
                    const ordersByCustomer = new Map();

                    records.forEach(record => {
                        const customerId = record.customer?.id;
                        if (!customerId) return;

                        if (!ordersByCustomer.has(customerId)) {
                            ordersByCustomer.set(customerId, []);
                        }
                        ordersByCustomer.get(customerId).push(record);
                    });

                    // Sort by date and add sequence
                    ordersByCustomer.forEach(orders => {
                        orders.sort((a, b) =>
                            new Date(a.orderPlacedAt).getTime() - new Date(b.orderPlacedAt).getTime()
                        );
                        orders.forEach((order, idx) => {
                            order._customerOrderNumber = idx + 1;
                            order._isFirstOrder = idx === 0;
                        });
                    });

                    return records;
                `,
            },
        ],

        // Use script hook for final enrichment
        BEFORE_LOAD: [
            {
                type: 'SCRIPT',
                name: 'Final enrichment',
                scriptName: 'enrichOrdersWithAnalytics',
                args: {
                    includeRFM: true,
                    includeSegments: true,
                },
                timeout: 10000,
            },
        ],

        PIPELINE_COMPLETED: [
            {
                type: 'WEBHOOK',
                name: 'Notify on completion',
                url: 'https://example.com/webhooks/pipeline-complete',
            },
            {
                type: 'LOG',
                level: 'INFO',
                message: 'Order analysis pipeline completed',
            },
        ],

        PIPELINE_FAILED: [
            {
                type: 'WEBHOOK',
                name: 'Alert on failure',
                url: 'https://example.com/webhooks/pipeline-failed',
            },
        ],
    })

    .build();


// =============================================================================
// 5. ALL 18 HOOK STAGES - Complete demonstration
// =============================================================================

/**
 * Pipeline demonstrating ALL 18 available hook stages.
 *
 * Hook stages where interceptors can MODIFY data:
 * - beforeExtract, afterExtract
 * - beforeTransform, afterTransform
 * - beforeValidate, afterValidate
 * - beforeEnrich, afterEnrich
 * - beforeRoute, afterRoute
 * - beforeLoad, afterLoad
 *
 * Observation-only stages (emit events, log, webhook):
 * - pipelineStarted, pipelineCompleted, pipelineFailed
 * - onError, onRetry, onDeadLetter
 */
export const allHookStagesPipeline = createPipeline()
    .name('All 18 Hook Stages Demo')
    .description('Demonstrates every available hook stage with interceptors that can modify data')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'product,stockLevels',
        batchSize: 50,
    })

    .transform('basic-transform', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        name: 'name',
                        price: 'priceWithTax',
                        stock: 'stockLevels.0.stockOnHand',
                    },
                },
            },
        ],
    })

    .load('log-output', {
        adapterCode: 'restPost',
        endpoint: 'https://example.com/api/products/log',
        method: 'POST',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'basic-transform')
    .edge('basic-transform', 'log-output')

    .hooks({
        // =====================================================================
        // PIPELINE LIFECYCLE HOOKS (observation only)
        // =====================================================================
        PIPELINE_STARTED: [
            {
                type: 'WEBHOOK',
                name: 'Notify pipeline started',
                url: 'https://example.com/webhooks/pipeline-started',
            },
            {
                type: 'EMIT',
                name: 'Emit Vendure event',
                event: 'DataHubPipelineStarted',
            },
        ],

        PIPELINE_COMPLETED: [
            {
                type: 'WEBHOOK',
                name: 'Notify pipeline completed',
                url: 'https://example.com/webhooks/pipeline-completed',
            },
            {
                type: 'TRIGGER_PIPELINE',
                name: 'Trigger follow-up pipeline',
                pipelineCode: 'post-processing-pipeline',
            },
        ],

        PIPELINE_FAILED: [
            {
                type: 'WEBHOOK',
                name: 'Alert on failure',
                url: 'https://example.com/webhooks/pipeline-failed',
            },
        ],

        // =====================================================================
        // ERROR HANDLING HOOKS (observation only)
        // =====================================================================
        ON_ERROR: [
            {
                type: 'LOG',
                level: 'ERROR',
                message: 'Error occurred in pipeline',
            },
            {
                type: 'WEBHOOK',
                name: 'Error notification',
                url: 'https://example.com/webhooks/pipeline-error',
            },
        ],

        ON_RETRY: [
            {
                type: 'LOG',
                level: 'WARN',
                message: 'Retrying failed operation',
            },
        ],

        ON_DEAD_LETTER: [
            {
                type: 'WEBHOOK',
                name: 'Dead letter notification',
                url: 'https://example.com/webhooks/dead-letter',
            },
        ],

        // =====================================================================
        // EXTRACT STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_EXTRACT: [
            {
                type: 'INTERCEPTOR',
                name: 'Pre-extract setup',
                code: `
                    // Can modify seed records or add context before extraction
                    console.log('Before extract - preparing extraction');
                    return records.map(r => ({
                        ...r,
                        _extractStartTime: Date.now(),
                    }));
                `,
            },
        ],

        AFTER_EXTRACT: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-extract enrichment',
                code: `
                    // Add metadata after extraction
                    return records.map(r => ({
                        ...r,
                        _extractedAt: new Date().toISOString(),
                        _recordSource: 'vendure',
                    }));
                `,
            },
            {
                type: 'INTERCEPTOR',
                name: 'Filter invalid extracts',
                code: `
                    // Remove records without required data
                    return records.filter(r => r.sku && r.name);
                `,
            },
        ],

        // =====================================================================
        // TRANSFORM STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_TRANSFORM: [
            {
                type: 'INTERCEPTOR',
                name: 'Pre-transform validation',
                code: `
                    // Add validation flags before transform
                    return records.map(r => ({
                        ...r,
                        _transformStarted: true,
                        _originalPrice: r.priceWithTax,
                    }));
                `,
            },
        ],

        AFTER_TRANSFORM: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-transform computed fields',
                code: `
                    // Add computed fields after transform
                    return records.map(r => ({
                        ...r,
                        priceFormatted: (r.price / 100).toFixed(2),
                        stockStatus: r.stock > 10 ? 'high' : r.stock > 0 ? 'low' : 'out',
                        _transformCompleted: true,
                    }));
                `,
            },
        ],

        // =====================================================================
        // VALIDATE STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_VALIDATE: [
            {
                type: 'INTERCEPTOR',
                name: 'Pre-validation cleanup',
                code: `
                    // Clean data before validation
                    return records.map(r => ({
                        ...r,
                        sku: r.sku?.trim().toUpperCase(),
                        name: r.name?.trim(),
                    }));
                `,
            },
        ],

        AFTER_VALIDATE: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-validation marking',
                code: `
                    // Mark records that passed validation
                    return records.map(r => ({
                        ...r,
                        _validated: true,
                        _validatedAt: new Date().toISOString(),
                    }));
                `,
            },
        ],

        // =====================================================================
        // ENRICH STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_ENRICH: [
            {
                type: 'INTERCEPTOR',
                name: 'Pre-enrich preparation',
                code: `
                    // Prepare records for enrichment
                    return records.map(r => ({
                        ...r,
                        _enrichStarted: true,
                    }));
                `,
            },
        ],

        AFTER_ENRICH: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-enrich finalization',
                code: `
                    // Finalize enriched records
                    return records.map(r => ({
                        ...r,
                        _enriched: true,
                        _enrichedAt: new Date().toISOString(),
                    }));
                `,
            },
        ],

        // =====================================================================
        // ROUTE STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_ROUTE: [
            {
                type: 'INTERCEPTOR',
                name: 'Pre-route classification',
                code: `
                    // Classify records before routing
                    return records.map(r => ({
                        ...r,
                        _routeTarget: r.stock > 0 ? 'active' : 'archive',
                    }));
                `,
            },
        ],

        AFTER_ROUTE: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-route logging',
                code: `
                    // Log routing decisions
                    return records.map(r => ({
                        ...r,
                        _routed: true,
                        _routedAt: new Date().toISOString(),
                    }));
                `,
            },
        ],

        // =====================================================================
        // LOAD STAGE HOOKS (interceptors can modify data)
        // =====================================================================
        BEFORE_LOAD: [
            {
                type: 'INTERCEPTOR',
                name: 'Final validation before load',
                code: `
                    // Last chance to filter/modify before loading
                    return records.filter(r => {
                        if (!r.sku || !r.name) {
                            console.warn('Skipping record:', r);
                            return false;
                        }
                        return true;
                    }).map(r => ({
                        ...r,
                        _loadStarted: true,
                        _loadTimestamp: Date.now(),
                    }));
                `,
                failOnError: false,
            },
        ],

        AFTER_LOAD: [
            {
                type: 'INTERCEPTOR',
                name: 'Post-load statistics',
                code: `
                    // Calculate load statistics
                    const stats = {
                        totalLoaded: records.length,
                        loadedAt: new Date().toISOString(),
                    };
                    console.log('Load complete:', stats);
                    return records.map(r => ({
                        ...r,
                        _loaded: true,
                        _loadStats: stats,
                    }));
                `,
            },
        ],
    })

    .build();


// =============================================================================
// 6. SDK CUSTOM ADAPTER PATTERN
// =============================================================================

/**
 * This example shows how to create custom adapters via SDK.
 *
 * Custom adapters are defined in your plugin code and registered
 * with the adapter registry. They provide type-safe, reusable
 * extraction, transformation, or loading logic.
 *
 * Example SDK custom extractor (to be registered in your plugin):
 *
 * ```typescript
 * import { defineExtractor, ExtractorHelpers, JsonObject } from '@data-hub/sdk';
 *
 * export const shopifyProductsExtractor = defineExtractor({
 *     code: 'shopify-products',
 *     name: 'Shopify Products',
 *     description: 'Extract products from Shopify GraphQL API',
 *     category: 'E-commerce',
 *     schema: {
 *         fields: [
 *             { key: 'shopDomain', label: 'Shop Domain', type: 'string', required: true },
 *             { key: 'apiVersion', label: 'API Version', type: 'string', default: '2024-01' },
 *             { key: 'productStatus', label: 'Product Status', type: 'select',
 *               options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }] },
 *         ],
 *     },
 *
 *     async extract(config, helpers: ExtractorHelpers): Promise<JsonObject[]> {
 *         const { shopDomain, apiVersion, productStatus } = config;
 *         const accessToken = await helpers.getSecret('shopify-access-token');
 *
 *         const query = `
 *             query GetProducts($status: ProductStatus) {
 *                 products(first: 100, query: $status) {
 *                     edges {
 *                         node {
 *                             id
 *                             title
 *                             handle
 *                             status
 *                             variants(first: 50) {
 *                                 edges {
 *                                     node {
 *                                         id
 *                                         sku
 *                                         price
 *                                         inventoryQuantity
 *                                     }
 *                                 }
 *                             }
 *                         }
 *                     }
 *                 }
 *             }
 *         `;
 *
 *         const response = await fetch(
 *             `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
 *             {
 *                 method: 'POST',
 *                 headers: {
 *                     'Content-Type': 'application/json',
 *                     'X-Shopify-Access-Token': accessToken,
 *                 },
 *                 body: JSON.stringify({
 *                     query,
 *                     variables: { status: productStatus?.toUpperCase() },
 *                 }),
 *             }
 *         );
 *
 *         const data = await response.json();
 *         return data.data.products.edges.map(edge => edge.node);
 *     },
 * });
 * ```
 *
 * Then register in your plugin:
 *
 * ```typescript
 * // In your plugin's onModuleInit:
 * adapterRegistry.registerExtractor(shopifyProductsExtractor);
 * ```
 */
export const customAdapterPipeline = createPipeline()
    .name('Custom Adapter Example')
    .description('Demonstrates usage of custom SDK adapters')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    // Use custom extractor (registered via SDK)
    .extract('fetch-shopify-products', {
        adapterCode: 'shopify-products', // Custom adapter
        shopDomain: 'your-store.myshopify.com',
        apiVersion: '2024-01',
        productStatus: 'active',
    })

    .transform('normalize-data', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        externalId: 'id',
                        name: 'title',
                        slug: 'handle',
                        status: 'status',
                        variants: 'variants.edges',
                    },
                },
            },
            {
                op: 'expand',
                args: {
                    path: 'variants',
                    mergeParent: true,
                    parentFields: {
                        productExternalId: 'externalId',
                        productName: 'name',
                        productSlug: 'slug',
                    },
                },
            },
        ],
    })

    // Use custom loader (registered via SDK)
    .load('sync-to-vendure', {
        adapterCode: 'vendure-product-sync', // Custom adapter
        matchField: 'sku',
        createMissing: true,
        updateExisting: true,
    })

    .edge('start', 'fetch-shopify-products')
    .edge('fetch-shopify-products', 'normalize-data')
    .edge('normalize-data', 'sync-to-vendure')

    .build();
