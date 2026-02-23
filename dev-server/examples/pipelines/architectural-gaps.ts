/**
 * Architectural Gap Pipelines - Examples covering 7 missing capabilities
 *
 * These pipelines demonstrate:
 * 1. Multi-source join (multiJoin operator)
 * 2. Parallel execution (concurrent steps)
 * 3. Per-record retry with exponential backoff
 * 4. GATE approval workflow
 * 5. CDC (Change Data Capture) extraction
 * 6. GraphQL mutation loading
 * 7. File transformation (image + PDF operators)
 */

import { createPipeline } from '../../../src';
import { ConnectionAuthType } from '../../../src';

// =============================================================================
// 1. MULTI-SOURCE JOIN - Join prices to products by productId
// =============================================================================

/**
 * Demonstrates the multiJoin operator to merge data from two extract steps.
 * Products are extracted from the Vendure catalog, prices from an external
 * pricing API, then joined on productId before loading.
 */
export const joinDemoPipeline = createPipeline()
    .name('Multi-Source Join Demo')
    .description('Join external price data to products using multiJoin operator')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('extract-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants',
        batchSize: 200,
    })
    .extract('extract-prices', {
        adapterCode: 'httpApi',
        url: 'https://pricing.example.com/api/v1/prices',
        method: 'GET',
        headers: { Accept: 'application/json' },
        bearerTokenSecretCode: 'demo-api-key',
        itemsField: 'data.prices',
    })
    .transform('join-prices', {
        operators: [
            {
                op: 'multiJoin',
                args: {
                    leftKey: 'id',
                    rightKey: 'productId',
                    rightDataPath: 'extract-prices',
                    type: 'LEFT',
                    prefix: 'ext_',
                    select: ['wholesale', 'retail', 'currency'],
                },
            },
            { op: 'coalesce', args: { paths: ['ext_retail', 'price'], target: 'finalPrice' } },
            { op: 'toNumber', args: { source: 'finalPrice' } },
            { op: 'toCents', args: { source: 'finalPrice', target: 'priceInCents' } },
        ],
    })
    .load('save-products', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        nameField: 'name',
        slugField: 'slug',
    })
    .edge('start', 'extract-products')
    .edge('start', 'extract-prices')
    .edge('extract-products', 'join-prices')
    .edge('extract-prices', 'join-prices')
    .edge('join-prices', 'save-products')
    .build();

// =============================================================================
// 2. PARALLEL EXECUTION - Concurrent transform branches
// =============================================================================

/**
 * Demonstrates parallel execution with maxConcurrentSteps and CONTINUE error policy.
 * A single extraction fans out into parallel transform branches that run concurrently.
 */
export const parallelDemoPipeline = createPipeline()
    .name('Parallel Execution Demo')
    .description('Parallel transform branches with concurrent step limit')
    .capabilities({ requires: ['UpdateCatalog'] })
    .parallel({ maxConcurrentSteps: 3, errorPolicy: 'CONTINUE' })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-catalog', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset',
        batchSize: 100,
    })
    .transform('normalize-names', {
        operators: [
            { op: 'trim', args: { path: 'name' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'uppercase', args: { path: 'sku' } },
        ],
    })
    .transform('compute-prices', {
        operators: [
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'math', args: { operation: 'multiply', source: 'price', target: 'priceWithTax', operand: '1.19' } },
            { op: 'round', args: { source: 'priceWithTax', decimals: 2 } },
            { op: 'toCents', args: { source: 'priceWithTax', target: 'priceWithTaxCents' } },
        ],
    })
    .transform('add-metadata', {
        operators: [
            { op: 'now', args: { target: 'processedAt' } },
            { op: 'set', args: { path: 'source', value: 'vendure-parallel' } },
            { op: 'hash', args: { source: ['sku', 'name'], target: 'contentHash', algorithm: 'sha256' } },
        ],
    })
    .load('export-results', {
        adapterCode: 'restPost',
        endpoint: 'https://webhook.example.com/parallel-results',
        method: 'POST',
        batchMode: 'array',
        maxBatchSize: 50,
    })
    .edge('start', 'fetch-catalog')
    .edge('fetch-catalog', 'normalize-names')
    .edge('fetch-catalog', 'compute-prices')
    .edge('fetch-catalog', 'add-metadata')
    .edge('normalize-names', 'export-results')
    .edge('compute-prices', 'export-results')
    .edge('add-metadata', 'export-results')
    .build();

// =============================================================================
// 3. PER-RECORD RETRY - Exponential backoff on transform failures
// =============================================================================

/**
 * Demonstrates per-record retry with exponential backoff.
 * Useful when transforms include HTTP lookups that may transiently fail.
 */
export const retryDemoPipeline = createPipeline()
    .name('Per-Record Retry Demo')
    .description('Transform with per-record retry and exponential backoff')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-skus', {
        adapterCode: 'csv',
        rows: [
            { sku: 'RETRY-001', name: 'Widget Alpha', price: '29.99' },
            { sku: 'RETRY-002', name: 'Widget Beta', price: '49.99' },
            { sku: 'RETRY-003', name: 'Widget Gamma', price: '79.99' },
        ],
    })
    .transform('enrich-with-retry', {
        retryPerRecord: {
            maxRetries: 3,
            retryDelayMs: 200,
            backoff: 'EXPONENTIAL',
        },
        operators: [
            { op: 'toNumber', args: { source: 'price' } },
            {
                op: 'httpLookup',
                args: {
                    url: 'https://inventory.example.com/api/stock/{{sku}}',
                    target: 'stockLevel',
                    responsePath: 'data.quantity',
                    default: 0,
                    timeoutMs: 3000,
                    maxRetries: 2,
                },
            },
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'stockLevel', cmp: 'gt', value: 0 },
                    thenValue: 'IN_STOCK',
                    elseValue: 'OUT_OF_STOCK',
                    target: 'availability',
                },
            },
            { op: 'toCents', args: { source: 'price', target: 'priceInCents' } },
        ],
    })
    .load('upsert-products', {
        adapterCode: 'variantUpsert',
        channel: '__default_channel__',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
        priceField: 'priceInCents',
    })
    .edge('start', 'fetch-skus')
    .edge('fetch-skus', 'enrich-with-retry')
    .edge('enrich-with-retry', 'upsert-products')
    .build();

// =============================================================================
// 4. GATE APPROVAL WORKFLOW - Manual approval before loading
// =============================================================================

/**
 * Demonstrates a GATE step requiring manual approval before data is loaded.
 * Data is extracted and validated, then paused at the gate for human review.
 * A webhook is notified when the gate is reached, and 5 preview records are shown.
 */
export const gateDemoPipeline = createPipeline()
    .name('Gate Approval Workflow Demo')
    .description('Manual approval gate between validation and loading')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-import-data', {
        adapterCode: 'inMemory',
        data: [
            { sku: 'GATE-001', name: 'Supplier Widget A', description: 'Imported widget from supplier', price: 29.99 },
            { sku: 'GATE-002', name: 'Supplier Widget B', description: 'Premium widget from supplier', price: 49.99 },
            { sku: 'GATE-003', name: 'Supplier Gadget C', description: 'New gadget pending approval', price: 99.99 },
        ],
    })
    .transform('prepare', {
        operators: [
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'toCents', args: { source: 'price', target: 'priceInCents' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            { op: 'set', args: { path: 'enabled', value: true } },
        ],
    })
    .gate('approval-gate', {
        approvalType: 'MANUAL',
        previewCount: 5,
    })
    .load('import-approved', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
    })
    .edge('start', 'fetch-import-data')
    .edge('fetch-import-data', 'prepare')
    .edge('prepare', 'approval-gate')
    .edge('approval-gate', 'import-approved')
    .build();

// =============================================================================
// 5. CDC EXTRACTION - Change Data Capture from PostgreSQL
// =============================================================================

/**
 * Demonstrates CDC (Change Data Capture) extraction from a PostgreSQL table.
 * Polls the products table using the updated_at timestamp column to detect changes.
 * Scheduled to run every 5 minutes for near-real-time sync.
 */
export const cdcDemoPipeline = createPipeline()
    .name('CDC Extraction Demo')
    .description('Change Data Capture from PostgreSQL products table')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', {
        type: 'SCHEDULE',
        cron: '*/5 * * * *',
        timezone: 'UTC',
    })
    .extract('poll-changes', {
        adapterCode: 'cdc',
        connectionCode: 'demo-postgres',
        databaseType: 'POSTGRESQL',
        table: 'products',
        primaryKey: 'id',
        trackingColumn: 'updated_at',
        trackingType: 'TIMESTAMP',
        columns: ['id', 'sku', 'name', 'description', 'price', 'updated_at'],
        includeDeletes: true,
        deleteColumn: 'deleted_at',
        batchSize: 500,
    })
    .transform('prepare-records', {
        operators: [
            { op: 'trim', args: { path: 'name' } },
            { op: 'trim', args: { path: 'sku' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'toCents', args: { source: 'price', target: 'priceInCents' } },
            { op: 'slugify', args: { source: 'name', target: 'slug' } },
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'deleted_at', cmp: 'exists', value: true },
                    thenValue: false,
                    elseValue: true,
                    target: 'enabled',
                },
            },
            { op: 'now', args: { target: 'syncedAt', format: 'ISO', timezone: 'UTC' } },
        ],
    })
    .load('sync-to-vendure', {
        adapterCode: 'productUpsert',
        channel: '__default_channel__',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        skuField: 'sku',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
    })
    .edge('start', 'poll-changes')
    .edge('poll-changes', 'prepare-records')
    .edge('prepare-records', 'sync-to-vendure')
    .build();

// =============================================================================
// 6. GRAPHQL MUTATION LOADING - Send data via GraphQL mutations
// =============================================================================

/**
 * Demonstrates loading records into an external system via GraphQL mutations.
 * Products are extracted from Vendure, transformed, and sent as individual
 * GraphQL mutations with variable mapping and bearer auth.
 */
export const graphqlMutationDemoPipeline = createPipeline()
    .name('GraphQL Mutation Loading Demo')
    .description('Load product data into external system via GraphQL mutations')
    .capabilities({ requires: ['ReadCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'variants,featuredAsset',
        batchSize: 50,
    })
    .transform('prepare-for-graphql', {
        operators: [
            { op: 'flatten', args: { source: 'variants' } },
            { op: 'pick', args: { fields: ['name', 'slug', 'sku', 'price', 'description', 'featuredAsset.preview'] } },
            { op: 'rename', args: { from: 'featuredAsset.preview', to: 'imageUrl' } },
            { op: 'toNumber', args: { source: 'price' } },
            { op: 'math', args: { operation: 'divide', source: 'price', target: 'priceDecimal', operand: '100' } },
            { op: 'round', args: { source: 'priceDecimal', decimals: 2 } },
            { op: 'set', args: { path: 'source', value: 'vendure' } },
        ],
    })
    .load('graphql-push', {
        adapterCode: 'graphqlMutation',
        endpoint: 'https://external-cms.example.com/graphql',
        mutation: `mutation UpsertProduct($input: ProductInput!) {
            upsertProduct(input: $input) {
                id
                sku
                status
            }
        }`,
        variableMapping: {
            'input.name': 'name',
            'input.slug': 'slug',
            'input.sku': 'sku',
            'input.price': 'priceDecimal',
            'input.description': 'description',
            'input.imageUrl': 'imageUrl',
            'input.source': 'source',
        },
        auth: ConnectionAuthType.BEARER,
        bearerTokenSecretCode: 'demo-api-key',
        batchMode: 'single',
        retries: 3,
        retryDelayMs: 1000,
        timeoutMs: 10000,
    })
    .edge('start', 'query-products')
    .edge('query-products', 'prepare-for-graphql')
    .edge('prepare-for-graphql', 'graphql-push')
    .build();

// =============================================================================
// 7. FILE TRANSFORMATION - Image resize, convert, and PDF generation
// =============================================================================

/**
 * Demonstrates file transformation operators: imageResize, imageConvert, and pdfGenerate.
 * Product images are resized for thumbnails, converted to WebP, and a product sheet PDF
 * is generated from each record.
 */
export const fileTransformDemoPipeline = createPipeline()
    .name('File Transformation Demo')
    .description('Image resize, format conversion, and PDF generation')
    .capabilities({ requires: ['UpdateCatalog'] })
    .trigger('start', { type: 'MANUAL' })
    .extract('fetch-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'featuredAsset,variants',
        batchSize: 20,
    })
    .transform('process-images', {
        operators: [
            { op: 'copy', args: { source: 'featuredAsset.preview', target: 'originalImage' } },
            {
                op: 'imageResize',
                args: {
                    sourceField: 'originalImage',
                    targetField: 'thumbnail',
                    width: 200,
                    height: 200,
                    fit: 'cover',
                    format: 'webp',
                    quality: 80,
                },
            },
            {
                op: 'imageResize',
                args: {
                    sourceField: 'originalImage',
                    targetField: 'heroImage',
                    width: 1200,
                    height: 800,
                    fit: 'contain',
                    format: 'jpeg',
                    quality: 90,
                },
            },
            {
                op: 'imageConvert',
                args: {
                    sourceField: 'originalImage',
                    targetField: 'webpImage',
                    format: 'webp',
                    quality: 85,
                },
            },
        ],
    })
    .transform('generate-pdf', {
        operators: [
            { op: 'template', args: { template: '${name} - $${price}', target: 'priceLabel' } },
            {
                op: 'pdfGenerate',
                args: {
                    template: [
                        '<html><body>',
                        '<h1>{{name}}</h1>',
                        '<p>SKU: {{sku}}</p>',
                        '<p>Price: {{priceLabel}}</p>',
                        '<p>{{description}}</p>',
                        '<img src="{{originalImage}}" style="max-width:400px" />',
                        '</body></html>',
                    ].join(''),
                    targetField: 'productSheet',
                    pageSize: 'A4',
                    orientation: 'PORTRAIT',
                },
            },
        ],
    })
    .load('save-assets', {
        adapterCode: 'restPost',
        endpoint: 'https://cdn.example.com/api/assets/upload',
        method: 'POST',
        headers: { 'X-API-Key': '{{secret:demo-api-key}}' },
        batchMode: 'single',
        retries: 2,
        timeoutMs: 30000,
    })
    .edge('start', 'fetch-products')
    .edge('fetch-products', 'process-images')
    .edge('process-images', 'generate-pdf')
    .edge('generate-pdf', 'save-assets')
    .build();
