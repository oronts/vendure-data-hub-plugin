# Extending the Plugin

Create custom extractors, loaders, and operators to extend Data Hub functionality.

## Contents

1. [Custom Extractors](./custom-extractors.md) - Pull data from new sources
2. [Custom Loaders](./custom-loaders.md) - Load data to new entity types
3. [Custom Operators](./custom-operators.md) - Add new transform operations

## When to Extend

Create custom adapters when you need to:

- Connect to proprietary systems
- Implement business-specific logic
- Load to custom Vendure entities
- Add specialized transformations

## Extension Points

| Adapter Type | Purpose | Interface |
|--------------|---------|-----------|
| Extractor | Pull data from sources | `DataExtractor` |
| Loader | Load to Vendure entities | `EntityLoader` |
| Operator | Transform record fields | `OperatorDefinition` |
| Feed Generator | Create product feeds | `FeedGenerator` |
| Search Sink | Index to search engines | `SearchSink` |

## Registration

Register custom adapters in your plugin:

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MyExtensionPlugin implements OnModuleInit {
    constructor(private registry: DataHubRegistryService) {}

    onModuleInit() {
        this.registry.registerExtractor('my-extractor', MyCustomExtractor);
        this.registry.registerLoader('my-loader', MyCustomLoader);
        this.registry.registerOperator(MY_OPERATOR_DEFINITION);
    }
}
```

## Best Practices

### Error Handling

Always handle errors gracefully:

```typescript
try {
    const data = await fetchData();
    return data;
} catch (error) {
    throw new ExtractorError(`Failed to fetch: ${error.message}`, {
        retryable: error.code === 'ECONNREFUSED',
    });
}
```

### Logging

Use the provided logger:

```typescript
this.logger.debug(`Processing record ${record.id}`);
this.logger.info(`Loaded ${count} records`);
this.logger.warn(`Field missing, using default`);
this.logger.error(`Failed to load record`, error);
```

### Performance

- Process records in batches
- Use streaming for large datasets
- Implement connection pooling
- Cache repeated lookups

### Testing

- Unit test adapter logic
- Integration test with real systems
- Load test with production-scale data
