# Extractors Reference

Complete reference for all data extractors.

## Table of Contents

- [HTTP API Extractor](#http-api-extractor) - Fetch data from REST APIs with pagination and authentication
- [Uploaded and Inline File Extractors](#uploaded-and-inline-file-extractors) - Parse uploaded CSV, JSON, XML, and XLSX files or safe inline data
- [GraphQL Extractor](#graphql-extractor) - Query external GraphQL endpoints with pagination
- [Vendure Query Extractor](#vendure-query-extractor) - Extract data directly from Vendure entities
- [S3 Extractor](#s3-extractor) - Fetch and parse files from S3-compatible storage
- [FTP/SFTP Extractor](#ftpsftp-extractor) - Fetch and parse files from FTP or SFTP servers
- [Database Extractor](#database-extractor) - Query SQL databases with pagination
- [CDC (Change Data Capture) Extractor](#cdc-change-data-capture-extractor) - Poll database tables for changes
- [In-Memory Extractor](#in-memory-extractor) - Inline data for testing and seed data
- [Generator Extractor](#generator-extractor) - Generate synthetic records for pipeline tests
- [Quick Reference](#quick-reference) - Summary table of all extractors

---

## HTTP API Extractor

Code: `httpApi`

Fetch data from REST APIs with automatic pagination, authentication, and retry support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | API endpoint URL (or path if using connection) |
| `method` | select | No | HTTP method: GET, POST, PUT, PATCH (default: GET) |
| `headers` | json | No | Non-sensitive static request headers |
| `body` | json | No | Request body for POST/PUT/PATCH (JSON) |
| `connectionCode` | string | Conditional | Saved HTTP-like connection; required for secret-backed authentication |
| `auth` | object | No | Secret-backed `NONE`, `BASIC`, `BEARER`, or `API_KEY` authentication override |
| `dataPath` | string | No | JSON path to records array (e.g., "data.items") |
| `pagination.type` | select | No | Pagination type: NONE, OFFSET, CURSOR, PAGE, LINK_HEADER |
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
        type: 'PAGE',
        limit: 100,
        maxPages: 50,
    },
})
```

Static `headers` cannot contain credentials, cookies, signatures, host
routing, or hop-by-hop headers. Put credentials in a saved HTTP connection or
the nested `auth` object and reference Secret Codes. Extractor-level
`headers` and `auth` override their saved-connection counterparts. The saved
connection must define a base URL when authentication is used. Relative paths
resolve against that URL; absolute URLs and redirects must retain its exact
origin.

### Pagination Modes

**Page-based:**
```typescript
{
    pagination: {
        type: 'PAGE',
        limit: 100,
    },
    dataPath: 'items',
}
```

**Offset-based:**
```typescript
{
    pagination: {
        type: 'OFFSET',
        limit: 100,
    },
}
```

**Cursor-based:**
```typescript
{
    pagination: {
        type: 'CURSOR',
        cursorPath: 'meta.nextCursor',
    },
}
```

---

## Uploaded and Inline File Extractors

Codes: `csv`, `json`, `xml`, `xlsx`

These format-specific extractors read files managed by Data Hub storage. Upload a file in the import wizard or with `POST /data-hub/upload`, then use the returned `file.id` as `fileId`. They do not accept server filesystem paths or glob patterns.

CSV, JSON, and XML also accept explicitly configured inline content. XLSX requires an uploaded file.

### Shared configuration

| Field | Applies to | Description |
|-------|------------|-------------|
| `fileId` | CSV, JSON, XML, XLSX | ID returned by Data Hub file upload |
| `resetCheckpoint` | CSV, JSON, XML, XLSX | Start from the beginning instead of the saved record offset |
| `delimiter` | CSV | Field delimiter. Default: `,` |
| `hasHeader` | CSV, XLSX | Treat the first row as column names. Default: `true` |
| `csvText` | CSV | Raw inline CSV string instead of `fileId` |
| `rows` | CSV | Inline array of objects, or an array of rows with a header row |
| `jsonText` | JSON | Raw inline JSON string instead of `fileId` |
| `itemsPath` | JSON | Dot path to the records array, such as `data.products` |
| `xmlText` | XML | Raw inline XML string instead of `fileId` |
| `recordPath` | XML | Dot path to record elements, such as `catalog.product` |
| `attributePrefix` | XML | Prefix used for parsed XML attributes. Default: `@` |
| `sheetName` | XLSX | Sheet name or zero-based sheet index |

Provide one source per extractor. For CSV, use one of `fileId`, `rows`, or `csvText`; for JSON and XML, use either `fileId` or the corresponding inline text field.

### CSV upload

```typescript
.extract('parse-csv', {
    adapterCode: 'csv',
    fileId: 'uploaded-file-id',
    delimiter: ',',
    hasHeader: true,
})
```

For small code-defined inputs, use `rows` without creating a server file:

```typescript
.extract('seed-products', {
    adapterCode: 'csv',
    rows: [
        { sku: 'SKU-1', name: 'First product' },
        { sku: 'SKU-2', name: 'Second product' },
    ],
})
```

### JSON upload

```typescript
.extract('parse-json', {
    adapterCode: 'json',
    fileId: 'uploaded-file-id',
    itemsPath: 'data.products',
})
```

### XML upload

```typescript
.extract('parse-xml', {
    adapterCode: 'xml',
    fileId: 'uploaded-file-id',
    recordPath: 'catalog.product',
    attributePrefix: '@',
})
```

### XLSX upload

```typescript
.extract('parse-xlsx', {
    adapterCode: 'xlsx',
    fileId: 'uploaded-file-id',
    sheetName: 'Products',
    hasHeader: true,
})
```

---

## GraphQL Extractor

Code: `graphql`

Query external GraphQL endpoints with cursor/offset/Relay pagination support.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | GraphQL endpoint URL, or path when using a connection |
| `query` | string | Yes | GraphQL query |
| `connectionCode` | string | No | HTTP connection to use (optional) |
| `headers` | json | No | Non-sensitive static request headers |
| `auth` | object | No | Secret-backed `NONE`, `BASIC`, `BEARER`, or `API_KEY` authentication override |
| `variables` | json | No | Query variables (JSON object) |
| `operationName` | string | No | Operation name when the document contains multiple operations |
| `dataPath` | string | No | Full response path to records, for example `data.products.items` |
| `pagination.type` | string | No | `NONE`, `OFFSET`, `CURSOR`, or `RELAY` |
| `pagination.limit` | number | No | Records requested per page |
| `pagination.offsetVariable` | string | No | Offset variable name |
| `pagination.limitVariable` | string | No | Page-size variable name |
| `pagination.cursorVariable` | string | No | Cursor variable name |
| `pagination.totalCountPath` | string | No | Full response path to total count |
| `pagination.pageInfoPath` | string | No | Full response path to Relay pageInfo |
| `pagination.maxPages` | number | No | Maximum pages per run |
| `retry.maxAttempts` | number | No | Maximum request attempts |
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

GraphQL uses the same saved HTTP connection, Secret Code, static-header, SSRF,
response-size, timeout, and retry boundaries as `httpApi`. A GraphQL response
can contain both `data` and `errors`; the extractor logs those GraphQL errors
and still emits records found at `dataPath`.

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
        type: 'OFFSET',
        limit: 100,
        offsetVariable: 'skip',
        limitVariable: 'take',
        totalCountPath: 'data.products.totalItems',
        maxPages: 50,
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
    dataPath: 'data.products',
    pagination: {
        type: 'RELAY',
        limit: 100,
        cursorVariable: 'cursor',
        limitVariable: 'first',
        pageInfoPath: 'data.products.pageInfo',
        maxPages: 50,
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
| `relations` | array | No | JSON array of TypeORM relation paths to join |
| `filters` | array | No | Filters from the DSL or export wizard with `field`, `operator`, and `value`; operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `like`, `contains` |
| `includeFields` | array | No | Only emit these root entity fields |
| `excludeFields` | array | No | Omit these root entity fields |
| `languageCode` | string | No | Preferred language code for translations (e.g., `en`, `de`); falls back to the first translation |
| `flattenTranslations` | boolean | No | Merge translation fields to root level and remove the translations array; default: `true` |
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
    relations: ['variants', 'featuredAsset', 'translations'],
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
    relations: ['addresses'],
    batchSize: 1000,
})
```

### Example - Orders

```typescript
.extract('query-orders', {
    adapterCode: 'vendureQuery',
    entity: 'ORDER',
    relations: ['lines', 'customer'],
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
| `connectionCode` | string | No | Saved `S3` connection. Step fields override saved connection fields |
| `bucket` | string | Yes | S3 bucket name; it may come from the saved connection |
| `region` | string | No | AWS region; default: `us-east-1` |
| `endpoint` | string | No | HTTP(S) endpoint for an S3-compatible service; SSRF checks apply |
| `accessKeyIdSecretCode` | string | No | Secret Code for an access key ID |
| `secretAccessKeySecretCode` | string | No | Secret Code for the matching secret key |
| `forcePathStyle` | boolean | No | Enable path-style addressing; default: `false` |
| `prefix` | string | No | Object-key prefix to list; must not begin with `/` |
| `suffix` | string | No | Object-key suffix filter, such as `.csv` |
| `format` | select | No | `CSV`, `JSON`, `XML`, or `XLSX`; otherwise detected from the object key |
| `csv.delimiter` | string | No | CSV delimiter: `,`, `;`, tab, or `|` |
| `csv.header` | boolean | No | Treat the first CSV row as headers |
| `json.path` | string | No | Dot path to the JSON records array |
| `xml.recordPath` | string | No | Dot path to XML record elements |
| `xlsx.sheet` | string/number | No | Spreadsheet sheet name or index |
| `modifiedAfter` | string | No | Process objects modified on or after this ISO date |
| `maxObjects` | number | No | Maximum objects per run; default: 100 |
| `includeObjectMetadata` | boolean | No | Add bucket/key/size/etag/last-modified data under `_s3` |
| `continueOnError` | boolean | No | Continue after an object parse/processing failure; default: `true` |
| `deleteAfterProcess` | boolean | No | Delete each successfully processed source object |
| `moveAfterProcess.enabled` | boolean | No | Copy successfully processed objects to another prefix, then delete the source |
| `moveAfterProcess.destinationPrefix` | string | Conditional | Required when move-after-process is enabled |

### Example

```typescript
.extract('s3-products', {
    adapterCode: 's3',
    connectionCode: 'aws-s3',
    prefix: 'imports/',
    suffix: '.csv',
    format: 'CSV',
    csv: {
        delimiter: ',',
        header: true,
    },
    maxObjects: 100,
    includeObjectMetadata: true,
})
```

Provide both static credential Secret Codes or neither. When neither is set,
the AWS SDK credential chain is used. The extractor lists objects under
`prefix`; it does not accept a single-object `key` field. Use a narrow
`prefix` plus `suffix`, or a file-watch trigger, to select source objects.

---

## FTP/SFTP Extractor

Code: `ftp`

Fetch and parse files from FTP or SFTP servers.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | No | Saved `FTP` or `SFTP` connection. Step fields override saved connection fields |
| `protocol` | select | Conditional | `ftp` or `sftp`; inferred from the saved connection when present |
| `host` | string | Conditional | Server hostname; required when it is not supplied by a saved connection |
| `port` | number | No | Server port (FTP: 21, SFTP: 22) |
| `username` | string | No | FTP/SFTP username |
| `passwordSecretCode` | string | No | Secret code for password |
| `privateKeySecretCode` | string | No | Secret code for an SFTP private key |
| `passphraseSecretCode` | string | No | Secret code for the private-key passphrase |
| `hostKeyFingerprintSecretCode` | string | Production SFTP | Secret code containing the trusted OpenSSH `SHA256:<base64>` host-key fingerprint |
| `remotePath` | string | Yes | Remote directory path |
| `filePattern` | string | No | File name pattern (e.g., `*.csv`, `products-*.json`) |
| `format` | select | No | File format: CSV, JSON, XML, XLSX (auto-detected if not specified) |
| `deleteAfterProcess` | boolean | No | Delete files after processing |
| `moveAfterProcess.enabled` | boolean | No | Move successfully processed files to another directory |
| `moveAfterProcess.destinationPath` | string | Conditional | Required when move-after-process is enabled |
| `modifiedAfter` | string | No | Only process files modified after this date |
| `maxFiles` | number | No | Maximum files per run; default: 50 |
| `includeFileMetadata` | boolean | No | Add protocol/host/path/size/modified data under `_ftp` |
| `continueOnError` | boolean | No | Continue after a file parse/processing failure; default: `true` |
| `secure` | boolean | No | Use FTPS when `protocol` is `ftp` |
| `passiveMode` | boolean | No | Use passive FTP; default: `true` |
| `timeoutMs` | number | No | Connection timeout; default: 30000 ms |

### Example

```typescript
.extract('sftp-inventory', {
    adapterCode: 'ftp',
    protocol: 'sftp',
    host: 'ftp.supplier.com',
    username: 'ftpuser',
    passwordSecretCode: 'supplier-ftp-pass',
    hostKeyFingerprintSecretCode: 'supplier-sftp-host-key',
    remotePath: '/exports',
    filePattern: 'inventory-*.csv',
    format: 'CSV',
})
```

### Example - Using Connection

```typescript
.extract('sftp-products', {
    adapterCode: 'ftp',
    connectionCode: 'supplier-sftp',
    remotePath: '/data/products',
    format: 'JSON',
})
```

---

SFTP connections in production require `hostKeyFingerprintSecretCode`. The referenced secret must contain the trusted server host-key fingerprint in OpenSSH `SHA256:<base64>` format; a missing value or mismatch rejects the SSH handshake.

## Database Extractor

Code: `database`

Run read-only `SELECT` queries against PostgreSQL, MySQL/MariaDB, or SQLite
with optional pagination and checkpoint-based incremental filtering. These are
the complete supported database-type values.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | No | Saved `POSTGRES` or `MYSQL` connection. Step fields override saved connection fields; SQLite is code-first only |
| `databaseType` | select | Yes | `POSTGRESQL`, `MYSQL`, or `SQLITE`; inferred for `POSTGRES` and `MYSQL` saved connections |
| `host` | string | Conditional | Database host; not used for SQLite |
| `port` | number | No | Port from 1 to 65535 |
| `database` | string | Conditional | Database name, or a SQLite file path/`:memory:` |
| `username` | string | No | Database username |
| `passwordSecretCode` | string | No | Secret Code for the password |
| `connectionStringSecretCode` | string | No | Secret Code for a connection string instead of host fields |
| `ssl.enabled` | boolean | No | Enable TLS for PostgreSQL/MySQL |
| `ssl.rejectUnauthorized` | boolean | No | Verify the server certificate; default: `true` |
| `query` | string | Yes | Query must begin with `SELECT`; dangerous patterns and SQL comments are rejected |
| `parameters` | array | No | Positional query parameters (`$1` for PostgreSQL, `?` for MySQL/SQLite) |
| `pagination.enabled` | boolean | No | Enable runtime query wrapping and pagination |
| `pagination.type` | select | No | `OFFSET` or `CURSOR` |
| `pagination.pageSize` | number | Conditional | Rows per page when pagination is enabled |
| `pagination.cursorColumn` | string | Conditional | Required for `CURSOR`; primary sort column and may contain repeated values |
| `pagination.cursorTieBreakerColumn` | string | Conditional | Required for `CURSOR`; different, unique, stable column used to order equal cursor values |
| `pagination.maxPages` | number | No | Safety limit for pages per run |
| `incremental.enabled` | boolean | No | Append a greater-than filter using the saved checkpoint |
| `incremental.column` | string | Conditional | Required when incremental extraction is enabled |
| `queryTimeoutMs` | number | No | PostgreSQL/MySQL query timeout from 1 to 300000 milliseconds; unsupported for SQLite |
| `pool.max` | number | No | Maximum PostgreSQL/MySQL connections in the extractor pool (1-10; default: 10) |
| `pool.idleTimeoutMs` | number | No | Close idle PostgreSQL/MySQL connections after 1-300000 milliseconds (default: 30000) |

### Example

```typescript
.extract('query-products', {
    adapterCode: 'database',
    connectionCode: 'supplier-db',
    databaseType: 'POSTGRESQL',
    query: 'SELECT id, sku, name, updated_at FROM products WHERE active = $1',
    parameters: [true],
    pagination: {
        enabled: true,
        type: 'OFFSET',
        pageSize: 1000,
        maxPages: 100,
    },
    incremental: {
        enabled: true,
        column: 'updated_at',
    },
})
```

Cursor pagination uses a composite keyset and requires both columns. For
example, use `updated_at` as `cursorColumn` and the primary key `id` as
`cursorTieBreakerColumn`. Both boundary values must be non-null. The extractor
orders by both fields and resumes after the exact pair, so records sharing the
same timestamp are not skipped between pages.

---

## CDC (Change Data Capture) Extractor

Code: `cdc`

Read one bounded batch of rows changed since the prior checkpoint. The first
run marks emitted records as `UPSERT`; later runs mark them as `UPDATE`.
Optional delete tracking reads a soft-delete timestamp column and marks those
records as `DELETE`. It does not observe physical deletes.

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connectionCode` | string | Yes | Database connection code |
| `table` | string | Yes | Table name to monitor for changes |
| `trackingColumn` | string | Yes | Non-null, monotonically increasing timestamp or version column used to detect changes (e.g., `updated_at`, `version`) |
| `trackingType` | select | Yes | Column type: `TIMESTAMP` or `VERSION` |
| `primaryKey` | string | Yes | Non-null, unique, immutable primary key used to order rows that share a tracking value |
| `databaseType` | select | Yes | Database type: `POSTGRESQL` or `MYSQL` |
| `columns` | array | No | Specific columns to select (omit for all columns) |
| `batchSize` | number | No | Number of records per batch (default: 1000) |
| `includeDeletes` | boolean | No | Whether to track soft-deletes |
| `deleteColumn` | string | No | Column that indicates deletion timestamp (required when `includeDeletes` is true) |

### Example - Track Product Changes

```typescript
.extract('product-changes', {
    adapterCode: 'cdc',
    connectionCode: 'main-db',
    table: 'products',
    trackingColumn: 'updated_at',
    trackingType: 'TIMESTAMP',
    databaseType: 'POSTGRESQL',
    primaryKey: 'id',
    columns: ['id', 'name', 'price', 'updated_at'],
    batchSize: 500,
})
```

### Example - Version-Based Tracking

```typescript
.extract('inventory-changes', {
    adapterCode: 'cdc',
    connectionCode: 'warehouse-db',
    table: 'inventory',
    trackingColumn: 'version',
    trackingType: 'VERSION',
    databaseType: 'MYSQL',
    primaryKey: 'id',
    batchSize: 1000,
})
```

### Example - With Soft-Delete Tracking

```typescript
.extract('product-changes-with-deletes', {
    adapterCode: 'cdc',
    connectionCode: 'main-db',
    table: 'products',
    trackingColumn: 'updated_at',
    trackingType: 'TIMESTAMP',
    databaseType: 'POSTGRESQL',
    primaryKey: 'id',
    includeDeletes: true,
    deleteColumn: 'deleted_at',
})
```

### How It Works

1. On first run, the extractor reads up to `batchSize` rows ordered by the tracking column and primary key
2. It stores both values as a composite checkpoint
3. On subsequent runs, it resumes after that exact pair, so a batch boundary cannot drop rows that share the same tracking value
4. Rows with a null tracking value or primary key cannot form a safe checkpoint and are rejected
5. DELETE tracking uses the same composite cursor and requires `includeDeletes: true` plus a non-null `deleteColumn` timestamp

The extractor performs one poll per pipeline run, limited by `batchSize`.
Use a scheduled trigger to run it repeatedly.
The ordered pair must never move backwards after commit. For concurrent writers,
prefer a database-assigned monotonic version with sufficient precision; a late
write that sorts before an already committed checkpoint cannot be recovered by
keyset polling alone.
When upgrading a pipeline with an existing CDC checkpoint, follow the
[CDC composite checkpoint upgrade](../deployment/migrations.md#cdc-composite-checkpoint-upgrade)
before its next run.

---

## In-Memory Extractor

Code: `inMemory`

Reads records directly from inline data provided in the step configuration.
Useful for small code-defined datasets and tests.

**Note:** The inMemory extractor reads records from the `data` field (not `records`). The `data` field accepts an array of objects or a single object (which will be wrapped in an array).

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | array/object | No | Inline records to extract. A single object is wrapped in an array; an omitted value produces no records |

### Example

```typescript
.extract('inline-data', {
    adapterCode: 'inMemory',
    data: [
        { sku: 'ABC-001', name: 'Widget A', price: 1999 },
        { sku: 'ABC-002', name: 'Widget B', price: 2999 },
    ],
})
```

Record-seeded runs behave differently: webhook, Vendure-event, message, hook,
and explicit seeded executions pass their records through each reachable
`EXTRACT` step without invoking its adapter. Do not add an incoming-webhook
extractor; there is no registered `webhook` extractor. File-watch seeds use
source-reference mode and still invoke the matching S3 or FTP/SFTP extractor.

---

## Generator Extractor

Code: `generator`

Generate deterministic-shape test records without an external source. Every
record includes a zero-based `_index` field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `count` | number | No | Number of records; defaults to 10 when omitted or zero |
| `template` | object | No | Field template. Non-string values are copied literally |

String template values support `uuid`, `timestamp`, `isoDate`, `index`,
`random:N`, `seq:N`, and interpolation of `{{index}}`, `{{count}}`, or
`{{total}}`. Both count placeholders contain the total number of records.

```typescript
.extract('generated-products', {
    adapterCode: 'generator',
    count: 3,
    template: {
        id: 'uuid',
        sku: 'SKU-{{index}}',
        sequence: 'seq:1000',
        sample: 'random:100',
        createdAt: 'isoDate',
    },
})
```

When `template` is omitted, generated records contain `id`, `name`,
`value`, and `createdAt` in addition to `_index`.

---

## Quick Reference

| Code | Source Type | Use Case |
|------|-------------|----------|
| `httpApi` | REST API | External APIs with pagination, authentication, and retry support |
| `graphql` | GraphQL API | External GraphQL services with cursor/offset/Relay pagination |
| `vendureQuery` | Vendure | Internal data extraction for feeds, exports, and transformations |
| `csv` | Uploaded/Inline CSV | Parse a managed CSV upload, raw CSV text, or inline rows |
| `json` | Uploaded/Inline JSON | Parse a managed JSON upload or raw JSON text |
| `xml` | Uploaded/Inline XML | Parse a managed XML upload or raw XML text |
| `xlsx` | Uploaded XLSX | Parse a managed spreadsheet upload |
| `s3` | S3 Storage | Fetch and parse files from S3-compatible storage |
| `ftp` | FTP/SFTP | Fetch files from FTP or SFTP servers |
| `database` | SQL Database | Query PostgreSQL, MySQL/MariaDB, or SQLite |
| `cdc` | CDC | Poll database tables for changes using timestamp or version tracking |
| `inMemory` | In-Memory | Read an inline object or array from the step config |
| `generator` | Generated | Generate configurable records for pipeline tests |

### Authentication Options

HTTP-based extractors (`httpApi`, `graphql`) accept a saved HTTP-like
`connectionCode` and a canonical nested `auth` override:

```typescript
auth: {
    type: 'BEARER',
    secretCode: 'supplier-api-token',
}

auth: {
    type: 'BASIC',
    usernameSecretCode: 'supplier-api-username',
    secretCode: 'supplier-api-password',
}

auth: {
    type: 'API_KEY',
    headerName: 'X-API-Key',
    secretCode: 'supplier-api-key',
}
```

Basic auth may use a literal `username` instead of
`usernameSecretCode`; passwords, bearer tokens, and API keys always resolve
through `secretCode`. Missing or empty secrets fail closed. Static
`headers` cannot contain credentials, cookies, signatures, host routing, or
hop-by-hop headers. Secret-backed authentication requires a saved connection
whose base URL binds the initial request and redirects to one exact origin.
`httpApi` supports
`rateLimit.requestsPerSecond`; `graphql` rejects `rateLimit`
configuration.
