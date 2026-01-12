# Extractors Reference

Complete reference for all data extractors.

## REST API Extractor

Code: `rest`

Fetch data from REST APIs with automatic pagination.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | API endpoint URL |
| `method` | string | Yes | HTTP method (GET, POST) |
| `headers` | object | No | Request headers (JSON) |
| `query` | object | No | Query parameters (JSON) |
| `body` | object | No | Request body for POST (JSON) |
| `connectionCode` | string | No | Connection code to merge headers from |
| `itemsField` | string | No | Dot path to items array in response |
| `pageParam` | string | No | Pagination parameter name |
| `nextPageField` | string | No | Dot path to next page indicator |
| `maxPages` | number | No | Maximum pages to fetch (safety limit) |
| `mapFields` | object | No | JSON object of dst to src dot-paths to transform items |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token auth |
| `basicSecretCode` | string | No | Secret code for Basic auth (user:pass) |
| `hmacSecretCode` | string | No | Secret code for HMAC signature |

### Example

```typescript
.extract('fetch-products', {
    adapterCode: 'rest',
    endpoint: 'https://api.example.com/products',
    method: 'GET',
    headers: {
        'Accept': 'application/json',
    },
    query: {
        limit: 100,
        status: 'active',
    },
    itemsField: 'data.products',
    pageParam: 'page',
    nextPageField: 'meta.hasNextPage',
    maxPages: 50,
    bearerTokenSecretCode: 'api-key',
})
```

### Pagination Modes

**Offset-based:**
```typescript
{
    pageParam: 'page',      // ?page=1, ?page=2, ...
    itemsField: 'items',
}
```

**Cursor-based:**
```typescript
{
    pageParam: 'cursor',
    nextPageField: 'meta.nextCursor',
}
```

---

## CSV Extractor

Code: `csv`

Parse CSV files or inline data.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fileId` | string | No | ID of uploaded file (from /data-hub/upload endpoint) |
| `csvText` | string | No | Raw CSV string (with header row) |
| `csvPath` | string | No | Path to CSV file on filesystem (dev/testing) |
| `rows` | array | No | Array of arrays or objects directly |
| `delimiter` | string | No | Field delimiter character. Default: `,` |
| `hasHeader` | boolean | No | Whether first row is header. Default: `true` |

Note: Provide one of `fileId`, `csvText`, `csvPath`, or `rows`. For production, use `fileId` with the upload endpoint.

### Example - CSV File

```typescript
.extract('parse-csv', {
    adapterCode: 'csv',
    csvPath: '/uploads/products.csv',
    delimiter: ',',
    hasHeader: true,
})
```

### Example - Inline Data

```typescript
.extract('static-data', {
    adapterCode: 'csv',
    rows: [
        { sku: 'ABC', name: 'Product 1' },
        { sku: 'DEF', name: 'Product 2' },
    ],
})
```

### Example - CSV Text

```typescript
.extract('inline-csv', {
    adapterCode: 'csv',
    csvText: `sku,name,price
ABC,Product 1,1999
DEF,Product 2,2999`,
    delimiter: ',',
    hasHeader: true,
})
```

---

## GraphQL Extractor

Code: `graphql`

Query external GraphQL endpoints with cursor pagination support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | GraphQL endpoint URL |
| `query` | string | Yes | GraphQL query |
| `headers` | object | No | Request headers (JSON) |
| `variables` | object | No | Query variables (JSON) |
| `itemsField` | string | No | Dot path to items in response |
| `edgesField` | string | No | Dot path to edges array (for Relay-style pagination) |
| `nodeField` | string | No | Node field name within edges. Default: `node` |
| `cursorVar` | string | No | Variable name for cursor. Default: `cursor` |
| `nextCursorField` | string | No | Dot path to next cursor |
| `pageInfoField` | string | No | Dot path to pageInfo object |
| `hasNextPageField` | string | No | Dot path to hasNextPage boolean |
| `endCursorField` | string | No | Dot path to endCursor |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token auth |
| `basicSecretCode` | string | No | Secret code for Basic auth |
| `hmacSecretCode` | string | No | Secret code for HMAC signature |

### Example - Basic Query

```typescript
.extract('query-graphql', {
    adapterCode: 'graphql',
    endpoint: 'https://api.example.com/graphql',
    query: `
        query GetProducts($limit: Int) {
            products(limit: $limit) {
                id
                name
                price
            }
        }
    `,
    variables: { limit: 100 },
    itemsField: 'data.products',
})
```

### Example - Relay-style Pagination

```typescript
.extract('query-with-cursor', {
    adapterCode: 'graphql',
    endpoint: 'https://api.example.com/graphql',
    query: `
        query GetProducts($cursor: String) {
            products(first: 100, after: $cursor) {
                edges {
                    node {
                        id
                        name
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `,
    edgesField: 'data.products.edges',
    pageInfoField: 'data.products.pageInfo',
    hasNextPageField: 'data.products.pageInfo.hasNextPage',
    endCursorField: 'data.products.pageInfo.endCursor',
    cursorVar: 'cursor',
})
```

---

## Vendure Query Extractor

Code: `vendure-query`

Extract data directly from Vendure entities with automatic pagination and translation support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity` | string | Yes | Entity type to query |
| `relations` | string | No | Comma-separated relations to include |
| `languageCode` | string | No | Language code for translations (e.g., `en`, `de`) |
| `flattenTranslations` | boolean | No | Merge translation fields to root level |
| `batchSize` | number | No | Number of records per batch |
| `sortBy` | string | No | Field to sort by |
| `sortOrder` | string | No | Sort order: `ASC` or `DESC` |

### Supported Entity Types

- `Product` - Products
- `ProductVariant` - Product Variants
- `Customer` - Customers
- `Order` - Orders
- `Collection` - Collections
- `Facet` - Facets
- `FacetValue` - Facet Values
- `Promotion` - Promotions
- `Asset` - Assets

### Example - Products with Relations

```typescript
.extract('query-products', {
    adapterCode: 'vendure-query',
    entity: 'Product',
    relations: 'variants,featuredAsset,translations',
    languageCode: 'en',
    flattenTranslations: true,
    batchSize: 500,
    sortBy: 'updatedAt',
    sortOrder: 'DESC',
})
```

### Example - Customers

```typescript
.extract('query-customers', {
    adapterCode: 'vendure-query',
    entity: 'Customer',
    relations: 'addresses',
    batchSize: 1000,
})
```

### Example - Orders

```typescript
.extract('query-orders', {
    adapterCode: 'vendure-query',
    entity: 'Order',
    relations: 'lines,customer',
    sortBy: 'orderPlacedAt',
    sortOrder: 'DESC',
})
```

---

## JSON Extractor

Code: `json`

Parse JSON files or inline JSON data.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fileId` | string | No | ID of uploaded file (from /data-hub/upload endpoint) |
| `jsonText` | string | No | Raw JSON string |
| `jsonPath` | string | No | Path to JSON file (dev/testing) |
| `itemsPath` | string | No | Dot path to items array in JSON (e.g., "data.items") |

Note: Provide one of `fileId`, `jsonText`, or `jsonPath`. For production, use `fileId` with the upload endpoint.

### Example - JSON File

```typescript
.extract('parse-json', {
    adapterCode: 'json',
    jsonPath: '/uploads/products.json',
    itemsField: 'data.products',
})
```

### Example - Inline Data

```typescript
.extract('static-data', {
    adapterCode: 'json',
    rows: [
        { sku: 'ABC', name: 'Product 1', price: 1999 },
        { sku: 'DEF', name: 'Product 2', price: 2999 },
    ],
})
```

---

## Generator Extractor

Code: `generator`

Generate test/sample records using templates. Useful for testing pipelines and creating seed data.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `count` | number | Yes | Number of records to generate |
| `template` | object | Yes | Record template with placeholders |
| `batchSize` | number | No | Batch size. Default: 100 |
| `delayMs` | number | No | Delay between batches (ms). Default: 0 |

### Template Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{{index}}` | Sequential index (1, 2, 3...) |
| `{{random min max}}` | Random integer between min and max |
| `{{uuid}}` | Random UUID v4 |
| `{{timestamp}}` | Current ISO timestamp |

### Example

```typescript
.extract('test-data', {
    adapterCode: 'generator',
    count: 100,
    template: {
        id: '{{index}}',
        name: 'Product {{index}}',
        sku: 'GEN-{{index}}',
        price: '{{random 1000 9999}}',
        email: 'user{{index}}@test.com',
        uuid: '{{uuid}}',
        createdAt: '{{timestamp}}',
    },
    batchSize: 50,
})
```

---

## In-Memory Extractor

Code: `inMemory`

Use data passed directly to the pipeline, typically from webhook payloads or API calls.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | array | No | Array of records to process |

This extractor is primarily used when pipelines are triggered via webhooks or APIs where the payload contains the data to process.

### Example

```typescript
.extract('incoming-data', {
    adapterCode: 'inMemory',
})
```

---

## Database Extractor

Code: `database`

Extract data from SQL databases (PostgreSQL, MySQL, SQLite, SQL Server, Oracle).

> **Note:** PostgreSQL and MySQL are fully supported. SQLite, SQL Server, and Oracle require installing the appropriate database driver (`better-sqlite3`, `mssql`, or `oracledb`).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | No | Use a saved database connection |
| `databaseType` | string | Yes | Database type: `postgresql`, `mysql`, `sqlite`, `mssql`, `oracle` |
| `host` | string | Cond | Database host (required unless SQLite or using connectionStringSecretCode) |
| `port` | number | No | Database port (defaults to standard port for database type) |
| `database` | string | Cond | Database name (required unless SQLite) |
| `username` | string | No | Database username |
| `passwordSecretCode` | string | No | Secret code for password |
| `connectionStringSecretCode` | string | No | Secret code for full connection string |
| `query` | string | Yes | SQL SELECT query to execute |
| `parameters` | array | No | Query parameters (JSON array) |
| `schema` | string | No | Database schema/namespace (default: `public`) |
| `ssl.enabled` | boolean | No | Enable SSL/TLS connection |
| `ssl.rejectUnauthorized` | boolean | No | Verify SSL certificate |
| `pagination.enabled` | boolean | No | Enable pagination. Default: `true` |
| `pagination.type` | string | No | Pagination type: `offset` or `cursor`. Default: `offset` |
| `pagination.pageSize` | number | No | Rows per page. Default: 1000 |
| `pagination.cursorColumn` | string | No | Column for cursor pagination |
| `pagination.maxPages` | number | No | Maximum pages (safety limit) |
| `incremental.enabled` | boolean | No | Only fetch new/updated records |
| `incremental.column` | string | No | Column to track for incremental extraction |
| `incremental.type` | string | No | Column type: `timestamp`, `sequence`, `id` |
| `queryTimeoutMs` | number | No | Query timeout in ms |

### Example

```typescript
.extract('query-products', {
    adapterCode: 'database',
    databaseType: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    username: 'user',
    passwordSecretCode: 'db-password',
    query: 'SELECT * FROM products WHERE updated_at > $1',
    parameters: ['2024-01-01'],
    pagination: {
        enabled: true,
        type: 'offset',
        pageSize: 500,
    },
})
```

---

## Quick Reference

| Code | Source Type | Use Case |
|------|-------------|----------|
| `rest` | REST API | External APIs with pagination, authentication, and field mapping |
| `graphql` | GraphQL API | External GraphQL services with cursor/Relay pagination |
| `csv` | CSV Files | File imports via upload, inline data, or filesystem path |
| `json` | JSON Files | JSON data from uploads, inline text, or filesystem path |
| `database` | SQL Database | PostgreSQL, MySQL, SQLite, SQL Server, Oracle |
| `vendure-query` | Vendure | Internal data extraction for feeds, exports, and transformations |
| `generator` | Test Data | Generate test records with templates and placeholders |
| `inMemory` | Direct Data | Webhook payloads, API-triggered pipelines, inline arrays |

### Authentication Options

All HTTP-based extractors (`rest`, `graphql`) support:
- **Bearer Token**: `bearerTokenSecretCode` - Reference a secret containing the token
- **Basic Auth**: `basicSecretCode` - Reference a secret containing `user:pass`
- **HMAC Signature**: `hmacSecretCode` - Reference a secret for request signing
