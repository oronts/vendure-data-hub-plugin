# Advanced Recipes

Real-world pipeline examples for common integration scenarios.

## Table of Contents

1. [Multi-Source Product Aggregation](#1-multi-source-product-aggregation)
2. [Incremental Inventory Sync](#2-incremental-inventory-sync)
3. [Customer Data Enrichment](#3-customer-data-enrichment)
4. [Real-Time Order Processing](#4-real-time-order-processing)
5. [Multi-Channel Price Sync](#5-multi-channel-price-sync)
6. [Automated Product Feed Generation](#6-automated-product-feed-generation)
7. [CDC-Based Data Warehouse Sync](#7-cdc-based-data-warehouse-sync)
8. [Error Recovery and Dead Letter Queue Processing](#8-error-recovery-and-dead-letter-queue-processing)
9. [Multi-Stage Approval Workflow](#9-multi-stage-approval-workflow)
10. [Event-Driven Catalog Updates](#10-event-driven-catalog-updates)

---

## 1. Multi-Source Product Aggregation

Combine product data from multiple sources (ERP, PIM, pricing service) into a single catalog.

### Scenario

- Pull product data from ERP system
- Enrich with detailed descriptions from PIM
- Add real-time pricing from pricing service
- Merge all data and upsert to Vendure

### Pipeline

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const multiSourceProductSync = createPipeline()
    .name('Multi-Source Product Aggregation')
    .description('Combine product data from ERP, PIM, and pricing service')
    .version(1)

    .context({
        channel: 'default',
        throughput: {
            batchSize: 100,
            concurrency: 4,
        },
    })

    .capabilities({
        writes: ['CATALOG'],
        streamSafe: true,
    })

    // Trigger: Scheduled daily at 2 AM
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 2 * * *',
        timezone: 'UTC',
    })

    // Extract from all three sources in parallel
    .extract('erp-products', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        dataPath: 'data.products',
        incremental: {
            enabled: true,
            field: 'updated_at',
            operator: '>',
        },
        throughput: { batchSize: 200 },
    })

    .extract('pim-descriptions', {
        adapterCode: 'httpApi',
        connectionCode: 'pim-api',
        url: '/product-content',
        dataPath: 'items',
        incremental: {
            enabled: true,
            field: 'last_modified',
            operator: '>=',
        },
    })

    .extract('pricing-data', {
        adapterCode: 'httpApi',
        connectionCode: 'pricing-api',
        url: '/prices',
        dataPath: 'prices',
    })

    // Normalize field names from each source
    .transform('normalize-erp', {
        operators: [
            { op: 'rename', args: { from: 'product_id', to: 'sku' } },
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'set', args: { path: '_source', value: 'erp' } },
        ],
    })

    .transform('normalize-pim', {
        operators: [
            { op: 'rename', args: { from: 'product_code', to: 'sku' } },
            { op: 'rename', args: { from: 'long_description', to: 'description' } },
            { op: 'rename', args: { from: 'marketing_text', to: 'marketingDescription' } },
            { op: 'set', args: { path: '_source', value: 'pim' } },
        ],
    })

    .transform('normalize-pricing', {
        operators: [
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'rename', args: { from: 'unit_price', to: 'price' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100' } },
            { op: 'set', args: { path: '_source', value: 'pricing' } },
        ],
    })

    // Merge all sources by SKU
    .transform('merge-sources', {
        operators: [
            {
                op: 'groupBy',
                args: {
                    field: 'sku',
                    aggregations: {
                        name: 'first',
                        description: 'first',
                        marketingDescription: 'first',
                        price: 'first',
                        stock: 'sum',
                        categories: 'unique',
                    },
                },
            },
        ],
    })

    // Enrich with computed fields
    .enrich('add-computed-fields', {
        computed: {
            slug: '${sku}',
            fullDescription: '${description}\n\n${marketingDescription}',
            displayPrice: '${price}',
        },
        defaults: {
            enabled: true,
            trackInventory: true,
        },
    })

    // Validate merged data
    .validate('check-required-fields', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, pattern: '^[A-Z0-9-]+$' } },
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', required: true, min: 0 } },
        ],
    })

    // Gate for manual review of high-value items
    .route('by-price', {
        branches: [
            {
                name: 'high-value',
                when: [{ field: 'price', cmp: 'gt', value: 100000 }],  // > $1000
            },
            {
                name: 'standard',
                when: [{ field: 'price', cmp: 'lte', value: 100000 }],
            },
        ],
    })

    .gate('review-high-value', {
        approvalType: 'MANUAL',
        notifyEmail: 'product-team@example.com',
        previewCount: 50,
    })

    // Upsert products
    .load('upsert-high-value', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'sku',
        conflictStrategy: 'MERGE',
    })

    .load('upsert-standard', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'sku',
        conflictStrategy: 'SOURCE_WINS',
        throughput: { batchSize: 50, concurrency: 2 },
    })

    // Index to search
    .sink('index-search', {
        adapterCode: 'meilisearch',
        indexName: 'products',
        host: 'localhost',
        port: 7700,
        idField: 'sku',
        bulkSize: 500,
    })

    // Define data flow
    .edge('schedule', 'erp-products')
    .edge('schedule', 'pim-descriptions')
    .edge('schedule', 'pricing-data')
    .edge('erp-products', 'normalize-erp')
    .edge('pim-descriptions', 'normalize-pim')
    .edge('pricing-data', 'normalize-pricing')
    .edge('normalize-erp', 'merge-sources')
    .edge('normalize-pim', 'merge-sources')
    .edge('normalize-pricing', 'merge-sources')
    .edge('merge-sources', 'add-computed-fields')
    .edge('add-computed-fields', 'check-required-fields')
    .edge('check-required-fields', 'by-price')
    .edge('by-price', 'review-high-value', 'high-value')
    .edge('by-price', 'upsert-standard', 'standard')
    .edge('review-high-value', 'upsert-high-value')
    .edge('upsert-high-value', 'index-search')
    .edge('upsert-standard', 'index-search')

    // Lifecycle hooks
    .hooks({
        PIPELINE_STARTED: [{
            type: 'WEBHOOK',
            url: 'https://api.example.com/notifications/sync-started',
        }],
        PIPELINE_COMPLETED: [{
            type: 'WEBHOOK',
            url: 'https://api.example.com/notifications/sync-completed',
        }],
        ON_ERROR: [{
            type: 'WEBHOOK',
            url: 'https://pagerduty.example.com/alerts',
        }],
    })

    .build();

export default multiSourceProductSync;
```

### Key Techniques

- **Parallel Extraction**: Independent API calls run concurrently
- **Data Normalization**: Each source has its own transform step
- **Grouping**: Merge records by SKU using groupBy operator
- **Conditional Routing**: High-value items require approval
- **Error Handling**: Validation with accumulate mode
- **Search Integration**: Automatic indexing after load

---

## 2. Incremental Inventory Sync

Sync inventory levels from warehouse system, tracking only changes since last run.

### Scenario

- Query warehouse database for inventory updates
- Update stock levels in Vendure
- Track low-stock items
- Send alerts for out-of-stock products

### Pipeline

```typescript
const inventorySync = createPipeline()
    .name('Incremental Inventory Sync')
    .description('Sync warehouse inventory to Vendure with low-stock alerts')
    .version(1)

    .context({
        checkpointing: {
            enabled: true,
            strategy: 'TIMESTAMP',
            field: 'updated_at',
        },
        errorHandling: {
            maxRetries: 3,
            deadLetterQueue: true,
        },
    })

    // Trigger: Every 15 minutes
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/15 * * * *',
        timezone: 'UTC',
    })

    // Extract only updated inventory records
    .extract('query-warehouse', {
        adapterCode: 'database',
        connectionCode: 'warehouse-db',
        query: `
            SELECT
                sku,
                location_code,
                quantity_on_hand,
                reserved_quantity,
                updated_at
            FROM inventory
            WHERE updated_at > :checkpoint
            ORDER BY updated_at ASC
        `,
        incremental: {
            enabled: true,
            field: 'updated_at',
            operator: '>',
        },
        throughput: { batchSize: 1000 },
    })

    // Calculate available inventory
    .transform('calculate-available', {
        operators: [
            {
                op: 'math',
                args: {
                    operation: 'subtract',
                    source: 'quantity_on_hand',
                    operand: 'reserved_quantity',
                    target: 'available',
                },
            },
            {
                op: 'coalesce',
                args: {
                    sources: ['available', 'quantity_on_hand'],
                    target: 'stockOnHand',
                },
            },
        ],
    })

    // Route by stock level
    .route('by-stock-level', {
        branches: [
            {
                name: 'out-of-stock',
                when: [{ field: 'stockOnHand', cmp: 'lte', value: 0 }],
            },
            {
                name: 'low-stock',
                when: [
                    { field: 'stockOnHand', cmp: 'gt', value: 0 },
                    { field: 'stockOnHand', cmp: 'lte', value: 10 },
                ],
            },
            {
                name: 'normal-stock',
                when: [{ field: 'stockOnHand', cmp: 'gt', value: 10 }],
            },
        ],
    })

    // Alert on out-of-stock
    .transform('format-oos-alert', {
        operators: [
            {
                op: 'template',
                args: {
                    template: 'SKU ${sku} is out of stock at ${location_code}',
                    target: 'alertMessage',
                },
            },
        ],
    })

    .export('send-oos-alerts', {
        adapterCode: 'webhook',
        url: 'https://alerts.example.com/out-of-stock',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })

    // Update Vendure inventory
    .load('update-inventory', {
        adapterCode: 'inventoryUpsert',
        strategy: 'UPDATE',
        matchField: 'sku',
        stockLocationField: 'location_code',
        stockOnHandField: 'stockOnHand',
    })

    // Edges
    .edge('schedule', 'query-warehouse')
    .edge('query-warehouse', 'calculate-available')
    .edge('calculate-available', 'by-stock-level')
    .edge('by-stock-level', 'format-oos-alert', 'out-of-stock')
    .edge('by-stock-level', 'update-inventory', 'low-stock')
    .edge('by-stock-level', 'update-inventory', 'normal-stock')
    .edge('format-oos-alert', 'send-oos-alerts')
    .edge('send-oos-alerts', 'update-inventory')

    .build();
```

### Key Techniques

- **Incremental Extraction**: Only queries records updated since last run
- **Checkpointing**: Automatic resume on failure
- **Math Operations**: Calculate available stock
- **Conditional Routing**: Different flows for different stock levels
- **Alerting**: Webhook notifications for critical events

---

## 3. Customer Data Enrichment

Enrich customer records with demographic data and purchase history from external services.

### Scenario

- Extract customer emails from Vendure
- Enrich with demographic data from Clearbit API
- Add lifetime value calculation
- Segment customers for marketing

### Pipeline

```typescript
const customerEnrichment = createPipeline()
    .name('Customer Data Enrichment')
    .description('Enrich customers with demographics and segmentation')
    .version(1)

    .trigger('event', {
        type: 'EVENT',
        event: 'CustomerRegistrationEvent',
    })

    // Extract customer data
    .extract('get-customer', {
        adapterCode: 'vendureQuery',
        entity: 'CUSTOMER',
        relations: 'addresses,orders',
    })

    // Enrich with Clearbit
    .transform('lookup-demographics', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: 'https://person.clearbit.com/v2/combined/find?email={{emailAddress}}',
                    target: 'demographics',
                    headers: {
                        Authorization: 'Bearer {{clearbitApiKey}}',
                    },
                    cache: true,
                    cacheTtl: 86400,  // 24 hours
                },
            },
        ],
        retryPerRecord: {
            maxRetries: 3,
            retryDelayMs: 1000,
            backoff: 'EXPONENTIAL',
            retryableErrors: ['ETIMEDOUT', '429'],
        },
    })

    // Extract demographics
    .transform('flatten-demographics', {
        operators: [
            { op: 'set', args: { path: 'company', value: '{{demographics.person.employment.name}}' } },
            { op: 'set', args: { path: 'title', value: '{{demographics.person.employment.title}}' } },
            { op: 'set', args: { path: 'location', value: '{{demographics.person.location}}' } },
            { op: 'set', args: { path: 'linkedIn', value: '{{demographics.person.linkedin.handle}}' } },
        ],
    })

    // Calculate customer lifetime value
    .transform('calculate-ltv', {
        operators: [
            {
                op: 'aggregate',
                args: {
                    source: 'orders',
                    operation: 'sum',
                    field: 'total',
                    target: 'lifetimeValue',
                },
            },
            {
                op: 'aggregate',
                args: {
                    source: 'orders',
                    operation: 'count',
                    target: 'orderCount',
                },
            },
        ],
    })

    // Segment customers
    .route('segment-customers', {
        branches: [
            {
                name: 'vip',
                when: [
                    { field: 'lifetimeValue', cmp: 'gte', value: 100000 },  // $1000+
                ],
            },
            {
                name: 'loyal',
                when: [
                    { field: 'orderCount', cmp: 'gte', value: 5 },
                    { field: 'lifetimeValue', cmp: 'gte', value: 50000 },   // $500+
                ],
            },
            {
                name: 'new',
                when: [
                    { field: 'orderCount', cmp: 'lt', value: 2 },
                ],
            },
        ],
        defaultTo: 'standard',
    })

    // Tag customers by segment
    .transform('add-vip-tag', {
        operators: [
            { op: 'set', args: { path: 'segment', value: 'VIP' } },
        ],
    })

    .transform('add-loyal-tag', {
        operators: [
            { op: 'set', args: { path: 'segment', value: 'Loyal' } },
        ],
    })

    .transform('add-new-tag', {
        operators: [
            { op: 'set', args: { path: 'segment', value: 'New' } },
        ],
    })

    .transform('add-standard-tag', {
        operators: [
            { op: 'set', args: { path: 'segment', value: 'Standard' } },
        ],
    })

    // Update customer group
    .load('assign-vip-group', {
        adapterCode: 'customerGroupAssignment',
        groupCode: 'vip-customers',
        emailField: 'emailAddress',
    })

    .load('assign-loyal-group', {
        adapterCode: 'customerGroupAssignment',
        groupCode: 'loyal-customers',
        emailField: 'emailAddress',
    })

    .load('assign-new-group', {
        adapterCode: 'customerGroupAssignment',
        groupCode: 'new-customers',
        emailField: 'emailAddress',
    })

    .load('assign-standard-group', {
        adapterCode: 'customerGroupAssignment',
        groupCode: 'standard-customers',
        emailField: 'emailAddress',
    })

    // Export to marketing platform
    .sink('sync-to-mailchimp', {
        adapterCode: 'webhook',
        url: 'https://api.mailchimp.com/3.0/lists/{{listId}}/members',
        method: 'POST',
        apiKeySecretCode: 'mailchimp-api-key',
    })

    // Edges
    .edge('get-customer', 'lookup-demographics')
    .edge('lookup-demographics', 'flatten-demographics')
    .edge('flatten-demographics', 'calculate-ltv')
    .edge('calculate-ltv', 'segment-customers')
    .edge('segment-customers', 'add-vip-tag', 'vip')
    .edge('segment-customers', 'add-loyal-tag', 'loyal')
    .edge('segment-customers', 'add-new-tag', 'new')
    .edge('segment-customers', 'add-standard-tag', 'standard')
    .edge('add-vip-tag', 'assign-vip-group')
    .edge('add-loyal-tag', 'assign-loyal-group')
    .edge('add-new-tag', 'assign-new-group')
    .edge('add-standard-tag', 'assign-standard-group')
    .edge('assign-vip-group', 'sync-to-mailchimp')
    .edge('assign-loyal-group', 'sync-to-mailchimp')
    .edge('assign-new-group', 'sync-to-mailchimp')
    .edge('assign-standard-group', 'sync-to-mailchimp')

    .build();
```

### Key Techniques

- **Event Trigger**: Runs automatically on customer registration
- **HTTP Lookup**: External API enrichment with caching
- **Aggregate Operations**: Calculate metrics from related entities
- **Multi-Way Routing**: Segment customers into multiple groups
- **Per-Record Retry**: Resilient API calls with exponential backoff

---

## 4. Real-Time Order Processing

Process orders in real-time via webhook, validate, and send to fulfillment system.

### Scenario

- Receive order webhooks from Vendure
- Validate order data
- Check inventory availability
- Route to fulfillment system
- Send confirmation emails

### Pipeline

```typescript
const orderProcessing = createPipeline()
    .name('Real-Time Order Processing')
    .description('Process orders and send to fulfillment')
    .version(1)

    .trigger('webhook', {
        type: 'WEBHOOK',
        path: '/order-placed',
        signature: 'hmac-sha256',
        secretCode: 'webhook-secret',
        idempotencyKey: 'X-Order-ID',
    })

    // Extract order from webhook payload
    .extract('parse-order', {
        adapterCode: 'webhookBody',
        dataPath: 'order',
    })

    // Validate order
    .validate('check-order', {
        errorHandlingMode: 'FAIL_FAST',
        rules: [
            { type: 'business', spec: { field: 'code', required: true } },
            { type: 'business', spec: { field: 'customer.emailAddress', required: true, type: 'email' } },
            { type: 'business', spec: { field: 'lines', required: true } },
            { type: 'business', spec: { field: 'totalWithTax', required: true, min: 0 } },
        ],
    })

    // Check inventory for all line items
    .transform('check-inventory', {
        operators: [
            {
                op: 'forEach',
                args: {
                    source: 'lines',
                    operator: {
                        op: 'vendureLookup',
                        args: {
                            entity: 'PRODUCT_VARIANT',
                            matchField: 'productVariant.sku',
                            select: 'stockOnHand',
                            target: 'availableStock',
                        },
                    },
                },
            },
        ],
    })

    // Route by fulfillment method
    .route('by-shipping-method', {
        branches: [
            {
                name: 'express',
                when: [
                    { field: 'shippingLines[0].shippingMethod.code', cmp: 'eq', value: 'express-shipping' },
                ],
            },
            {
                name: 'international',
                when: [
                    { field: 'shippingAddress.countryCode', cmp: 'nin', value: ['US', 'CA'] },
                ],
            },
        ],
        defaultTo: 'standard',
    })

    // Transform for fulfillment system
    .transform('format-for-shipstation', {
        operators: [
            {
                op: 'map',
                args: {
                    orderNumber: 'code',
                    orderDate: 'orderPlacedAt',
                    orderStatus: 'state',
                    customerEmail: 'customer.emailAddress',
                    billTo: {
                        name: 'billingAddress.fullName',
                        street1: 'billingAddress.streetLine1',
                        city: 'billingAddress.city',
                        state: 'billingAddress.province',
                        postalCode: 'billingAddress.postalCode',
                        country: 'billingAddress.countryCode',
                    },
                    shipTo: {
                        name: 'shippingAddress.fullName',
                        street1: 'shippingAddress.streetLine1',
                        city: 'shippingAddress.city',
                        state: 'shippingAddress.province',
                        postalCode: 'shippingAddress.postalCode',
                        country: 'shippingAddress.countryCode',
                    },
                    items: {
                        _forEach: 'lines',
                        sku: 'productVariant.sku',
                        name: 'productVariant.name',
                        quantity: 'quantity',
                        unitPrice: 'unitPriceWithTax',
                    },
                },
            },
        ],
    })

    // Send to fulfillment
    .export('send-to-shipstation', {
        adapterCode: 'api-export',
        url: 'https://api.shipstation.com/orders/createorder',
        method: 'POST',
        apiKeySecretCode: 'shipstation-api-key',
    })

    // Send confirmation email
    .export('send-confirmation', {
        adapterCode: 'email',
        to: '{{customer.emailAddress}}',
        subject: 'Order Confirmation - {{code}}',
        template: 'order-confirmation',
    })

    // Update order status
    .load('update-order-status', {
        adapterCode: 'orderUpdate',
        matchField: 'code',
        config: {
            customFields: {
                sentToFulfillment: true,
                fulfillmentProvider: 'shipstation',
            },
        },
    })

    // Edges
    .edge('parse-order', 'check-order')
    .edge('check-order', 'check-inventory')
    .edge('check-inventory', 'by-shipping-method')
    .edge('by-shipping-method', 'format-for-shipstation', 'express')
    .edge('by-shipping-method', 'format-for-shipstation', 'international')
    .edge('by-shipping-method', 'format-for-shipstation', 'standard')
    .edge('format-for-shipstation', 'send-to-shipstation')
    .edge('send-to-shipstation', 'send-confirmation')
    .edge('send-confirmation', 'update-order-status')

    .hooks({
        ON_ERROR: [{
            type: 'WEBHOOK',
            url: 'https://pagerduty.example.com/critical-order-error',
        }],
    })

    .build();
```

### Key Techniques

- **Webhook Trigger**: Real-time processing
- **Idempotency**: Prevents duplicate processing
- **Fail-Fast Validation**: Critical orders stop immediately on error
- **Inventory Lookup**: Vendure entity lookup for stock
- **Complex Mapping**: Nested object transformation
- **Multi-Step Flow**: Fulfillment → Email → Status update

---

## 5. Multi-Channel Price Sync

Synchronize prices across multiple sales channels based on regional rules.

### Scenario

- Extract base prices from PIM
- Apply regional markup rules
- Apply channel-specific discounts
- Update prices in all channels

### Pipeline

```typescript
const multiChannelPricing = createPipeline()
    .name('Multi-Channel Price Sync')
    .description('Apply regional pricing rules across channels')
    .version(1)

    .context({
        channelStrategy: 'MULTI',
        channelIds: ['us-channel', 'eu-channel', 'uk-channel'],
    })

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 3 * * *',  // Daily at 3 AM
    })

    // Extract base prices
    .extract('get-base-prices', {
        adapterCode: 'httpApi',
        connectionCode: 'pim-api',
        url: '/pricing/base-prices',
        dataPath: 'prices',
    })

    // Duplicate records for each channel
    .transform('create-channel-copies', {
        operators: [
            {
                op: 'fanOut',
                args: {
                    dimension: 'channel',
                    values: ['us-channel', 'eu-channel', 'uk-channel'],
                },
            },
        ],
    })

    // Apply regional markup
    .route('by-channel', {
        branches: [
            { name: 'us', when: [{ field: 'channel', cmp: 'eq', value: 'us-channel' }] },
            { name: 'eu', when: [{ field: 'channel', cmp: 'eq', value: 'eu-channel' }] },
            { name: 'uk', when: [{ field: 'channel', cmp: 'eq', value: 'uk-channel' }] },
        ],
    })

    // US: No markup, USD
    .transform('apply-us-pricing', {
        operators: [
            { op: 'set', args: { path: 'currencyCode', value: 'USD' } },
            // Price already in cents
        ],
    })

    // EU: 20% markup, EUR conversion
    .transform('apply-eu-pricing', {
        operators: [
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '1.2' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '0.92' } },  // USD to EUR
            { op: 'round', args: { source: 'price', precision: 0 } },
            { op: 'set', args: { path: 'currencyCode', value: 'EUR' } },
        ],
    })

    // UK: 15% markup, GBP conversion
    .transform('apply-uk-pricing', {
        operators: [
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '1.15' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', operand: '0.79' } },  // USD to GBP
            { op: 'round', args: { source: 'price', precision: 0 } },
            { op: 'set', args: { path: 'currencyCode', value: 'GBP' } },
        ],
    })

    // Merge channels back
    .transform('merge-channels', {
        operators: [
            { op: 'identity' },  // Passthrough
        ],
    })

    // Apply promotional discounts
    .enrich('apply-promotions', {
        sourceType: 'HTTP',
        endpoint: 'https://api.example.com/promotions/active',
        matchField: 'sku',
        targetField: 'promotion',
    })

    .transform('calculate-discounted-price', {
        operators: [
            {
                op: 'conditional',
                args: {
                    if: { field: 'promotion.discount', cmp: 'exists' },
                    then: [
                        {
                            op: 'math',
                            args: {
                                operation: 'multiply',
                                source: 'price',
                                operand: '{{promotion.discountPercent}}',
                                target: 'discountAmount',
                            },
                        },
                        {
                            op: 'math',
                            args: {
                                operation: 'subtract',
                                source: 'price',
                                operand: 'discountAmount',
                                target: 'price',
                            },
                        },
                    ],
                },
            },
        ],
    })

    // Update variant prices in each channel
    .load('update-prices', {
        adapterCode: 'variantPriceUpdate',
        matchField: 'sku',
        priceField: 'price',
        channelStrategy: 'EXPLICIT',
    })

    // Edges
    .edge('get-base-prices', 'create-channel-copies')
    .edge('create-channel-copies', 'by-channel')
    .edge('by-channel', 'apply-us-pricing', 'us')
    .edge('by-channel', 'apply-eu-pricing', 'eu')
    .edge('by-channel', 'apply-uk-pricing', 'uk')
    .edge('apply-us-pricing', 'merge-channels')
    .edge('apply-eu-pricing', 'merge-channels')
    .edge('apply-uk-pricing', 'merge-channels')
    .edge('merge-channels', 'apply-promotions')
    .edge('apply-promotions', 'calculate-discounted-price')
    .edge('calculate-discounted-price', 'update-prices')

    .build();
```

### Key Techniques

- **Fan-Out**: Duplicate records for each channel
- **Channel Routing**: Different pricing logic per channel
- **Currency Conversion**: Math operators for FX
- **Conditional Logic**: Apply discounts selectively
- **Channel Strategy**: Update prices across multiple channels

---

## 6. Automated Product Feed Generation

Generate and upload product feeds for Google Shopping and Meta Catalog.

### Scenario

- Extract active products from Vendure
- Transform to feed format
- Generate XML/CSV feeds
- Upload to FTP servers
- Notify marketing team

### Pipeline

```typescript
const productFeedGeneration = createPipeline()
    .name('Automated Product Feed Generation')
    .description('Generate Google and Meta product feeds')
    .version(1)

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '0 */6 * * *',  // Every 6 hours
    })

    // Extract active products with variants
    .extract('get-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset,facetValues',
        batchSize: 500,
    })

    // Filter enabled products
    .transform('filter-active', {
        operators: [
            { op: 'filter', args: { field: 'enabled', value: true } },
            { op: 'filter', args: { field: 'variants.enabled', value: true } },
        ],
    })

    // Flatten variants
    .transform('flatten-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    source: 'variants',
                    preserveParent: true,
                    parentAlias: 'product',
                },
            },
        ],
    })

    // Prepare for feeds
    .transform('normalize-for-feeds', {
        operators: [
            { op: 'set', args: { path: 'id', value: '{{product.id}}_{{id}}' } },
            { op: 'set', args: { path: 'title', value: '{{product.name}} - {{name}}' } },
            { op: 'set', args: { path: 'description', value: '{{product.description}}' } },
            { op: 'set', args: { path: 'link', value: 'https://shop.example.com/products/{{product.slug}}' } },
            { op: 'set', args: { path: 'image_link', value: '{{product.featuredAsset.preview}}' } },
            { op: 'set', args: { path: 'price', value: '{{priceWithTax}} USD' } },
            { op: 'set', args: { path: 'availability', value: '{{stockOnHand > 0 ? "in stock" : "out of stock"}}' } },
            { op: 'set', args: { path: 'condition', value: 'new' } },
        ],
    })

    // Route to different feed types
    .route('by-feed-type', {
        branches: [
            { name: 'google', when: [] },  // All products
            { name: 'meta', when: [] },     // All products
        ],
    })

    // Generate Google Shopping XML
    .feed('google-shopping', {
        adapterCode: 'googleMerchant',
        feedType: 'GOOGLE_SHOPPING',
        format: 'XML',
        outputPath: '/feeds/google-shopping.xml',
        targetCountry: 'US',
        contentLanguage: 'en',
        currency: 'USD',
    })

    // Upload Google feed to FTP
    .export('upload-google-feed', {
        adapterCode: 'ftp-export',
        connectionCode: 'google-ftp',
        path: '/feeds',
        filename: 'google-shopping.xml',
    })

    // Generate Meta Catalog CSV
    .feed('meta-catalog', {
        adapterCode: 'metaCatalog',
        feedType: 'META_CATALOG',
        format: 'CSV',
        outputPath: '/feeds/meta-catalog.csv',
    })

    // Upload Meta feed to FTP
    .export('upload-meta-feed', {
        adapterCode: 'ftp-export',
        connectionCode: 'meta-ftp',
        path: '/feeds',
        filename: 'meta-catalog.csv',
    })

    // Notify marketing team
    .export('send-notification', {
        adapterCode: 'email',
        to: 'marketing@example.com',
        subject: 'Product Feeds Updated',
        body: 'Google Shopping and Meta Catalog feeds have been regenerated and uploaded.',
    })

    // Edges
    .edge('get-products', 'filter-active')
    .edge('filter-active', 'flatten-variants')
    .edge('flatten-variants', 'normalize-for-feeds')
    .edge('normalize-for-feeds', 'by-feed-type')
    .edge('by-feed-type', 'google-shopping', 'google')
    .edge('by-feed-type', 'meta-catalog', 'meta')
    .edge('google-shopping', 'upload-google-feed')
    .edge('meta-catalog', 'upload-meta-feed')
    .edge('upload-google-feed', 'send-notification')
    .edge('upload-meta-feed', 'send-notification')

    .build();
```

### Key Techniques

- **Variant Flattening**: Expand array to individual records
- **Feed Generation**: Specialized feed adapters
- **Multi-Format Output**: XML and CSV generation
- **FTP Upload**: Automated file transfer
- **Parallel Feeds**: Generate multiple feeds simultaneously

---

## 7. CDC-Based Data Warehouse Sync

Stream database changes to data warehouse for analytics.

### Scenario

- Monitor database for product changes
- Transform to analytics schema
- Stream to Snowflake/BigQuery
- Maintain slowly changing dimensions

### Pipeline

```typescript
const dataWarehouseSync = createPipeline()
    .name('CDC Data Warehouse Sync')
    .description('Stream Vendure data to warehouse via CDC')
    .version(1)

    .trigger('cdc', {
        type: 'MESSAGE',
        queueType: 'RABBITMQ',
        connectionCode: 'rabbitmq',
        queueName: 'vendure.cdc.product',
        consumerGroup: 'warehouse-sync',
        ackMode: 'MANUAL',
    })

    // Extract CDC message
    .extract('parse-cdc', {
        adapterCode: 'cdcExtractor',
        operation: 'ALL',  // INSERT, UPDATE, DELETE
    })

    // Transform to warehouse schema
    .transform('to-warehouse-schema', {
        operators: [
            // Dimension table fields
            { op: 'set', args: { path: 'product_key', value: '{{id}}' } },
            { op: 'set', args: { path: 'product_code', value: '{{slug}}' } },
            { op: 'set', args: { path: 'product_name', value: '{{name}}' } },
            { op: 'set', args: { path: 'created_date', value: '{{createdAt}}' } },
            { op: 'set', args: { path: 'modified_date', value: '{{updatedAt}}' } },
            { op: 'set', args: { path: 'is_active', value: '{{enabled}}' } },

            // SCD Type 2 fields
            { op: 'set', args: { path: 'effective_from', value: '{{_cdc.timestamp}}' } },
            { op: 'set', args: { path: 'effective_to', value: '9999-12-31' } },
            { op: 'set', args: { path: 'is_current', value: true } },
        ],
    })

    // Route by CDC operation
    .route('by-operation', {
        branches: [
            { name: 'insert', when: [{ field: '_cdc.operation', cmp: 'eq', value: 'INSERT' }] },
            { name: 'update', when: [{ field: '_cdc.operation', cmp: 'eq', value: 'UPDATE' }] },
            { name: 'delete', when: [{ field: '_cdc.operation', cmp: 'eq', value: 'DELETE' }] },
        ],
    })

    // Handle inserts - direct load
    .export('load-insert', {
        adapterCode: 'snowflake-export',
        connectionCode: 'snowflake',
        database: 'ANALYTICS',
        schema: 'DIM',
        table: 'PRODUCT',
        method: 'APPEND',
    })

    // Handle updates - SCD Type 2
    .transform('prepare-scd-update', {
        operators: [
            // Expire current record
            {
                op: 'sql',
                args: {
                    query: `
                        UPDATE ANALYTICS.DIM.PRODUCT
                        SET effective_to = CURRENT_TIMESTAMP(),
                            is_current = FALSE
                        WHERE product_key = :product_key
                          AND is_current = TRUE
                    `,
                },
            },
        ],
    })

    .export('load-update', {
        adapterCode: 'snowflake-export',
        connectionCode: 'snowflake',
        database: 'ANALYTICS',
        schema: 'DIM',
        table: 'PRODUCT',
        method: 'APPEND',  // Insert new version
    })

    // Handle deletes - soft delete
    .export('load-delete', {
        adapterCode: 'snowflake-export',
        connectionCode: 'snowflake',
        database: 'ANALYTICS',
        schema: 'DIM',
        table: 'PRODUCT',
        method: 'UPDATE',
        updateFields: {
            effective_to: '{{_cdc.timestamp}}',
            is_current: false,
            is_deleted: true,
        },
        matchField: 'product_key',
    })

    // Edges
    .edge('parse-cdc', 'to-warehouse-schema')
    .edge('to-warehouse-schema', 'by-operation')
    .edge('by-operation', 'load-insert', 'insert')
    .edge('by-operation', 'prepare-scd-update', 'update')
    .edge('by-operation', 'load-delete', 'delete')
    .edge('prepare-scd-update', 'load-update')

    .build();
```

### Key Techniques

- **CDC Trigger**: Stream database changes
- **Message Queue**: Reliable event delivery
- **SCD Type 2**: Historical dimension tracking
- **Conditional Routing**: Different logic per operation
- **Data Warehouse Export**: Snowflake/BigQuery integration

---

## 8. Error Recovery and Dead Letter Queue Processing

Handle and retry failed records from dead letter queue.

### Scenario

- Monitor dead letter queue
- Analyze failure patterns
- Apply fixes and retry
- Alert on persistent failures

### Pipeline

```typescript
const dlqRecovery = createPipeline()
    .name('Dead Letter Queue Recovery')
    .description('Process and retry failed records')
    .version(1)

    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/30 * * * *',  // Every 30 minutes
    })

    // Extract records from DLQ
    .extract('get-dlq-records', {
        adapterCode: 'deadLetterQueue',
        ageMinutes: 30,  // Records older than 30 minutes
        limit: 1000,
    })

    // Analyze failure reasons
    .transform('categorize-failures', {
        operators: [
            {
                op: 'switch',
                args: {
                    field: '_error.code',
                    cases: {
                        'VALIDATION_ERROR': { category: 'data-quality' },
                        'RATE_LIMIT': { category: 'rate-limit' },
                        'TIMEOUT': { category: 'timeout' },
                        'NOT_FOUND': { category: 'missing-data' },
                        'DUPLICATE': { category: 'duplicate' },
                    },
                    default: { category: 'unknown' },
                    target: 'failureCategory',
                },
            },
        ],
    })

    // Route by failure category
    .route('by-failure-type', {
        branches: [
            { name: 'fixable', when: [
                { field: 'failureCategory', cmp: 'in', value: ['data-quality', 'missing-data'] },
            ]},
            { name: 'retryable', when: [
                { field: 'failureCategory', cmp: 'in', value: ['rate-limit', 'timeout'] },
            ]},
            { name: 'permanent', when: [
                { field: 'failureCategory', cmp: 'in', value: ['duplicate'] },
            ]},
        ],
        defaultTo: 'unknown',
    })

    // Fix data quality issues
    .transform('fix-data-issues', {
        operators: [
            // Apply default values
            { op: 'default', args: { path: 'name', value: 'Unnamed Product' } },
            { op: 'default', args: { path: 'price', value: 0 } },
            // Clean invalid data
            { op: 'trim', args: { path: 'sku' } },
            { op: 'uppercase', args: { path: 'sku' } },
        ],
    })

    // Retry validation
    .validate('revalidate', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true } },
            { type: 'business', spec: { field: 'name', required: true } },
        ],
    })

    // Retry original operation
    .load('retry-load', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        matchField: 'sku',
    })

    // Remove from DLQ on success
    .transform('mark-resolved', {
        operators: [
            { op: 'set', args: { path: '_dlq.resolved', value: true } },
        ],
    })

    // Alert on permanent failures
    .export('alert-permanent-failures', {
        adapterCode: 'webhook',
        url: 'https://alerts.example.com/dlq-permanent-failure',
        method: 'POST',
    })

    // Log unknown failures
    .export('log-unknown-failures', {
        adapterCode: 'file-export',
        path: '/logs/dlq',
        filename: 'unknown-failures-{{date}}.json',
        format: 'JSON',
    })

    // Edges
    .edge('get-dlq-records', 'categorize-failures')
    .edge('categorize-failures', 'by-failure-type')
    .edge('by-failure-type', 'fix-data-issues', 'fixable')
    .edge('by-failure-type', 'retry-load', 'retryable')
    .edge('by-failure-type', 'alert-permanent-failures', 'permanent')
    .edge('by-failure-type', 'log-unknown-failures', 'unknown')
    .edge('fix-data-issues', 'revalidate')
    .edge('revalidate', 'retry-load')
    .edge('retry-load', 'mark-resolved')

    .hooks({
        PIPELINE_COMPLETED: [{
            type: 'LOG',
            level: 'INFO',
            message: 'DLQ recovery completed: {{stats.resolved}} resolved, {{stats.failed}} still failing',
        }],
    })

    .build();
```

### Key Techniques

- **DLQ Extraction**: Read failed records
- **Failure Analysis**: Categorize errors
- **Automated Fixes**: Apply corrections
- **Selective Retry**: Only retry fixable issues
- **Alerting**: Notify on persistent failures

---

## 9. Multi-Stage Approval Workflow

Complex approval workflow with multiple gates and escalation.

### Scenario

- Import high-value products
- Route through approval stages
- Escalate on timeout
- Track approval history

### Pipeline

```typescript
const approvalWorkflow = createPipeline()
    .name('Multi-Stage Product Approval')
    .description('Tiered approval for new products')
    .version(1)

    .trigger('manual', { type: 'MANUAL' })

    // Extract products from import file
    .extract('parse-csv', {
        adapterCode: 'file',
        path: '/imports/new-products.csv',
        format: 'CSV',
        hasHeader: true,
    })

    // Validate data
    .validate('check-data', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'sku', required: true, pattern: '^[A-Z0-9-]+$' } },
            { type: 'business', spec: { field: 'name', required: true } },
            { type: 'business', spec: { field: 'price', required: true, min: 0 } },
            { type: 'business', spec: { field: 'category', required: true } },
        ],
    })

    // Route by value
    .route('by-value', {
        branches: [
            {
                name: 'low-value',
                when: [{ field: 'price', cmp: 'lt', value: 5000 }],  // < $50
            },
            {
                name: 'medium-value',
                when: [
                    { field: 'price', cmp: 'gte', value: 5000 },
                    { field: 'price', cmp: 'lt', value: 50000 },  // $50-$500
                ],
            },
            {
                name: 'high-value',
                when: [{ field: 'price', cmp: 'gte', value: 50000 }],  // >= $500
            },
        ],
    })

    // Low-value: Auto-approve
    .load('auto-approve-low', {
        adapterCode: 'productUpsert',
        strategy: 'CREATE',
    })

    // Medium-value: Single approval
    .gate('manager-approval', {
        approvalType: 'MANUAL',
        notifyEmail: 'product-manager@example.com',
        timeoutSeconds: 86400,  // 24 hours
    })

    .load('create-medium', {
        adapterCode: 'productUpsert',
        strategy: 'CREATE',
    })

    // High-value: Multi-stage approval
    .gate('buyer-approval', {
        approvalType: 'MANUAL',
        notifyEmail: 'buyer@example.com',
        timeoutSeconds: 43200,  // 12 hours
    })

    .gate('director-approval', {
        approvalType: 'THRESHOLD',
        errorThresholdPercent: 0,  // No errors allowed
        timeoutSeconds: 86400,      // 24 hours
        notifyEmail: 'director@example.com',
    })

    .load('create-high', {
        adapterCode: 'productUpsert',
        strategy: 'CREATE',
    })

    // Track approval history
    .export('log-approval', {
        adapterCode: 'database-export',
        connectionCode: 'audit-db',
        table: 'product_approvals',
        fields: {
            sku: 'sku',
            name: 'name',
            price: 'price',
            approval_level: '{{_approvalLevel}}',
            approved_by: '{{_approvedBy}}',
            approved_at: '{{_approvedAt}}',
        },
    })

    // Edges
    .edge('parse-csv', 'check-data')
    .edge('check-data', 'by-value')
    .edge('by-value', 'auto-approve-low', 'low-value')
    .edge('by-value', 'manager-approval', 'medium-value')
    .edge('by-value', 'buyer-approval', 'high-value')
    .edge('manager-approval', 'create-medium')
    .edge('buyer-approval', 'director-approval')
    .edge('director-approval', 'create-high')
    .edge('auto-approve-low', 'log-approval')
    .edge('create-medium', 'log-approval')
    .edge('create-high', 'log-approval')

    .hooks({
        GATE_TIMEOUT: [{
            type: 'WEBHOOK',
            url: 'https://alerts.example.com/approval-timeout',
        }],
    })

    .build();
```

### Key Techniques

- **Multi-Stage Gates**: Sequential approval steps
- **Value-Based Routing**: Different flows by value
- **Timeout Handling**: Auto-escalation
- **Audit Trail**: Log all approvals
- **Threshold Gates**: Auto-approve on quality

---

## 10. Event-Driven Catalog Updates

React to Vendure events and update external systems.

### Scenario

- Listen for Vendure product events
- Update search index
- Sync to PIM
- Invalidate CDN cache
- Update recommendation engine

### Pipeline

```typescript
const eventDrivenSync = createPipeline()
    .name('Event-Driven Catalog Sync')
    .description('React to product changes and sync external systems')
    .version(1)

    .trigger('event', {
        type: 'EVENT',
        event: 'ProductEvent',
        filter: {
            type: 'updated',
        },
    })

    // Extract product details
    .extract('get-product', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,assets,facetValues',
    })

    // Transform for search index
    .transform('to-search-doc', {
        operators: [
            { op: 'pick', args: { fields: ['id', 'name', 'slug', 'description'] } },
            {
                op: 'map',
                args: {
                    searchableText: '${name} ${description}',
                    tags: { _forEach: 'facetValues', _map: 'name' },
                },
            },
        ],
    })

    // Update MeiliSearch
    .sink('update-search', {
        adapterCode: 'meilisearch',
        indexName: 'products',
        host: 'localhost',
        port: 7700,
        idField: 'id',
    })

    // Transform for PIM
    .transform('to-pim-format', {
        operators: [
            {
                op: 'map',
                args: {
                    product_code: 'slug',
                    product_name: 'name',
                    long_description: 'description',
                    images: { _forEach: 'assets', _map: 'source' },
                },
            },
        ],
    })

    // Sync to PIM
    .export('sync-to-pim', {
        adapterCode: 'api-export',
        connectionCode: 'pim-api',
        url: '/products/${slug}',
        method: 'PUT',
    })

    // Invalidate CDN cache
    .export('purge-cdn', {
        adapterCode: 'webhook',
        url: 'https://cdn.example.com/purge',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            urls: [
                'https://shop.example.com/products/${slug}',
                'https://shop.example.com/api/products/${slug}',
            ],
        }),
    })

    // Update recommendation engine
    .export('update-recommendations', {
        adapterCode: 'api-export',
        url: 'https://recommendations.example.com/products/${id}',
        method: 'PUT',
        apiKeySecretCode: 'recommendations-api-key',
    })

    // Edges
    .edge('get-product', 'to-search-doc')
    .edge('to-search-doc', 'update-search')
    .edge('get-product', 'to-pim-format')
    .edge('to-pim-format', 'sync-to-pim')
    .edge('get-product', 'purge-cdn')
    .edge('get-product', 'update-recommendations')

    .build();
```

### Key Techniques

- **Event Trigger**: React to Vendure events
- **Parallel Sync**: Update multiple systems simultaneously
- **Transformation**: Different formats for different systems
- **Cache Invalidation**: CDN purge
- **Fan-Out Pattern**: Single source, multiple destinations

---

## Common Patterns Summary

| Pattern | Use Case | Key Steps |
|---------|----------|-----------|
| **Multi-Source Aggregation** | Combine data from multiple APIs | Parallel extract → Transform → Merge → Load |
| **Incremental Sync** | Only process changed records | Incremental extract → Transform → Load |
| **Enrichment** | Add external data to records | Extract → HTTP Lookup → Transform → Load |
| **Real-Time Processing** | Webhook-triggered workflows | Webhook trigger → Validate → Transform → Export |
| **Multi-Channel** | Different logic per channel | Fan-out → Route → Channel-specific transform → Load |
| **Feed Generation** | E-commerce platform feeds | Extract → Transform → Feed adapter → Upload |
| **CDC Streaming** | Stream database changes | CDC trigger → Transform → Data warehouse export |
| **Error Recovery** | Retry failed records | DLQ extract → Analyze → Fix → Retry |
| **Approval Workflow** | Human-in-the-loop | Gates → Routes → Conditional approval |
| **Event-Driven** | React to system events | Event trigger → Extract → Parallel sync |

## See Also

- [Pipeline Builder Guide](../developer-guide/dsl/pipeline-builder.md) - DSL API reference
- [Operators Reference](../developer-guide/dsl/operators.md) - All operators
- [Templates Guide](./templates.md) - Pre-built pipeline templates
- [Performance Tuning](../deployment/performance.md) - Optimization techniques
