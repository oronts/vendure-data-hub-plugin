# Custom Operators

Create operators to add new transform operations.

## Interface

```typescript
interface SingleRecordOperator<TConfig = JsonObject> {
    type: 'OPERATOR';
    code: string;
    name: string;
    description?: string;
    category: string;
    pure?: boolean;
    schema: StepConfigSchema;
    icon?: string;
    version?: string;

    applyOne(
        record: JsonObject,
        config: TConfig,
        helpers: OperatorHelpers,
    ): JsonObject | null;
}

interface OperatorHelpers {
    get(record: JsonObject, path: string): unknown;
    set(record: JsonObject, path: string, value: unknown): void;
}
```

## Basic Example

```typescript
import { JsonObject, SingleRecordOperator, OperatorHelpers, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';

export const currencyConvertSchema: StepConfigSchema = {
    fields: [
        { key: 'field', type: 'string', label: 'Price Field', required: true },
        { key: 'from', type: 'select', label: 'From Currency', required: true,
          options: [{ value: 'USD', label: 'US Dollar' }, { value: 'EUR', label: 'Euro' }] },
        { key: 'to', type: 'select', label: 'To Currency', required: true,
          options: [{ value: 'USD', label: 'US Dollar' }, { value: 'EUR', label: 'Euro' }] },
        { key: 'targetField', type: 'string', label: 'Target Field', required: false },
    ],
};

interface CurrencyConvertConfig {
    field: string;
    from: string;
    to: string;
    targetField?: string;
}

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
    USD: { EUR: 0.92, GBP: 0.79 },
    EUR: { USD: 1.09, GBP: 0.86 },
};

export const currencyConvertOperator: SingleRecordOperator<CurrencyConvertConfig> = {
    type: 'OPERATOR',
    code: 'currencyConvert',
    name: 'Currency Convert',
    description: 'Convert currency values using exchange rates',
    category: 'conversion',
    pure: true,
    schema: currencyConvertSchema,
    icon: 'currency-exchange',
    version: '1.0.0',

    applyOne(record: JsonObject, config: CurrencyConvertConfig, helpers: OperatorHelpers): JsonObject | null {
        const { field, from, to, targetField } = config;
        const value = helpers.get(record, field);

        if (value === undefined || value === null) return record;

        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        if (isNaN(numValue) || from === to) return record;

        const rate = EXCHANGE_RATES[from]?.[to];
        if (!rate) return record;

        const converted = Math.round(numValue * rate * 100) / 100;
        const result = { ...record };
        helpers.set(result, targetField || field, converted);
        return result;
    },
};
```

## Registering the Operator

Register operators via the plugin's `adapters` option:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { currencyConvertOperator } from './currency-convert.operator';

DataHubPlugin.init({
    adapters: [currencyConvertOperator],
})
```

Or register programmatically:

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';
import { currencyConvertOperator } from './currency-convert.operator';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MyOperatorPlugin implements OnModuleInit {
    constructor(private registry: DataHubRegistryService) {}

    onModuleInit() {
        this.registry.registerOperator(currencyConvertOperator);
    }
}
```

## Runtime Registration via DataHubRegistryService

In addition to the `adapters` array and `registerOperator()` method shown above, you can register custom operators at runtime using `DataHubRegistryService.registerRuntime()`. This approach is useful for dynamically registering operators from other plugins or modules.

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MyCustomOperatorPlugin implements OnModuleInit {
    constructor(private registry: DataHubRegistryService) {}

    onModuleInit() {
        this.registry.registerRuntime({
            type: 'OPERATOR',
            code: 'myCustomOp',
            name: 'My Custom Operator',
            description: 'Custom processing logic',
            category: 'CUSTOM',
            async apply(records, config, helpers) {
                return {
                    records: records.map(r => ({ ...r, processed: true })),
                };
            },
        });
    }
}
```

### How Runtime Registration Works

Custom operators registered via `registerRuntime()` are discovered automatically by the transform executor. When the executor encounters an operator code that is not found in the built-in operator registry, it falls back to the runtime registry where custom operators are stored.

This means:
- No changes to the core plugin are needed
- Custom operators are available immediately after registration
- They appear alongside built-in operators in the pipeline editor
- They can be used in DSL pipelines exactly like built-in operators

### Using a Runtime-Registered Operator in a Pipeline

```typescript
export const customPipeline = createPipeline()
    .name('Pipeline with Custom Operator')

    .trigger('start', { type: 'MANUAL' })

    .extract('fetch', { adapterCode: 'httpApi', url: 'https://api.example.com/data' })

    .transform('custom-step', {
        operators: [
            { op: 'myCustomOp', args: { /* operator-specific config */ } },
        ],
    })

    .load('save', { adapterCode: 'productUpsert', strategy: 'UPSERT', matchField: 'slug' })

    .edge('start', 'fetch')
    .edge('fetch', 'custom-step')
    .edge('custom-step', 'save')

    .build();
```

## Operator Categories

Use standard categories for consistency:

| Category | Purpose |
|----------|---------|
| `data` | Basic data operations (set, copy, rename) |
| `string` | String manipulation |
| `numeric` | Number operations |
| `date` | Date/time operations |
| `logic` | Conditional logic |
| `json` | JSON operations |
| `validation` | Data validation |
| `aggregation` | Aggregation operations |
| `enrichment` | External data enrichment |
| `file` | File and media processing |
| `custom` | Custom operator category for runtime-registered operators |

## Return Values

| Return | Effect |
|--------|--------|
| `record` | Modified record continues to next step |
| `null` | Record is skipped (filtered out) |
| `throw` | Record fails and is quarantined |

### Filtering Records

Return `null` to skip records:

```typescript
applyOne(record, config, helpers) {
    if (!record.enabled) {
        return null;  // Skip disabled records
    }
    return record;
}
```

### Failing Records

Throw to quarantine records:

```typescript
applyOne(record, config, helpers) {
    if (!helpers.get(record, 'sku')) {
        throw new Error('Missing SKU');
    }
    return record;
}
```

## Async Operators

Operators can be async for external lookups:

```typescript
interface HttpLookupConfig {
    source: string;
    url: string;
    resultPath: string;
    target: string;
}

export const httpLookupOperator: SingleRecordOperator<HttpLookupConfig> = {
    type: 'OPERATOR',
    code: 'httpLookup',
    name: 'HTTP Lookup',
    category: 'enrichment',
    pure: false,
    schema: {
        fields: [
            { key: 'source', type: 'string', required: true, label: 'Source Field' },
            { key: 'url', type: 'string', required: true, label: 'URL Template' },
            { key: 'resultPath', type: 'string', required: true, label: 'Result Path' },
            { key: 'target', type: 'string', required: true, label: 'Target Field' },
        ],
    },

    async applyOne(record, config, helpers) {
        const { source, url, resultPath, target } = config;
        const value = helpers.get(record, source);
        const lookupUrl = url.replace('{{value}}', String(value));

        const response = await fetch(lookupUrl);
        const data = await response.json();

        const result = resultPath.split('.').reduce(
            (obj, key) => (obj as any)?.[key],
            data,
        );

        const clone = { ...record };
        helpers.set(clone, target, result);
        return clone;
    },
};
```

## Using Helpers

The `helpers` object provides utilities for field access:

```typescript
interface OperatorHelpers {
    get(record: JsonObject, path: string): unknown;
    set(record: JsonObject, path: string, value: unknown): void;
}
```

```typescript
applyOne(record, config, helpers) {
    // Get nested value
    const value = helpers.get(record, 'nested.deep.field');

    // Set nested value
    const result = { ...record };
    helpers.set(result, 'output.field', value);
    return result;
}
```

## Complete Examples

### Slug Generator

```typescript
interface SlugConfig {
    source: string;
    target?: string;
    lowercase?: boolean;
    separator?: string;
}

export const slugGeneratorOperator: SingleRecordOperator<SlugConfig> = {
    type: 'OPERATOR',
    code: 'customSlug',
    name: 'Custom Slug Generator',
    category: 'string',
    description: 'Generate URL-friendly slug from field',
    pure: true,
    schema: {
        fields: [
            { key: 'source', type: 'string', required: true, label: 'Source Field' },
            { key: 'target', type: 'string', label: 'Target Field' },
            { key: 'lowercase', type: 'boolean' },
            { key: 'separator', type: 'string' },
        ],
    },

    applyOne(record, config, helpers) {
        const { source, target = 'slug', lowercase = true, separator = '-' } = config;
        const value = String(helpers.get(record, source) || '');

        let slug = value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, separator);

        if (lowercase) {
            slug = slug.toLowerCase();
        }

        const result = { ...record };
        helpers.set(result, target, slug);
        return result;
    },
};
```

### Price Formatter

```typescript
interface PriceFormatConfig {
    source: string;
    target?: string;
    currency?: string;
    locale?: string;
}

export const priceFormatterOperator: SingleRecordOperator<PriceFormatConfig> = {
    type: 'OPERATOR',
    code: 'formatPrice',
    name: 'Format Price',
    category: 'numeric',
    description: 'Format price with currency symbol',
    pure: true,
    schema: {
        fields: [
            { key: 'source', type: 'string', required: true, label: 'Source Field' },
            { key: 'target', type: 'string', label: 'Target Field' },
            { key: 'currency', type: 'string' },
            { key: 'locale', type: 'string' },
        ],
    },

    applyOne(record, config, helpers) {
        const { source, target, currency = 'USD', locale = 'en-US' } = config;
        const value = Number(helpers.get(record, source));

        if (isNaN(value)) return record;

        const formatted = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
        }).format(value / 100);

        const result = { ...record };
        helpers.set(result, target || `${source}_formatted`, formatted);
        return result;
    },
};
```

### Array Filter

```typescript
interface ArrayFilterConfig {
    source: string;
    filterField: string;
    filterValue: unknown;
}

export const arrayFilterOperator: SingleRecordOperator<ArrayFilterConfig> = {
    type: 'OPERATOR',
    code: 'arrayFilter',
    name: 'Array Filter',
    category: 'json',
    description: 'Filter array elements by condition',
    pure: true,
    schema: {
        fields: [
            { key: 'source', type: 'string', required: true, label: 'Array Field' },
            { key: 'filterField', type: 'string', required: true, label: 'Filter Field' },
            { key: 'filterValue', type: 'string', required: true, label: 'Filter Value' },
        ],
    },

    applyOne(record, config, helpers) {
        const { source, filterField, filterValue } = config;
        const array = helpers.get(record, source);

        if (!Array.isArray(array)) return record;

        const filtered = array.filter(item =>
            (item as any)[filterField] === filterValue
        );

        const result = { ...record };
        helpers.set(result, source, filtered);
        return result;
    },
};
```

## Testing Operators

```typescript
import { describe, it, expect } from 'vitest';
import { slugGeneratorOperator } from './slug-generator.operator';

const mockHelpers = {
    get: (record: any, path: string) => path.split('.').reduce((obj, key) => obj?.[key], record),
    set: (record: any, path: string, value: any) => {
        const keys = path.split('.');
        const last = keys.pop()!;
        const target = keys.reduce((obj, key) => obj[key] ??= {}, record);
        target[last] = value;
    },
};

describe('Slug Generator Operator', () => {
    it('should generate slug from name', () => {
        const record = { name: 'Hello World' };
        const config = { source: 'name', target: 'slug' };

        const result = slugGeneratorOperator.applyOne(record, config, mockHelpers);

        expect(result?.slug).toBe('hello-world');
    });

    it('should handle special characters', () => {
        const record = { name: 'Café & Résumé' };
        const config = { source: 'name', target: 'slug' };

        const result = slugGeneratorOperator.applyOne(record, config, mockHelpers);

        expect(result?.slug).toBe('cafe--resume');
    });
});
```
