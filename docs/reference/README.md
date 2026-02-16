# Reference

Complete reference documentation for all Data Hub adapters.

<p align="center">
  <img src="../images/01-adapters-catalog.png" alt="Adapters Catalog" width="700">
  <br>
  <em>Adapters Catalog - Browse all extractors, operators, and loaders</em>
</p>

## Contents

1. [Step Types](./step-types.md) - All pipeline step types
2. [Extractors](./extractors.md) - All data extractors
3. [Loaders](./loaders.md) - All entity loaders
4. [Operators](./operators.md) - All transform operators
5. [Feed Generators](./feeds.md) - Product feed generators
6. [Search Sinks](./sinks.md) - Search engine integrations

## Quick Reference

### Extractors (9)

| Code | Description |
|------|-------------|
| `httpApi` | REST API with pagination, authentication, retry |
| `graphql` | External GraphQL endpoints with cursor/offset/Relay pagination |
| `vendureQuery` | Vendure entity queries with automatic pagination |
| `file` | Parse files (CSV, JSON, XML, XLSX, NDJSON, TSV) |
| `database` | SQL databases (PostgreSQL, MySQL, SQLite, MSSQL, Oracle) |
| `s3` | S3-compatible storage (AWS, MinIO, DigitalOcean Spaces) |
| `ftp` | FTP/SFTP servers |
| `cdc` | Change Data Capture - poll database tables for changes |
| `webhook` | Incoming webhook payloads |

### Loaders (18)

| Entity Type | Description |
|-------------|-------------|
| `PRODUCT` | Create/update products with facets and assets |
| `PRODUCT_VARIANT` | Update variants by SKU with multi-currency prices |
| `CUSTOMER` | Create/update customers with addresses and groups |
| `CUSTOMER_GROUP` | Create/update customer groups with member assignments |
| `COLLECTION` | Create/update collections with parent relationships |
| `FACET` | Create/update facets for categorization |
| `FACET_VALUE` | Create/update facet values within facets |
| `PROMOTION` | Create/update promotions with conditions and actions |
| `ORDER` | Create/update orders with line items |
| `SHIPPING_METHOD` | Create/update shipping methods with calculators |
| `STOCK_LOCATION` | Create/update stock locations |
| `INVENTORY` | Adjust inventory levels by SKU and location |
| `ASSET` | Create/update assets and attach to entities |
| `TAX_RATE` | Create/update tax rates with category and zone |
| `PAYMENT_METHOD` | Create/update payment methods with handlers |
| `CHANNEL` | Create/update channels with currencies and languages |
| `REST_POST` | POST data to custom REST endpoints |
| `GRAPHQL_MUTATION` | Send records as GraphQL mutations to external APIs |

### Operator Categories (61 operators)

| Category | Operators |
|----------|-----------|
| Data (8) | `set`, `copy`, `rename`, `remove`, `map`, `template`, `hash`, `uuid` |
| String (12) | `trim`, `uppercase`, `lowercase`, `slugify`, `split`, `join`, `concat`, `replace`, `extractRegex`, `replaceRegex`, `stripHtml`, `truncate` |
| Numeric (9) | `math`, `toNumber`, `toString`, `currency`, `unit`, `parseNumber`, `formatNumber`, `toCents`, `round` |
| Date (5) | `dateFormat`, `dateParse`, `dateAdd`, `dateDiff`, `now` |
| Logic (4) | `when`, `ifThenElse`, `switch`, `deltaFilter` |
| JSON (4) | `pick`, `omit`, `parseJson`, `stringifyJson` |
| Enrichment (5) | `lookup`, `enrich`, `coalesce`, `default`, `httpLookup` |
| Aggregation (8) | `aggregate`, `multiJoin`, `count`, `unique`, `flatten`, `first`, `last`, `expand` |
| File (3) | `imageResize`, `imageConvert`, `pdfGenerate` |
| Validation (2) | `validateRequired`, `validateFormat` |
| Advanced (1) | `script` |

### Feed Types (5)

| Adapter Code | Platform |
|--------------|----------|
| `googleMerchant` | Google Merchant Center / Google Shopping |
| `metaCatalog` | Meta/Facebook/Instagram Catalog |
| `customFeed` | Custom CSV, JSON, or XML format |

### Sink Types (6)

| Code | Engine |
|------|--------|
| `elasticsearch` | Elasticsearch / OpenSearch |
| `meilisearch` | MeiliSearch |
| `algolia` | Algolia |
| `typesense` | Typesense |
| `queueProducer` | RabbitMQ Queue |
| `webhook` | HTTP Webhook (POST/PUT/PATCH) |
