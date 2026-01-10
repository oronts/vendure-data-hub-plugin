# Reference

Complete reference documentation for all Data Hub adapters.

<p align="center">
  <img src="../images/01-adapters-catalog.png" alt="Adapters Catalog" width="700">
  <br>
  <em>Adapters Catalog - Browse all extractors, operators, and loaders</em>
</p>

## Contents

1. [Extractors](./extractors.md) - All data extractors
2. [Loaders](./loaders.md) - All entity loaders
3. [Operators](./operators.md) - All transform operators
4. [Feed Generators](./feeds.md) - Product feed generators
5. [Search Sinks](./sinks.md) - Search engine integrations

## Quick Reference

### Extractors

| Code | Description |
|------|-------------|
| `rest` | REST API with pagination |
| `csv` | CSV files or inline data |
| `graphql` | External GraphQL endpoints |
| `vendure-query` | Vendure entity queries |

### Loaders

| Code | Entity | Description |
|------|--------|-------------|
| `productUpsert` | Product | Create/update products with default variant |
| `variantUpsert` | ProductVariant | Create/update product variants |
| `customerUpsert` | Customer | Create/update customers with addresses |
| `collectionUpsert` | Collection | Create/update collections |
| `promotionUpsert` | Promotion | Create/update promotions |
| `orderNote` | Order | Add notes to orders |
| `orderTransition` | Order | Transition order states |
| `stockAdjust` | ProductVariant | Adjust inventory levels |
| `applyCoupon` | Order | Apply coupon codes to orders |
| `assetAttach` | Product/Collection | Attach assets to entities |
| `restPost` | External | POST/PUT data to external APIs |

### Operator Categories

| Category | Operators |
|----------|-----------|
| Data | set, copy, rename, remove, map, template |
| String | trim, uppercase, lowercase, slugify, split, join, replace, regex |
| Numeric | round, floor, ceil, abs, add, multiply, divide, clamp |
| Date | parse, format, add, diff |
| Logic | when, if-then-else, switch, delta-filter |
| JSON | get, flatten, merge, parse, stringify |
| Validation | required, type, range, pattern, length |
| Aggregation | count, sum, avg, min, max, groupBy |

### Feed Types

| Type | Platform |
|------|----------|
| `google-merchant` | Google Merchant Center |
| `meta-catalog` | Meta/Facebook Catalog |
| `amazon` | Amazon Product Ads |
| `custom` | Custom format |

### Sink Types

| Type | Engine |
|------|--------|
| `elasticsearch` | Elasticsearch / OpenSearch |
| `meilisearch` | MeiliSearch |
| `algolia` | Algolia |
| `typesense` | Typesense |
