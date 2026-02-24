# Testing Guide

Comprehensive testing strategies for Data Hub pipelines, custom adapters, and integrations.

## Table of Contents

- [Testing Overview](#testing-overview)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Testing Custom Adapters](#testing-custom-adapters)
- [Testing Pipelines](#testing-pipelines)
- [Test Data Management](#test-data-management)
- [Mocking and Fixtures](#mocking-and-fixtures)
- [Performance Testing](#performance-testing)
- [Testing Best Practices](#testing-best-practices)

## Testing Overview

Data Hub supports multiple testing strategies to ensure pipeline reliability and data quality.

### Testing Pyramid

```
           ┌─────────────────┐
           │   E2E Tests     │  Few, slow, high confidence
           │  Full Pipelines │
           └─────────────────┘
         ┌───────────────────────┐
         │  Integration Tests    │  Some, moderate speed
         │  Adapter + Vendure    │
         └───────────────────────┘
    ┌──────────────────────────────────┐
    │       Unit Tests                 │  Many, fast, low level
    │  Operators, Validators, Helpers  │
    └──────────────────────────────────┘
```

### Test Technologies

- **Unit Tests:** Vitest or Jest
- **Integration Tests:** Vendure Testing utilities
- **E2E Tests:** Vendure Testing + Database
- **API Tests:** GraphQL queries with test client
- **Performance Tests:** Artillery, k6, or custom scripts

## Unit Testing

Test individual functions, operators, and utilities in isolation.

### Testing Operators

```typescript
import { describe, it, expect } from 'vitest';
import { renameOperator } from './operators/field/rename';

describe('renameOperator', () => {
    it('should rename a field', () => {
        const record = { oldName: 'value', other: 'data' };
        const config = { from: 'oldName', to: 'newName' };

        const result = renameOperator.applyOne(record, config, helpers);

        expect(result).toEqual({
            newName: 'value',
            other: 'data',
        });
        expect(result.oldName).toBeUndefined();
    });

    it('should handle missing source field', () => {
        const record = { other: 'data' };
        const config = { from: 'missing', to: 'newName' };

        const result = renameOperator.applyOne(record, config, helpers);

        expect(result).toEqual({ other: 'data' });
        expect(result.newName).toBeUndefined();
    });

    it('should overwrite existing target field', () => {
        const record = { oldName: 'new', newName: 'old' };
        const config = { from: 'oldName', to: 'newName' };

        const result = renameOperator.applyOne(record, config, helpers);

        expect(result.newName).toBe('new');
    });
});
```

### Testing Validators

```typescript
import { describe, it, expect } from 'vitest';
import { businessValidator } from './validators/business-validator';

describe('businessValidator', () => {
    const mockContext = {
        ctx: {} as any,
        pipelineId: 'test',
        stepKey: 'validate',
        mode: 'ACCUMULATE' as const,
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };

    it('should validate required fields', async () => {
        const records = [
            { name: 'Product 1', sku: 'SKU1' },
            { name: 'Product 2' },  // Missing sku
        ];

        const config = {
            rules: [
                { type: 'business', spec: { field: 'sku', required: true } },
            ],
        };

        const result = await businessValidator.validate(
            mockContext,
            config,
            records
        );

        expect(result.valid).toHaveLength(1);
        expect(result.invalid).toHaveLength(1);
        expect(result.invalid[0].errors[0].field).toBe('sku');
    });

    it('should validate field types', async () => {
        const records = [
            { price: 100 },
            { price: 'invalid' },
        ];

        const config = {
            rules: [
                { type: 'business', spec: { field: 'price', type: 'number' } },
            ],
        };

        const result = await businessValidator.validate(
            mockContext,
            config,
            records
        );

        expect(result.valid).toHaveLength(1);
        expect(result.invalid).toHaveLength(1);
    });
});
```

### Testing Utilities

```typescript
import { describe, it, expect } from 'vitest';
import { getNestedValue, setNestedValue } from './utils/object-path';

describe('Object Path Utilities', () => {
    describe('getNestedValue', () => {
        it('should get shallow values', () => {
            const obj = { name: 'Test' };
            expect(getNestedValue(obj, 'name')).toBe('Test');
        });

        it('should get nested values', () => {
            const obj = { user: { profile: { name: 'Test' } } };
            expect(getNestedValue(obj, 'user.profile.name')).toBe('Test');
        });

        it('should return undefined for missing paths', () => {
            const obj = { user: {} };
            expect(getNestedValue(obj, 'user.missing.path')).toBeUndefined();
        });
    });

    describe('setNestedValue', () => {
        it('should set shallow values', () => {
            const obj = {};
            setNestedValue(obj, 'name', 'Test');
            expect(obj).toEqual({ name: 'Test' });
        });

        it('should create nested paths', () => {
            const obj = {};
            setNestedValue(obj, 'user.profile.name', 'Test');
            expect(obj).toEqual({
                user: { profile: { name: 'Test' } },
            });
        });
    });
});
```

### Testing Parsers

```typescript
import { describe, it, expect } from 'vitest';
import { CsvParser } from './parsers/formats/csv.parser';

describe('CsvParser', () => {
    it('should parse CSV with headers', async () => {
        const csv = 'name,sku,price\nProduct 1,SKU1,100\nProduct 2,SKU2,200';
        const parser = new CsvParser({
            delimiter: ',',
            hasHeader: true,
        });

        const records = [];
        for await (const record of parser.parse(csv)) {
            records.push(record);
        }

        expect(records).toEqual([
            { name: 'Product 1', sku: 'SKU1', price: '100' },
            { name: 'Product 2', sku: 'SKU2', price: '200' },
        ]);
    });

    it('should handle quoted fields', async () => {
        const csv = 'name,description\n"Product","Description with, comma"';
        const parser = new CsvParser({ hasHeader: true });

        const records = [];
        for await (const record of parser.parse(csv)) {
            records.push(record);
        }

        expect(records[0].description).toBe('Description with, comma');
    });
});
```

## Integration Testing

Test adapters with actual Vendure services and database.

### Setup Test Environment

```typescript
import { createTestEnvironment, TestServer } from '@vendure/testing';
import { InitialData, testConfig } from '@vendure/testing';
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';

describe('Product Loader Integration', () => {
    let server: TestServer;
    let adminClient: SimpleGraphQLClient;
    let shopClient: SimpleGraphQLClient;

    const initialData: InitialData = {
        /* ... initial test data ... */
    };

    beforeAll(async () => {
        const testEnv = createTestEnvironment({
            ...testConfig(),
            plugins: [
                DataHubPlugin.init({
                    /* test config */
                }),
            ],
        });

        server = testEnv.server;
        adminClient = testEnv.adminClient;
        shopClient = testEnv.shopClient;

        await server.init({
            initialData,
            productsCsvPath: '../test/fixtures/products.csv',
        });
    }, 60000);

    afterAll(async () => {
        await server.destroy();
    });

    it('should upsert products via loader', async () => {
        const records = [
            {
                slug: 'test-product',
                name: 'Test Product',
                price: 1000,
                enabled: true,
            },
        ];

        const result = await server.app
            .get(ProductLoader)
            .load(createMockContext(), { strategy: 'UPSERT' }, records);

        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);

        // Verify product exists
        const { product } = await adminClient.query(gql`
            query {
                product(slug: "test-product") {
                    id
                    name
                    slug
                }
            }
        `);

        expect(product.slug).toBe('test-product');
        expect(product.name).toBe('Test Product');
    });
});
```

### Testing Custom Extractors

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestEnvironment } from '@vendure/testing';
import { myCustomExtractor } from './my-custom-extractor';

describe('Custom Extractor Integration', () => {
    let server: TestServer;

    beforeAll(async () => {
        const testEnv = createTestEnvironment({
            ...testConfig(),
            plugins: [
                DataHubPlugin.init({
                    adapters: [myCustomExtractor],
                }),
            ],
        });
        server = testEnv.server;
        await server.init({ initialData });
    });

    afterAll(async () => {
        await server.destroy();
    });

    it('should extract data from custom source', async () => {
        const mockContext = createMockExtractContext();
        const config = {
            connectionCode: 'test-connection',
            endpoint: '/data',
        };

        const records = [];
        for await (const envelope of myCustomExtractor.extract(mockContext, config)) {
            records.push(envelope.data);
        }

        expect(records.length).toBeGreaterThan(0);
        expect(records[0]).toHaveProperty('id');
    });

    it('should handle extraction errors gracefully', async () => {
        const mockContext = createMockExtractContext();
        const config = {
            endpoint: '/invalid',  // Intentionally invalid
        };

        await expect(async () => {
            for await (const envelope of myCustomExtractor.extract(mockContext, config)) {
                // Should not reach here
            }
        }).rejects.toThrow();
    });
});
```

### Testing with Database

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEnvironment } from '@vendure/testing';
import { Connection } from 'typeorm';

describe('Database Extractor', () => {
    let connection: Connection;

    beforeEach(async () => {
        // Get Vendure database connection
        connection = server.app.get(Connection);

        // Seed test data
        await connection.query(`
            INSERT INTO product (name, slug, enabled)
            VALUES ('Test Product', 'test-product', true)
        `);
    });

    it('should extract products from database', async () => {
        const extractor = server.app.get(DatabaseExtractor);
        const mockContext = createMockExtractContext();
        const config = {
            connectionCode: 'vendure-db',
            query: 'SELECT * FROM product WHERE enabled = true',
        };

        const records = [];
        for await (const envelope of extractor.extract(mockContext, config)) {
            records.push(envelope.data);
        }

        expect(records).toContainEqual(
            expect.objectContaining({ slug: 'test-product' })
        );
    });
});
```

## End-to-End Testing

Test complete pipeline execution from trigger to completion.

### Pipeline Execution Test

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { runPipeline } from './test-helpers';

describe('Product Import Pipeline E2E', () => {
    let server: TestServer;
    let adminClient: SimpleGraphQLClient;

    beforeAll(async () => {
        const testEnv = createTestEnvironment({
            ...testConfig(),
            plugins: [DataHubPlugin.init({})],
        });
        server = testEnv.server;
        adminClient = testEnv.adminClient;
        await server.init({ initialData });
    });

    it('should import products end-to-end', async () => {
        // 1. Create test CSV file
        const csvData = `name,sku,price
Product 1,SKU1,1000
Product 2,SKU2,2000
Product 3,SKU3,3000`;

        const testFile = '/tmp/test-products.csv';
        await fs.writeFile(testFile, csvData);

        // 2. Create and register pipeline
        const pipeline = createPipeline()
            .name('Test Import')
            .extract('parse', {
                adapterCode: 'file',
                path: testFile,
                format: 'CSV',
                hasHeader: true,
            })
            .transform('normalize', {
                operators: [
                    { op: 'math', args: { operation: 'multiply', source: 'price', operand: '100' } },
                    { op: 'set', args: { path: 'enabled', value: true } },
                ],
            })
            .load('upsert', {
                adapterCode: 'productUpsert',
                strategy: 'UPSERT',
                matchField: 'sku',
            })
            .edge('parse', 'normalize')
            .edge('normalize', 'upsert')
            .build();

        // 3. Run pipeline
        const result = await runPipeline(adminClient, {
            code: 'test-import',
            name: 'Test Import',
            enabled: true,
            definition: pipeline,
        });

        // 4. Verify execution
        expect(result.status).toBe('COMPLETED');
        expect(result.recordsProcessed).toBe(3);

        // 5. Verify data in Vendure
        const { products } = await adminClient.query(gql`
            query {
                products {
                    items {
                        sku
                        name
                    }
                }
            }
        `);

        expect(products.items).toContainEqual(
            expect.objectContaining({ sku: 'SKU1', name: 'Product 1' })
        );
        expect(products.items).toContainEqual(
            expect.objectContaining({ sku: 'SKU2', name: 'Product 2' })
        );
    });

    it('should handle validation errors', async () => {
        const csvData = `name,sku,price
Valid Product,SKU1,1000
,SKU2,2000
Invalid Product,,3000`;

        const testFile = '/tmp/test-invalid.csv';
        await fs.writeFile(testFile, csvData);

        const pipeline = createPipeline()
            .extract('parse', { adapterCode: 'file', path: testFile, format: 'CSV' })
            .validate('check', {
                errorHandlingMode: 'ACCUMULATE',
                rules: [
                    { type: 'business', spec: { field: 'name', required: true } },
                    { type: 'business', spec: { field: 'sku', required: true } },
                ],
            })
            .load('upsert', { adapterCode: 'productUpsert' })
            .edge('parse', 'check')
            .edge('check', 'upsert')
            .build();

        const result = await runPipeline(adminClient, {
            code: 'test-validation',
            definition: pipeline,
        });

        // Should complete but with errors
        expect(result.status).toBe('COMPLETED');
        expect(result.recordsProcessed).toBe(1);  // Only 1 valid record
        expect(result.recordsFailed).toBe(2);     // 2 invalid records
    });
});
```

### Testing Scheduled Pipelines

```typescript
describe('Scheduled Pipeline Execution', () => {
    it('should execute on schedule', async () => {
        const pipeline = createPipeline()
            .trigger('schedule', {
                type: 'SCHEDULE',
                cron: '*/1 * * * *',  // Every minute
            })
            .extract('fetch', { /* ... */ })
            .load('upsert', { /* ... */ })
            .build();

        await createPipeline(adminClient, pipeline);

        // Wait for scheduled execution
        await sleep(65000);  // Wait just over 1 minute

        // Check that pipeline ran
        const { runs } = await adminClient.query(gql`
            query {
                dataHubPipelineRuns(options: { filter: { triggeredBy: { eq: "schedule" } } }) {
                    items {
                        id
                        status
                        triggeredBy
                    }
                }
            }
        `);

        expect(runs.items.length).toBeGreaterThan(0);
        expect(runs.items[0].triggeredBy).toBe('schedule');
    });
});
```

### Testing Webhook Triggers

```typescript
describe('Webhook Triggered Pipeline', () => {
    it('should execute on webhook request', async () => {
        const pipeline = createPipeline()
            .trigger('webhook', {
                type: 'WEBHOOK',
                path: '/test-webhook',
                signature: 'hmac-sha256',
                secretCode: 'webhook-secret',
            })
            .extract('from-body', { /* ... */ })
            .load('upsert', { /* ... */ })
            .build();

        await createPipeline(adminClient, pipeline);

        // Send webhook request
        const payload = { products: [{ name: 'Test', sku: 'TST1' }] };
        const signature = createHmacSignature(payload, 'test-secret');

        const response = await fetch('http://localhost:3000/data-hub/webhook/test-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Signature-256': signature,
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);

        // Verify pipeline ran
        await sleep(1000);  // Allow time for async execution

        const { runs } = await adminClient.query(gql`
            query {
                dataHubPipelineRuns(options: { sort: { createdAt: DESC }, take: 1 }) {
                    items {
                        triggeredBy
                        status
                    }
                }
            }
        `);

        expect(runs.items[0].triggeredBy).toBe('webhook');
    });
});
```

## Testing Custom Adapters

### Custom Operator Test

```typescript
import { describe, it, expect } from 'vitest';
import { myCustomOperator } from './my-custom-operator';

describe('MyCustomOperator', () => {
    const helpers = {
        get: (obj, path) => obj[path],
        set: (obj, path, value) => { obj[path] = value; },
    };

    it('should apply custom transformation', () => {
        const record = { value: 10 };
        const config = { multiplier: 5 };

        const result = myCustomOperator.applyOne(record, config, helpers);

        expect(result.value).toBe(50);
    });

    it('should handle edge cases', () => {
        const record = { value: 'not-a-number' };
        const config = { multiplier: 5 };

        expect(() =>
            myCustomOperator.applyOne(record, config, helpers)
        ).toThrow('Value must be a number');
    });
});
```

### Custom Loader Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { myCustomLoader } from './my-custom-loader';
import { createMockLoadContext } from './test-helpers';

describe('MyCustomLoader', () => {
    let mockContext: LoadContext;

    beforeEach(() => {
        mockContext = createMockLoadContext();
    });

    it('should load records', async () => {
        const records = [
            { id: '1', name: 'Item 1' },
            { id: '2', name: 'Item 2' },
        ];

        const config = { strategy: 'CREATE' };

        const result = await myCustomLoader.load(
            mockContext,
            config,
            records
        );

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('should handle duplicate records', async () => {
        const records = [
            { id: '1', name: 'Item 1' },
            { id: '1', name: 'Duplicate' },
        ];

        const config = { strategy: 'CREATE' };

        const result = await myCustomLoader.load(
            mockContext,
            config,
            records
        );

        expect(result.failed).toBe(1);
        expect(result.errors[0].message).toContain('duplicate');
    });

    it('should support dry run mode', async () => {
        mockContext.dryRun = true;

        const records = [{ id: '1', name: 'Item 1' }];
        const config = { strategy: 'CREATE' };

        const result = await myCustomLoader.load(
            mockContext,
            config,
            records
        );

        expect(result.succeeded).toBe(1);
        // Verify no actual database changes
    });
});
```

## Test Data Management

### Test Fixtures

```typescript
// test/fixtures/products.ts
export const testProducts = [
    {
        slug: 'test-product-1',
        name: 'Test Product 1',
        sku: 'TEST-SKU-1',
        price: 1000,
        enabled: true,
    },
    {
        slug: 'test-product-2',
        name: 'Test Product 2',
        sku: 'TEST-SKU-2',
        price: 2000,
        enabled: true,
    },
];

export const testCustomers = [
    {
        emailAddress: 'test1@example.com',
        firstName: 'Test',
        lastName: 'Customer',
    },
];
```

### Fixture Loaders

```typescript
// test/helpers/load-fixtures.ts
export async function loadProductFixtures(
    connection: Connection,
    products: any[]
) {
    for (const product of products) {
        await connection
            .getRepository(Product)
            .save(product);
    }
}

export async function clearDatabase(connection: Connection) {
    await connection.query('DELETE FROM product_variant');
    await connection.query('DELETE FROM product');
    await connection.query('DELETE FROM customer');
}
```

### Test Data Factories

```typescript
// test/factories/product.factory.ts
import { faker } from '@faker-js/faker';

export function createTestProduct(overrides = {}) {
    return {
        slug: faker.helpers.slugify(faker.commerce.productName()),
        name: faker.commerce.productName(),
        sku: faker.string.alphanumeric(8).toUpperCase(),
        price: faker.number.int({ min: 1000, max: 100000 }),
        enabled: true,
        ...overrides,
    };
}

export function createManyTestProducts(count: number) {
    return Array.from({ length: count }, () => createTestProduct());
}

// Usage in tests
const products = createManyTestProducts(100);
```

## Mocking and Fixtures

### Mocking External APIs

```typescript
import { vi, beforeEach, afterEach } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
    rest.get('https://api.example.com/products', (req, res, ctx) => {
        return res(
            ctx.json({
                data: [
                    { id: 1, name: 'Product 1' },
                    { id: 2, name: 'Product 2' },
                ],
            })
        );
    })
);

beforeEach(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('should fetch from API', async () => {
    const extractor = new HttpApiExtractor();
    // Test will use mocked API
});
```

### Mocking Vendure Services

```typescript
import { vi } from 'vitest';
import { ProductService } from '@vendure/core';

describe('Product Loader', () => {
    let mockProductService: Partial<ProductService>;

    beforeEach(() => {
        mockProductService = {
            findOne: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: '1' }),
            update: vi.fn().mockResolvedValue({ id: '1' }),
        };
    });

    it('should use mocked service', async () => {
        const loader = new ProductLoader(
            mockProductService as ProductService
        );

        // Test with mocked service
    });
});
```

## Performance Testing

### Load Testing

```typescript
// test/load/pipeline-load-test.ts
import { performance } from 'perf_hooks';

describe('Pipeline Performance', () => {
    it('should handle 10,000 records within 30 seconds', async () => {
        const records = createManyTestProducts(10000);

        const start = performance.now();

        const result = await runPipeline(adminClient, {
            definition: testPipeline,
            seedRecords: records,
        });

        const duration = performance.now() - start;

        expect(result.status).toBe('COMPLETED');
        expect(duration).toBeLessThan(30000);  // 30 seconds
        expect(result.recordsProcessed).toBe(10000);
    });

    it('should maintain throughput under load', async () => {
        const recordsPerSecond = [];

        for (let i = 0; i < 5; i++) {
            const records = createManyTestProducts(1000);
            const start = performance.now();

            await runPipeline(adminClient, {
                definition: testPipeline,
                seedRecords: records,
            });

            const duration = (performance.now() - start) / 1000;
            recordsPerSecond.push(1000 / duration);
        }

        const avgThroughput = recordsPerSecond.reduce((a, b) => a + b) / recordsPerSecond.length;

        expect(avgThroughput).toBeGreaterThan(100);  // 100 records/sec minimum
    });
});
```

### Memory Leak Testing

```typescript
describe('Memory Management', () => {
    it('should not leak memory on large datasets', async () => {
        const initialMemory = process.memoryUsage().heapUsed;

        // Run pipeline multiple times
        for (let i = 0; i < 10; i++) {
            const records = createManyTestProducts(1000);
            await runPipeline(adminClient, {
                definition: testPipeline,
                seedRecords: records,
            });

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;

        // Memory increase should be minimal (< 50MB)
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
});
```

## Testing Best Practices

### 1. Test Organization

```
test/
├── unit/
│   ├── operators/
│   ├── validators/
│   └── utilities/
├── integration/
│   ├── loaders/
│   ├── extractors/
│   └── services/
├── e2e/
│   └── pipelines/
├── fixtures/
│   ├── products.csv
│   └── test-data.json
└── helpers/
    ├── mock-context.ts
    └── test-environment.ts
```

### 2. Use Descriptive Test Names

```typescript
// Good
it('should create product when SKU does not exist', () => {});
it('should update product when SKU exists', () => {});
it('should handle missing required fields gracefully', () => {});

// Bad
it('test product loader', () => {});
it('works', () => {});
```

### 3. Test Edge Cases

```typescript
describe('FieldMapper', () => {
    it('should map simple fields', () => {});
    it('should map nested fields', () => {});
    it('should handle null values', () => {});
    it('should handle undefined values', () => {});
    it('should handle empty strings', () => {});
    it('should handle missing source fields', () => {});
    it('should handle array values', () => {});
    it('should handle circular references', () => {});
});
```

### 4. Use Test Helpers

```typescript
// test/helpers/mock-context.ts
export function createMockLoadContext(overrides = {}): LoadContext {
    return {
        ctx: createRequestContext(),
        pipelineId: 'test-pipeline',
        stepKey: 'test-step',
        secrets: createMockSecretResolver(),
        connections: createMockConnectionResolver(),
        logger: createMockLogger(),
        dryRun: false,
        ...overrides,
    };
}

// Usage in tests
const context = createMockLoadContext({ dryRun: true });
```

### 5. Isolate Tests

```typescript
describe('ProductLoader', () => {
    beforeEach(async () => {
        // Clear database before each test
        await clearDatabase(connection);
        // Reset mocks
        vi.clearAllMocks();
    });

    it('test 1', () => {
        // Isolated test
    });

    it('test 2', () => {
        // Independent of test 1
    });
});
```

### 6. Test Error Handling

```typescript
it('should handle network errors gracefully', async () => {
    // Mock network failure
    server.use(
        rest.get('https://api.example.com/products', (req, res) =>
            res.networkError('Connection refused')
        )
    );

    const extractor = new HttpApiExtractor();

    await expect(
        extractor.extract(mockContext, config)
    ).rejects.toThrow('Connection refused');
});

it('should retry on transient errors', async () => {
    let attempts = 0;

    server.use(
        rest.get('https://api.example.com/products', (req, res, ctx) => {
            attempts++;
            if (attempts < 3) {
                return res(ctx.status(500));
            }
            return res(ctx.json({ data: [] }));
        })
    );

    const result = await extractor.extract(mockContext, config);

    expect(attempts).toBe(3);  // Should retry twice
});
```

### 7. Snapshot Testing for Complex Outputs

```typescript
it('should generate correct feed XML', async () => {
    const products = [testProduct1, testProduct2];
    const feedGenerator = new GoogleMerchantFeed();

    const xml = await feedGenerator.generate(products, config);

    expect(xml).toMatchSnapshot();
});
```

### 8. Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Test Coverage Goals

- **Unit Tests:** > 80% coverage for utilities, operators, validators
- **Integration Tests:** All loaders and extractors
- **E2E Tests:** Critical pipelines and workflows
- **Performance Tests:** Key operations under load

## See Also

- [Architecture Overview](./architecture.md) - Understanding the system
- [Extending the Plugin](./extending/README.md) - Creating custom adapters
- [Pipeline Builder Guide](./dsl/pipeline-builder.md) - DSL API reference
- [Troubleshooting Guide](../deployment/troubleshooting.md) - Debugging issues
