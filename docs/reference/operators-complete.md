# Complete Operator Reference

**Auto-generated from OPERATOR_REGISTRY**

Total operators: **61**

This is the definitive reference for all built-in transform operators in the Data Hub plugin.

## Table of Contents

### [Aggregation Operators](#aggregation)
- [aggregate](#aggregate) - Compute a simple aggregate over records and set a field on each record.
- [count](#count) - Count elements in an array or characters in a string.
- [unique](#unique) - Remove duplicate values from an array field.
- [flatten](#flatten) - Flatten a nested array into a single-level array.
- [first](#first) - Get the first element of an array.
- [last](#last) - Get the last element of an array.
- [expand](#expand) - Expand an array field into multiple records. Each array element becomes a separate record with optional parent field inheritance.
- [multiJoin](#multijoin) - Join two datasets by matching key fields. Supports INNER, LEFT, RIGHT, and FULL OUTER join types.

### [File Operators](#file)
- [imageResize](#imageresize) - Resize images referenced in record fields (base64-encoded)
- [imageConvert](#imageconvert) - Convert image format (JPEG, PNG, WebP, AVIF, GIF)
- [pdfGenerate](#pdfgenerate) - Generate PDF from HTML template with record data

### [Data Operators](#data)
- [map](#map) - Transform records via field mapping. Provide a JSON object of dst -> src dot-paths.
- [set](#set) - Set a static value at a specified path.
- [remove](#remove) - Remove a field at a specified path.
- [rename](#rename) - Rename a field from one path to another.
- [copy](#copy) - Copy a field value to another path.
- [template](#template) - Render a string template and set it at target path.
- [hash](#hash) - Generate a cryptographic hash (MD5, SHA1, SHA256, SHA512) of field value(s).
- [uuid](#uuid) - Generate a UUID for each record. Supports v4 (random) and v5 (namespace-based deterministic).
- [validateRequired](#validaterequired) - Mark records as invalid if required fields are missing.
- [validateFormat](#validateformat) - Validate field format using regex.

### [Date Operators](#date)
- [dateFormat](#dateformat) - Format a date field to a string.
- [dateParse](#dateparse) - Parse a string to a date.
- [dateAdd](#dateadd) - Add or subtract time from a date.
- [dateDiff](#datediff) - Calculate the difference between two dates in a specified unit.
- [now](#now) - Set the current timestamp on a field. Useful for adding created/updated timestamps.

### [Enrichment Operators](#enrichment)
- [lookup](#lookup) - Lookup value from a map and set to target field.
- [coalesce](#coalesce) - Return the first non-null value from a list of field paths.
- [enrich](#enrich) - Enrich or default fields on records. 
- [default](#default) - Set a default value if field is null or undefined.
- [httpLookup](#httplookup) - Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.

### [JSON Operators](#json)
- [parseJson](#parsejson) - Parse a JSON string field into an object.
- [stringifyJson](#stringifyjson) - Stringify an object field to a JSON string.
- [pick](#pick) - Pick specific fields from a record, discarding others.
- [omit](#omit) - Omit specific fields from a record.

### [Logic Operators](#logic)
- [when](#when) - Filter records by conditions. Action: keep or drop.
- [ifThenElse](#ifthenelse) - Set a value based on a condition.
- [switch](#switch) - Set a value based on multiple conditions (like a switch statement).
- [deltaFilter](#deltafilter) - Filter out unchanged records using a stable hash stored in checkpoint. Keeps only changed/new based on idPath.

### [Numeric Operators](#numeric)
- [math](#math) - Perform math operations on numeric fields.
- [currency](#currency) - Convert floats to minor units or re-map currency fields.
- [unit](#unit) - Convert units (e.g. g<->kg, cm<->m)
- [toNumber](#tonumber) - Convert a string field to a number.
- [toString](#tostring) - Convert a value to a string.
- [parseNumber](#parsenumber) - Parse a string to a number with locale-aware decimal/thousand separator handling.
- [formatNumber](#formatnumber) - Format a number as a localized string with optional currency or percent formatting.
- [toCents](#tocents) - Convert a decimal amount to cents (minor currency units). Multiplies by 100 and rounds.
- [round](#round) - Round a number to a specified number of decimal places.

### [String Operators](#string)
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

### [Scripting Operators](#scripting)
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
| `path` | string | Yes | Path to the array to expand (e.g.,  |
| `mergeParent` | boolean | No | Include all parent fields in expanded records |
| `parentFields` | json | No | Map of target field names to source paths (e.g., { |

**Example:**

```typescript
{ op: 'expand', args: {
  "path": "sourceField"
} }
```

### multiJoin

Join two datasets by matching key fields. Supports INNER, LEFT, RIGHT, and FULL OUTER join types.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `leftKey` | string | Yes | Field path in left (primary) records to join on |
| `rightKey` | string | Yes | Field path in right records to join on |
| `type` | select | Yes | Join type |

**Example:**

```typescript
{ op: 'multiJoin', args: {
  "leftKey": "value",
  "rightKey": "value",
  "type": "value"
} }
```

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

Generate PDF from HTML template with record data

**Example:**

```typescript
{ op: 'pdfGenerate', args: {} }
```

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

Generate a cryptographic hash (MD5, SHA1, SHA256, SHA512) of field value(s).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | json | Yes | Single path string or array of paths to hash together |
| `target` | string | Yes | Path where the hash will be stored |
| `algorithm` | select | No | Default: sha256 |
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
| `timezone` | string | No | e.g. UTC, Europe/London |

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
| `timezone` | string | No | Timezone |

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

> **Important:** Unit strings must be plural: `"days"`, `"hours"`, `"minutes"`, `"seconds"`, `"weeks"`, `"months"`, `"years"`. Singular forms like `"day"` are not supported.

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
| `url` | string | Yes | HTTP endpoint URL. Use {{field}} for dynamic values. |
| `method` | select | No | HTTP Method |
| `target` | string | Yes | Field path to store the response data. |
| `responsePath` | string | No | JSON path to extract from response (optional). |
| `keyField` | string | No | Field to use as cache key. If not set, URL is used. |
| `default` | json | No | Value to use if lookup fails or returns 404. |
| `timeoutMs` | number | No | Request timeout in milliseconds. |
| `cacheTtlSec` | number | No | Cache time-to-live in seconds. Set to 0 to disable. |
| `headers` | json | No | Static HTTP headers as JSON object. |
| `bearerTokenSecretCode` | string | No | Secret code for Bearer token authentication. |
| `apiKeySecretCode` | string | No | Secret code for API key authentication. |
| `apiKeyHeader` | string | No | Header name for API key. |
| `basicAuthSecretCode` | string | No | Secret code for Basic auth (username:password). |
| `bodyField` | string | No | Field path for POST body (uses record value at this path). |
| `body` | json | No | Static POST body (JSON object). |
| `skipOn404` | boolean | No | Skip record if endpoint returns 404. |
| `failOnError` | boolean | No | Fail pipeline if HTTP request fails. |
| `maxRetries` | number | No | Maximum retry attempts on transient errors. |
| `batchSize` | number | No | Process this many records in parallel (default: 50). |
| `rateLimitPerSecond` | number | No | Max requests per second per domain (default: 100). |

**Example:**

```typescript
{ op: 'httpLookup', args: {
  "url": "value",
  "target": "targetField"
} }
```

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

Filter out unchanged records using a stable hash stored in checkpoint. Keeps only changed/new based on idPath.

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

**Example:**

```typescript
{ op: 'unit', args: {
  "source": "sourceField",
  "target": "targetField",
  "from": "value"
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
| `locale` | string | No | e.g.,  |
| `decimals` | number | No | Decimal places |
| `style` | select | No | Format style |

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
| `timeout` | number | No | Maximum execution time in milliseconds (default: 5000) |
| `failOnError` | boolean | No | If true, errors fail the entire step. If false, errors are logged and records skipped. |
| `context` | json | No | Optional JSON data passed to the script as context.data |

**Example:**

```typescript
{ op: 'script', args: {
  "code": "value"
} }
```

---

## Custom Operators

You can register custom operators using the SDK. See [Custom Operators Guide](../guides/custom-operators.md) for details.
