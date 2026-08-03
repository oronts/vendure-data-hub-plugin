# Complete Operator Reference

**Auto-generated from OPERATOR_REGISTRY**

Total operators: **62**

This is the definitive reference for all built-in transform operators in the Data Hub plugin.

## Table of Contents

### [Aggregation Operators](#aggregation-operators)
- [aggregate](#aggregate) - Compute a simple aggregate over records and set a field on each record.
- [count](#count) - Count elements in an array or characters in a string.
- [unique](#unique) - Remove duplicate values from an array field.
- [flatten](#flatten) - Flatten a nested array into a single-level array.
- [first](#first) - Get the first element of an array.
- [last](#last) - Get the last element of an array.
- [expand](#expand) - Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance.
- [deduplicateRecords](#deduplicaterecords) - Deduplicate a record batch by a scalar key with deterministic conflict resolution.
- [multiJoin](#multijoin) - Join two datasets by matching key fields. Supports INNER, LEFT, RIGHT, and FULL OUTER join types.

### [File Operators](#file-operators)
- [imageResize](#imageresize) - Resize images referenced in record fields (base64-encoded)
- [imageConvert](#imageconvert) - Convert image format (JPEG, PNG, WebP, AVIF, GIF)
- [pdfGenerate](#pdfgenerate) - Generate a multi-page plain-text PDF from record data

### [Data Operators](#data-operators)
- [map](#map) - Transform records via field mapping. Provide a JSON object of dst -> src dot-paths.
- [set](#set) - Set a static value at a specified path.
- [remove](#remove) - Remove a field at a specified path.
- [rename](#rename) - Rename a field from one path to another.
- [copy](#copy) - Copy a field value to another path.
- [template](#template) - Render a string template and set it at target path.
- [hash](#hash) - Generate a SHA-256 or SHA-512 hash of field value(s).
- [uuid](#uuid) - Generate a UUID for each record. Supports v4 (random) and v5 (namespace-based deterministic).
- [validateRequired](#validaterequired) - Mark records as invalid if required fields are missing.
- [validateFormat](#validateformat) - Validate field format using regex.

### [Date Operators](#date-operators)
- [dateFormat](#dateformat) - Format a date field to a string.
- [dateParse](#dateparse) - Parse a string to a date.
- [dateAdd](#dateadd) - Add or subtract time from a date.
- [dateDiff](#datediff) - Calculate the difference between two dates in a specified unit.
- [now](#now) - Set the current timestamp on a field. Useful for adding created/updated timestamps.

### [Enrichment Operators](#enrichment-operators)
- [lookup](#lookup) - Lookup value from a map and set to target field.
- [coalesce](#coalesce) - Return the first non-null value from a list of field paths.
- [enrich](#enrich) - Enrich or default fields on records. 
- [default](#default) - Set a default value if field is null or undefined.
- [httpLookup](#httplookup) - Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.

### [JSON Operators](#json-operators)
- [parseJson](#parsejson) - Parse a JSON string field into an object.
- [stringifyJson](#stringifyjson) - Stringify an object field to a JSON string.
- [pick](#pick) - Pick specific fields from a record, discarding others.
- [omit](#omit) - Omit specific fields from a record.

### [Logic Operators](#logic-operators)
- [when](#when) - Filter records by conditions. Action: keep or drop.
- [ifThenElse](#ifthenelse) - Set a value based on a condition.
- [switch](#switch) - Set a value based on multiple conditions (like a switch statement).
- [deltaFilter](#deltafilter) - Detect likely record changes with a checkpointed, non-cryptographic 32-bit hash. Hash collisions are possible.

### [Numeric Operators](#numeric-operators)
- [math](#math) - Perform math operations on numeric fields.
- [currency](#currency) - Convert floats to minor units or re-map currency fields.
- [unit](#unit) - Convert units (e.g. g<->kg, cm<->m)
- [toNumber](#tonumber) - Convert a string field to a number.
- [toString](#tostring) - Convert a value to a string.
- [parseNumber](#parsenumber) - Parse a string to a number with locale-aware decimal/thousand separator handling.
- [formatNumber](#formatnumber) - Format a number as a localized string with optional currency or percent formatting.
- [toCents](#tocents) - Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds.
- [round](#round) - Round a number to a specified number of decimal places.

### [String Operators](#string-operators)
- [split](#split) - Split a string field into an array by delimiter.
- [join](#join) - Join an array field into a string.
- [trim](#trim) - Trim whitespace from a string field.
- [lowercase](#lowercase) - Convert a string field to lowercase.
- [uppercase](#uppercase) - Convert a string field to uppercase.
- [slugify](#slugify) - Generate a URL-friendly slug from a string field.
- [concat](#concat) - Concatenate multiple string fields into one.
- [replace](#replace) - Replace text in a string field.
- [extractRegex](#extractregex) - Extract a value from a string field using a regular expression pattern with capture groups.
- [replaceRegex](#replaceregex) - Replace values in a string field using a regular expression pattern.
- [stripHtml](#striphtml) - Remove HTML tags from a string field, preserving text content.
- [truncate](#truncate) - Truncate a string to a maximum length, optionally adding a suffix.

### [Scripting Operators](#scripting-operators)
- [script](#script) - Execute inline JavaScript code to transform records. Use for complex logic that cannot be expressed with standard operators.

---

## Aggregation Operators

### aggregate

Compute a simple aggregate over records and set a field on each record.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `op` | select | Yes | Operation |

**Example:**

```typescript
{ op: 'aggregate', args: {
  "op": "value"
} }
```

### count

Count elements in an array or characters in a string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'count', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### unique

Remove duplicate values from an array field.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path |
| `by` | string | No | Object key to use for uniqueness |

**Example:**

```typescript
{ op: 'unique', args: {
  "source": "sourceField"
} }
```

### flatten

Flatten a nested array into a single-level array.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source path if not set |
| `depth` | number | No | How deep to flatten (default: 1) |

**Example:**

```typescript
{ op: 'flatten', args: {
  "source": "sourceField"
} }
```

### first

Get the first element of an array.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source array path |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'first', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### last

Get the last element of an array.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source array path |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'last', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### expand

Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Path to the array to expand, such as `variants` or `lines` |
| `mergeParent` | boolean | No | Include the parent record (without the expanded array) in each result; default: `false` |
| `parentFields` | json | No | Map target field names to parent source paths; used when `mergeParent` is `false` |

**Example:**

```typescript
{ op: 'expand', args: {
  "path": "variants",
  "parentFields": { "productId": "id" }
} }
```

Object elements become output records directly. Primitive elements are placed
in `_item`. A missing, non-array, or empty value emits no records unless
`mergeParent` is `true`, in which case the unchanged parent record is emitted.

### deduplicateRecords

Deduplicate the current record batch by a type-strict scalar key.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | string | Yes | Scalar key field path |
| `keep` | select | No | `FIRST`, `LAST`, `LOWEST`, or `HIGHEST`; default `FIRST` |
| `priority` | string | Conditional | Finite numeric field path required by `LOWEST` and `HIGHEST` |

**Example:**

```typescript
{ op: 'deduplicateRecords', args: {
  key: 'sku',
  keep: 'LOWEST',
  priority: '_sourcePriority',
} }
```

The first appearance of a key determines its output position. Missing and
non-scalar keys are retained as separate records. Ordered strategies reject
missing and non-finite priorities.

### multiJoin

Join the current records to an inline reference dataset using type-strict scalar keys.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `leftKey` | string | Yes | Field path in left (primary) records to join on |
| `rightKey` | string | Yes | Field path in right records to join on |
| `rightData` | JSON array | Yes | Inline right-side objects; maximum 10,000 records |
| `type` | select | No | `INNER`, `LEFT`, `RIGHT`, or `FULL`; default `LEFT` |
| `prefix` | string | No | Prefix for emitted right-side fields |
| `select` | JSON array | No | Right-side fields to emit; omitted or empty selects all fields |
| `maxOutputRecords` | number | No | Output ceiling; default 10,000, maximum 100,000 |

**Example:**

```typescript
{ op: 'multiJoin', args: {
  leftKey: 'productId',
  rightKey: 'id',
  rightData: [
    { id: 'p1', price: 1999 },
    { id: 'p2', price: 2499 },
  ],
  type: 'LEFT',
  prefix: 'price',
  maxOutputRecords: 10000,
} }
```

Only strings, booleans, and finite numbers match, and their types must be the
same. Null, missing, array, object, and non-finite keys remain unmatched. RIGHT
and FULL joins emit unmatched right records in input order. Output exceeding
the configured ceiling fails instead of being truncated.

## File Operators

### imageResize

Resize images referenced in record fields (base64-encoded)

**Example:**

```typescript
{ op: 'imageResize', args: {} }
```

### imageConvert

Convert image format (JPEG, PNG, WebP, AVIF, GIF)

**Example:**

```typescript
{ op: 'imageConvert', args: {} }
```

### pdfGenerate

Generate a multi-page plain-text PDF from a static template or a template read
from a record field. The operator replaces nested-path `{{field.path}}`
placeholders, converts common block/line-break tags to newlines, and strips the
remaining HTML-like tags. It does not render HTML or CSS.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `template` | string | No | Static template; used when `templateField` is absent or resolves to `undefined` |
| `templateField` | string | No | Record field path containing the template |
| `targetField` | string | Yes | Field path for the base64-encoded PDF |
| `pageSize` | select | No | `A4`, `LETTER`, or `A3`; default: `A4` |
| `orientation` | select | No | `PORTRAIT` or `LANDSCAPE`; default: `PORTRAIT` |

**Example:**

```typescript
{ op: 'pdfGenerate', args: {
  "template": "Invoice {{order.code}}\nTotal: {{order.total}}",
  "targetField": "documents.invoice",
  "pageSize": "A4"
} }
```

Text wraps with standard Helvetica and continues on additional pages. `pdf-lib`
is a direct runtime dependency. A record-level rendering error preserves that
record, omits the target field, and is returned as an operator error.

## Data Operators

### map

Transform records via field mapping. Provide a JSON object of dst -> src dot-paths.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `mapping` | json | Yes | JSON object defining field mapping (target: source) |
| `passthrough` | boolean | No | If true, include fields not in mapping |

**Example:**

```typescript
{ op: 'map', args: {
  "mapping": "value"
} }
```

### set

Set a static value at a specified path.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Dot notation path where to set the value |
| `value` | json | Yes | The value to set (any valid JSON) |

**Example:**

```typescript
{ op: 'set', args: {
  "path": "sourceField",
  "value": "value"
} }
```

### remove

Remove a field at a specified path.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Dot notation path of the field to remove |

**Example:**

```typescript
{ op: 'remove', args: {
  "path": "sourceField"
} }
```

### rename

Rename a field from one path to another.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `from` | string | Yes | Source field path |
| `to` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'rename', args: {
  "from": "value",
  "to": "value"
} }
```

### copy

Copy a field value to another path.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'copy', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### template

Render a string template and set it at target path.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `template` | string | Yes | Use ${path.to.field} to substitute values |
| `target` | string | Yes | Where to store the result |
| `missingAsEmpty` | boolean | No | Treat missing fields as empty strings |

**Example:**

```typescript
{ op: 'template', args: {
  "template": "value",
  "target": "targetField"
} }
```

### hash

Generate a SHA-256 or SHA-512 hash of field value(s).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | json | Yes | Single path string or array of paths to hash together |
| `target` | string | Yes | Path where the hash will be stored |
| `algorithm` | select | No | `sha256` or `sha512`; default: `sha256` |
| `encoding` | select | No | Default: hex |

**Example:**

```typescript
{ op: 'hash', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### uuid

Generate a UUID for each record. Supports v4 (random) and v5 (namespace-based deterministic).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `target` | string | Yes | Path where the UUID will be stored |
| `version` | select | No | UUID version |

**Example:**

```typescript
{ op: 'uuid', args: {
  "target": "targetField"
} }
```

### validateRequired

Mark records as invalid if required fields are missing.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `fields` | json | Yes | Required fields (JSON array) |
| `errorField` | string | No | Field to store validation errors |

**Example:**

```typescript
{ op: 'validateRequired', args: {
  "fields": "value"
} }
```

### validateFormat

Validate field format using regex.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | Yes | Field path |
| `pattern` | string | Yes | Regex pattern |
| `errorField` | string | No | Error output field |
| `errorMessage` | string | No | Error message |

**Example:**

```typescript
{ op: 'validateFormat', args: {
  "field": "value",
  "pattern": "value"
} }
```

## Date Operators

### dateFormat

Format a date field to a string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `format` | string | Yes | e.g. YYYY-MM-DD, DD/MM/YYYY HH:mm |
| `inputFormat` | string | No | If source is string, specify its format |

Formats use the exact UTC tokens `YYYY`, `MM`, `DD`, `HH`, `mm`, and `ss`, with
a maximum length of 128 characters. Mismatched or impossible values leave the
target unchanged.

**Example:**

```typescript
{ op: 'dateFormat', args: {
  "source": "sourceField",
  "target": "targetField",
  "format": "value"
} }
```

### dateParse

Parse a string to a date.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `format` | string | Yes | Format of the source string |

The input format uses the same exact UTC token contract and 128-character
limit. Invalid values leave the target unchanged.

**Example:**

```typescript
{ op: 'dateParse', args: {
  "source": "sourceField",
  "target": "targetField",
  "format": "value"
} }
```

### dateAdd

Add or subtract time from a date.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `amount` | number | Yes | Positive to add, negative to subtract |
| `unit` | select | Yes | Unit: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years` |

> **Important:** Unit strings must be plural: `"days"`, `"hours"`, `"minutes"`, `"seconds"`, `"weeks"`, `"months"`, `"years"`. Singular forms like `"day"` are not supported.

**Example:**

```typescript
{ op: 'dateAdd', args: {
  "source": "sourceField",
  "target": "targetField",
  "amount": 10,
  "unit": "days"
} }
```

### dateDiff

Calculate the difference between two dates in a specified unit.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `startDate` | string | Yes | Start date field path |
| `endDate` | string | Yes | End date field path |
| `target` | string | Yes | Target field path |
| `unit` | select | Yes | Result unit: `seconds`, `minutes`, `hours`, `days`, `weeks`, `months`, `years` |
| `absolute` | boolean | No | Return a non-negative result; default: `false` |

> **Important:** Unit strings must be plural: `"days"`, `"hours"`, `"minutes"`, `"seconds"`, `"weeks"`, `"months"`, `"years"`. Singular forms like `"day"` are not supported.

Months and years are elapsed-time approximations of 30.44 and 365.25 days,
respectively; they are not calendar-month or anniversary calculations.

**Example:**

```typescript
{ op: 'dateDiff', args: {
  "startDate": "startDateField",
  "endDate": "endDateField",
  "target": "targetField",
  "unit": "days"
} }
```

### now

Set the current timestamp on a field. Useful for adding created/updated timestamps.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `target` | string | Yes | Target field path |
| `format` | select | No | Output format |

**Example:**

```typescript
{ op: 'now', args: {
  "target": "targetField"
} }
```

## Enrichment Operators

### lookup

Lookup value from a map and set to target field.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `map` | json | Yes | Map (JSON object) |
| `target` | string | Yes | Target field path |
| `default` | string | No | Default value |

**Example:**

```typescript
{ op: 'lookup', args: {
  "source": "sourceField",
  "map": "value",
  "target": "targetField"
} }
```

### coalesce

Return the first non-null value from a list of field paths.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `paths` | json | Yes | Array of paths to check in order |
| `target` | string | Yes | Target field path |
| `default` | json | No | Value if all paths are null |

**Example:**

```typescript
{ op: 'coalesce', args: {
  "paths": "value",
  "target": "targetField"
} }
```

### enrich

Enrich or default fields on records. 

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `set` | json | No | JSON object of fields to set (dot paths allowed) |
| `defaults` | json | No | JSON object of fields to set if currently missing (dot paths allowed) |

**Example:**

```typescript
{ op: 'enrich', args: {} }
```

### default

Set a default value if field is null or undefined.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |
| `value` | json | Yes | Default value (JSON) |

**Example:**

```typescript
{ op: 'default', args: {
  "path": "sourceField",
  "value": "value"
} }
```

### httpLookup

Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `connectionCode` | connection | No | Saved HTTP connection. Required when authentication is configured and used to bind credentials and redirects to one origin. |
| `url` | string | Yes | HTTP endpoint URL. Use {{field}} for dynamic values. |
| `method` | select | No | HTTP Method |
| `target` | string | Yes | Field path to store the response data. |
| `responsePath` | string | No | JSON path to extract from response (optional). |
| `keyField` | string | No | Optional record value included in the opaque full-request cache identity. |
| `default` | json | No | Value to use if lookup fails or returns 404. |
| `timeoutMs` | number | No | Integer from 1 to 300000 milliseconds. |
| `cacheTtlSec` | number | No | Integer from 0 to 604800 seconds. Set to 0 to disable. |
| `headers` | json | No | Non-sensitive static headers only. Credential, cookie, signature, Host, and hop-by-hop headers are rejected. |
| `bearerTokenSecretCode` | string | No | Secret Code for Bearer authentication. Missing or empty values fail before any request. |
| `apiKeySecretCode` | string | No | Secret Code for API key authentication. Missing or empty values fail before any request. |
| `apiKeyHeader` | string | No | Valid request header name for the resolved API key. Requires `apiKeySecretCode`. |
| `basicAuthSecretCode` | string | No | Secret Code resolving to `username:password`. Missing or empty values fail before any request. |
| `bodyField` | string | No | Field path for POST body (uses record value at this path). |
| `body` | json | No | Static POST body (JSON object). |
| `skipOn404` | boolean | No | Skip record if endpoint returns 404. |
| `failOnError` | boolean | No | Fail pipeline if HTTP request fails. |
| `maxRetries` | number | No | Integer from 0 to 10. |
| `batchSize` | number | No | Integer from 1 to 500 (default: 50). |
| `rateLimitPerSecond` | number | No | Integer from 1 to 10000 requests per second per domain. |

Cache entries are isolated by channel/pipeline step and by an opaque HMAC of the
complete request configuration and resolved credentials. Cache statistics expose
only the entry count, never request material, credential values, or cache keys.

**Example:**

```typescript
{ op: 'httpLookup', args: {
  "connectionCode": "external-api",
  "url": "https://api.example.com/products/{{sku}}",
  "target": "externalProduct",
  "headers": { "Accept": "application/json" },
  "bearerTokenSecretCode": "external-api-token"
} }
```

Public unauthenticated lookups can omit `connectionCode`. Secret-backed
authentication requires a saved HTTP-family connection with `baseUrl` and is
restricted to that exact origin across redirects.

## JSON Operators

### parseJson

Parse a JSON string field into an object.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source if not set |

**Example:**

```typescript
{ op: 'parseJson', args: {
  "source": "sourceField"
} }
```

### stringifyJson

Stringify an object field to a JSON string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source if not set |
| `pretty` | boolean | No | Pretty print |

**Example:**

```typescript
{ op: 'stringifyJson', args: {
  "source": "sourceField"
} }
```

### pick

Pick specific fields from a record, discarding others.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `fields` | json | Yes | Array of field paths to keep |

**Example:**

```typescript
{ op: 'pick', args: {
  "fields": "value"
} }
```

### omit

Omit specific fields from a record.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `fields` | json | Yes | Array of field paths to remove |

**Example:**

```typescript
{ op: 'omit', args: {
  "fields": "value"
} }
```

## Logic Operators

### when

Filter records by conditions. Action: keep or drop.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `conditions` | json | Yes | e.g. [{ field:  |

**Example:**

```typescript
{ op: 'when', args: {
  "conditions": "value"
} }
```

### ifThenElse

Set a value based on a condition.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `condition` | json | Yes | e.g. { field:  |
| `thenValue` | json | Yes | Then value (JSON) |
| `elseValue` | json | No | Else value (JSON) |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'ifThenElse', args: {
  "condition": "value",
  "thenValue": "value",
  "target": "targetField"
} }
```

### switch

Set a value based on multiple conditions (like a switch statement).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `cases` | json | Yes | Array of { value, result } objects |
| `default` | json | No | Default value (JSON) |
| `target` | string | Yes | Target field path |

**Example:**

```typescript
{ op: 'switch', args: {
  "source": "sourceField",
  "cases": "value",
  "target": "targetField"
} }
```

### deltaFilter

Detect likely changes by storing a non-cryptographic 32-bit record hash in the
checkpoint for each `idPath` value. A hash collision can suppress a changed
record, so do not use this operator as a correctness or security boundary.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `idPath` | string | Yes | ID field path |
| `includePaths` | json | No | Subset of fields to hash; default is entire record |
| `excludePaths` | json | No | Fields to ignore when hashing |

**Example:**

```typescript
{ op: 'deltaFilter', args: {
  "idPath": "value"
} }
```

## Numeric Operators

### math

Perform math operations on numeric fields.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `operation` | select | Yes | Operation |

**Example:**

```typescript
{ op: 'math', args: {
  "operation": "value"
} }
```

### currency

Convert floats to minor units or re-map currency fields.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `decimals` | number | Yes | Decimals (e.g. 2) |
| `round` | select | No | Rounding |

**Example:**

```typescript
{ op: 'currency', args: {
  "source": "sourceField",
  "target": "targetField",
  "decimals": 10
} }
```

### unit

Convert units (e.g. g<->kg, cm<->m)

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `from` | select | Yes | From unit |
| `to` | select | Yes | Target unit; must be in the same weight, length, or volume category as `from` |

**Example:**

```typescript
{ op: 'unit', args: {
  "source": "sourceField",
  "target": "targetField",
  "from": "g",
  "to": "kg"
} }
```

### toNumber

Convert a string field to a number.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path |
| `default` | number | No | Value if conversion fails |

**Example:**

```typescript
{ op: 'toNumber', args: {
  "source": "sourceField"
} }
```

### toString

Convert a value to a string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Target field path |

**Example:**

```typescript
{ op: 'toString', args: {
  "source": "sourceField"
} }
```

### parseNumber

Parse a string to a number with locale-aware decimal/thousand separator handling.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source path |
| `locale` | string | No | e.g.,  |
| `default` | number | No | Value if parsing fails |

**Example:**

```typescript
{ op: 'parseNumber', args: {
  "source": "sourceField"
} }
```

### formatNumber

Format a number as a localized string with optional currency or percent formatting.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `locale` | string | No | Intl locale; default: `en-US` |
| `decimals` | number | No | Sets both minimum and maximum fraction digits; otherwise Intl style defaults apply |
| `style` | select | No | `decimal`, `currency`, or `percent`; default: `decimal` |
| `currency` | string | No | Currency code used with `currency` style; a missing code falls back to decimal formatting |
| `useGrouping` | boolean | No | Use grouping separators; default: `true` |

**Example:**

```typescript
{ op: 'formatNumber', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### toCents

Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Field containing decimal amount (e.g., 19.99) |
| `target` | string | Yes | Field for cents amount (e.g., 1999) |
| `round` | select | No | Rounding |

**Example:**

```typescript
{ op: 'toCents', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### round

Round a number to a specified number of decimal places.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source if not set |
| `decimals` | number | No | Default: 0 (round to integer) |
| `mode` | select | No | Rounding mode |

**Example:**

```typescript
{ op: 'round', args: {
  "source": "sourceField"
} }
```

## String Operators

### split

Split a string field into an array by delimiter.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `delimiter` | string | Yes | Character(s) to split by |
| `trim` | boolean | No | Trim whitespace from each item |

**Example:**

```typescript
{ op: 'split', args: {
  "source": "sourceField",
  "target": "targetField",
  "delimiter": "value"
} }
```

### join

Join an array field into a string.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `delimiter` | string | Yes | Character(s) to join with |

**Example:**

```typescript
{ op: 'join', args: {
  "source": "sourceField",
  "target": "targetField",
  "delimiter": "value"
} }
```

### trim

Trim whitespace from a string field.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |
| `mode` | select | No | Mode |

**Example:**

```typescript
{ op: 'trim', args: {
  "path": "sourceField"
} }
```

### lowercase

Convert a string field to lowercase.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |

**Example:**

```typescript
{ op: 'lowercase', args: {
  "path": "sourceField"
} }
```

### uppercase

Convert a string field to uppercase.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |

**Example:**

```typescript
{ op: 'uppercase', args: {
  "path": "sourceField"
} }
```

### slugify

Generate a URL-friendly slug from a string field.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `separator` | string | No | Default: hyphen (-) |

**Example:**

```typescript
{ op: 'slugify', args: {
  "source": "sourceField",
  "target": "targetField"
} }
```

### concat

Concatenate multiple string fields into one.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `sources` | json | Yes | Array of field paths to concatenate |
| `target` | string | Yes | Target field path |
| `separator` | string | No | Optional separator between values |

**Example:**

```typescript
{ op: 'concat', args: {
  "sources": "value",
  "target": "targetField"
} }
```

### replace

Replace text in a string field.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |
| `search` | string | Yes | Search text |
| `replacement` | string | Yes | Replacement |
| `all` | boolean | No | Replace all occurrences |

**Example:**

```typescript
{ op: 'replace', args: {
  "path": "sourceField",
  "search": "value",
  "replacement": "value"
} }
```

### extractRegex

Extract a value from a string field using a regular expression pattern with capture groups.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | Yes | Target field path |
| `pattern` | string | Yes | Regular expression pattern (without delimiters) |
| `group` | number | No | Group index to extract (0=full match, 1+=capture groups). Default: 1 |
| `flags` | string | No | e.g.,  |

**Example:**

```typescript
{ op: 'extractRegex', args: {
  "source": "sourceField",
  "target": "targetField",
  "pattern": "value"
} }
```

### replaceRegex

Replace values in a string field using a regular expression pattern.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Field path |
| `pattern` | string | Yes | Regular expression pattern (without delimiters) |
| `replacement` | string | Yes | Replacement string (use $1, $2 for capture groups) |
| `flags` | string | No | e.g.,  |

**Example:**

```typescript
{ op: 'replaceRegex', args: {
  "path": "sourceField",
  "pattern": "value",
  "replacement": "value"
} }
```

### stripHtml

Remove HTML tags from a string field, preserving text content.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source if not set |

**Example:**

```typescript
{ op: 'stripHtml', args: {
  "source": "sourceField"
} }
```

### truncate

Truncate a string to a maximum length, optionally adding a suffix.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Source field path |
| `target` | string | No | Defaults to source if not set |
| `length` | number | Yes | Maximum length |
| `suffix` | string | No | e.g.,  |

**Example:**

```typescript
{ op: 'truncate', args: {
  "source": "sourceField",
  "length": 10
} }
```

## Scripting Operators

### script

Execute inline JavaScript code to transform records. Use for complex logic that cannot be expressed with standard operators.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `code` | code | Yes | JavaScript code to execute. In single-record mode: receives `record`, `index`, `context`. In batch mode: receives `records`, `context`. Must return the transformed result. |
| `batch` | boolean | No | If true, processes all records at once. If false (default), processes one record at a time. |
| `timeout` | number | No | Integer from 1 to 300000 milliseconds (default: 5000) |
| `failOnError` | boolean | No | If true, errors fail the step. If false, errors are logged and the original record or batch is preserved. |
| `context` | json | No | Optional JSON data passed to the script as context.data |

**Example:**

```typescript
{ op: 'script', args: {
  "code": "value"
} }
```

---

## Custom Operators

You can register custom operators using the SDK. See [Custom Operators Guide](../developer-guide/extending/custom-operators.md) for details.
