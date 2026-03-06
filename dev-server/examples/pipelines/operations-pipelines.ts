/**
 * Operations Pipelines - CSV customer import, product feed generation, webhook order import,
 * webhook auth variants, file watch, and message queue triggers
 *
 * These pipelines demonstrate:
 * - P4: CSV customer import with validation, error routing, address building, group assignment
 * - P5: Scheduled Google Shopping feed generation from Vendure catalog
 * - P6: Webhook-triggered order import with HMAC authentication and enrichment
 * - P7: Webhook-triggered import with HTTP Basic authentication
 * - P8: Webhook-triggered import with JWT token authentication
 * - P9: File watch trigger for automatic CSV import
 * - P10: Message queue trigger for consuming internal queue messages
 */

import { createPipeline } from '../../../src';

// =============================================================================
// P4: CSV CUSTOMER IMPORT - Validation, routing, address building, group assignment
// =============================================================================

/**
 * Import customers from a CSV file with full validation, error routing,
 * address building, and customer group assignment.
 *
 * Features:
 * - VALIDATE step with email format, required field checks
 * - ROUTE step to split valid/invalid records into separate branches
 * - Invalid branch: export error report CSV
 * - Valid branch: transform, build addresses, assign groups, upsert customers
 *
 * Expected CSV columns: email, first_name, last_name, phone, street, city,
 * postal_code, country_code, province, group
 */
export const csvCustomerImport = createPipeline()
    .name('CSV Customer Import')
    .description('Import customers from CSV with validation, error routing, address building, and group assignment')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    .extract('read-csv', {
        adapterCode: 'csv',
        csvPath: './dev-server/examples/data/customers.csv',
        delimiter: ',',
        hasHeader: true,
    })

    .validate('check-data', {
        rules: [
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Invalid email format' } },
            { type: 'business', spec: { field: 'first_name', required: true, error: 'First name is required' } },
            { type: 'business', spec: { field: 'last_name', required: true, error: 'Last name is required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .route('valid-or-invalid', {
        branches: [
            { name: 'valid', when: [{ field: '_validationErrors', cmp: 'eq' , value: null }] },
            { name: 'invalid', when: [{ field: '_validationErrors', cmp: 'ne' , value: null }] },
        ],
    })

    // Invalid branch: export error report
    .export('error-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'customer-import-errors.csv',
    })

    // Valid branch: transform, build addresses, assign groups, load
    .transform('build-customer', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'first_name' } },
            { op: 'trim', args: { path: 'last_name' } },
            {
                op: 'script',
                args: {
                    code: `
                        record.addresses = [{
                            fullName: record.first_name + ' ' + record.last_name,
                            streetLine1: record.street,
                            city: record.city,
                            postalCode: record.postal_code,
                            countryCode: record.country_code,
                            province: record.province,
                            phoneNumber: record.phone,
                            defaultShippingAddress: true,
                            defaultBillingAddress: true,
                        }];
                        record.groups = [record.group];
                        return record;
                    `,
                },
            },
            { op: 'rename', args: { from: 'first_name', to: 'firstName' } },
            { op: 'rename', args: { from: 'last_name', to: 'lastName' } },
        ],
    })

    .load('ensure-groups', {
        adapterCode: 'customerGroupUpsert',
        strategy: 'UPSERT',
        nameField: 'group',
    })

    .load('upsert-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groups',
        addressesMode: 'UPSERT_BY_MATCH',
        customFieldsField: 'customFields',
    })

    // Graph edges
    .edge('manual', 'read-csv')
    .edge('read-csv', 'check-data')
    .edge('check-data', 'valid-or-invalid')
    .edge('valid-or-invalid', 'error-report', 'invalid')
    .edge('valid-or-invalid', 'build-customer', 'valid')
    .edge('build-customer', 'ensure-groups')
    .edge('ensure-groups', 'upsert-customers')

    .build();


// =============================================================================
// P5: PRODUCT FEED GENERATOR - Google Shopping feed from Vendure catalog
// =============================================================================

/**
 * Generate a Google Shopping feed from the Vendure product catalog.
 * Runs on a daily schedule at 4 AM Berlin time.
 *
 * Features:
 * - Scheduled trigger (daily at 4 AM Europe/Berlin)
 * - Extract all product variants with relations
 * - Validate required feed fields (SKU, name, price)
 * - Map to Google Shopping field format (g:id, g:title, etc.)
 * - Strip HTML, format prices, determine availability
 * - Generate Google Merchant XML feed
 * - Export CSV backup of feed data
 */
export const productFeedGenerator = createPipeline()
    .name('Product Feed Generator')
    .description('Generate Google Shopping feed from Vendure product catalog on a daily schedule')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 4 * * *',
        timezone: 'Europe/Berlin',
    })

    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations,featuredAsset,stockLevels,facetValues,productVariantPrices',
        batchSize: 100,
    })

    .validate('check-feed-data', {
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, error: 'SKU required for feed' } },
            { type: 'business', spec: { field: 'product.name', required: true, error: 'Product name required' } },
            { type: 'business', spec: { field: 'priceWithTax', required: true, min: 1, error: 'Price must be > 0' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    .transform('map-feed-fields', {
        operators: [
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'copy', args: { source: 'sku', target: 'g:id' } },
            { op: 'copy', args: { source: 'product.name', target: 'g:title' } },
            { op: 'copy', args: { source: 'product.description', target: 'g:description' } },
            { op: 'copy', args: { source: 'featuredAsset.preview', target: 'g:image_link' } },
            { op: 'copy', args: { source: 'priceWithTax', target: '_rawPrice' } },
            {
                op: 'script',
                args: {
                    code: `
                        const stockLevel = (record.stockLevels || []).reduce((sum, sl) => sum + (sl.stockOnHand || 0), 0);
                        record['g:availability'] = stockLevel > 0 ? 'in_stock' : 'out_of_stock';
                        return record;
                    `,
                },
            },
            { op: 'pick', args: { fields: ['g:id', 'g:title', 'g:description', 'g:image_link', '_rawPrice', 'g:availability'] } },
        ],
    })

    .transform('format-output', {
        operators: [
            { op: 'stripHtml', args: { source: 'g:description', target: 'g:description' } },
            {
                op: 'script',
                args: {
                    code: `
                        const price = record['_rawPrice'];
                        record['g:price'] = (price / 100).toFixed(2) + ' EUR';
                        record['g:link'] = 'https://shop.example.com/products/' + record['g:id'];
                        record['g:condition'] = 'new';
                        record['g:brand'] = 'DataHub Store';
                        delete record['_rawPrice'];
                        return record;
                    `,
                },
            },
        ],
    })

    .feed('generate-feed', {
        adapterCode: 'googleMerchant',
        format: 'XML',
        outputPath: './feeds/google-shopping.xml',
        storeUrl: 'https://shop.example.com',
        storeName: 'DataHub Store',
        targetCountry: 'DE',
        contentLanguage: 'de',
        currency: 'EUR',
    })

    .export('product-csv', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'feed-products.csv',
    })

    // Linear graph
    .edge('schedule', 'query-products')
    .edge('query-products', 'check-feed-data')
    .edge('check-feed-data', 'map-feed-fields')
    .edge('map-feed-fields', 'format-output')
    .edge('format-output', 'generate-feed')
    .edge('generate-feed', 'product-csv')

    .build();


// =============================================================================
// P6: WEBHOOK ORDER IMPORT - External OMS pushes orders via webhook
// =============================================================================

/**
 * External OMS pushes orders via webhook with HMAC-SHA256 authentication.
 * Orders are validated, enriched with defaults, transformed with import notes,
 * loaded into Vendure, annotated, and acknowledged via callback.
 *
 * Features:
 * - Webhook trigger with HMAC-SHA256 signature verification
 * - Idempotency key requirement to prevent duplicate processing
 * - In-memory extraction of webhook payload
 * - Business validation with fail-fast mode
 * - Static enrichment with shipping/payment defaults
 * - Template-based import note generation
 * - Order upsert with state transition to PaymentSettled
 * - Private order note attachment
 * - REST callback notification to external system
 */
export const webhookOrderImport = createPipeline()
    .name('Webhook Order Import')
    .description('Import orders from external OMS via webhook with HMAC authentication and enrichment')
    .capabilities({ requires: ['UpdateOrder', 'UpdateCustomer'] })

    .trigger('webhook', {
        type: 'WEBHOOK',
        signature: 'hmac-sha256',
        hmacSecretCode: 'webhook-hmac-secret',
        idempotencyKey: 'X-Idempotency-Key',
    })

    .extract('parse-payload', {
        adapterCode: 'inMemory',
        itemsField: 'orders',
    })

    .validate('check-orders', {
        rules: [
            { type: 'business', spec: { field: 'code', required: true, error: 'Order code required' } },
            { type: 'business', spec: { field: 'customerEmail', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid customer email required' } },
            { type: 'business', spec: { field: 'lines', required: true, error: 'Order must have line items' } },
        ],
        errorHandlingMode: 'FAIL_FAST',
    })

    .enrich('add-defaults', {
        defaults: {
            shippingMethodCode: 'standard-shipping',
            paymentMethodCode: 'standard-payment',
            couponCode: 'WELCOME10',
        },
        set: {
            importSource: 'external-oms',
            targetState: 'Shipped',
        },
    })

    .transform('add-note-text', {
        operators: [
            {
                op: 'template',
                args: {
                    template: 'Imported from external OMS at ${new Date().toISOString()}. Source: ${importSource}',
                    target: 'importNote',
                },
            },
        ],
    })

    .load('upsert-orders', {
        adapterCode: 'orderUpsert',
        lookupFields: 'code',
        state: 'PaymentSettled',
        orderPlacedAtField: 'orderPlacedAt',
    })

    .load('add-note', {
        adapterCode: 'orderNote',
        orderCodeField: 'code',
        noteField: 'importNote',
        isPrivate: true,
    })

    // Apply coupon code if present on the order
    .load('apply-coupon', {
        adapterCode: 'applyCoupon',
        orderCodeField: 'code',
        couponField: 'couponCode',
    })

    // Transition order to final state
    .load('transition-state', {
        adapterCode: 'orderTransition',
        orderCodeField: 'code',
        state: 'Shipped',
    })

    .load('notify-callback', {
        adapterCode: 'restPost',
        endpoint: 'http://localhost:4100/api/webhook',
        method: 'POST',
        batchMode: 'single',
    })

    // Linear graph
    .edge('webhook', 'parse-payload')
    .edge('parse-payload', 'check-orders')
    .edge('check-orders', 'add-defaults')
    .edge('add-defaults', 'add-note-text')
    .edge('add-note-text', 'upsert-orders')
    .edge('upsert-orders', 'apply-coupon')
    .edge('apply-coupon', 'add-note')
    .edge('add-note', 'transition-state')
    .edge('transition-state', 'notify-callback')

    .build();


// =============================================================================
// P7: WEBHOOK BASIC AUTH IMPORT - Webhook with HTTP Basic authentication
// =============================================================================

/**
 * Simple webhook pipeline with HTTP Basic authentication.
 * Demonstrates BASIC auth as an alternative to HMAC signature verification.
 *
 * Features:
 * - Webhook trigger with HTTP Basic authentication
 * - In-memory extraction of webhook payload
 * - Simple transform tagging source
 */
export const webhookBasicAuthImport = createPipeline()
    .name('Webhook Basic Auth Import')
    .description('Webhook-triggered import with HTTP Basic authentication')

    .trigger('webhook-basic', {
        type: 'WEBHOOK',
        authentication: 'BASIC',
        basicSecretCode: 'webhook-api-key',
    })

    .extract('receive-payload', {
        adapterCode: 'inMemory',
        data: [],
    })

    .transform('normalize', {
        operators: [
            { op: 'set', args: { path: '_source', value: 'webhook-basic' } },
        ],
    })

    // Linear graph
    .edge('webhook-basic', 'receive-payload')
    .edge('receive-payload', 'normalize')

    .build();


// =============================================================================
// P8: WEBHOOK JWT AUTH IMPORT - Webhook with JWT token authentication
// =============================================================================

/**
 * Webhook pipeline with JWT token authentication.
 * Demonstrates JWT auth for bearer-token-based webhook verification.
 *
 * Features:
 * - Webhook trigger with JWT token authentication
 * - In-memory extraction of webhook payload
 * - Simple transform tagging source
 */
export const webhookJwtAuthImport = createPipeline()
    .name('Webhook JWT Auth Import')
    .description('Webhook-triggered import with JWT token authentication')

    .trigger('webhook-jwt', {
        type: 'WEBHOOK',
        authentication: 'JWT',
        jwtSecretCode: 'webhook-api-key',
    })

    .extract('receive-payload', {
        adapterCode: 'inMemory',
        data: [],
    })

    .transform('normalize', {
        operators: [
            { op: 'set', args: { path: '_source', value: 'webhook-jwt' } },
        ],
    })

    // Linear graph
    .edge('webhook-jwt', 'receive-payload')
    .edge('receive-payload', 'normalize')

    .build();


// =============================================================================
// P9: FILE WATCH IMPORT - Automatic CSV import from watched directory
// =============================================================================

/**
 * Watches for new CSV files on an SFTP server and imports them automatically.
 * Demonstrates the FILE trigger type for polling-based file detection.
 *
 * Features:
 * - FILE trigger with glob pattern matching and poll interval
 * - minFileAge filter to avoid processing incomplete uploads
 * - CSV extraction with field mapping transform
 */
export const fileWatchImport = createPipeline()
    .name('File Watch Import')
    .description('Watches for new CSV files and imports them automatically')

    .trigger('watch-csv', {
        type: 'FILE',
        path: './dev-server/data/incoming/*.csv',
        pollIntervalSeconds: 60,
        minFileAgeSeconds: 30,
    })

    .extract('read-file', {
        adapterCode: 'csv',
        delimiter: ',',
    })

    .transform('map-fields', {
        operators: [
            { op: 'rename', args: { from: 'name', to: 'productName' } },
        ],
    })

    // Linear graph
    .edge('watch-csv', 'read-file')
    .edge('read-file', 'map-fields')

    .build();


// =============================================================================
// P10: MESSAGE QUEUE IMPORT - Consume messages from internal queue
// =============================================================================

/**
 * Consumes messages from an internal queue and processes them.
 * Demonstrates the MESSAGE trigger type for queue-based pipeline activation.
 *
 * Features:
 * - MESSAGE trigger with internal queue type
 * - Configurable batch size and auto-acknowledge mode
 * - In-memory extraction with source tagging transform
 */
export const messageQueueImport = createPipeline()
    .name('Message Queue Import')
    .description('Consumes messages from an internal queue and processes them')

    .trigger('consume-queue', {
        type: 'MESSAGE',
        message: {
            queueType: 'INTERNAL',
            queueName: 'product-updates',
            connectionCode: '',
            batchSize: 10,
            ackMode: 'AUTO',
        },
    })

    .extract('parse-message', {
        adapterCode: 'inMemory',
        data: [],
    })

    .transform('enrich-data', {
        operators: [
            { op: 'set', args: { path: '_queueSource', value: 'internal' } },
        ],
    })

    // Linear graph
    .edge('consume-queue', 'parse-message')
    .edge('parse-message', 'enrich-data')

    .build();
