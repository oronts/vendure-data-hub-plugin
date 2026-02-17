/**
 * Import Pipelines - Production-quality examples for importing data into Vendure
 *
 * These pipelines demonstrate:
 * - Importing from CSV files with field mapping
 * - Data validation and transformation
 * - SKU/email-based entity lookup
 * - Price conversion and slug generation
 * - Bulk updates with proper error handling
 * - VALIDATE steps with rules-based validation
 * - ENRICH steps with built-in configuration
 * - Parallel processing branches
 */

import { createPipeline } from '../../../src';

// =============================================================================
// 5. PRODUCT IMPORT FROM CSV - Advanced import with VALIDATE, ENRICH & parallel branches
// =============================================================================

/**
 * Imports products from a CSV file with full field mapping.
 * Demonstrates:
 * - VALIDATE step with rules (required, min, max, pattern)
 * - ENRICH step with defaults, set, and computed fields
 * - Parallel processing: validation errors -> error export, valid records -> load
 *
 * Expected CSV columns: name, sku, description, price, category,
 * brand, weight, weight_unit, image_url, tags
 */
export const productImportCsv = createPipeline()
    .name('Product Import - CSV')
    .description('Import products from CSV with VALIDATE, ENRICH, and parallel error handling')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/products.csv',
        delimiter: ',',
        hasHeader: true,
    })

    // VALIDATE step - rules-based validation with error collection
    .validate('validate-data', {
        rules: [
            // Required fields
            { type: 'business', spec: { field: 'name', required: true, error: 'Product name is required' } },
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU is required' } },
            { type: 'business', spec: { field: 'price', required: true, error: 'Price is required' } },
            // SKU format: alphanumeric with dashes
            { type: 'business', spec: { field: 'sku', pattern: '^[A-Za-z0-9-]{3,20}$', error: 'SKU must be 3-20 alphanumeric characters or dashes' } },
            // Price must be positive number
            { type: 'business', spec: { field: 'price', min: 0.01, error: 'Price must be greater than 0' } },
            { type: 'business', spec: { field: 'price', max: 1000000, error: 'Price cannot exceed 1,000,000' } },
            // Weight validation (optional but if present must be positive)
            { type: 'business', spec: { field: 'weight', min: 0, error: 'Weight cannot be negative' } },
        ],
        errorHandlingMode: 'ACCUMULATE', // Collect all errors, don't stop on first
        validationMode: 'STRICT',
    })

    // Route invalid records to error export (parallel branch 1)
    .transform('filter-invalid', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_errors', cmp: 'exists', value: true }],
                    action: 'keep',
                },
            },
        ],
    })

    .export('export-errors', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './imports/errors',
        filenamePattern: 'product-import-errors-${date:YYYY-MM-DD-HHmmss}.csv',
        includeHeader: true,
    })

    // Route valid records for processing (parallel branch 2)
    .transform('filter-valid', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_errors', cmp: 'exists', value: false }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('transform-fields', {
        operators: [
            // Trim whitespace from all string fields
            { op: 'trim', args: { path: 'name' } },
            { op: 'trim', args: { path: 'description' } },
            { op: 'trim', args: { path: 'sku' } },

            // Generate slug from name
            { op: 'slugify', args: { source: 'name', target: 'slug' } },

            // Convert price from string to cents
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'currency', args: { source: 'price', target: 'priceInCents', decimals: 2 } },

            // Convert weight to grams if needed
            { op: 'toNumber', args: { source: 'weight' } },
            { op: 'unit', args: { source: 'weight', target: 'weightInGrams', from: 'kg', to: 'g' } },

            // Split comma-separated tags into array
            { op: 'split', args: { source: 'tags', target: 'tagArray', separator: ',' } },

            // Map category to facet value
            {
                op: 'lookup',
                args: {
                    source: 'category',
                    target: 'facetValueCode',
                    map: {
                        'Electronics': 'cat-electronics',
                        'Clothing': 'cat-clothing',
                        'Home & Garden': 'cat-home-garden',
                        'Sports': 'cat-sports',
                        'Books': 'cat-books',
                    },
                    default: 'cat-general',
                },
            },
        ],
    })

    // ENRICH step - add defaults, set computed values, and enrich data
    .enrich('enrich-product', {
        sourceType: 'STATIC',
        // Default values for missing fields
        defaults: {
            trackInventory: true,
            enabled: true,
            taxCategoryCode: 'standard',
            description: 'No description provided',
        },
        // Set fixed values
        set: {
            importedAt: '${@now}',
            importSource: 'csv-import',
            channel: '__default_channel__',
        },
        // Computed fields based on record data
        computed: {
            // Calculate discount eligibility based on price
            eligibleForDiscount: 'record.priceInCents > 5000',
            // Determine if premium product
            isPremium: 'record.priceInCents > 10000',
            // Generate canonical URL
            canonicalUrl: '"https://store.example.com/products/" + record.slug',
        },
    })

    .transform('map-to-vendure', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        name: 'name',
                        slug: 'slug',
                        description: 'description',
                        sku: 'sku',
                        price: 'priceInCents',
                        facetValueCodes: 'facetValueCode',
                        assetUrls: 'image_url',
                        trackInventory: 'trackInventory',
                        enabled: 'enabled',
                        taxCategoryCode: 'taxCategoryCode',
                        'customFields.brand': 'brand',
                        'customFields.weight': 'weightInGrams',
                        'customFields.tags': 'tagArray',
                        'customFields.isPremium': 'isPremium',
                        'customFields.importedAt': 'importedAt',
                    },
                },
            },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        skuField: 'sku',
        priceField: 'price',
    })

    // Edges define the flow - note parallel branches from validate-data
    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-data')
    // Parallel branch 1: Invalid records -> error export
    .edge('validate-data', 'filter-invalid')
    .edge('filter-invalid', 'export-errors')
    // Parallel branch 2: Valid records -> transform -> enrich -> load
    .edge('validate-data', 'filter-valid')
    .edge('filter-valid', 'transform-fields')
    .edge('transform-fields', 'enrich-product')
    .edge('enrich-product', 'map-to-vendure')
    .edge('map-to-vendure', 'upsert-products')
    .build();


// =============================================================================
// 6. CUSTOMER IMPORT FROM CSV - Import with address parsing
// =============================================================================

/**
 * Imports customers from CSV with address parsing and email validation.
 * Supports customer groups and multiple addresses.
 *
 * Expected CSV columns: email, first_name, last_name, phone,
 * address_line1, address_line2, city, state, postal_code, country,
 * customer_group
 */
export const customerImportCsv = createPipeline()
    .name('Customer Import - CSV')
    .description('Import customers from CSV with address parsing and email validation')
    .capabilities({ requires: ['UpdateCustomer'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/customers.csv',
        delimiter: ',',
        hasHeader: true,
    })

    .transform('validate-data', {
        operators: [
            // Validate required fields
            {
                op: 'validateRequired',
                args: {
                    fields: ['email', 'first_name', 'last_name'],
                    errorField: '_requiredErrors',
                },
            },
            // Validate email format
            {
                op: 'validateFormat',
                args: {
                    field: 'email',
                    pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
                    errorField: '_emailError',
                    errorMessage: 'Invalid email format',
                },
            },
            // Filter valid records
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: '_requiredErrors', cmp: 'exists', value: false },
                        { field: '_emailError', cmp: 'exists', value: false },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('transform-fields', {
        operators: [
            // Normalize email to lowercase
            { op: 'lowercase', args: { path: 'email' } },

            // Trim whitespace
            { op: 'trim', args: { path: 'first_name' } },
            { op: 'trim', args: { path: 'last_name' } },
            { op: 'trim', args: { path: 'phone' } },

            // Format phone number (strip non-numeric, add country code if needed)
            {
                op: 'replaceRegex',
                args: {
                    path: 'phone',
                    pattern: '[^0-9+]',
                    replacement: '',
                },
            },

            // Copy cleaned phone to phoneClean for downstream use
            { op: 'copy', args: { source: 'phone', target: 'phoneClean' } },

            // Normalize country code
            {
                op: 'lookup',
                args: {
                    source: 'country',
                    target: 'countryCode',
                    map: {
                        'United States': 'US',
                        'USA': 'US',
                        'United Kingdom': 'GB',
                        'UK': 'GB',
                        'Germany': 'DE',
                        'France': 'FR',
                        'Canada': 'CA',
                        'Australia': 'AU',
                    },
                    default: 'US',
                },
            },

            // Map customer group to Vendure group code
            {
                op: 'lookup',
                args: {
                    source: 'customer_group',
                    target: 'groupCode',
                    map: {
                        'VIP': 'vip-customers',
                        'Wholesale': 'wholesale',
                        'Retail': 'retail',
                        'Premium': 'premium-members',
                    },
                    default: 'retail',
                },
            },
        ],
    })

    .transform('build-address', {
        operators: [
            // Create address object from fields
            {
                op: 'set',
                args: {
                    path: 'addresses',
                    value: [],
                },
            },
            // Only add address if we have street line
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'address_line1', cmp: 'exists', value: true }],
                    action: 'keep',
                },
            },
            {
                op: 'enrich',
                args: {
                    set: {
                        'addresses.0.streetLine1': '${address_line1}',
                        'addresses.0.streetLine2': '${address_line2}',
                        'addresses.0.city': '${city}',
                        'addresses.0.province': '${state}',
                        'addresses.0.postalCode': '${postal_code}',
                        'addresses.0.countryCode': '${countryCode}',
                        'addresses.0.phoneNumber': '${phoneClean}',
                        'addresses.0.defaultShippingAddress': true,
                        'addresses.0.defaultBillingAddress': true,
                    },
                },
            },
        ],
    })

    .transform('map-to-vendure', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        emailAddress: 'email',
                        firstName: 'first_name',
                        lastName: 'last_name',
                        phoneNumber: 'phoneClean',
                        addresses: 'addresses',
                        groupCodes: 'groupCode',
                    },
                },
            },
            // Wrap groupCode in array
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

    .load('upsert-customers', {
        adapterCode: 'customerUpsert',
        emailField: 'emailAddress',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phoneNumber',
        addressesField: 'addresses',
        groupsField: 'groupCodes',
        groupsMode: 'add',
    })

    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-data')
    .edge('validate-data', 'transform-fields')
    .edge('transform-fields', 'build-address')
    .edge('build-address', 'map-to-vendure')
    .edge('map-to-vendure', 'upsert-customers')
    .build();


// =============================================================================
// 7. STOCK UPDATE FROM CSV - Bulk inventory with VALIDATE, ENRICH & parallel alerts
// =============================================================================

/**
 * Updates stock levels from a CSV file by SKU.
 * Demonstrates:
 * - VALIDATE step with numeric range validation
 * - ENRICH step with computed stock status fields
 * - Parallel branches: Update stock + Low stock alerts + Out of stock report
 *
 * Expected CSV columns: sku, stock_quantity, location (optional), reorder_point (optional)
 */
export const stockUpdateCsv = createPipeline()
    .name('Stock Update - CSV')
    .description('Import stock with VALIDATE, ENRICH computed status, and parallel low-stock alerts')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/stock-update.csv',
        delimiter: ',',
        hasHeader: true,
    })

    // VALIDATE step - full stock data validation
    .validate('validate-stock', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU is required' } },
            { type: 'business', spec: { field: 'stock_quantity', required: true, error: 'Stock quantity is required' } },
            { type: 'business', spec: { field: 'sku', pattern: '^[A-Za-z0-9_-]+$', error: 'SKU must be alphanumeric' } },
            { type: 'business', spec: { field: 'stock_quantity', min: 0, error: 'Stock quantity cannot be negative' } },
            { type: 'business', spec: { field: 'stock_quantity', max: 999999, error: 'Stock quantity exceeds maximum' } },
            { type: 'business', spec: { field: 'reorder_point', min: 0, error: 'Reorder point cannot be negative' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
        validationMode: 'STRICT',
    })

    .transform('filter-valid', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_errors', cmp: 'exists', value: false }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('transform-data', {
        operators: [
            { op: 'trim', args: { path: 'sku' } },
            { op: 'uppercase', args: { path: 'sku' } },
            { op: 'toNumber', args: { source: 'stock_quantity' } },
            { op: 'toNumber', args: { source: 'reorder_point' } },
        ],
    })

    // ENRICH step - add computed stock status and alerts
    .enrich('enrich-stock-status', {
        sourceType: 'STATIC',
        // Default values
        defaults: {
            location: 'default-warehouse',
            reorder_point: 10, // Default reorder point if not provided
        },
        // Computed stock status fields
        computed: {
            // Determine stock status
            stockStatus: 'record.stock_quantity === 0 ? "out_of_stock" : record.stock_quantity <= (record.reorder_point || 10) ? "low_stock" : "in_stock"',
            // Check if needs reorder
            needsReorder: 'record.stock_quantity <= (record.reorder_point || 10)',
            // Calculate days of stock (assuming avg 5 units/day sold)
            estimatedDaysOfStock: 'Math.floor(record.stock_quantity / 5)',
            // Priority for restocking (higher = more urgent)
            restockPriority: 'record.stock_quantity === 0 ? 3 : record.stock_quantity <= 5 ? 2 : record.stock_quantity <= (record.reorder_point || 10) ? 1 : 0',
            // Flag critical items
            isCritical: 'record.stock_quantity <= 5',
        },
        set: {
            updatedAt: '${@now}',
            updateSource: 'csv-import',
        },
    })

    .transform('build-stock-location', {
        operators: [
            {
                op: 'template',
                args: {
                    template: '{"${location}": ${stock_quantity}}',
                    target: 'stockByLocationJson',
                },
            },
            { op: 'parseJson', args: { source: 'stockByLocationJson', target: 'stockByLocation' } },
        ],
    })

    // =====================================================
    // PARALLEL BRANCH 1: Update stock in Vendure
    // =====================================================
    .transform('map-to-vendure', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        stockByLocation: 'stockByLocation',
                    },
                },
            },
        ],
    })

    .load('adjust-stock', {
        adapterCode: 'stockAdjust',
        skuField: 'sku',
        stockByLocationField: 'stockByLocation',
        absolute: true,
    })

    // =====================================================
    // PARALLEL BRANCH 2: Export low stock items for reorder
    // =====================================================
    .transform('filter-low-stock', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'needsReorder', cmp: 'eq', value: true },
                        { field: 'stock_quantity', cmp: 'gt', value: 0 },
                    ],
                    action: 'keep',
                },
            },
            {
                op: 'pick',
                args: {
                    fields: ['sku', 'stock_quantity', 'reorder_point', 'location', 'estimatedDaysOfStock', 'restockPriority'],
                },
            },
        ],
    })

    .export('export-low-stock', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './reports/inventory',
        filenamePattern: 'low-stock-alert-${date:YYYY-MM-DD-HHmmss}.csv',
        includeHeader: true,
    })

    // =====================================================
    // PARALLEL BRANCH 3: Export out of stock items (urgent)
    // =====================================================
    .transform('filter-out-of-stock', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stock_quantity', cmp: 'eq', value: 0 }],
                    action: 'keep',
                },
            },
            {
                op: 'pick',
                args: {
                    fields: ['sku', 'location', 'reorder_point', 'updatedAt'],
                },
            },
            {
                op: 'enrich',
                args: {
                    set: {
                        urgency: 'CRITICAL',
                        actionRequired: 'Immediate restock required',
                    },
                },
            },
        ],
    })

    .export('export-out-of-stock', {
        adapterCode: 'csvExport',
        target: 'file',
        format: 'CSV',
        path: './reports/inventory',
        filenamePattern: 'out-of-stock-urgent-${date:YYYY-MM-DD-HHmmss}.csv',
        includeHeader: true,
    })

    // Flow with parallel branches
    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-stock')
    .edge('validate-stock', 'filter-valid')
    .edge('filter-valid', 'transform-data')
    .edge('transform-data', 'enrich-stock-status')
    .edge('enrich-stock-status', 'build-stock-location')

    // Parallel Branch 1: Update stock
    .edge('build-stock-location', 'map-to-vendure')
    .edge('map-to-vendure', 'adjust-stock')

    // Parallel Branch 2: Export low stock alert
    .edge('build-stock-location', 'filter-low-stock')
    .edge('filter-low-stock', 'export-low-stock')

    // Parallel Branch 3: Export out of stock urgent
    .edge('build-stock-location', 'filter-out-of-stock')
    .edge('filter-out-of-stock', 'export-out-of-stock')

    .build();


// =============================================================================
// 8. PRICE UPDATE FROM CSV - Bulk price updates with currency support
// =============================================================================

/**
 * Updates variant prices from CSV with currency conversion support.
 * Can handle prices in different currencies and convert to store currency.
 *
 * Expected CSV columns: sku, price, currency (optional, defaults to USD),
 * sale_price (optional)
 */
export const priceUpdateCsv = createPipeline()
    .name('Price Update - CSV')
    .description('Bulk price update from CSV with currency conversion')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/price-update.csv',
        delimiter: ',',
        hasHeader: true,
    })

    .transform('validate-data', {
        operators: [
            // Validate required fields
            {
                op: 'validateRequired',
                args: {
                    fields: ['sku', 'price'],
                    errorField: '_errors',
                },
            },
            // Filter valid records
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_errors', cmp: 'exists', value: false }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('transform-prices', {
        operators: [
            // Trim SKU
            { op: 'trim', args: { path: 'sku' } },

            // Set default currency
            {
                op: 'enrich',
                args: {
                    defaults: {
                        currency: 'USD',
                    },
                },
            },

            // Convert price string to number: strip non-numeric chars, then copy to priceClean
            {
                op: 'replaceRegex',
                args: {
                    path: 'price',
                    pattern: '[^0-9.]',
                    replacement: '',
                },
            },
            { op: 'copy', args: { source: 'price', target: 'priceClean' } },
            { op: 'toNumber', args: { source: 'priceClean' } },

            // Convert to cents using currency operator
            {
                op: 'currency',
                args: { source: 'priceClean', target: 'priceInCents', decimals: 2 },
            },

            // Handle sale price if present
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'sale_price', cmp: 'exists', value: true }],
                    action: 'keep',
                },
            },
            {
                op: 'replaceRegex',
                args: {
                    path: 'sale_price',
                    pattern: '[^0-9.]',
                    replacement: '',
                },
            },
            { op: 'copy', args: { source: 'sale_price', target: 'salePriceClean' } },
            { op: 'toNumber', args: { source: 'salePriceClean' } },
            {
                op: 'currency',
                args: { source: 'salePriceClean', target: 'salePriceInCents', decimals: 2 },
            },

            // Build price by currency map for multi-currency support
            {
                op: 'enrich',
                args: {
                    set: {
                        priceByCurrency: {
                            '${currency}': '${priceInCents}',
                        },
                    },
                },
            },
        ],
    })

    .transform('map-to-vendure', {
        operators: [
            {
                op: 'map',
                args: {
                    mapping: {
                        sku: 'sku',
                        price: 'priceInCents',
                        salePrice: 'salePriceInCents',
                        priceByCurrency: 'priceByCurrency',
                    },
                },
            },
        ],
    })

    .load('update-prices', {
        adapterCode: 'variantUpsert',
        channel: '__default_channel__',
        skuField: 'sku',
        priceField: 'price',
        priceByCurrencyField: 'priceByCurrency',
    })

    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-data')
    .edge('validate-data', 'transform-prices')
    .edge('transform-prices', 'map-to-vendure')
    .edge('map-to-vendure', 'update-prices')
    .build();
