# Search Sinks Reference

Complete reference for all search engine integrations.

## Overview

Search sinks index Vendure data into external search engines for enhanced search functionality.

---

## MeiliSearch

Code: `meilisearch`

Index records to MeiliSearch for fast, typo-tolerant search.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Host URL (e.g., http://localhost:7700) |
| `apiKeySecretCode` | string | Yes | Secret code for API key |
| `indexName` | string | Yes | Target index name |
| `primaryKey` | string | Yes | Primary key field name |
| `batchSize` | number | No | Records per batch |
| `searchableFields` | json | No | Array of searchable field names |
| `filterableFields` | json | No | Array of filterable field names |
| `sortableFields` | json | No | Array of sortable field names |

### Example

```typescript
.sink('meilisearch-products', {
    adapterCode: 'meilisearch',
    host: 'http://localhost:7700',
    apiKeySecretCode: 'meilisearch-api-key',
    indexName: 'products',
    primaryKey: 'id',
    batchSize: 500,
    searchableFields: ['name', 'description', 'sku'],
    filterableFields: ['categoryId', 'price', 'inStock'],
    sortableFields: ['price', 'name', 'createdAt'],
})
```

### Index Settings

The sink automatically configures index settings:

```typescript
{
    searchableFields: ['name', 'description'],  // Fields for full-text search
    filterableFields: ['categoryId', 'price'],  // Fields for filtering
    sortableFields: ['price', 'createdAt'],     // Fields for sorting
}
```

### Authentication

Store API key as a secret:

```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'meilisearch-api-key',
            provider: 'env',
            envVar: 'MEILISEARCH_API_KEY',
        },
    ],
})
```

---

## Elasticsearch

Code: `elasticsearch`

Index records to Elasticsearch or OpenSearch.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `node` | string | Yes | Node URL (e.g., http://localhost:9200) |
| `apiKeySecretCode` | string | No | Secret code for API key auth |
| `usernameSecretCode` | string | No | Secret code for username (Basic auth) |
| `passwordSecretCode` | string | No | Secret code for password (Basic auth) |
| `indexName` | string | Yes | Target index name |
| `idField` | string | Yes | Document ID field |
| `batchSize` | number | No | Records per batch |
| `refresh` | boolean | No | Refresh index after indexing |

### Example - API Key Auth

```typescript
.sink('elasticsearch-products', {
    adapterCode: 'elasticsearch',
    node: 'https://elasticsearch.example.com:9200',
    apiKeySecretCode: 'elasticsearch-api-key',
    indexName: 'products',
    idField: 'id',
    batchSize: 1000,
    refresh: true,
})
```

### Example - Basic Auth

```typescript
.sink('elasticsearch-products', {
    adapterCode: 'elasticsearch',
    node: 'http://localhost:9200',
    usernameSecretCode: 'es-username',
    passwordSecretCode: 'es-password',
    indexName: 'products',
    idField: 'id',
})
```

### Index Mapping

Elasticsearch creates dynamic mappings. For production, create index mappings beforehand:

```json
{
    "mappings": {
        "properties": {
            "id": { "type": "keyword" },
            "name": { "type": "text" },
            "sku": { "type": "keyword" },
            "price": { "type": "integer" },
            "description": { "type": "text" },
            "categories": { "type": "keyword" }
        }
    }
}
```

### OpenSearch Compatibility

Works with Amazon OpenSearch Service using the same configuration.

---

## Algolia

Code: `algolia`

Index records to Algolia search service.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `appId` | string | Yes | Algolia Application ID |
| `apiKeySecretCode` | string | Yes | Secret code for Admin API key |
| `indexName` | string | Yes | Target index name |
| `objectIdField` | string | Yes | Field for object ID |
| `batchSize` | number | No | Records per batch |

### Example

```typescript
.sink('algolia-products', {
    adapterCode: 'algolia',
    appId: 'YOUR_APP_ID',
    apiKeySecretCode: 'algolia-admin-key',
    indexName: 'products',
    objectIdField: 'objectID',
    batchSize: 1000,
})
```

### Object ID

Algolia requires a unique `objectID` field. Map your ID field:

```typescript
.transform('prepare-algolia', {
    operators: [
        { op: 'copy', args: { source: 'id', target: 'objectID' } },
    ],
})
.sink('algolia-products', {
    adapterCode: 'algolia',
    objectIdField: 'objectID',
    // ...
})
```

### Secrets Configuration

```typescript
DataHubPlugin.init({
    secrets: [
        {
            code: 'algolia-admin-key',
            provider: 'env',
            envVar: 'ALGOLIA_ADMIN_KEY',
        },
    ],
})
```

---

## Typesense

Code: `typesense`

Index records to Typesense search engine.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Typesense host |
| `port` | number | Yes | Typesense port |
| `protocol` | select | No | http or https |
| `apiKeySecretCode` | string | Yes | Secret code for API key |
| `collectionName` | string | Yes | Target collection name |
| `batchSize` | number | No | Records per batch |

### Example

```typescript
.sink('typesense-products', {
    adapterCode: 'typesense',
    host: 'localhost',
    port: 8108,
    protocol: 'http',
    apiKeySecretCode: 'typesense-api-key',
    collectionName: 'products',
    batchSize: 250,
})
```

### Collection Schema

Create collection with schema before indexing:

```json
{
    "name": "products",
    "fields": [
        { "name": "id", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "description", "type": "string" },
        { "name": "price", "type": "int32" },
        { "name": "categories", "type": "string[]" }
    ],
    "default_sorting_field": "price"
}
```

---

## Common Patterns

### Full Product Sync

```typescript
createPipeline()
    .name('sync-to-search')
    .trigger('schedule', {
        type: 'schedule',
        cron: '0 */4 * * *',  // Every 4 hours
    })
    .extract('query-products', {
        adapterCode: 'vendure-query',
        entity: 'Product',
        relations: 'variants,featuredAsset,collections,facetValues,facetValues.facet,translations',
        languageCode: 'en',
        batchSize: 500,
    })
    .transform('prepare-search', {
        operators: [
            { op: 'template', args: { template: '/products/${slug}', target: 'url' } },
            { op: 'copy', args: { source: 'featuredAsset.preview', target: 'image' } },
            { op: 'copy', args: { source: 'variants.0.price', target: 'minPrice' } },
        ],
    })
    .sink('meilisearch-products', {
        adapterCode: 'meilisearch',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-key',
        indexName: 'products',
        primaryKey: 'id',
    })
```

### Real-time Updates

```typescript
createPipeline()
    .name('product-updated-sync')
    .trigger('vendure-event', {
        type: 'event',
        event: 'ProductEvent',
    })
    .extract('get-product', {
        adapterCode: 'vendure-query',
        entity: 'Product',
        relations: 'variants,featuredAsset',
        batchSize: 1,
    })
    .sink('elasticsearch', {
        adapterCode: 'elasticsearch',
        node: 'http://localhost:9200',
        indexName: 'products',
        idField: 'id',
    })
```

### Multi-Engine Sync

```typescript
createPipeline()
    .name('multi-search-sync')
    .extract('query-products', { /* ... */ })
    .transform('prepare', { operators: [ /* ... */ ] })
    // Primary search
    .sink('meilisearch', {
        adapterCode: 'meilisearch',
        indexName: 'products',
        // ...
    })
    // Analytics search
    .sink('elasticsearch', {
        adapterCode: 'elasticsearch',
        indexName: 'products-analytics',
        // ...
    })
```

---

## Performance Tuning

### Batch Size

Adjust batch size based on:
- Record size (larger records = smaller batches)
- Network latency
- Search engine capacity

```typescript
{
    batchSize: 500,  // Start here, adjust based on performance
}
```

### Concurrency

For large datasets, use multiple workers:

```typescript
DataHubPlugin.init({
    jobQueueOptions: {
        concurrency: 4,
    },
})
```

### Refresh Strategy

For Elasticsearch, control index refresh:

```typescript
{
    refresh: false,  // Faster, but documents not immediately searchable
}
```

Run manual refresh after bulk indexing.
