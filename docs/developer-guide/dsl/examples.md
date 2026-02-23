# Pipeline Examples

Real-world examples of Data Hub pipelines.

## Product Import from REST API

Import products from an external API:

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

export const productApiImport = createPipeline()
    .name('Product API Import')
    .description('Import products from supplier REST API')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/v2/products',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
        bearerTokenSecretCode: 'supplier-api-key',
        dataPath: 'data.products',
        pagination: {
            type: 'PAGE',
            limit: 100,
            maxPages: 100,
        },
        throughput: { batchSize: 100 },
    })

    .transform('map-fields', {
        operators: [
            { op: 'rename', args: { from: 'productId', to: 'externalId' } },
            { op: 'rename', args: { from: 'productName', to: 'name' } },
            { op: 'rename', args: { from: 'productDescription', to: 'description' } },
            { op: 'rename', args: { from: 'retailPrice', to: 'price' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'price' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })

    .validate('check-required', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', min: 0 } },
        ],
    })

    .load('create-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'map-fields')
    .edge('map-fields', 'check-required')
    .edge('check-required', 'create-products')

    .build();
```

## CSV Product Import

Import products from a CSV file:

```typescript
export const csvProductImport = createPipeline()
    .name('CSV Product Import')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('parse-csv', {
        adapterCode: 'file',
        path: '/uploads/products.csv',
        format: 'CSV',
        delimiter: ',',
        hasHeader: true,
    })

    .transform('clean-data', {
        operators: [
            { op: 'trim', args: { path: 'name' } },
            { op: 'trim', args: { path: 'sku' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'price' } },
        ],
    })

    .load('import', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        matchField: 'sku',
    })

    .edge('start', 'parse-csv')
    .edge('parse-csv', 'clean-data')
    .edge('clean-data', 'import')

    .build();
```

## Database Sync with Delta

Sync only changed records from a database:

```typescript
export const deltaDatabaseSync = createPipeline()
    .name('Delta Database Sync')
    .capabilities({ requires: ['UpdateCatalog'], resumable: true })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 */2 * * *',  // Every 2 hours
    })

    .extract('query-changes', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        dataPath: 'data',
        pagination: {
            type: 'OFFSET',
            limit: 5000,
        },
    })

    .transform('map-and-filter', {
        operators: [
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'deltaFilter', args: {
                idPath: 'sku',
                includePaths: ['name', 'price', 'stock_level'],
            }},
        ],
    })

    .load('upsert', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        matchField: 'sku',
    })

    .edge('schedule', 'query-changes')
    .edge('query-changes', 'map-and-filter')
    .edge('map-and-filter', 'upsert')

    .build();
```

## Inventory Update from FTP

Download and process inventory file from FTP:

```typescript
export const ftpInventorySync = createPipeline()
    .name('FTP Inventory Sync')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 6 * * *',  // Daily at 6 AM
    })

    .extract('download-file', {
        adapterCode: 'file',
        path: '/exports/inventory.csv',
        format: 'CSV',
        hasHeader: true,
    })

    .transform('map-inventory', {
        operators: [
            { op: 'rename', args: { from: 'item_sku', to: 'sku' } },
            { op: 'rename', args: { from: 'qty_available', to: 'stockOnHand' } },
            { op: 'toNumber', args: { source: 'stockOnHand' } },
            { op: 'math', args: { operation: 'abs', source: 'stockOnHand', target: 'stockOnHand' } },
        ],
    })

    .load('update-stock', {
        adapterCode: 'stockAdjust',
        strategy: 'UPDATE',
        matchField: 'sku',
    })

    .edge('schedule', 'download-file')
    .edge('download-file', 'map-inventory')
    .edge('map-inventory', 'update-stock')

    .build();
```

## Customer Import with Validation

Import customers with strict validation:

```typescript
export const customerImport = createPipeline()
    .name('Customer Import')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-customers', {
        adapterCode: 'httpApi',
        url: 'https://crm.example.com/api/customers',
        bearerTokenSecretCode: 'crm-api-key',
        dataPath: 'customers',
    })

    .transform('prepare-customers', {
        operators: [
            { op: 'trim', args: { path: 'email' } },
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'firstName' } },
            { op: 'trim', args: { path: 'lastName' } },
        ],
    })

    .validate('validate-customers', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'email', required: true } },
            { type: 'business', spec: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$' } },
            { type: 'business', spec: { field: 'firstName', required: true } },
            { type: 'business', spec: { field: 'lastName', required: true } },
        ],
    })

    .load('create-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        matchField: 'emailAddress',
    })

    .edge('start', 'fetch-customers')
    .edge('fetch-customers', 'prepare-customers')
    .edge('prepare-customers', 'validate-customers')
    .edge('validate-customers', 'create-customers')

    .build();
```

## Google Shopping Feed Generation

Generate a Google Merchant feed:

```typescript
export const googleFeedPipeline = createPipeline()
    .name('Google Shopping Feed')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 4 * * *',  // Daily at 4 AM
    })

    .extract('get-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,collections,translations',
        languageCode: 'en',
        batchSize: 500,
    })

    .transform('prepare-feed', {
        operators: [
            { op: 'template', args: {
                template: 'https://mystore.com/products/${slug}',
                target: 'link',
            }},
            { op: 'template', args: {
                template: 'https://mystore.com${featuredAsset.preview}',
                target: 'image_link',
            }},
            { op: 'copy', args: { source: 'variants.0.price', target: 'price' } },
            { op: 'math', args: { operation: 'divide', source: 'price', operand: '100', target: 'price' } },
            { op: 'template', args: {
                template: '${price} USD',
                target: 'price_formatted',
            }},
            { op: 'copy', args: { source: 'variants.0.stockLevel', target: 'availability' } },
            { op: 'lookup', args: {
                source: 'availability',
                map: {
                    'IN_STOCK': 'in_stock',
                    'OUT_OF_STOCK': 'out_of_stock',
                    'LOW_STOCK': 'in_stock',
                },
                target: 'availability',
            }},
            { op: 'set', args: { path: 'condition', value: 'new' } },
        ],
    })

    .feed('generate-feed', {
        adapterCode: 'googleMerchant',
        feedType: 'GOOGLE_SHOPPING',
        format: 'XML',
        outputPath: '/feeds/google-shopping.xml',
        targetCountry: 'US',
        contentLanguage: 'en',
        currency: 'USD',
    })

    .edge('schedule', 'get-products')
    .edge('get-products', 'prepare-feed')
    .edge('prepare-feed', 'generate-feed')

    .build();
```

## Elasticsearch Product Index

Index products to Elasticsearch:

```typescript
export const elasticsearchIndex = createPipeline()
    .name('Elasticsearch Product Index')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 */4 * * *',  // Every 4 hours
    })

    .extract('get-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,facetValues,facetValues.facet,collections,translations',
        languageCode: 'en',
        batchSize: 500,
    })

    .transform('prepare-index', {
        operators: [
            { op: 'copy', args: { source: 'variants.0.price', target: 'price' } },
            { op: 'copy', args: { source: 'variants.0.stockLevel', target: 'stockLevel' } },
            { op: 'ifThenElse', args: {
                condition: { field: 'stockLevel', cmp: 'eq', value: 'IN_STOCK' },
                thenValue: true,
                elseValue: false,
                target: 'inStock',
            }},
            { op: 'omit', args: { fields: ['variants', 'facetValues'] } },
        ],
    })

    .sink('index-to-es', {
        adapterCode: 'elasticsearch',
        sinkType: 'ELASTICSEARCH',
        host: 'localhost',
        port: 9200,
        indexName: 'products',
        idField: 'id',
        bulkSize: 500,
        upsert: true,
    })

    .edge('schedule', 'get-products')
    .edge('get-products', 'prepare-index')
    .edge('prepare-index', 'index-to-es')

    .build();
```

## Multi-Branch Processing

Route products to different processing based on category:

```typescript
export const categorizedProcessing = createPipeline()
    .name('Categorized Product Processing')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
    })

    .route('by-category', {
        branches: [
            { name: 'electronics', when: [{ field: 'category', cmp: 'eq', value: 'electronics' }] },
            { name: 'clothing', when: [{ field: 'category', cmp: 'eq', value: 'clothing' }] },
        ],
        defaultTo: 'other-products',
    })

    // Electronics branch - higher pricing
    .transform('process-electronics', {
        operators: [
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '1.2', target: 'price' } },
            { op: 'set', args: { path: 'collection', value: 'electronics' } },
        ],
    })

    // Clothing branch - add size info
    .transform('process-clothing', {
        operators: [
            { op: 'split', args: { source: 'sizes', target: 'sizeList', delimiter: ',' } },
            { op: 'set', args: { path: 'collection', value: 'apparel' } },
        ],
    })

    // Other products
    .transform('process-other', {
        operators: [
            { op: 'set', args: { path: 'collection', value: 'general' } },
        ],
    })

    // Merge back
    .load('import-all', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'by-category')
    .edge('by-category', 'process-electronics', 'electronics')
    .edge('by-category', 'process-clothing', 'clothing')
    .edge('by-category', 'process-other')
    .edge('process-electronics', 'import-all')
    .edge('process-clothing', 'import-all')
    .edge('process-other', 'import-all')

    .build();
```

## Webhook-Triggered Order Sync

Process orders when triggered by webhook:

```typescript
export const orderWebhookSync = createPipeline()
    .name('Order Webhook Sync')
    .capabilities({ requires: ['UpdateOrder'] })

    .trigger('webhook', {
        type: 'WEBHOOK',
        webhookPath: '/order-sync',
        authentication: 'HMAC',
        secretCode: 'order-webhook-secret',
    })

    .transform('map-order', {
        operators: [
            { op: 'rename', args: { from: 'orderId', to: 'externalOrderId' } },
            { op: 'lookup', args: {
                source: 'status',
                map: {
                    'PAID': 'PaymentSettled',
                    'SHIPPED': 'Shipped',
                    'DELIVERED': 'Delivered',
                    'CANCELLED': 'Cancelled',
                },
                target: 'status',
            }},
        ],
    })

    .load('update-order', {
        adapterCode: 'orderTransition',
        orderIdField: 'externalOrderId',
        state: 'status',
    })

    .edge('webhook', 'map-order')
    .edge('map-order', 'update-order')

    .build();
```

## Export Pipelines

Export data from Vendure to external systems.

### Product Export to Webhook

```typescript
export const productExport = createPipeline()
    .name('Product Export')
    .description('Export products to external webhook')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',  // Daily at 2 AM
    })

    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,facetValues',
        batchSize: 100,
    })

    .transform('prepare', {
        operators: [
            { op: 'flatten', args: { source: 'variants', target: 'variants' } },
            { op: 'pick', args: { fields: ['id', 'name', 'slug', 'sku', 'price', 'featuredAsset.preview'] } },
            { op: 'set', args: { path: 'exportedAt', value: '${now}' } },
        ],
    })

    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://webhook.example.com/products/sync',
        method: 'POST',
        batchMode: 'array',
        maxBatchSize: 100,
    })

    .edge('schedule', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')

    .build();
```

### Customer Export to CRM

```typescript
export const customerExport = createPipeline()
    .name('Customer Export')
    .description('Export customers to external CRM')
    .capabilities({ requires: ['ReadCustomer'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'addresses,groups',
        batchSize: 50,
    })

    .transform('prepare', {
        operators: [
            { op: 'pick', args: { fields: ['id', 'emailAddress', 'firstName', 'lastName', 'phoneNumber', 'createdAt'] } },
            { op: 'rename', args: { from: 'emailAddress', to: 'email' } },
            { op: 'template', args: { template: '${firstName} ${lastName}', target: 'fullName' } },
        ],
    })

    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://crm.example.com/api/customers',
        method: 'POST',
        auth: 'bearer',
        bearerTokenSecretCode: 'crm-api-key',
        batchMode: 'single',
        retries: 3,
    })

    .edge('start', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')

    .build();
```

### Order Export to Fulfillment

```typescript
export const orderExport = createPipeline()
    .name('Order Export')
    .description('Export recent orders to fulfillment system')
    .capabilities({ requires: ['ReadOrder'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/15 * * * *',  // Every 15 minutes
    })

    .extract('query', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'lines,customer,shippingLines',
        batchSize: 20,
    })

    .transform('prepare', {
        operators: [
            { op: 'pick', args: { fields: ['code', 'state', 'total', 'customer.emailAddress', 'shippingAddress', 'lines'] } },
            { op: 'set', args: { path: 'source', value: 'vendure' } },
        ],
    })

    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://fulfillment.example.com/api/orders',
        method: 'POST',
        batchMode: 'single',
    })

    .edge('schedule', 'query')
    .edge('query', 'prepare')
    .edge('prepare', 'export')

    .build();
```

## Validation and Enrichment

### Strict Data Validation

Validate incoming records with multiple rule types:

```typescript
export const validatedProductImport = createPipeline()
    .name('Validated Product Import')
    .description('Import products with strict validation')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
        dataPath: 'products',
    })

    .validate('validate-data', {
        errorHandlingMode: 'ACCUMULATE',  // Collect all errors vs fail-fast
        rules: [
            // Required field validation
            { type: 'business', spec: { field: 'sku', required: true } },
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', required: true } },

            // Number range validation
            { type: 'business', spec: { field: 'price', min: 0, max: 1000000 } },
            { type: 'business', spec: { field: 'stockLevel', min: 0 } },

            // Pattern matching (regex)
            { type: 'business', spec: {
                field: 'sku',
                pattern: '^[A-Z]{2,4}-\\d{4,8}$',  // e.g., SKU-12345
            }},
            { type: 'business', spec: {
                field: 'email',
                pattern: '^[^@]+@[^@]+\\.[^@]+$',  // Basic email format
            }},

            // String length validation
            { type: 'business', spec: {
                field: 'name',
                minLength: 3,
                maxLength: 255,
            }},
            { type: 'business', spec: {
                field: 'description',
                maxLength: 5000,
            }},

            // Allowed values
            { type: 'business', spec: {
                field: 'status',
                oneOf: ['active', 'inactive', 'draft'],
            }},
        ],
    })

    .load('import-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'sku',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'validate-data')
    .edge('validate-data', 'import-products')

    .build();
```

### Static Data Enrichment

Enrich records without external lookups:

```typescript
export const enrichedProductImport = createPipeline()
    .name('Enriched Product Import')
    .description('Import products with automatic enrichment')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
    })

    .enrich('add-defaults', {
        // Apply defaults only to missing fields
        defaults: {
            currency: 'USD',
            status: 'draft',
            stockLevel: 0,
            enabled: false,
            taxCategory: 'standard',
        },
        // Always set these values (overwrite existing)
        set: {
            importSource: 'api-sync',
            importedAt: '${timestamp}',
            needsReview: true,
        },
        // Computed fields using template expressions
        computed: {
            slug: '${sku}-${name}',
            fullTitle: '${brand} - ${name}',
            searchableText: '${name} ${description} ${sku}',
        },
    })

    .load('import-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'sku',
    })

    .edge('start', 'fetch-products')
    .edge('fetch-products', 'add-defaults')
    .edge('add-defaults', 'import-products')

    .build();
```

### Combined Validation and Enrichment

Full data quality pipeline with validation and enrichment:

```typescript
export const fullDataQualityPipeline = createPipeline()
    .name('Customer Import with Data Quality')
    .description('Import customers with validation, enrichment, and quality checks')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('webhook', {
        type: 'WEBHOOK',
        webhookPath: '/customer-import',
    })

    // Step 1: Validate required fields and format
    .validate('validate-input', {
        errorHandlingMode: 'FAIL_FAST',
        rules: [
            { type: 'business', spec: { field: 'email', required: true } },
            { type: 'business', spec: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$' } },
            { type: 'business', spec: { field: 'firstName', required: true, minLength: 1 } },
            { type: 'business', spec: { field: 'lastName', required: true, minLength: 1 } },
        ],
    })

    // Step 2: Clean and normalize data
    .transform('normalize', {
        operators: [
            { op: 'trim', args: { path: 'email' } },
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'firstName' } },
            { op: 'trim', args: { path: 'lastName' } },
        ],
    })

    // Step 3: Enrich with computed and default values
    .enrich('enrich-customer', {
        defaults: {
            country: 'US',
            customerGroup: 'retail',
            marketingOptIn: false,
        },
        computed: {
            fullName: '${firstName} ${lastName}',
            displayName: '${firstName}',
        },
        set: {
            source: 'webhook-import',
            importedAt: '${timestamp}',
        },
    })

    // Step 4: Final validation after enrichment
    .validate('validate-output', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'fullName', minLength: 3 } },
            { type: 'business', spec: { field: 'country', oneOf: ['US', 'CA', 'UK', 'DE', 'FR'] } },
        ],
    })

    .load('create-customer', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        matchField: 'emailAddress',
    })

    .edge('webhook', 'validate-input')
    .edge('validate-input', 'normalize')
    .edge('normalize', 'enrich-customer')
    .edge('enrich-customer', 'validate-output')
    .edge('validate-output', 'create-customer')

    .build();
```

### Product Catalog Enrichment for SEO

Enrich products with SEO-optimized computed fields:

```typescript
export const seoEnrichmentPipeline = createPipeline()
    .name('Product SEO Enrichment')
    .description('Enrich product catalog with SEO-friendly fields')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 3 * * *',  // Daily at 3 AM
    })

    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,facetValues',
        batchSize: 100,
    })

    // Validate products have required SEO fields
    .validate('validate-seo-ready', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'name', required: true, minLength: 10 } },
            { type: 'business', spec: { field: 'description', required: true, minLength: 50 } },
        ],
    })

    // Enrich with SEO-optimized computed fields
    .enrich('seo-enrichment', {
        computed: {
            metaTitle: '${name} | Buy Online | MyStore',
            metaDescription: 'Shop ${name}. ${description}. Free shipping on orders over $50.',
            canonicalUrl: 'https://mystore.com/products/${slug}',
            structuredDataTitle: '${name}',
            ogTitle: '${name} - MyStore',
            ogDescription: '${description}',
        },
        defaults: {
            metaRobots: 'index,follow',
            priority: 0.8,
        },
        set: {
            seoUpdatedAt: '${timestamp}',
        },
    })

    .load('update-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPDATE',
        matchField: 'id',
    })

    .edge('schedule', 'query-products')
    .edge('query-products', 'validate-seo-ready')
    .edge('validate-seo-ready', 'seo-enrichment')
    .edge('seo-enrichment', 'update-products')

    .build();
```

## Advanced Features

Examples demonstrating new pipeline capabilities: parallel execution, multi-source joins, per-record retry, GATE approval steps, and image/PDF processing.

### Parallel Execution

Run pipeline steps concurrently for improved throughput:

```typescript
import { createPipeline, operators } from '@oronts/vendure-data-hub-plugin';

export const parallelPipeline = createPipeline()
    .name('Parallel Pipeline')
    .description('Process data with parallel step execution')
    .parallel({ maxConcurrentSteps: 4, errorPolicy: 'CONTINUE' })

    .trigger('start', { type: 'MANUAL' })

    .extract('data', { adapterCode: 'file', path: '/data/products.csv', format: 'CSV' })

    .transform('process', {
        operators: [
            operators.trim('name'),
            operators.map({ productName: 'name', productSku: 'sku' }),
        ],
    })

    .load('save', { adapterCode: 'productUpsert', strategy: 'UPSERT', matchField: 'slug' })

    .edge('start', 'data')
    .edge('data', 'process')
    .edge('process', 'save')

    .build();
```

### Multi-Source Join

Merge records from two extract steps using the `multiJoin` operator:

```typescript
export const joinPipeline = createPipeline()
    .name('Product Price Join')
    .description('Join products with pricing data from a second source')

    .trigger('start', { type: 'MANUAL' })

    .extract('products', {
        adapterCode: 'httpApi',
        url: 'https://api.example.com/products',
        dataPath: 'data',
    })

    .extract('prices', {
        adapterCode: 'httpApi',
        url: 'https://api.example.com/prices',
        dataPath: 'data',
    })

    .transform('merge', {
        operators: [
            operators.multiJoin({
                leftKey: 'productId',
                rightKey: 'id',
                rightDataPath: '$.steps.prices.output',
                type: 'LEFT',
                prefix: 'price_',
            }),
        ],
    })

    .load('save', {
        adapterCode: 'variantUpsert',
        strategy: 'UPDATE',
        matchField: 'sku',
    })

    .edge('start', 'products')
    .edge('start', 'prices')
    .edge('products', 'merge')
    .edge('prices', 'merge')
    .edge('merge', 'save')

    .build();
```

### Per-Record Retry

Add retry logic at the record level for resilient transforms:

```typescript
export const resilientPipeline = createPipeline()
    .name('Resilient Import')
    .description('Import with per-record retry on transient failures')

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
        dataPath: 'products',
    })

    .transform('resilient', {
        operators: [
            { op: 'httpLookup', args: {
                url: 'https://api.pricing.com/lookup/{{sku}}',
                target: 'externalPrice',
                default: null,
            }},
        ],
        retryPerRecord: {
            maxRetries: 3,
            retryDelayMs: 200,
            backoff: 'EXPONENTIAL',
        },
    })

    .load('save', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })

    .edge('start', 'fetch')
    .edge('fetch', 'resilient')
    .edge('resilient', 'save')

    .build();
```

### GATE Approval Step

Pause pipeline execution for human approval before loading:

```typescript
export const gatedImport = createPipeline()
    .name('Gated Product Import')
    .description('Import products with manual review before loading')

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
        dataPath: 'products',
    })

    .transform('prepare', {
        operators: [
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'toCents', args: { source: 'price', target: 'priceInCents' } },
        ],
    })

    .gate('review', {
        approvalType: 'MANUAL',
        notifyWebhook: 'https://hooks.slack.com/services/...',
        previewCount: 20,
    })

    .load('import', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })

    .edge('start', 'fetch')
    .edge('fetch', 'prepare')
    .edge('prepare', 'review')
    .edge('review', 'import')

    .build();
```

The GATE step supports three approval types:

- **MANUAL** - A human must explicitly approve or reject the run via the dashboard
- **THRESHOLD** - Automatically approves if validation error rate is below a threshold
- **TIMEOUT** - Automatically approves after a configurable timeout period if not rejected

### Image Processing

Resize and convert images as part of a product pipeline:

```typescript
export const imageProcessingPipeline = createPipeline()
    .name('Product Image Processing')
    .description('Resize and convert product images to optimized formats')

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
        dataPath: 'products',
    })

    .transform('process-images', {
        operators: [
            // Resize the main product photo
            operators.imageResize({
                sourceField: 'photo',
                width: 800,
                height: 600,
                fit: 'cover',
                format: 'webp',
                quality: 85,
            }),

            // Convert an additional image to WebP
            operators.imageConvert({
                sourceField: 'image',
                format: 'webp',
                quality: 90,
            }),
        ],
    })

    .load('save', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'slug',
    })

    .edge('start', 'fetch')
    .edge('fetch', 'process-images')
    .edge('process-images', 'save')

    .build();
```

### PDF Generation

Generate PDF documents from record data using HTML templates:

```typescript
export const invoicePipeline = createPipeline()
    .name('Invoice PDF Generation')
    .description('Generate PDF invoices from order data')

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 8 * * *',  // Daily at 8 AM
    })

    .extract('get-orders', {
        adapterCode: 'vendureQuery',
        entity: 'ORDER',
        relations: 'lines,customer',
        batchSize: 50,
    })

    .transform('generate-pdfs', {
        operators: [
            operators.pdfGenerate({
                template: '<h1>Invoice #{{code}}</h1><p>Customer: {{customer.firstName}} {{customer.lastName}}</p><p>Total: {{total}}</p>',
                targetField: 'invoice_pdf',
            }),
        ],
    })

    .load('export', {
        adapterCode: 'restPost',
        endpoint: 'https://storage.example.com/invoices',
        method: 'POST',
    })

    .edge('schedule', 'get-orders')
    .edge('get-orders', 'generate-pdfs')
    .edge('generate-pdfs', 'export')

    .build();
```
