/**
 * Import Pipelines - Production-quality examples for importing data into Vendure
 *
 * These pipelines demonstrate:
 * - Importing from CSV files with field mapping
 * - Data validation and transformation
 * - SKU/email-based entity lookup
 * - Price conversion and slug generation
 * - Bulk updates with proper error handling
 */

import { createPipeline } from '../../../src';

// =============================================================================
// 5. PRODUCT IMPORT FROM CSV - Full product import with transformations
// =============================================================================

/**
 * Imports products from a CSV file with comprehensive field mapping.
 * Handles price conversion, slug generation, and multi-value fields.
 *
 * Expected CSV columns: name, sku, description, price, category,
 * brand, weight, weight_unit, image_url, tags
 */
export const productImportCsv = createPipeline()
    .name('Product Import - CSV')
    .description('Import products from CSV with field mapping, price conversion, and slug generation')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'manual' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/products.csv',
        delimiter: ',',
        hasHeader: true,
    })

    .transform('validate-required', {
        operators: [
            {
                op: 'validateRequired',
                args: {
                    fields: ['name', 'sku', 'price'],
                    errorField: '_validationErrors',
                },
            },
            // Filter out invalid records (or could route to error handling)
            {
                op: 'when',
                args: {
                    conditions: [{ field: '_validationErrors', cmp: 'exists', value: false }],
                    action: 'keep',
                },
            },
        ],
    })

    .transform('transform-fields', {
        operators: [
            // Trim whitespace from all string fields
            { op: 'trim', args: { source: 'name' } },
            { op: 'trim', args: { source: 'description' } },
            { op: 'trim', args: { source: 'sku' } },

            // Generate slug from name
            {
                op: 'slugify',
                args: { source: 'name', target: 'slug' },
            },

            // Convert price from string to cents (assuming input is in dollars like "19.99")
            {
                op: 'toNumber',
                args: { source: 'price' },
            },
            {
                op: 'currency',
                args: { source: 'price', target: 'priceInCents', decimals: 2 },
            },

            // Convert weight to grams if needed
            {
                op: 'toNumber',
                args: { source: 'weight' },
            },
            {
                op: 'unit',
                args: {
                    source: 'weight',
                    target: 'weightInGrams',
                    from: 'kg',
                    to: 'g',
                },
            },

            // Split comma-separated tags into array
            {
                op: 'split',
                args: {
                    source: 'tags',
                    target: 'tagArray',
                    separator: ',',
                },
            },

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

            // Set default values
            {
                op: 'enrich',
                args: {
                    defaults: {
                        trackInventory: true,
                        enabled: true,
                        taxCategoryCode: 'standard',
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
                    },
                },
            },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'upsert',
        conflictResolution: 'source-wins',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        skuField: 'sku',
        priceField: 'price',
    })

    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-required')
    .edge('validate-required', 'transform-fields')
    .edge('transform-fields', 'map-to-vendure')
    .edge('map-to-vendure', 'upsert-products')
    .build();


// =============================================================================
// 6. CUSTOMER IMPORT FROM CSV - Import with address parsing
// =============================================================================

/**
 * Imports customers from CSV with address parsing and email validation.
 * Handles customer groups and multiple addresses.
 *
 * Expected CSV columns: email, first_name, last_name, phone,
 * address_line1, address_line2, city, state, postal_code, country,
 * customer_group
 */
export const customerImportCsv = createPipeline()
    .name('Customer Import - CSV')
    .description('Import customers from CSV with address parsing and email validation')
    .capabilities({ requires: ['UpdateCustomer'] })
    .trigger('start', { type: 'manual' })

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
            { op: 'lowercase', args: { source: 'email' } },

            // Trim whitespace
            { op: 'trim', args: { source: 'first_name' } },
            { op: 'trim', args: { source: 'last_name' } },
            { op: 'trim', args: { source: 'phone' } },

            // Format phone number (strip non-numeric, add country code if needed)
            {
                op: 'replaceRegex',
                args: {
                    source: 'phone',
                    target: 'phoneClean',
                    pattern: '[^0-9+]',
                    replacement: '',
                },
            },

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
                    conditions: [{ field: 'address_line1', cmp: 'notEmpty', value: true }],
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
// 7. STOCK UPDATE FROM CSV - Bulk inventory update
// =============================================================================

/**
 * Updates stock levels from a CSV file by SKU.
 * Supports multiple stock locations.
 *
 * Expected CSV columns: sku, stock_quantity, location (optional)
 */
export const stockUpdateCsv = createPipeline()
    .name('Stock Update - CSV')
    .description('Import stock levels with SKU lookup and location support')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'manual' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './imports/stock-update.csv',
        delimiter: ',',
        hasHeader: true,
    })

    .transform('validate-data', {
        operators: [
            // Validate required fields
            {
                op: 'validateRequired',
                args: {
                    fields: ['sku', 'stock_quantity'],
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

    .transform('transform-data', {
        operators: [
            // Trim SKU
            { op: 'trim', args: { source: 'sku' } },
            { op: 'uppercase', args: { source: 'sku' } },

            // Convert stock to number
            {
                op: 'toNumber',
                args: { source: 'stock_quantity' },
            },

            // Ensure non-negative
            {
                op: 'when',
                args: {
                    conditions: [{ field: 'stock_quantity', cmp: 'lt', value: 0 }],
                    action: 'drop',
                },
            },

            // Set default location if not provided
            {
                op: 'enrich',
                args: {
                    defaults: {
                        location: 'default-warehouse',
                    },
                },
            },

            // Build stock by location map
            {
                op: 'template',
                args: {
                    template: '{"${location}": ${stock_quantity}}',
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
                    },
                },
            },
        ],
    })

    .load('adjust-stock', {
        adapterCode: 'stockAdjust',
        skuField: 'sku',
        stockByLocationField: 'stockByLocation',
        absolute: true, // Set absolute value, not delta
    })

    .edge('start', 'read-csv')
    .edge('read-csv', 'validate-data')
    .edge('validate-data', 'transform-data')
    .edge('transform-data', 'map-to-vendure')
    .edge('map-to-vendure', 'adjust-stock')
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
    .trigger('start', { type: 'manual' })

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
            { op: 'trim', args: { source: 'sku' } },

            // Set default currency
            {
                op: 'enrich',
                args: {
                    defaults: {
                        currency: 'USD',
                    },
                },
            },

            // Convert price string to number
            {
                op: 'replaceRegex',
                args: {
                    source: 'price',
                    target: 'priceClean',
                    pattern: '[^0-9.]',
                    replacement: '',
                },
            },
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
                    conditions: [{ field: 'sale_price', cmp: 'notEmpty', value: true }],
                    action: 'keep',
                },
            },
            {
                op: 'replaceRegex',
                args: {
                    source: 'sale_price',
                    target: 'salePriceClean',
                    pattern: '[^0-9.]',
                    replacement: '',
                },
            },
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
