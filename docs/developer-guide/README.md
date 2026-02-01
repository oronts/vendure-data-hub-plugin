# Developer Guide

This guide covers the code-first DSL, architecture, and extending the Data Hub plugin.

<p align="center">
  <img src="../images/04-hooks-events.png" alt="Pipeline Hooks" width="700">
  <br>
  <em>Pipeline Hooks - Execute custom code at every stage of pipeline execution</em>
</p>

## Contents

1. [Architecture Overview](./architecture.md) - How the plugin works internally
2. [DSL Reference](./dsl/README.md)
   - [Pipeline Builder](./dsl/pipeline-builder.md) - Building pipelines with TypeScript
   - [Operators](./dsl/operators.md) - All transform operators
   - [Examples](./dsl/examples.md) - Real-world pipeline examples
3. [Extending the Plugin](./extending/README.md)
   - [Custom Extractors](./extending/custom-extractors.md)
   - [Custom Loaders](./extending/custom-loaders.md)
   - [Custom Operators](./extending/custom-operators.md)
4. [GraphQL API](./graphql-api.md) - API reference for integration

## When to Use Code-First

Use the code-first DSL when:

- Pipelines are part of your deployment
- You want type-safe configurations
- Pipelines don't change frequently
- You need version control for pipeline definitions

Use the visual builder when:

- Non-developers create pipelines
- Rapid iteration is needed
- Pipelines change frequently
- You want immediate feedback

## Quick Example

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const pipeline = createPipeline()
    .name('Product Sync')
    .description('Sync products from ERP system')
    .trigger('schedule', { type: 'schedule', cron: '0 2 * * *' })
    .extract('fetch-erp', {
        adapterCode: 'httpApi',
        connectionCode: 'erp-api',
        url: '/products',
        dataPath: 'data.products',
    })
    .transform('map-fields', {
        operators: [
            { op: 'rename', args: { from: 'product_name', to: 'name' } },
            { op: 'rename', args: { from: 'product_sku', to: 'sku' } },
            { op: 'slugify', args: { source: 'sku', target: 'slug' } },
        ],
    })
    .load('upsert-products', {
        entityType: 'PRODUCT',
        operation: 'UPSERT',
        lookupFields: ['slug'],
    })
    .edge('schedule', 'fetch-erp')
    .edge('fetch-erp', 'map-fields')
    .edge('map-fields', 'upsert-products')
    .build();
```

## Type Safety

The DSL is fully typed. TypeScript will catch errors like:

- Invalid adapter codes
- Missing required fields
- Wrong operator arguments
- Invalid edge connections

```typescript
// TypeScript error: Property 'invalidOption' does not exist
.extract('fetch', {
    adapterCode: 'httpApi',
    invalidOption: true,  // Error!
})
```

## Next Steps

- [Architecture](./architecture.md) - Understand how it works
- [Pipeline Builder](./dsl/pipeline-builder.md) - Start building with DSL
- [Examples](./dsl/examples.md) - See real-world patterns
