/**
 * Export Pipelines - Export data from Vendure to files
 */

import { createPipeline } from '../../../src';

export const productExportFull = createPipeline()
    .name('Product Export - Full Catalog')
    .description('Export product catalog with variants flattened to rows')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        // Load variants.translations as a nested relation to get variant names
        relations: 'translations,variants,variants.translations,featuredAsset,facetValues',
        languageCode: 'en',
        batchSize: 100,
    })

    // Extract variant names from their translations (now loaded via nested relation)
    .transform('prepare-variants', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Extract variant name from translations for English
                        if (Array.isArray(record.variants)) {
                            record.variants = record.variants.map(v => {
                                const trans = (v.translations || []).find(t => t.languageCode === 'en') || (v.translations || [])[0];
                                return {
                                    ...v,
                                    variantName: trans?.name || v.sku || 'Unknown',
                                };
                            });
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    .transform('flatten-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: 'variants',
                    mergeParent: false,
                    parentFields: {
                        productId: 'id',
                        productName: 'name',
                        productSlug: 'slug',
                        productDescription: 'description',
                        productFeaturedImage: 'featuredAsset.preview',
                    },
                },
            },
        ],
    })

    .transform('format-fields', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        productId: 'productId',
                        productName: 'productName',
                        productSlug: 'productSlug',
                        sku: 'sku',
                        variantName: 'variantName',
                        priceRaw: 'priceWithTax',
                        stockOnHand: 'stockOnHand',
                        imageUrl: 'productFeaturedImage',
                        description: 'productDescription',
                    },
                },
            },
            // Convert price from cents to dollars (divide by 100)
            {
                op: 'math',
                args: {
                    operation: 'divide',
                    source: 'priceRaw',
                    operand: '100',
                    target: 'price',
                    decimals: 2,
                },
            },
            { op: 'set', args: { path: 'currency', value: 'USD' } },
            // Build full image URL only if imageUrl exists, otherwise leave empty
            {
                op: 'script',
                args: {
                    code: `
                        if (record.imageUrl) {
                            record.imageFullUrl = 'https://your-store.com' + record.imageUrl;
                        } else {
                            record.imageFullUrl = '';
                        }
                        delete record.priceRaw;
                        delete record.imageUrl;
                        return record;
                    `,
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
                        'productId',
                        'productName',
                        'productSlug',
                        'sku',
                        'variantName',
                        'price',
                        'currency',
                        'stockOnHand',
                        'imageFullUrl',
                        'description',
                    ],
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'csv',
        path: './exports',
        filenamePattern: 'products-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
        delimiter: ',',
        quoteStrings: true,
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'prepare-variants')
    .edge('prepare-variants', 'flatten-variants')
    .edge('flatten-variants', 'format-fields')
    .edge('format-fields', 'select-fields')
    .edge('select-fields', 'write-csv')
    .build();

export const customerExportFull = createPipeline()
    .name('Customer Export - Full Data')
    .description('Export customers with addresses, order count, and total spent')
    .capabilities({ requires: ['ReadCustomer', 'ReadOrder'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-customers', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'addresses,groups,orders',
        batchSize: 100,
    })

    .transform('calculate-metrics', {
        operators: [
            { op: 'count', args: { source: 'orders', target: 'orderCount' } },
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
                    target: 'totalSpent',
                    decimals: 2,
                },
            },
        ],
    })

    .transform('format-fields', {
        operators: [
            {
                op: 'template',
                args: {
                    template: '${firstName} ${lastName}',
                    target: 'fullName',
                },
            },
            { op: 'first', args: { source: 'addresses', target: 'primaryAddressObj' } },
            {
                op: 'template',
                args: {
                    template: '${primaryAddressObj.streetLine1}, ${primaryAddressObj.city}, ${primaryAddressObj.province} ${primaryAddressObj.postalCode}, ${primaryAddressObj.countryCode}',
                    target: 'primaryAddress',
                    missingAsEmpty: true,
                },
            },
            {
                op: 'template',
                args: {
                    template: '${groups.*.code|join:","}',
                    target: 'groupCodes',
                    missingAsEmpty: true,
                },
            },
            {
                op: 'dateFormat',
                args: {
                    source: 'createdAt',
                    target: 'createdAtFormatted',
                    format: 'YYYY-MM-DD HH:mm:ss',
                },
            },
        ],
    })

    .transform('select-fields', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        customerId: 'id',
                        email: 'emailAddress',
                        firstName: 'firstName',
                        lastName: 'lastName',
                        fullName: 'fullName',
                        phoneNumber: 'phoneNumber',
                        orderCount: 'orderCount',
                        totalSpent: 'totalSpent',
                        primaryAddress: 'primaryAddress',
                        groups: 'groupCodes',
                        createdAt: 'createdAtFormatted',
                    },
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'csv',
        path: './exports',
        filenamePattern: 'customers-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'calculate-metrics')
    .edge('calculate-metrics', 'format-fields')
    .edge('format-fields', 'select-fields')
    .edge('select-fields', 'write-csv')
    .build();

export const orderExportFull = createPipeline()
    .name('Order Export - Full Details')
    .description('Export orders with line items and customer info')
    .capabilities({ requires: ['ReadOrder'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-orders', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'customer,lines,shippingLines,payments',
        batchSize: 50,
    })

    .transform('filter-orders', {
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

    .transform('flatten-lines', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: 'lines',
                    mergeParent: true,
                    parentFields: {
                        orderId: 'id',
                        orderCode: 'code',
                        orderState: 'state',
                        orderDate: 'orderPlacedAt',
                        customerEmail: 'customer.emailAddress',
                        customerFirstName: 'customer.firstName',
                        customerLastName: 'customer.lastName',
                        shippingAddressStreet: 'shippingAddress.streetLine1',
                        shippingAddressCity: 'shippingAddress.city',
                        shippingAddressCountry: 'shippingAddress.countryCode',
                        paymentMethod: 'payments.0.method',
                        orderSubtotal: 'subTotalWithTax',
                        orderShipping: 'shippingWithTax',
                        orderTotal: 'totalWithTax',
                    },
                },
            },
        ],
    })

    .transform('format-fields', {
        operators: [
            {
                op: 'template',
                args: {
                    template: '${customerFirstName} ${customerLastName}',
                    target: 'customerName',
                },
            },
            {
                op: 'template',
                args: {
                    template: '${shippingAddressStreet}, ${shippingAddressCity}, ${shippingAddressCountry}',
                    target: 'shippingAddress',
                },
            },
            {
                op: 'dateFormat',
                args: {
                    source: 'orderDate',
                    target: 'orderDateFormatted',
                    format: 'YYYY-MM-DD HH:mm',
                },
            },
            { op: 'currency', args: { source: 'unitPriceWithTax', target: 'unitPrice', decimals: 2 } },
            { op: 'currency', args: { source: 'linePriceWithTax', target: 'lineTotal', decimals: 2 } },
            { op: 'currency', args: { source: 'orderSubtotal', target: 'subtotal', decimals: 2 } },
            { op: 'currency', args: { source: 'orderShipping', target: 'shipping', decimals: 2 } },
            { op: 'currency', args: { source: 'orderTotal', target: 'total', decimals: 2 } },
            { op: 'copy', args: { source: 'productVariantId', target: 'variantId' } },
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
                        'customerEmail',
                        'customerName',
                        'orderDateFormatted',
                        'orderState',
                        'variantId',
                        'quantity',
                        'unitPrice',
                        'lineTotal',
                        'shippingAddress',
                        'paymentMethod',
                        'subtotal',
                        'shipping',
                        'total',
                    ],
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'csv',
        path: './exports',
        filenamePattern: 'orders-${date:YYYY-MM-DD}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-orders')
    .edge('fetch-orders', 'filter-orders')
    .edge('filter-orders', 'flatten-lines')
    .edge('flatten-lines', 'format-fields')
    .edge('format-fields', 'select-fields')
    .edge('select-fields', 'write-csv')
    .build();

export const inventoryExport = createPipeline()
    .name('Inventory Export - Stock Levels')
    .description('Export stock levels by SKU')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'manual' })

    .extract('fetch-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,stockLevels',
        languageCode: 'en',
        batchSize: 100,
    })

    .transform('flatten-stock', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: 'stockLevels',
                    mergeParent: true,
                    parentFields: {
                        sku: 'sku',
                        variantName: 'name',
                        productName: 'product.name',
                        productSlug: 'product.slug',
                        outOfStockThreshold: 'outOfStockThreshold',
                        trackInventory: 'trackInventory',
                    },
                },
            },
        ],
    })

    .transform('format-fields', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        variantName: 'variantName',
                        productName: 'productName',
                        productSlug: 'productSlug',
                        stockLocationId: 'stockLocationId',
                        stockOnHand: 'stockOnHand',
                        stockAllocated: 'stockAllocated',
                        outOfStockThreshold: 'outOfStockThreshold',
                        trackInventory: 'trackInventory',
                    },
                },
            },
            {
                op: 'template',
                args: {
                    template: '${stockOnHand - stockAllocated}',
                    target: 'stockAvailable',
                },
            },
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'stockAvailable', cmp: 'lte', value: '${outOfStockThreshold}' },
                    ],
                    action: 'keep',
                },
            },
            { op: 'set', args: { path: 'lowStock', value: true } },
            { op: 'now', args: { target: 'exportedAt', format: 'ISO' } },
        ],
    })

    .transform('select-fields', {
        operators: [
            {
                op: 'pick',
                args: {
                    fields: [
                        'sku',
                        'variantName',
                        'productName',
                        'stockLocationId',
                        'stockOnHand',
                        'stockAllocated',
                        'stockAvailable',
                        'outOfStockThreshold',
                        'lowStock',
                        'trackInventory',
                        'exportedAt',
                    ],
                },
            },
        ],
    })

    .export('write-csv', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'csv',
        path: './exports',
        filenamePattern: 'inventory-${date:YYYY-MM-DD-HHmmss}.csv',
        includeHeader: true,
    })

    .edge('start', 'fetch-variants')
    .edge('fetch-variants', 'flatten-stock')
    .edge('flatten-stock', 'format-fields')
    .edge('format-fields', 'select-fields')
    .edge('select-fields', 'write-csv')
    .build();
