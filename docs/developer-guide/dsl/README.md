# DSL Reference

The Data Hub DSL (Domain Specific Language) provides a fluent TypeScript API for defining pipelines.

## Contents

1. [Pipeline Builder](./pipeline-builder.md) - Core pipeline construction
2. [Operators](./operators.md) - All transform operators
3. [Examples](./examples.md) - Real-world pipeline examples

## Quick Start

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const pipeline = createPipeline()
    .name('My Pipeline')
    .trigger('start', { type: 'manual' })
    .extract('fetch', { adapterCode: 'rest', endpoint: '...' })
    .transform('process', { operators: [...] })
    .load('save', { adapterCode: 'productUpsert', strategy: 'source-wins', channel: '__default_channel__' })
    .edge('start', 'fetch')
    .edge('fetch', 'process')
    .edge('process', 'save')
    .build();
```

## Key Concepts

### Builder Pattern

The DSL uses a fluent builder pattern. Each method returns the builder, allowing chaining:

```typescript
createPipeline()
    .name('Name')           // Returns builder
    .description('Desc')    // Returns builder
    .trigger(...)           // Returns builder
    .build();               // Returns PipelineDefinition
```

### Step Keys

Each step has a unique key within the pipeline:

```typescript
.extract('my-unique-key', { ... })
```

Keys are used in edges to connect steps.

### Edges

Edges define the execution order:

```typescript
.edge('step-a', 'step-b')  // step-a runs before step-b
```

### Configuration Objects

Each step type has specific configuration:

```typescript
// Extract step
.extract('fetch', {
    adapterCode: 'rest',
    endpoint: 'https://api.example.com',
    method: 'GET',
})

// Transform step
.transform('process', {
    operators: [
        { op: 'rename', args: { from: 'old', to: 'new' } },
    ],
})

// Load step
.load('save', {
    adapterCode: 'productUpsert',
    strategy: 'source-wins',
    channel: '__default_channel__',
    skuField: 'sku',
    nameField: 'name',
})
```

## Types

The DSL is fully typed. Import types for IDE support:

```typescript
import {
    createPipeline,
    PipelineBuilder,
    PipelineDefinition,
    ExtractStepConfig,
    TransformStepConfig,
    LoadStepConfig,
} from '@oronts/vendure-data-hub-plugin';
```

## Using with Plugin Options

Pass built pipelines to the plugin:

```typescript
import { DataHubPlugin, createPipeline } from '@oronts/vendure-data-hub-plugin';

const myPipeline = createPipeline()
    .name('My Pipeline')
    // ... steps ...
    .build();

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            pipelines: [{
                code: 'my-pipeline',
                name: 'My Pipeline',
                enabled: true,
                definition: myPipeline,
            }],
        }),
    ],
};
```

## Next Steps

- [Pipeline Builder](./pipeline-builder.md) - Complete builder API
- [Operators](./operators.md) - All available operators
- [Examples](./examples.md) - Common patterns
