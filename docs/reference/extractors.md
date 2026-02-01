# Extractors Reference

Complete reference for all data extractors.

## HTTP API Extractor

Code: `httpApi`

Fetch data from REST APIs with automatic pagination, authentication, and retry support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | API endpoint URL (or path if using connection) |
| `method` | select | No | HTTP method: GET, POST, PUT, PATCH (default: GET) |
| `headers` | json | No | Request headers (JSON object) |
| `body` | json | No | Request body for POST/PUT/PATCH (JSON) |
| `connectionCode` | string | No | HTTP connection to use (optional) |
| `dataPath` | string | No | JSON path to records array (e.g., "data.items") |
| `pagination.type` | select | No | Pagination type: none, offset, cursor, page, link_header |
| `pagination.limit` | number | No | Page size (records per page) |
| `pagination.maxPages` | number | No | Maximum pages to fetch |
| `pagination.cursorPath` | string | No | JSON path to cursor (for cursor pagination) |
| `rateLimit.requestsPerSecond` | number | No | Maximum requests per second |
| `retry.maxAttempts` | number | No | Maximum retry attempts |
| `timeoutMs` | number | No | Request timeout in milliseconds |

### Example

```typescript
.extract('fetch-products', {
    adapterCode: 'httpApi',
    url: 'https://api.example.com/products',
    method: 'GET',
    headers: {
        'Accept': 'application/json',
    },
    dataPath: 'data.products',
    pagination: {
        type: 'page',
        limit: 100,
        maxPages: 50,
    },
})
```

### Pagination Modes

**Page-based:**
```typescript
{
    pagination: {
        type: 'page',
        limit: 100,
    },
    dataPath: 'items',
}
```

**Offset-based:**
```typescript
{
    pagination: {
        type: 'offset',
        limit: 100,
    },
}
```

**Cursor-based:**
```typescript
{
    pagination: {
        type: 'cursor',
        cursorPath: 'meta.nextCursor',
    },
}
```

---

## File Extractor

Code: `file`

Parse files in multiple formats (CSV, JSON, XML, XLSX, NDJSON, TSV).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | File path or glob pattern (e.g., /data/*.csv) |
| `format` | select | No | File format: csv, json, xml, xlsx, ndjson, tsv (auto-detected if not specified) |
| `delimiter` | string | No | Field delimiter for CSV/TSV. Default: `,` for CSV, `\t` for TSV |
| `hasHeader` | boolean | No | Whether first row is header (CSV/TSV). Default: `true` |
| `encoding` | string | No | File encoding. Default: `utf-8` |
| `dataPath` | string | No | JSON path to records array (for JSON/XML) |
| `sheet` | string | No | Sheet name or index for XLSX |

### Example - CSV File

```typescript
.extract('parse-csv', {
    adapterCode: 'file',
    path: '/uploads/products.csv',
    format: 'csv',
    delimiter: ',',
    hasHeader: true,
})
```

### Example - JSON File

```typescript
.extract('parse-json', {
    adapterCode: 'file',
    path: '/data/products.json',
    format: 'json',
    dataPath: 'data.products',
})
```

### Example - Excel File

```typescript
.extract('parse-excel', {
    adapterCode: 'file',
    path: '/uploads/inventory.xlsx',
    format: 'xlsx',
    sheet: 'Products',
})
```

### Example - Glob Pattern

```typescript
.extract('parse-all-csv', {
    adapterCode: 'file',
    path: '/imports/*.csv',
    format: 'csv',
})
```

---

## GraphQL Extractor

Code: `graphql`

Query external GraphQL endpoints with cursor/offset/Relay pagination support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | GraphQL endpoint URL |
| `query` | string | Yes | GraphQL query |
| `connectionCode` | string | No | HTTP connection to use (optional) |
| `headers` | json | No | Request headers (JSON object) |
| `variables` | json | No | Query variables (JSON object) |
| `dataPath` | string | No | JSON path to items in response |
| `pagination.type` | select | No | Pagination type: none, offset, cursor, relay |
| `pagination.limit` | number | No | Page size |
| `pagination.maxPages` | number | No | Maximum pages to fetch |
| `pagination.cursorPath` | string | No | JSON path to cursor in response |
| `pagination.cursorVariable` | string | No | Variable name for cursor |
| `pagination.hasNextPagePath` | string | No | JSON path to hasNextPage boolean |
| `timeoutMs` | number | No | Request timeout in milliseconds |

### Example - Basic Query

```typescript
.extract('query-graphql', {
    adapterCode: 'graphql',
    url: 'https://api.example.com/graphql',
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
    dataPath: 'data.products',
})
```

### Example - Offset Pagination

```typescript
.extract('query-with-offset', {
    adapterCode: 'graphql',
    url: 'https://api.example.com/graphql',
    query: `
        query GetProducts($skip: Int, $take: Int) {
            products(skip: $skip, take: $take) {
                items { id name price }
                totalItems
            }
        }
    `,
    dataPath: 'data.products.items',
    pagination: {
        type: 'offset',
        limit: 100,
    },
})
```

### Example - Relay-style Pagination

```typescript
.extract('query-with-cursor', {
    adapterCode: 'graphql',
    url: 'https://api.example.com/graphql',
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
    dataPath: 'data.products.edges',
    pagination: {
        type: 'relay',
        cursorPath: 'data.products.pageInfo.endCursor',
        hasNextPagePath: 'data.products.pageInfo.hasNextPage',
        cursorVariable: 'cursor',
    },
})
```

---

## Vendure Query Extractor

Code: `vendureQuery`

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

- `PRODUCT` - Products
- `PRODUCT_VARIANT` - Product Variants
- `CUSTOMER` - Customers
- `ORDER` - Orders
- `COLLECTION` - Collections
- `FACET` - Facets
- `FACET_VALUE` - Facet Values
- `PROMOTION` - Promotions
- `ASSET` - Assets

### Example - Products with Relations

```typescript
.extract('query-products', {
    adapterCode: 'vendureQuery',
    entity: 'PRODUCT',
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
    adapterCode: 'vendureQuery',
    entity: 'CUSTOMER',
    relations: 'addresses',
    batchSize: 1000,
})
```

### Example - Orders

```typescript
.extract('query-orders', {
    adapterCode: 'vendureQuery',
    entity: 'ORDER',
    relations: 'lines,customer',
    sortBy: 'orderPlacedAt',
    sortOrder: 'DESC',
})
```

---

## S3 Extractor

Code: `s3`

Fetch and parse files from S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, etc.).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | Yes | S3 connection code |
| `bucket` | string | Yes | S3 bucket name |
| `key` | string | No | Object key (file path) |
| `prefix` | string | No | Key prefix to list objects |
| `format` | select | No | File format: csv, json, xml, xlsx, ndjson, tsv |
| `dataPath` | string | No | JSON path to records (for JSON files) |

### Example

```typescript
.extract('s3-products', {
    adapterCode: 's3',
    connectionCode: 'aws-s3',
    bucket: 'product-feeds',
    key: 'imports/products.csv',
    format: 'csv',
})
```

---

## FTP/SFTP Extractor

Code: `ftp`

Fetch and parse files from FTP or SFTP servers.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | No | FTP/SFTP connection code |
| `protocol` | select | Yes | Protocol: `ftp` or `sftp` |
| `host` | string | Yes | FTP/SFTP server hostname or IP |
| `port` | number | No | Server port (FTP: 21, SFTP: 22) |
| `username` | string | No | FTP/SFTP username |
| `passwordSecretCode` | string | No | Secret code for password |
| `remotePath` | string | Yes | Remote directory path |
| `filePattern` | string | No | File name pattern (e.g., `*.csv`, `products-*.json`) |
| `format` | select | No | File format: csv, json, xml, xlsx (auto-detected if not specified) |
| `deleteAfterProcess` | boolean | No | Delete files after processing |
| `modifiedAfter` | string | No | Only process files modified after this date |
| `maxFiles` | number | No | Maximum number of files to process |

### Example

```typescript
.extract('sftp-inventory', {
    adapterCode: 'ftp',
    protocol: 'sftp',
    host: 'ftp.supplier.com',
    username: 'ftpuser',
    passwordSecretCode: 'supplier-ftp-pass',
    remotePath: '/exports',
    filePattern: 'inventory-*.csv',
    format: 'csv',
})
```

### Example - Using Connection

```typescript
.extract('sftp-products', {
    adapterCode: 'ftp',
    connectionCode: 'supplier-sftp',
    remotePath: '/data/products',
    format: 'json',
})
```

---

## Database Extractor

Code: `database`

Query SQL databases (PostgreSQL, MySQL, SQLite, MSSQL, Oracle) with pagination support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | Yes | Database connection code |
| `query` | string | Yes | SQL query to execute |
| `pagination.type` | select | No | Pagination type: none, offset, keyset |
| `pagination.limit` | number | No | Page size |
| `incrementalColumn` | string | No | Column for incremental extraction |

### Example

```typescript
.extract('query-products', {
    adapterCode: 'database',
    connectionCode: 'supplier-db',
    query: 'SELECT * FROM products WHERE updated_at > :lastRun',
    pagination: {
        type: 'offset',
        limit: 1000,
    },
    incrementalColumn: 'updated_at',
})
```

---

## Webhook Extractor

Code: `webhook`

Receive data from webhook payloads. Used when pipelines are triggered via webhooks.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dataPath` | string | No | JSON path to records in webhook payload |

### Example

```typescript
.extract('webhook-data', {
    adapterCode: 'webhook',
    dataPath: 'data.items',
})
```

---

## Quick Reference

| Code | Source Type | Use Case |
|------|-------------|----------|
| `httpApi` | REST API | External APIs with pagination, authentication, and retry support |
| `graphql` | GraphQL API | External GraphQL services with cursor/offset/Relay pagination |
| `vendureQuery` | Vendure | Internal data extraction for feeds, exports, and transformations |
| `file` | Files | Parse CSV, JSON, XML, XLSX, NDJSON, TSV files |
| `s3` | S3 Storage | Fetch and parse files from S3-compatible storage |
| `ftp` | FTP/SFTP | Fetch files from FTP or SFTP servers |
| `database` | SQL Database | Query PostgreSQL, MySQL, SQLite, MSSQL, Oracle databases |
| `webhook` | Webhook | Receive data from webhook payloads |

### Authentication Options

HTTP-based extractors (`httpApi`, `graphql`) support connection-based authentication via `connectionCode` which provides:
- **Bearer Token**: Bearer token authentication
- **Basic Auth**: HTTP Basic authentication
- **API Key**: API key in header
