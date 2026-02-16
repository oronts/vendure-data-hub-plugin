# Operators Reference

Complete reference for all transform operators.

## Data Operators

### set

Set a static value at a path.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Target field path |
| `value` | any | Yes | Value to set (JSON) |

```typescript
{ op: 'set', args: { path: 'enabled', value: true } }
{ op: 'set', args: { path: 'metadata.source', value: 'import' } }
```

### copy

Copy a field value to another path.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'copy', args: { source: 'sku', target: 'externalId' } }
```

### rename

Rename a field.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `from` | string | Yes | Source field path |
| `to` | string | Yes | Target field path |

```typescript
{ op: 'rename', args: { from: 'product_name', to: 'name' } }
```

### remove

Remove a field at path.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path to remove |

```typescript
{ op: 'remove', args: { path: 'temp_id' } }
```

### map

Transform records via field mapping.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `mapping` | json | Yes | JSON object defining field mapping (target: source) |
| `passthrough` | boolean | No | If true, include fields not in mapping |

```typescript
{ op: 'map', args: { mapping: { name: 'product_name', sku: 'product_sku', price: 'retail_price' } } }
{ op: 'map', args: { mapping: { name: 'title', price: 'cost' }, passthrough: true } }
```

### template

Render a string template and set it at target path.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `template` | string | Yes | Template with `${path}` substitutions |
| `target` | string | Yes | Target field path |
| `missingAsEmpty` | boolean | No | Treat missing fields as empty string |

```typescript
{ op: 'template', args: { template: 'https://store.com/${slug}', target: 'url' } }
{ op: 'template', args: { template: '${firstName} ${lastName}', target: 'fullName', missingAsEmpty: true } }
```

### hash

Generate a cryptographic hash of field value(s).

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | json | Yes | Single path string or array of paths to hash together |
| `target` | string | Yes | Path where the hash will be stored |
| `algorithm` | select | No | `md5`, `sha1`, `sha256`, `sha512` (default: `sha256`) |
| `encoding` | select | No | `hex` or `base64` (default: `hex`) |

```typescript
{ op: 'hash', args: { source: 'data', target: 'checksum', algorithm: 'sha256' } }
{ op: 'hash', args: { source: ['sku', 'name', 'price'], target: 'contentHash', algorithm: 'md5' } }
{ op: 'hash', args: { source: 'password', target: 'passwordHash', algorithm: 'sha512', encoding: 'base64' } }
```

### uuid

Generate a UUID.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `target` | string | Yes | Target field path |
| `version` | string | No | `v4` (random) or `v5` (namespace-based) |
| `namespace` | string | No | Namespace for v5 (required if version is v5) |
| `source` | string | No | Source field path for v5 name |

```typescript
{ op: 'uuid', args: { target: 'id' } }
{ op: 'uuid', args: { target: 'productId', version: 'v4' } }
{ op: 'uuid', args: { target: 'stableId', version: 'v5', namespace: 'products', source: 'sku' } }
```

---

## Enrichment Operators

### lookup

Lookup value from a map and set to target field.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `map` | object | Yes | Lookup map (JSON object) |
| `target` | string | Yes | Target field path |
| `default` | any | No | Default value if not found |

```typescript
{ op: 'lookup', args: { source: 'status', map: { 'A': 'active', 'I': 'inactive' }, target: 'statusText', default: 'unknown' } }
```

### enrich

Set or default fields on records.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `set` | object | No | Fields to set (overwrites) |
| `defaults` | object | No | Fields to set if currently missing |

```typescript
{ op: 'enrich', args: { set: { source: 'import' }, defaults: { enabled: true } } }
```

### coalesce

Return the first non-null value from paths.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `paths` | array | Yes | Array of field paths to check |
| `target` | string | Yes | Target field path |
| `default` | any | No | Default value if all null |

```typescript
{ op: 'coalesce', args: { paths: ['name', 'title', 'sku'], target: 'displayName', default: 'Unnamed' } }
```

### default

Set a default value if field is null or undefined.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |
| `value` | json | Yes | Default value |

```typescript
{ op: 'default', args: { path: 'enabled', value: true } }
{ op: 'default', args: { path: 'stock', value: 0 } }
```

### httpLookup

Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `url` | string | Yes | HTTP endpoint URL. Use `{{field}}` for dynamic values |
| `method` | select | No | `GET` or `POST` (default: GET) |
| `target` | string | Yes | Field path to store the response data |
| `responsePath` | string | No | JSON path to extract from response |
| `keyField` | string | No | Field to use as cache key. If not set, URL is used |
| `default` | json | No | Value to use if lookup fails or returns 404 |
| `timeoutMs` | number | No | Request timeout in milliseconds |
| `cacheTtlSec` | number | No | Cache time-to-live in seconds. Set to 0 to disable |
| `headers` | json | No | Static HTTP headers as JSON object |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token authentication |
| `apiKeySecretCode` | string | No | Secret code for API key authentication |
| `apiKeyHeader` | string | No | Header name for API key |
| `basicAuthSecretCode` | string | No | Secret code for Basic auth (username:password) |
| `bodyField` | string | No | Field path for POST body (uses record value at this path) |
| `body` | json | No | Static POST body (JSON object) |
| `skipOn404` | boolean | No | Skip record if endpoint returns 404 |
| `failOnError` | boolean | No | Fail pipeline if HTTP request fails |
| `maxRetries` | number | No | Maximum retry attempts on transient errors |
| `batchSize` | number | No | Process this many records in parallel (default: 50) |
| `rateLimitPerSecond` | number | No | Max requests per second per domain (default: 100) |

```typescript
// Basic enrichment from external API
{ op: 'httpLookup', args: {
    url: 'https://api.example.com/products/{{sku}}',
    target: 'externalData',
    cacheTtlSec: 300,
} }

// With authentication and response extraction
{ op: 'httpLookup', args: {
    url: 'https://api.inventory.com/stock/{{productId}}',
    target: 'stockLevel',
    responsePath: 'data.available',
    bearerTokenSecretCode: 'inventory-api-key',
    default: 0,
} }

// POST request with body
{ op: 'httpLookup', args: {
    url: 'https://api.pricing.com/calculate',
    method: 'POST',
    bodyField: 'priceRequest',
    target: 'calculatedPrice',
    headers: { 'Content-Type': 'application/json' },
} }
```

---

## String Operators

### trim

Trim whitespace from a string field.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |
| `mode` | string | No | `both`, `start`, or `end` |

```typescript
{ op: 'trim', args: { path: 'name' } }
{ op: 'trim', args: { path: 'description', mode: 'both' } }
```

### uppercase

Convert to uppercase.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |

```typescript
{ op: 'uppercase', args: { path: 'sku' } }
```

### lowercase

Convert to lowercase.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |

```typescript
{ op: 'lowercase', args: { path: 'email' } }
```

### slugify

Generate a URL-friendly slug.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `separator` | string | No | Separator character (default: `-`) |

```typescript
{ op: 'slugify', args: { source: 'name', target: 'slug' } }
{ op: 'slugify', args: { source: 'title', target: 'urlPath', separator: '_' } }
```

### split

Split string into array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `delimiter` | string | Yes | Split delimiter |
| `trim` | boolean | No | Trim whitespace from each item |

```typescript
{ op: 'split', args: { source: 'tags', target: 'tagList', delimiter: ',' } }
{ op: 'split', args: { source: 'categories', target: 'categoryArray', delimiter: '|', trim: true } }
```

### join

Join array into string.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `delimiter` | string | Yes | Join delimiter |

```typescript
{ op: 'join', args: { source: 'path', target: 'breadcrumb', delimiter: ' > ' } }
```

### concat

Concatenate multiple string fields.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `sources` | array | Yes | Array of field paths |
| `target` | string | Yes | Target field path |
| `separator` | string | No | Separator between values |

```typescript
{ op: 'concat', args: { sources: ['firstName', 'lastName'], target: 'fullName', separator: ' ' } }
```

### replace

Replace text in a string field.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |
| `search` | string | Yes | Text to find |
| `replacement` | string | Yes | Replacement text |
| `all` | boolean | No | Replace all occurrences |

```typescript
{ op: 'replace', args: { path: 'description', search: '\n', replacement: '<br>', all: true } }
```

### extractRegex

Extract text using regex capture groups.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `pattern` | string | Yes | Regex pattern with capture group (without delimiters) |
| `group` | number | No | Capture group index (0=full match, 1+=capture groups). Default: 1 |
| `flags` | string | No | Regex flags (e.g., "i" for case-insensitive) |

```typescript
{ op: 'extractRegex', args: { source: 'sku', pattern: '^([A-Z]+)-\\d+$', target: 'prefix' } }
{ op: 'extractRegex', args: { source: 'url', pattern: '/products/([^/]+)/', target: 'productSlug' } }
{ op: 'extractRegex', args: { source: 'text', pattern: '([a-z]+)', target: 'word', group: 1, flags: 'i' } }
```

### replaceRegex

Replace text using regex pattern.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Field path |
| `pattern` | string | Yes | Regex pattern |
| `replacement` | string | Yes | Replacement (supports $1, $2, etc.) |
| `flags` | string | No | Regex flags (default: `g`) |

```typescript
{ op: 'replaceRegex', args: { path: 'text', pattern: '\\s+', replacement: ' ' } }
{ op: 'replaceRegex', args: { path: 'html', pattern: '<[^>]+>', replacement: '' } }
```

### stripHtml

Remove HTML tags from a string, preserving text content.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |

```typescript
{ op: 'stripHtml', args: { source: 'description' } }
{ op: 'stripHtml', args: { source: 'htmlContent', target: 'plainText' } }
```

### truncate

Truncate a string to a maximum length.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |
| `length` | number | Yes | Maximum length |
| `suffix` | string | No | Suffix when truncated (e.g., `...`) |

```typescript
{ op: 'truncate', args: { source: 'description', length: 100, suffix: '...' } }
{ op: 'truncate', args: { source: 'title', target: 'shortTitle', length: 50 } }
```

---

## Numeric Operators

### math

Perform math operations with flexible source/target fields.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `operation` | string | Yes | `add`, `subtract`, `multiply`, `divide`, `modulo`, `power`, `round`, `floor`, `ceil`, `abs` |
| `source` | string | Yes | Source field path |
| `operand` | string/number | No | Value or field path (prefix with `$` for field reference) |
| `target` | string | Yes | Target field path |
| `decimals` | number | No | Decimal places for result |

```typescript
{ op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } }
{ op: 'math', args: { operation: 'divide', source: 'cents', operand: '100', target: 'dollars', decimals: 2 } }
{ op: 'math', args: { operation: 'round', source: 'value', target: 'rounded', decimals: 0 } }
{ op: 'math', args: { operation: 'abs', source: 'balance', target: 'absoluteBalance' } }
```

### toNumber

Convert string to number.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |
| `default` | number | No | Default value if conversion fails |

```typescript
{ op: 'toNumber', args: { source: 'price' } }
{ op: 'toNumber', args: { source: 'quantity', target: 'qty', default: 0 } }
```

### toString

Convert value to string.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |

```typescript
{ op: 'toString', args: { source: 'id', target: 'idString' } }
```

### currency

Convert floats to minor units.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `decimals` | number | Yes | Decimal places (e.g., 2 for cents) |
| `round` | string | No | `round`, `floor`, or `ceil` |

```typescript
{ op: 'currency', args: { source: 'price', target: 'priceInCents', decimals: 2, round: 'round' } }
```

### unit

Convert units (g to kg, cm to m, etc).

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `from` | string | Yes | Source unit (g, kg, cm, m) |
| `to` | string | Yes | Target unit |

```typescript
{ op: 'unit', args: { source: 'weightGrams', target: 'weightKg', from: 'g', to: 'kg' } }
{ op: 'unit', args: { source: 'lengthCm', target: 'lengthM', from: 'cm', to: 'm' } }
```

### parseNumber

Parse locale-formatted number strings.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path |
| `locale` | string | No | Locale for parsing (e.g., `de-DE` for `1.234,56`) |

```typescript
{ op: 'parseNumber', args: { source: 'priceEuro', target: 'price', locale: 'de-DE' } }
{ op: 'parseNumber', args: { source: 'amount', locale: 'fr-FR' } }
```

### formatNumber

Format numbers with locale support.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `locale` | string | No | Output locale (e.g., "en-US", "de-DE"). Default: "en-US" |
| `decimals` | number | No | Number of decimal places |
| `style` | select | No | `decimal`, `currency`, `percent` |
| `currency` | string | No | Currency code (e.g., "USD", "EUR") - required for currency style |
| `useGrouping` | boolean | No | Use thousand separators |

```typescript
{ op: 'formatNumber', args: { source: 'price', target: 'priceDisplay', style: 'currency', currency: 'USD' } }
{ op: 'formatNumber', args: { source: 'rate', target: 'ratePercent', style: 'percent', decimals: 1 } }
{ op: 'formatNumber', args: { source: 'amount', target: 'formatted', decimals: 2, useGrouping: true } }
```

### toCents

Convert a decimal amount to cents (minor currency units).

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path (decimal amount, e.g., 19.99) |
| `target` | string | Yes | Target field path (cents, e.g., 1999) |
| `round` | string | No | Rounding mode: `round`, `floor`, `ceil` |

```typescript
{ op: 'toCents', args: { source: 'price', target: 'priceInCents' } }
{ op: 'toCents', args: { source: 'amount', target: 'centAmount', round: 'floor' } }
```

### round

Round a number to a specified number of decimal places.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |
| `decimals` | number | No | Decimal places (default: 0) |
| `mode` | string | No | Rounding mode: `round`, `floor`, `ceil` |

```typescript
{ op: 'round', args: { source: 'price', decimals: 2 } }
{ op: 'round', args: { source: 'weight', target: 'roundedWeight', decimals: 1, mode: 'ceil' } }
```

---

## Date Operators

### dateFormat

Format a date to a string.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `format` | string | Yes | Output format (e.g., `YYYY-MM-DD`) |
| `inputFormat` | string | No | Input format if source is string |
| `timezone` | string | No | Timezone (e.g., `UTC`, `Europe/London`) |

```typescript
{ op: 'dateFormat', args: { source: 'createdAt', target: 'dateStr', format: 'YYYY-MM-DD' } }
{ op: 'dateFormat', args: { source: 'timestamp', target: 'formatted', format: 'DD/MM/YYYY HH:mm', timezone: 'Europe/London' } }
```

### dateParse

Parse a string to a date.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `format` | string | Yes | Input format |
| `timezone` | string | No | Timezone |

```typescript
{ op: 'dateParse', args: { source: 'dateStr', target: 'date', format: 'MM/DD/YYYY' } }
```

### dateAdd

Add or subtract time from a date.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `amount` | number | Yes | Amount (negative to subtract) |
| `unit` | string | Yes | `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years` |

```typescript
{ op: 'dateAdd', args: { source: 'orderDate', target: 'expiresAt', amount: 30, unit: 'days' } }
{ op: 'dateAdd', args: { source: 'createdAt', target: 'previousDay', amount: -1, unit: 'days' } }
```

### dateDiff

Calculate the difference between two dates.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `startDate` | string | Yes | Start date field path |
| `endDate` | string | Yes | End date field path |
| `target` | string | Yes | Target field path |
| `unit` | select | Yes | `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years` |
| `absolute` | boolean | No | Return absolute value (no negative numbers) |

```typescript
{ op: 'dateDiff', args: { startDate: 'createdAt', endDate: 'completedAt', target: 'durationDays', unit: 'days' } }
{ op: 'dateDiff', args: { startDate: 'orderDate', endDate: 'deliveryDate', target: 'deliveryHours', unit: 'hours', absolute: true } }
```

### now

Set the current timestamp on a field.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `target` | string | Yes | Target field path |
| `format` | string | No | `ISO`, `timestamp`, `date`, `datetime`, or custom format |
| `timezone` | string | No | Timezone (e.g., `UTC`, `Europe/London`) |

```typescript
{ op: 'now', args: { target: 'processedAt' } }
{ op: 'now', args: { target: 'dateOnly', format: 'date' } }
{ op: 'now', args: { target: 'localTime', format: 'YYYY-MM-DD HH:mm:ss', timezone: 'America/New_York' } }
```

---

## Logic Operators

### when

Filter records by conditions.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `conditions` | array | Yes | Array of condition objects |
| `action` | string | Yes | `keep` or `drop` |

Condition operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `notContains`, `startsWith`, `endsWith`, `regex`, `exists`, `isNull`

```typescript
{ op: 'when', args: {
    conditions: [{ field: 'price', cmp: 'gt', value: 0 }],
    action: 'keep'
}}
{ op: 'when', args: {
    conditions: [{ field: 'status', cmp: 'in', value: ['active', 'pending'] }],
    action: 'keep'
}}
```

### ifThenElse

Set a value based on a condition.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `condition` | object | Yes | Condition object |
| `thenValue` | any | Yes | Value if condition is true |
| `elseValue` | any | No | Value if condition is false |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'ifThenElse', args: {
    condition: { field: 'type', cmp: 'eq', value: 'digital' },
    thenValue: true,
    elseValue: false,
    target: 'isDigital',
}}
```

### switch

Set a value based on multiple conditions.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field to switch on |
| `cases` | array | Yes | Array of `{ value, result }` objects |
| `default` | any | No | Default value |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'switch', args: {
    source: 'status',
    cases: [
        { value: 'A', result: 'Active' },
        { value: 'I', result: 'Inactive' },
        { value: 'P', result: 'Pending' },
    ],
    default: 'Unknown',
    target: 'statusText',
}}
```

### deltaFilter

Filter out unchanged records using stable hashing.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `idPath` | string | Yes | Record identifier field |
| `includePaths` | array | No | Fields to include in hash |
| `excludePaths` | array | No | Fields to exclude from hash |

```typescript
{ op: 'deltaFilter', args: { idPath: 'sku', includePaths: ['name', 'price', 'stock'] } }
{ op: 'deltaFilter', args: { idPath: 'id', excludePaths: ['updatedAt', 'createdAt'] } }
```

---

## JSON Operators

### pick

Keep only specified fields.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `fields` | array | Yes | Array of field paths to keep |

```typescript
{ op: 'pick', args: { fields: ['id', 'name', 'slug', 'sku', 'price'] } }
```

### omit

Remove specified fields.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `fields` | array | Yes | Array of field paths to remove |

```typescript
{ op: 'omit', args: { fields: ['_internal', 'tempId', 'debug'] } }
```

### parseJson

Parse a JSON string to an object.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |

```typescript
{ op: 'parseJson', args: { source: 'metadataJson', target: 'metadata' } }
```

### stringifyJson

Convert object to JSON string.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path (defaults to source) |
| `pretty` | boolean | No | Pretty print output |

```typescript
{ op: 'stringifyJson', args: { source: 'config', target: 'configJson', pretty: true } }
```

---

## Array Operators

### flatten

Flatten a nested array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source array field path |
| `target` | string | No | Target field path (defaults to source) |
| `depth` | number | No | How deep to flatten (default: 1) |

```typescript
{ op: 'flatten', args: { source: 'nestedCategories', target: 'categories' } }
{ op: 'flatten', args: { source: 'deepArray', depth: 2 } }
```

### unique

Remove duplicate values from an array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source array field path |
| `target` | string | No | Target field path |
| `by` | string | No | Object key for uniqueness (for arrays of objects) |

```typescript
{ op: 'unique', args: { source: 'tags' } }
{ op: 'unique', args: { source: 'variants', target: 'uniqueVariants', by: 'sku' } }
```

### first

Get the first element of an array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source array path |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'first', args: { source: 'images', target: 'featuredImage' } }
```

### last

Get the last element of an array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source array path |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'last', args: { source: 'history', target: 'latestEntry' } }
```

### count

Count elements in an array.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'count', args: { source: 'variants', target: 'variantCount' } }
```

### expand

Expand an array field into multiple records (one per element).

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `path` | string | Yes | Path to the array to expand (e.g., "variants" or "lines") |
| `mergeParent` | boolean | No | Include all parent fields in expanded records |
| `parentFields` | json | No | Map of target field names to source paths (e.g., `{"productId": "id", "productName": "name"}`) |

```typescript
{ op: 'expand', args: { path: 'variants' } }
{ op: 'expand', args: { path: 'lineItems', mergeParent: true } }
{ op: 'expand', args: { path: 'variants', parentFields: { productId: 'id', productName: 'name' } } }
```

This operator changes the record count. For example, 1 product with 3 variants becomes 3 records.

---

## Aggregation Operators

### aggregate

Compute aggregates over records.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `op` | select | Yes | `count`, `sum`, `avg`, `min`, `max` |
| `source` | string | No | Source field path (required for sum/avg/min/max) |
| `target` | string | Yes | Target field path |

```typescript
{ op: 'aggregate', args: { op: 'count', target: 'totalRecords' } }
{ op: 'aggregate', args: { op: 'sum', source: 'quantity', target: 'totalQuantity' } }
{ op: 'aggregate', args: { op: 'avg', source: 'price', target: 'averagePrice' } }
{ op: 'aggregate', args: { op: 'min', source: 'price', target: 'lowestPrice' } }
{ op: 'aggregate', args: { op: 'max', source: 'price', target: 'highestPrice' } }
```

### multiJoin

Merge records from two datasets by matching on key fields. Supports INNER, LEFT, RIGHT, and FULL join types with optional prefix and field selection.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `leftKey` | string | Yes | Key field path in the current (left) dataset |
| `rightKey` | string | Yes | Key field path in the right dataset |
| `rightDataPath` | string | Yes | JSON path to the right dataset (e.g., `$.steps.prices.output`) |
| `type` | select | No | Join type: `INNER`, `LEFT`, `RIGHT`, `FULL` (default: `INNER`) |
| `prefix` | string | No | Prefix for joined fields from right dataset (e.g., `price_`) |
| `select` | array | No | Specific fields to include from the right dataset. If omitted, all fields are included |

```typescript
// Inner join products with prices by product ID
{ op: 'multiJoin', args: {
    leftKey: 'productId',
    rightKey: 'id',
    rightDataPath: '$.steps.prices.output',
    type: 'INNER',
} }

// Left join with prefix to avoid field name collisions
{ op: 'multiJoin', args: {
    leftKey: 'sku',
    rightKey: 'sku',
    rightDataPath: '$.steps.inventory.output',
    type: 'LEFT',
    prefix: 'inv_',
} }

// Join with specific fields from right dataset
{ op: 'multiJoin', args: {
    leftKey: 'id',
    rightKey: 'productId',
    rightDataPath: '$.steps.reviews.output',
    type: 'LEFT',
    select: ['rating', 'reviewCount'],
} }
```

---

## File Operators

### imageResize

Resize base64-encoded images using sharp. Supports width, height, fit modes, output format, and quality settings.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `sourceField` | string | Yes | Field path containing the base64-encoded image |
| `targetField` | string | No | Target field path (defaults to source) |
| `width` | number | No | Target width in pixels |
| `height` | number | No | Target height in pixels |
| `fit` | select | No | Resize fit mode: `cover`, `contain`, `fill`, `inside`, `outside` (default: `cover`) |
| `format` | select | No | Output format: `jpeg`, `png`, `webp`, `avif` |
| `quality` | number | No | Output quality (1-100). Default varies by format |

```typescript
// Resize to specific dimensions
{ op: 'imageResize', args: { sourceField: 'photo', width: 800, height: 600, fit: 'cover' } }

// Resize and convert to WebP
{ op: 'imageResize', args: { sourceField: 'image', width: 400, format: 'webp', quality: 85 } }

// Resize to fit within bounds
{ op: 'imageResize', args: { sourceField: 'banner', targetField: 'thumbnail', width: 200, height: 200, fit: 'inside' } }
```

**Note**: Requires the `sharp` package to be installed.

### imageConvert

Convert image format (JPEG, PNG, WebP, AVIF, GIF). Reads a base64-encoded image and re-encodes it in the target format.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `sourceField` | string | Yes | Field path containing the base64-encoded image |
| `targetField` | string | No | Target field path (defaults to source) |
| `format` | select | Yes | Target format: `jpeg`, `png`, `webp`, `avif`, `gif` |
| `quality` | number | No | Output quality (1-100). Default varies by format |

```typescript
// Convert to WebP for smaller file sizes
{ op: 'imageConvert', args: { sourceField: 'image', format: 'webp', quality: 90 } }

// Convert to JPEG with quality setting
{ op: 'imageConvert', args: { sourceField: 'photo', targetField: 'jpegPhoto', format: 'jpeg', quality: 80 } }

// Convert to AVIF for modern browsers
{ op: 'imageConvert', args: { sourceField: 'image', format: 'avif', quality: 75 } }
```

**Note**: Requires the `sharp` package to be installed.

### pdfGenerate

Generate a PDF document from an HTML template with `{{field}}` placeholders using pdf-lib. Each record produces a base64-encoded PDF stored in the target field. You can provide the template as a static string (`template`) or read it from a record field (`templateField`).

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `template` | string | No | Static HTML template with `{{field}}` placeholders (use this or `templateField`) |
| `templateField` | string | No | Record field containing the HTML template (use this or `template`) |
| `targetField` | string | Yes | Field path to store the generated base64-encoded PDF |
| `pageSize` | select | No | Page size: `A4`, `LETTER`, `A3` (default: `A4`) |
| `orientation` | select | No | Page orientation: `PORTRAIT`, `LANDSCAPE` (default: `PORTRAIT`) |

```typescript
// Generate a simple invoice PDF
{ op: 'pdfGenerate', args: {
    template: '<h1>Invoice #{{invoiceNumber}}</h1><p>Customer: {{customerName}}</p><p>Total: {{total}}</p>',
    targetField: 'invoice_pdf',
} }

// Generate a product label in landscape
{ op: 'pdfGenerate', args: {
    template: '<h2>{{name}}</h2><p>SKU: {{sku}}</p><p>{{description}}</p>',
    targetField: 'label_pdf',
    pageSize: 'LETTER',
    orientation: 'LANDSCAPE',
} }

// Use a template stored in a record field
{ op: 'pdfGenerate', args: {
    templateField: 'htmlTemplate',
    targetField: 'document_pdf',
    pageSize: 'A3',
} }
```

---

## Validation Operators

### validateRequired

Mark records as invalid if required fields are missing.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `fields` | array | Yes | Array of required field paths |
| `errorField` | string | No | Field to store validation errors |

```typescript
{ op: 'validateRequired', args: { fields: ['sku', 'name', 'price'] } }
```

### validateFormat

Validate field format using regex.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `field` | string | Yes | Field path to validate |
| `pattern` | string | Yes | Regex pattern |
| `errorField` | string | No | Field to store error |
| `errorMessage` | string | No | Custom error message |

```typescript
{ op: 'validateFormat', args: { field: 'sku', pattern: '^[A-Z0-9-]+$', errorMessage: 'Invalid SKU format' } }
{ op: 'validateFormat', args: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$' } }
```

---

## Script Operator

Execute custom JavaScript for complex transformations that can't be achieved with built-in operators.

### script

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `code` | code | Yes | JavaScript code to execute. Receives `record`, `index`, `context` (single mode) or `records`, `context` (batch mode). Must return the transformed result. |
| `batch` | boolean | No | If true, processes all records at once. If false (default), processes one record at a time. |
| `timeout` | number | No | Maximum execution time in milliseconds (default: 5000) |
| `failOnError` | boolean | No | If true, errors fail the entire step. If false, errors are logged and records skipped. |
| `context` | json | No | Optional JSON data passed to the script as `context.data` |

**Single Record Mode** (default):

The code receives `record`, `index`, and `context`. Return the modified record (or `null` to exclude).

```typescript
{ op: 'script', args: {
    code: `
        const margin = (record.price - record.cost) / record.price * 100;
        return { ...record, margin: Math.round(margin * 100) / 100 };
    `,
}}

// Filter out records by returning null
{ op: 'script', args: {
    code: `return record.stock > 0 ? record : null;`,
}}

// Use context data
{ op: 'script', args: {
    context: { taxRate: 0.2, currency: 'USD' },
    code: `
        const tax = record.price * context.data.taxRate;
        return { ...record, priceWithTax: record.price + tax, currency: context.data.currency };
    `,
}}
```

**Batch Mode**:

The code receives `records` array and `context`. Return the modified array.

```typescript
{ op: 'script', args: {
    batch: true,
    code: `
        // Sort and rank all records
        const sorted = records.sort((a, b) => b.sales - a.sales);
        return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
    `,
}}

// Calculate aggregate and add to each record
{ op: 'script', args: {
    batch: true,
    code: `
        const total = records.reduce((sum, r) => sum + r.amount, 0);
        return records.map(r => ({ ...r, percentOfTotal: r.amount / total * 100 }));
    `,
}}
```

**Available in Script Context**:
- `record` (single mode) or `records` (batch mode)
- `index` (single mode) - current record index
- `context` - contains `{ total, data, index }`
- `Array`, `Object`, `String`, `Number`, `Boolean`, `Date`, `JSON`, `Math`
- `parseInt`, `parseFloat`, `isNaN`, `isFinite`
- `encodeURIComponent`, `decodeURIComponent`
- `console.log`, `console.warn`, `console.error` (logged to pipeline logs)

**Security**: Scripts run in a sandboxed environment with limited globals. They cannot access the filesystem, network, or Node.js APIs.

---

## Quick Reference

| Category | Operators |
|----------|-----------|
| Data (8) | `set`, `copy`, `rename`, `remove`, `map`, `template`, `hash`, `uuid` |
| String (12) | `trim`, `uppercase`, `lowercase`, `slugify`, `split`, `join`, `concat`, `replace`, `extractRegex`, `replaceRegex`, `stripHtml`, `truncate` |
| Numeric (9) | `math`, `toNumber`, `toString`, `currency`, `unit`, `parseNumber`, `formatNumber`, `toCents`, `round` |
| Date (5) | `dateFormat`, `dateParse`, `dateAdd`, `dateDiff`, `now` |
| Logic (4) | `when`, `ifThenElse`, `switch`, `deltaFilter` |
| JSON (4) | `pick`, `omit`, `parseJson`, `stringifyJson` |
| Enrichment (5) | `lookup`, `enrich`, `coalesce`, `default`, `httpLookup` |
| Array (6) | `flatten`, `count`, `unique`, `first`, `last`, `expand` |
| Aggregation (2) | `aggregate`, `multiJoin` |
| File (3) | `imageResize`, `imageConvert`, `pdfGenerate` |
| Validation (2) | `validateRequired`, `validateFormat` |
| Advanced (1) | `script` |
