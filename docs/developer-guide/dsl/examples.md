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
        adapterCode: 'rest',
        endpoint: 'https://api.supplier.com/v2/products',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
        bearerTokenSecretCode: 'supplier-api-key',
        itemsField: 'data.products',
        pageParam: 'page',
        maxPages: 100,
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
        adapterCode: 'productUpsert',
        strategy: 'source-wins',
        channel: '__default_channel__',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
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
        adapterCode: 'csv',
        csvPath: '/uploads/products.csv',
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
        channel: '__default_channel__',
        skuField: 'sku',
        priceField: 'price',
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
        adapterCode: 'rest',
        connectionCode: 'erp-api',
        endpoint: '/products',
        query: {
            limit: 5000,
        },
        itemsField: 'data',
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
        channel: '__default_channel__',
        skuField: 'sku',
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
        adapterCode: 'csv',
        csvPath: '/exports/inventory.csv',
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
        skuField: 'sku',
        stockByLocationField: 'stockOnHand',
        absolute: true,
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
        adapterCode: 'rest',
        endpoint: 'https://crm.example.com/api/customers',
        bearerTokenSecretCode: 'crm-api-key',
        itemsField: 'customers',
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
        adapterCode: 'customerUpsert',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
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
        adapterCode: 'vendure-query',
        entity: 'Product',
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
        adapterCode: 'vendure-query',
        entity: 'Product',
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
        adapterCode: 'rest',
        endpoint: 'https://api.supplier.com/products',
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
        strategy: 'source-wins',
        channel: '__default_channel__',
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
        adapterCode: 'vendure-query',
        entity: 'Product',
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
        adapterCode: 'vendure-query',
        entity: 'Customer',
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
        adapterCode: 'vendure-query',
        entity: 'Order',
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
