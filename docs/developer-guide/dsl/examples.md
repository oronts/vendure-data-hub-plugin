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

    .trigger('start', { type: 'manual' })

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
            type: 'page',
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
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', min: 0 } },
        ],
    })

    .load('create-products', {
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['slug'],
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

    .trigger('start', { type: 'manual' })

    .extract('parse-csv', {
        adapterCode: 'file',
        path: '/uploads/products.csv',
        format: 'csv',
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
        entityType: 'PRODUCT_VARIANT',
        operation: 'UPDATE',
        lookupFields: ['sku'],
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
        type: 'schedule',
        cron: '0 */2 * * *',  // Every 2 hours
    })

    .extract('query-changes', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        dataPath: 'data',
        pagination: {
            type: 'offset',
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
        entityType: 'PRODUCT_VARIANT',
        operation: 'UPDATE',
        lookupFields: ['sku'],
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
        type: 'schedule',
        cron: '0 6 * * *',  // Daily at 6 AM
    })

    .extract('download-file', {
        adapterCode: 'file',
        path: '/exports/inventory.csv',
        format: 'csv',
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
        entityType: 'INVENTORY',
        operation: 'UPDATE',
        lookupFields: ['sku'],
    })

    .edge('schedule', 'download-file')
    .edge('download-file', 'map-inventory')
    .edge('map-inventory', 'update-stock')

    .build();
```

## Customer Import with Validation

Import customers with comprehensive validation:

```typescript
export const customerImport = createPipeline()
    .name('Customer Import')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('start', { type: 'manual' })

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
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'email', required: true } },
            { type: 'business', spec: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$' } },
            { type: 'business', spec: { field: 'firstName', required: true } },
            { type: 'business', spec: { field: 'lastName', required: true } },
        ],
    })

    .load('create-customers', {
        entityType: 'CUSTOMER',
        operation: 'UPSERT',
        lookupFields: ['emailAddress'],
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
        type: 'schedule',
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
        adapterCode: 'feed-generator',
        feedType: 'google-merchant',
        format: 'xml',
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
        type: 'schedule',
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
        adapterCode: 'search-sink',
        sinkType: 'elasticsearch',
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

    .trigger('start', { type: 'manual' })

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
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['slug'],
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
        type: 'webhook',
        path: '/order-sync',
        signature: 'hmac-sha256',
        signatureSecretCode: 'order-webhook-secret',
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
        type: 'schedule',
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

    .trigger('start', { type: 'manual' })

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
        type: 'schedule',
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

### Comprehensive Data Validation

Validate incoming records with multiple rule types:

```typescript
export const validatedProductImport = createPipeline()
    .name('Validated Product Import')
    .description('Import products with comprehensive validation')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('start', { type: 'manual' })

    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: 'https://api.supplier.com/products',
        dataPath: 'products',
    })

    .validate('validate-data', {
        mode: 'accumulate',  // Collect all errors vs fail-fast
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
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['sku'],
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

    .trigger('start', { type: 'manual' })

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
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['sku'],
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
        type: 'webhook',
        path: '/customer-import',
    })

    // Step 1: Validate required fields and format
    .validate('validate-input', {
        mode: 'fail-fast',
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
            { op: 'capitalize', args: { path: 'firstName' } },
            { op: 'capitalize', args: { path: 'lastName' } },
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
        mode: 'accumulate',
        rules: [
            { type: 'business', spec: { field: 'fullName', minLength: 3 } },
            { type: 'business', spec: { field: 'country', oneOf: ['US', 'CA', 'UK', 'DE', 'FR'] } },
        ],
    })

    .load('create-customer', {
        entityType: 'CUSTOMER',
        operation: 'UPSERT',
        lookupFields: ['emailAddress'],
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
        type: 'schedule',
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
        mode: 'accumulate',
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
        entityType: 'PRODUCT',
        operation: 'UPDATE',
        lookupFields: ['id'],
    })

    .edge('schedule', 'query-products')
    .edge('query-products', 'validate-seo-ready')
    .edge('validate-seo-ready', 'seo-enrichment')
    .edge('seo-enrichment', 'update-products')

    .build();
```
