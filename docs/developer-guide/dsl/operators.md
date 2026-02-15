# Transform Operators

Complete reference for all transform operators.

## Operator Syntax

Operators are defined in transform steps:

```typescript
.transform('step-key', {
    operators: [
        { op: 'operator-name', args: { ...options } },
    ],
})
```

---

## Data Operators

### set

Set a static value at a path:

```typescript
{ op: 'set', args: { path: 'enabled', value: true } }
{ op: 'set', args: { path: 'status', value: 'active' } }
{ op: 'set', args: { path: 'count', value: 0 } }
```

### copy

Copy a field value to another field:

```typescript
{ op: 'copy', args: { source: 'sku', target: 'productCode' } }
{ op: 'copy', args: { source: 'pricing.retail.amount', target: 'price' } }
```

### rename

Rename a field:

```typescript
{ op: 'rename', args: { from: 'product_name', to: 'name' } }
```

### remove

Remove a field:

```typescript
{ op: 'remove', args: { path: 'tempId' } }
{ op: 'remove', args: { path: 'internal.code' } }
```

### map

Transform records via field mapping (object of dst→src dot-paths):

```typescript
{ op: 'map', args: {
    mapping: {
        'name': 'product_name',
        'sku': 'item_code',
        'price': 'pricing.retail',
    },
}}
```

### lookup

Lookup value from a map and set to target field:

```typescript
{ op: 'lookup', args: {
    source: 'statusCode',
    map: {
        'A': 'active',
        'I': 'inactive',
        'D': 'deleted',
    },
    target: 'status',
    default: 'unknown',
}}
```

### template

Render a string template using `${path.to.field}` syntax:

```typescript
{ op: 'template', args: {
    template: '${sku}-${name}',
    target: 'slug',
}}

{ op: 'template', args: {
    template: '${firstName} ${lastName}',
    target: 'fullName',
}}

{ op: 'template', args: {
    template: 'https://store.com/products/${slug}',
    target: 'url',
}}
```

### enrich

Enrich or default fields on records:

```typescript
{ op: 'enrich', args: {
    set: { 'status': 'active' },           // Always set these values
    defaults: { 'enabled': true },          // Only set if missing
}}
```

### default

Set a default value if field is null or undefined:

```typescript
{ op: 'default', args: { path: 'enabled', value: true } }
{ op: 'default', args: { path: 'stock', value: 0 } }
```

### coalesce

Return the first non-null value from a list of paths:

```typescript
{ op: 'coalesce', args: {
    paths: ['preferredName', 'firstName', 'username'],
    target: 'displayName',
    default: 'Anonymous',
}}
```

### hash

Generate a cryptographic hash of field value(s):

```typescript
{ op: 'hash', args: { source: 'email', target: 'emailHash' } }
{ op: 'hash', args: { source: 'email', target: 'emailHash', algorithm: 'md5' } }
{ op: 'hash', args: { source: ['sku', 'name', 'price'], target: 'contentHash', algorithm: 'sha256' } }
{ op: 'hash', args: { source: 'payload', target: 'signature', algorithm: 'sha512', encoding: 'base64' } }
```

- `source` (required): Single field path or array of paths to hash together
- `target` (required): Field path for the hash result
- `algorithm`: `md5`, `sha1`, `sha256`, `sha512` (default: `sha256`)
- `encoding`: `hex`, `base64` (default: `hex`)

### uuid

Generate a UUID for each record:

```typescript
{ op: 'uuid', args: { target: 'id' } }
{ op: 'uuid', args: { target: 'id', version: 'v4' } }
{ op: 'uuid', args: { target: 'stableId', version: 'v5', namespace: 'dns', source: 'domain' } }
```

- `target` (required): Field path for the UUID
- `version`: `v4` (random) or `v5` (namespace-based deterministic). Default: `v4`
- `namespace`: For v5 -- UUID namespace or well-known name (`dns`, `url`, `oid`, `x500`)
- `source`: For v5 -- field path containing the name to hash

---

## String Operators

### trim

Remove whitespace from a string field:

```typescript
{ op: 'trim', args: { path: 'name' } }
{ op: 'trim', args: { path: 'description', mode: 'start' } }  // start, end, or both
```

### uppercase

Convert to uppercase:

```typescript
{ op: 'uppercase', args: { path: 'sku' } }
```

### lowercase

Convert to lowercase:

```typescript
{ op: 'lowercase', args: { path: 'email' } }
```

### slugify

Generate a URL-friendly slug:

```typescript
{ op: 'slugify', args: { source: 'name', target: 'slug' } }
{ op: 'slugify', args: { source: 'title', target: 'slug', separator: '_' } }
```

### split

Split string into array by delimiter:

```typescript
{ op: 'split', args: { source: 'tags', target: 'tagList', delimiter: ',' } }
{ op: 'split', args: { source: 'path', target: 'segments', delimiter: '/', trim: true } }
```

### join

Join array into string:

```typescript
{ op: 'join', args: { source: 'categories', target: 'categoryPath', delimiter: ' > ' } }
```

### concat

Concatenate multiple fields:

```typescript
{ op: 'concat', args: {
    sources: ['firstName', 'lastName'],
    target: 'fullName',
    separator: ' ',
}}
```

### replace

Replace text in a string field:

```typescript
{ op: 'replace', args: { path: 'description', search: '\n', replacement: '<br>' } }
{ op: 'replace', args: { path: 'sku', search: '-', replacement: '_', all: true } }
```

### extractRegex

Extract a value from a string field using a regular expression with capture groups:

```typescript
{ op: 'extractRegex', args: { source: 'url', target: 'domain', pattern: 'https?://([^/]+)' } }
{ op: 'extractRegex', args: { source: 'sku', target: 'prefix', pattern: '^([A-Z]+)-\\d+', group: 1 } }
{ op: 'extractRegex', args: { source: 'title', target: 'year', pattern: '(\\d{4})', flags: 'i' } }
```

- `source` (required): Source field path containing the string to match
- `target` (required): Target field path for the extracted value
- `pattern` (required): Regular expression pattern (without delimiters)
- `group`: Capture group index to extract (0 = full match, 1+ = capture groups). Default: `1`
- `flags`: Regex flags (e.g., `i` for case-insensitive)

### replaceRegex

Replace values in a string field using a regular expression:

```typescript
{ op: 'replaceRegex', args: { path: 'description', pattern: '<[^>]+>', replacement: '' } }
{ op: 'replaceRegex', args: { path: 'phone', pattern: '[^\\d+]', replacement: '', flags: 'g' } }
{ op: 'replaceRegex', args: { path: 'text', pattern: '(\\w+)@(\\w+)', replacement: '$1 at $2', flags: 'gi' } }
```

- `path` (required): Field path containing the string to modify
- `pattern` (required): Regular expression pattern (without delimiters)
- `replacement` (required): Replacement string (use `$1`, `$2` for capture groups)
- `flags`: Regex flags (e.g., `gi` for global case-insensitive). Default: `g`

### stripHtml

Remove HTML tags from a string field, preserving text content:

```typescript
{ op: 'stripHtml', args: { source: 'description' } }
{ op: 'stripHtml', args: { source: 'htmlContent', target: 'plainText' } }
```

- `source` (required): Source field path containing the HTML string
- `target`: Target field path for the stripped text. Defaults to `source` if not set

### truncate

Truncate a string to a maximum length with an optional suffix:

```typescript
{ op: 'truncate', args: { source: 'description', length: 100 } }
{ op: 'truncate', args: { source: 'title', target: 'shortTitle', length: 50, suffix: '...' } }
```

- `source` (required): Source field path containing the string to truncate
- `target`: Target field path for the truncated string. Defaults to `source` if not set
- `length` (required): Maximum length of the resulting string
- `suffix`: Suffix to append when truncated (e.g., `...`). Default: none

---

## Numeric Operators

### math

Perform math operations on numeric fields:

```typescript
// Rounding operations
{ op: 'math', args: { operation: 'round', source: 'price', target: 'roundedPrice', decimals: 2 } }
{ op: 'math', args: { operation: 'floor', source: 'quantity', target: 'floorQty' } }
{ op: 'math', args: { operation: 'ceil', source: 'quantity', target: 'ceilQty' } }
{ op: 'math', args: { operation: 'abs', source: 'balance', target: 'absBalance' } }

// Arithmetic operations
{ op: 'math', args: { operation: 'add', source: 'price', operand: '10', target: 'adjustedPrice' } }
{ op: 'math', args: { operation: 'subtract', source: 'total', operand: '$discount', target: 'finalPrice' } }
{ op: 'math', args: { operation: 'multiply', source: 'price', operand: '100', target: 'priceInCents' } }
{ op: 'math', args: { operation: 'divide', source: 'priceInCents', operand: '100', target: 'price' } }
{ op: 'math', args: { operation: 'modulo', source: 'index', operand: '10', target: 'bucket' } }
{ op: 'math', args: { operation: 'power', source: 'base', operand: '2', target: 'squared' } }
```

Operations: `add`, `subtract`, `multiply`, `divide`, `modulo`, `power`, `round`, `floor`, `ceil`, `abs`

Operand can be a number or a field path starting with `$`.

### toNumber

Convert a string field to a number:

```typescript
{ op: 'toNumber', args: { source: 'priceStr' } }
{ op: 'toNumber', args: { source: 'quantity', target: 'qty', default: 0 } }
```

### toString

Convert a value to a string:

```typescript
{ op: 'toString', args: { source: 'id' } }
{ op: 'toString', args: { source: 'price', target: 'priceText' } }
```

### currency

Convert floats to minor units (for Vendure price handling):

```typescript
{ op: 'currency', args: { source: 'price', target: 'priceInCents', decimals: 2 } }
{ op: 'currency', args: { source: 'amount', target: 'cents', decimals: 2, round: 'floor' } }
```

### unit

Convert units (weight and length):

```typescript
{ op: 'unit', args: { source: 'weightG', target: 'weightKg', from: 'g', to: 'kg' } }
{ op: 'unit', args: { source: 'heightCm', target: 'heightM', from: 'cm', to: 'm' } }
```

Supported units: `g`, `kg`, `lb`, `oz`, `cm`, `m`, `mm`, `in`, `ft`, `ml`, `l`, `gal`

### parseNumber

Parse a string to a number with locale-aware decimal and thousand separator handling:

```typescript
{ op: 'parseNumber', args: { source: 'priceStr' } }
{ op: 'parseNumber', args: { source: 'germanPrice', target: 'price', locale: 'de-DE' } }
{ op: 'parseNumber', args: { source: 'amount', locale: 'fr-FR', default: 0 } }
```

- `source` (required): Source field path containing the string to parse
- `target`: Target field path for the parsed number. Defaults to `source` if not set
- `locale`: Locale for parsing (e.g., `en-US`, `de-DE`, `fr-FR`). Affects decimal/thousand separators
- `default`: Value to use if parsing fails

### formatNumber

Format a number as a localized string with optional currency or percent formatting:

```typescript
{ op: 'formatNumber', args: { source: 'price', target: 'priceText', locale: 'en-US', decimals: 2 } }
{ op: 'formatNumber', args: { source: 'price', target: 'priceDisplay', locale: 'de-DE', style: 'currency', currency: 'EUR' } }
{ op: 'formatNumber', args: { source: 'ratio', target: 'percentage', style: 'percent', decimals: 1 } }
{ op: 'formatNumber', args: { source: 'count', target: 'countStr', locale: 'en-US', useGrouping: true } }
```

- `source` (required): Source field path containing the number
- `target` (required): Target field path for the formatted string
- `locale`: Locale for formatting (e.g., `en-US`, `de-DE`). Default: `en-US`
- `decimals`: Number of decimal places
- `style`: Format style -- `decimal`, `currency`, `percent`
- `currency`: Currency code (e.g., `USD`, `EUR`). Required when style is `currency`
- `useGrouping`: Whether to use thousand separators

### toCents

Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds:

```typescript
{ op: 'toCents', args: { source: 'price', target: 'priceInCents' } }
{ op: 'toCents', args: { source: 'amount', target: 'cents', round: 'floor' } }
```

- `source` (required): Field containing decimal amount (e.g., `19.99`)
- `target` (required): Field for cents amount (e.g., `1999`)
- `round`: Rounding mode -- `round`, `floor`, `ceil`. Default: `round`

### round

Round a number to a specified number of decimal places:

```typescript
{ op: 'round', args: { source: 'price' } }
{ op: 'round', args: { source: 'price', target: 'roundedPrice', decimals: 2 } }
{ op: 'round', args: { source: 'quantity', decimals: 0, mode: 'ceil' } }
```

- `source` (required): Source field path containing the number to round
- `target`: Target field path for the rounded number. Defaults to `source` if not set
- `decimals`: Number of decimal places. Default: `0` (round to integer)
- `mode`: Rounding mode -- `round`, `floor`, `ceil`. Default: `round`

---

## Date Operators

### dateParse

Parse a string to a date:

```typescript
{ op: 'dateParse', args: { source: 'dateStr', target: 'date', format: 'YYYY-MM-DD' } }
{ op: 'dateParse', args: { source: 'timestamp', target: 'date', format: 'MM/DD/YYYY', timezone: 'UTC' } }
```

### dateFormat

Format a date to a string:

```typescript
{ op: 'dateFormat', args: { source: 'createdAt', target: 'dateStr', format: 'YYYY-MM-DD' } }
{ op: 'dateFormat', args: { source: 'date', target: 'formatted', format: 'DD/MM/YYYY HH:mm', timezone: 'Europe/London' } }
```

### dateAdd

Add or subtract time from a date:

```typescript
{ op: 'dateAdd', args: { source: 'startDate', target: 'expiresAt', amount: 30, unit: 'days' } }
{ op: 'dateAdd', args: { source: 'now', target: 'yesterday', amount: -1, unit: 'days' } }
```

Units: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years`

### dateDiff

Calculate the difference between two dates in a specified unit:

```typescript
{ op: 'dateDiff', args: { startDate: 'createdAt', endDate: 'closedAt', target: 'daysOpen', unit: 'days' } }
{ op: 'dateDiff', args: { startDate: 'birthDate', endDate: 'registrationDate', target: 'ageAtRegistration', unit: 'years' } }
{ op: 'dateDiff', args: { startDate: 'startTime', endDate: 'endTime', target: 'durationMinutes', unit: 'minutes', absolute: true } }
```

- `startDate` (required): Field path containing the start date
- `endDate` (required): Field path containing the end date
- `target` (required): Target field path for the result
- `unit` (required): Result unit -- `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years`
- `absolute`: Return absolute value (no negative numbers). Default: `false`

### now

Set the current timestamp on a field:

```typescript
{ op: 'now', args: { target: 'importedAt' } }
{ op: 'now', args: { target: 'syncDate', format: 'date' } }
{ op: 'now', args: { target: 'timestamp', format: 'timestamp' } }
{ op: 'now', args: { target: 'lastUpdated', format: 'datetime', timezone: 'Europe/Berlin' } }
```

- `target` (required): Target field path for the current timestamp
- `format`: Output format -- `ISO` (default, e.g., `2024-01-15T10:30:00.000Z`), `timestamp` (Unix ms), `date` (`YYYY-MM-DD`), `datetime` (`YYYY-MM-DD HH:mm:ss`), or a custom format string
- `timezone`: Timezone (e.g., `UTC`, `Europe/London`, `America/New_York`). Default: `UTC`

---

## Logic Operators

### when

Filter records by conditions:

```typescript
{ op: 'when', args: {
    conditions: [
        { field: 'price', cmp: 'gt', value: 0 },
        { field: 'enabled', cmp: 'eq', value: true },
    ],
    action: 'keep',  // or 'drop'
}}
```

Condition comparators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `notContains`, `startsWith`, `endsWith`, `regex`, `exists`, `isNull`

### deltaFilter

Filter out unchanged records using checkpoint hashing:

```typescript
{ op: 'deltaFilter', args: {
    idPath: 'sku',
    includePaths: ['name', 'price', 'stock'],  // Optional: only hash these fields
}}

{ op: 'deltaFilter', args: {
    idPath: 'id',
    excludePaths: ['updatedAt', 'syncedAt'],  // Optional: ignore these when hashing
}}
```

### ifThenElse

Set a value based on a condition:

```typescript
{ op: 'ifThenElse', args: {
    condition: { field: 'type', cmp: 'eq', value: 'digital' },
    thenValue: true,
    elseValue: false,
    target: 'isDigital',
}}

{ op: 'ifThenElse', args: {
    condition: { field: 'price', cmp: 'gt', value: 100 },
    thenValue: 'premium',
    elseValue: 'standard',
    target: 'tier',
}}
```

### switch

Set a value based on multiple conditions (like a switch statement):

```typescript
{ op: 'switch', args: {
    source: 'status',
    cases: [
        { value: 'A', result: 'Active' },
        { value: 'I', result: 'Inactive' },
        { value: 'D', result: 'Deleted' },
    ],
    default: 'Unknown',
    target: 'statusText',
}}
```

---

## JSON Operators

### parseJson

Parse a JSON string field into an object:

```typescript
{ op: 'parseJson', args: { source: 'metadata' } }
{ op: 'parseJson', args: { source: 'configStr', target: 'config' } }
```

### stringifyJson

Convert an object to a JSON string:

```typescript
{ op: 'stringifyJson', args: { source: 'config' } }
{ op: 'stringifyJson', args: { source: 'data', target: 'dataJson', pretty: true } }
```

### pick

Keep only specific fields from a record:

```typescript
{ op: 'pick', args: { fields: ['id', 'name', 'sku', 'price'] } }
```

### omit

Remove specific fields from a record:

```typescript
{ op: 'omit', args: { fields: ['internalId', 'tempData', 'debug'] } }
```

---

## Array Operators

### flatten

Flatten a nested array:

```typescript
{ op: 'flatten', args: { source: 'nestedTags' } }
{ op: 'flatten', args: { source: 'items', target: 'flatItems', depth: 2 } }
```

### unique

Remove duplicate values from an array:

```typescript
{ op: 'unique', args: { source: 'tags' } }
{ op: 'unique', args: { source: 'variants', by: 'sku' } }  // Unique by object key
```

### first

Get the first element of an array:

```typescript
{ op: 'first', args: { source: 'images', target: 'mainImage' } }
{ op: 'first', args: { source: 'variants', target: 'defaultVariant' } }
```

### last

Get the last element of an array:

```typescript
{ op: 'last', args: { source: 'history', target: 'latestEntry' } }
```

### count

Count elements in an array or characters in a string:

```typescript
{ op: 'count', args: { source: 'variants', target: 'variantCount' } }
{ op: 'count', args: { source: 'description', target: 'charCount' } }
```

---

## Validation Operators

### validateRequired

Mark records as invalid if required fields are missing:

```typescript
{ op: 'validateRequired', args: { fields: ['sku', 'name', 'price'] } }
{ op: 'validateRequired', args: { fields: ['email'], errorField: 'validationErrors' } }
```

Records failing validation are quarantined.

### validateFormat

Validate field format using regex:

```typescript
{ op: 'validateFormat', args: { field: 'sku', pattern: '^[A-Z0-9-]+$' } }
{ op: 'validateFormat', args: { field: 'email', pattern: '^[^@]+@[^@]+\\.[^@]+$', errorMessage: 'Invalid email format' } }
```

---

## Aggregation Operators

### aggregate

Compute aggregates over records:

```typescript
{ op: 'aggregate', args: { op: 'count', target: 'totalCount' } }
{ op: 'aggregate', args: { op: 'sum', source: 'quantity', target: 'totalQuantity' } }
```

Operations: `count`, `sum`, `avg`, `min`, `max`, `first`, `last`

### expand

Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance:

```typescript
{ op: 'expand', args: { path: 'variants' } }
{ op: 'expand', args: { path: 'variants', mergeParent: true } }
{ op: 'expand', args: {
    path: 'lines',
    parentFields: {
        'orderId': 'id',
        'orderDate': 'createdAt',
        'customerEmail': 'customer.email',
    },
}}
```

- `path` (required): Path to the array field to expand (e.g., `variants` or `lines`)
- `mergeParent`: Include all parent (non-array) fields in each expanded record
- `parentFields`: Map of specific parent fields to include -- `{ targetField: sourceFieldPath }`

---

## Enrichment Operators

### httpLookup

Enrich records by fetching data from external HTTP endpoints. Supports caching, authentication, and configurable error handling:

```typescript
// Simple GET lookup
{ op: 'httpLookup', args: {
    url: 'https://api.example.com/products/{{sku}}',
    target: 'externalData',
}}

// With response path extraction and default
{ op: 'httpLookup', args: {
    url: 'https://api.example.com/lookup?id={{productId}}',
    target: 'category',
    responsePath: 'data.category.name',
    default: 'Uncategorized',
}}

// POST with authentication and caching
{ op: 'httpLookup', args: {
    url: 'https://api.example.com/enrich',
    method: 'POST',
    bodyField: 'lookupPayload',
    target: 'enrichedData',
    bearerTokenSecretCode: 'api-token',
    cacheTtlSec: 600,
    timeoutMs: 3000,
    maxRetries: 3,
}}

// With rate limiting and concurrency control
{ op: 'httpLookup', args: {
    url: 'https://api.example.com/items/{{id}}',
    target: 'itemData',
    batchSize: 10,
    rateLimitPerSecond: 50,
    skipOn404: true,
}}
```

- `url` (required): HTTP endpoint URL. Use `{{field}}` for dynamic values from the record
- `target` (required): Field path to store the response data
- `method`: HTTP method -- `GET` or `POST`. Default: `GET`
- `responsePath`: JSON path to extract from response (e.g., `data.result`)
- `keyField`: Field to use as cache key. If not set, URL is used
- `default`: Value to use if lookup fails or returns 404
- `timeoutMs`: Request timeout in milliseconds. Default: `5000`
- `cacheTtlSec`: Cache time-to-live in seconds. Default: `300`. Set to `0` to disable
- `headers`: Static HTTP headers as JSON object
- `bearerTokenSecretCode`: Secret code for Bearer token authentication
- `apiKeySecretCode`: Secret code for API key authentication
- `apiKeyHeader`: Header name for API key. Default: `X-API-Key`
- `basicAuthSecretCode`: Secret code for Basic auth (format: `username:password`)
- `bodyField`: Field path for POST body (uses record value at this path)
- `body`: Static POST body (JSON object)
- `skipOn404`: Skip record if endpoint returns 404. Default: `false`
- `failOnError`: Fail pipeline if HTTP request fails. Default: `false`
- `maxRetries`: Maximum retry attempts on transient errors. Default: `2`
- `batchSize`: Process this many records in parallel. Default: `50`
- `rateLimitPerSecond`: Max requests per second per domain. Default: `100`

---

## Script Operators

### script

Execute inline JavaScript code for complex transformations that cannot be expressed with standard operators. Code runs in a secure sandboxed VM with timeout enforcement:

```typescript
// Single-record mode (default): receives record, index, context
{ op: 'script', args: {
    code: 'return { ...record, total: record.price * record.quantity }',
}}

// Filter records by returning null
{ op: 'script', args: {
    code: 'return record.status === "active" ? record : null',
}}

// Complex transformation with context data
{ op: 'script', args: {
    code: 'const markup = context.data.markupPercent / 100; return { ...record, price: record.cost * (1 + markup) }',
    context: { markupPercent: 30 },
}}

// Batch mode: receives records array, useful for cross-record operations
{ op: 'script', args: {
    code: 'return records.sort((a, b) => a.price - b.price)',
    batch: true,
}}

// Batch mode with running total
{ op: 'script', args: {
    code: 'let total = 0; return records.map(r => ({ ...r, runningTotal: total += r.amount }))',
    batch: true,
    timeout: 10000,
    failOnError: true,
}}
```

- `code` (required): JavaScript code to execute. In single-record mode: receives `record`, `index`, `context`. In batch mode: receives `records`, `context`. Must return the transformed result
- `batch`: If `true`, processes all records at once. If `false` (default), processes one record at a time
- `timeout`: Maximum execution time in milliseconds. Default: `5000`
- `failOnError`: If `true`, errors fail the entire step. If `false` (default), errors are logged and records skipped
- `context`: Optional JSON data passed to the script as `context.data`

---

## Combining Operators

Operators execute in order:

```typescript
.transform('process', {
    operators: [
        // First: rename fields
        { op: 'rename', args: { from: 'product_name', to: 'name' } },

        // Second: clean data
        { op: 'trim', args: { path: 'name' } },

        // Third: generate slug
        { op: 'slugify', args: { source: 'name', target: 'slug' } },

        // Fourth: validate
        { op: 'validateRequired', args: { fields: ['name', 'sku'] } },

        // Fifth: set defaults
        { op: 'default', args: { path: 'enabled', value: true } },
    ],
})
```
