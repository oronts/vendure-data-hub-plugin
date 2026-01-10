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

Supported units: `g`, `kg`, `cm`, `m`

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

Condition comparators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `matches`

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

Operations: `count`, `sum`

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
