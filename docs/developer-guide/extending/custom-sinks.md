# Custom Sinks

Create sinks to index data to custom search engines or external systems.

## Interface

```typescript
interface SinkAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'SINK';
    readonly sinkType: SinkType;

    index(context: SinkContext, config: TConfig, records: readonly JsonObject[]): Promise<SinkResult>;
    delete?(context: SinkContext, config: TConfig, ids: readonly string[]): Promise<SinkResult>;
    refresh?(context: SinkContext, config: TConfig): Promise<void>;
}

type SinkType = 'ELASTICSEARCH' | 'OPENSEARCH' | 'MEILISEARCH' | 'ALGOLIA' | 'TYPESENSE' | 'WEBHOOK' | 'CUSTOM';

interface SinkContext {
    readonly ctx: RequestContext;
    readonly pipelineId: ID;
    readonly stepKey: string;
    readonly pipelineContext: PipelineContext;
    readonly secrets: SecretResolver;
    readonly connections: ConnectionResolver;
    readonly logger: AdapterLogger;
    readonly dryRun: boolean;
}

interface SinkResult {
    readonly indexed: number;
    readonly deleted: number;
    readonly failed: number;
    readonly errors?: readonly SinkError[];
}

interface SinkError {
    readonly record: JsonObject;
    readonly message: string;
    readonly statusCode?: number;
}
```

## Basic Example

```typescript
import { SinkAdapter, SinkContext, SinkResult, StepConfigSchema, JsonObject } from '@oronts/vendure-data-hub-plugin';

interface MySinkConfig {
    endpoint: string;
    apiKeySecretCode: string;
    indexName: string;
    idField: string;
    batchSize?: number;
}

const mySearchSinkSchema: StepConfigSchema = {
    fields: [
        { key: 'endpoint', label: 'API Endpoint', type: 'string', required: true },
        { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'string', required: true },
        { key: 'indexName', label: 'Index Name', type: 'string', required: true },
        { key: 'idField', label: 'ID Field', type: 'string', required: true, placeholder: 'id' },
        { key: 'batchSize', label: 'Batch Size', type: 'number', placeholder: '100' },
    ],
};

export const mySearchSink: SinkAdapter<MySinkConfig> = {
    type: 'SINK',
    code: 'my-search',
    name: 'My Search Engine',
    description: 'Index records to custom search engine',
    category: 'external',
    sinkType: 'CUSTOM',
    schema: mySearchSinkSchema,
    icon: 'search',

    async index(context: SinkContext, config: MySinkConfig, records: readonly JsonObject[]): Promise<SinkResult> {
        const { secrets, logger, dryRun } = context;

        // Resolve API key from secrets
        const apiKey = await secrets.get(config.apiKeySecretCode);

        if (dryRun) {
            logger.info(`[DRY RUN] Would index ${records.length} records`);
            return { indexed: records.length, deleted: 0, failed: 0 };
        }

        let indexed = 0;
        let failed = 0;
        const errors: SinkError[] = [];
        const batchSize = config.batchSize || 100;

        // Process in batches
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);

            try {
                const response = await fetch(`${config.endpoint}/indexes/${config.indexName}/documents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(batch),
                });

                if (response.ok) {
                    indexed += batch.length;
                } else {
                    failed += batch.length;
                    const errorText = await response.text();
                    for (const record of batch) {
                        errors.push({ record, message: errorText, statusCode: response.status });
                    }
                }
            } catch (err) {
                failed += batch.length;
                const message = err instanceof Error ? err.message : 'Network error';
                for (const record of batch) {
                    errors.push({ record, message });
                }
            }
        }

        logger.info(`Indexed ${indexed}, failed ${failed}`);
        return { indexed, deleted: 0, failed, errors };
    },
};
```

## Complete Example: OpenSearch Sink

```typescript
import { SinkAdapter, SinkContext, SinkResult, StepConfigSchema, JsonObject } from '@oronts/vendure-data-hub-plugin';

interface OpenSearchSinkConfig {
    host: string;
    port?: number;
    ssl?: boolean;
    indexName: string;
    idField: string;
    apiKeySecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
    bulkSize?: number;
    refreshAfterBulk?: boolean;
}

const openSearchSchema: StepConfigSchema = {
    fields: [
        {
            key: 'host',
            label: 'OpenSearch Host',
            type: 'string',
            required: true,
            placeholder: 'opensearch.example.com',
        },
        { key: 'port', label: 'Port', type: 'number', placeholder: '9200' },
        { key: 'ssl', label: 'Use SSL', type: 'boolean' },
        { key: 'indexName', label: 'Index Name', type: 'string', required: true },
        { key: 'idField', label: 'ID Field', type: 'string', required: true, placeholder: 'id' },
        { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'string' },
        { key: 'usernameSecretCode', label: 'Username Secret', type: 'string' },
        { key: 'passwordSecretCode', label: 'Password Secret', type: 'string' },
        { key: 'bulkSize', label: 'Bulk Size', type: 'number', placeholder: '100' },
        { key: 'refreshAfterBulk', label: 'Refresh after bulk', type: 'boolean' },
    ],
};

export const openSearchSink: SinkAdapter<OpenSearchSinkConfig> = {
    type: 'SINK',
    code: 'opensearch',
    name: 'OpenSearch',
    description: 'Index records to OpenSearch cluster',
    category: 'external',
    sinkType: 'CUSTOM',
    schema: openSearchSchema,
    icon: 'search',

    async index(context, config, records): Promise<SinkResult> {
        const { secrets, logger, dryRun } = context;

        // Build base URL
        const protocol = config.ssl !== false ? 'https' : 'http';
        const port = config.port || 9200;
        const baseUrl = `${protocol}://${config.host}:${port}`;

        // Resolve auth
        const apiKey = config.apiKeySecretCode
            ? await secrets.get(config.apiKeySecretCode)
            : undefined;
        const username = config.usernameSecretCode
            ? await secrets.get(config.usernameSecretCode)
            : undefined;
        const password = config.passwordSecretCode
            ? await secrets.get(config.passwordSecretCode)
            : undefined;

        // Build headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-ndjson',
        };
        if (apiKey) {
            headers['Authorization'] = `ApiKey ${apiKey}`;
        } else if (username && password) {
            headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
        }

        if (dryRun) {
            logger.info(`[DRY RUN] Would index ${records.length} records to ${config.indexName}`);
            return { indexed: records.length, deleted: 0, failed: 0 };
        }

        let indexed = 0;
        let failed = 0;
        const errors: Array<{ record: JsonObject; message: string; statusCode?: number }> = [];
        const bulkSize = config.bulkSize || 100;

        for (let i = 0; i < records.length; i += bulkSize) {
            const batch = records.slice(i, i + bulkSize);

            // Build NDJSON bulk body
            const bulkBody: string[] = [];
            for (const record of batch) {
                const docId = String(record[config.idField] ?? '');
                bulkBody.push(JSON.stringify({ index: { _index: config.indexName, _id: docId } }));
                bulkBody.push(JSON.stringify(record));
            }

            try {
                const response = await fetch(`${baseUrl}/_bulk`, {
                    method: 'POST',
                    headers,
                    body: bulkBody.join('\n') + '\n',
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.errors) {
                        for (let j = 0; j < result.items.length; j++) {
                            const item = result.items[j];
                            if (item.index?.error) {
                                failed++;
                                errors.push({
                                    record: batch[j],
                                    message: item.index.error.reason,
                                    statusCode: item.index.status,
                                });
                            } else {
                                indexed++;
                            }
                        }
                    } else {
                        indexed += batch.length;
                    }
                } else {
                    failed += batch.length;
                    const errorText = await response.text();
                    for (const record of batch) {
                        errors.push({ record, message: errorText, statusCode: response.status });
                    }
                }
            } catch (err) {
                failed += batch.length;
                const message = err instanceof Error ? err.message : 'Network error';
                for (const record of batch) {
                    errors.push({ record, message });
                }
            }
        }

        // Optional refresh
        if (config.refreshAfterBulk && indexed > 0) {
            try {
                await fetch(`${baseUrl}/${config.indexName}/_refresh`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                });
            } catch {
                logger.warn('Index refresh failed');
            }
        }

        logger.info(`Indexed ${indexed}, failed ${failed} to ${config.indexName}`);
        return { indexed, deleted: 0, failed, errors };
    },

    async delete(context, config, ids): Promise<SinkResult> {
        const { secrets, logger, dryRun } = context;

        if (dryRun) {
            logger.info(`[DRY RUN] Would delete ${ids.length} documents`);
            return { indexed: 0, deleted: ids.length, failed: 0 };
        }

        const protocol = config.ssl !== false ? 'https' : 'http';
        const port = config.port || 9200;
        const baseUrl = `${protocol}://${config.host}:${port}`;

        const apiKey = config.apiKeySecretCode
            ? await secrets.get(config.apiKeySecretCode)
            : undefined;

        const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson' };
        if (apiKey) headers['Authorization'] = `ApiKey ${apiKey}`;

        const bulkBody = ids.map(id =>
            JSON.stringify({ delete: { _index: config.indexName, _id: id } })
        ).join('\n') + '\n';

        const response = await fetch(`${baseUrl}/_bulk`, {
            method: 'POST',
            headers,
            body: bulkBody,
        });

        if (response.ok) {
            return { indexed: 0, deleted: ids.length, failed: 0 };
        }

        return { indexed: 0, deleted: 0, failed: ids.length };
    },

    async refresh(context, config): Promise<void> {
        const protocol = config.ssl !== false ? 'https' : 'http';
        const port = config.port || 9200;
        await fetch(`${protocol}://${config.host}:${port}/${config.indexName}/_refresh`, {
            method: 'POST',
        });
    },
};
```

## Registration

Register custom sinks via the plugin's `adapters` option:

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { openSearchSink } from './opensearch-sink';
import { mySearchSink } from './my-search-sink';

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            adapters: [
                openSearchSink,
                mySearchSink,
            ],
        }),
    ],
};
```

Or register programmatically:

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';
import { openSearchSink } from './opensearch-sink';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MySinksPlugin implements OnModuleInit {
    constructor(private registry: DataHubRegistryService) {}

    onModuleInit() {
        this.registry.registerAdapter(openSearchSink);
    }
}
```

## Using in Pipelines

```typescript
import { createPipeline } from '@oronts/vendure-data-hub-plugin';

const searchSyncPipeline = createPipeline()
    .name('product-search-sync')
    .extract('products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT',
        relations: 'translations,featuredAsset',
    })
    .transform('prepare', {
        adapterCode: 'map',
        mapping: {
            'id': 'id',
            'name': 'translations.0.name',
            'slug': 'translations.0.slug',
            'image': 'featuredAsset.preview',
        },
    })
    .sink('index-products', {
        adapterCode: 'opensearch',  // Your custom sink code
        host: 'opensearch.example.com',
        indexName: 'products',
        idField: 'id',
        apiKeySecretCode: 'opensearch-key',
        bulkSize: 200,
    })
    .trigger('sync', {
        type: 'SCHEDULE',
        schedule: { cron: '0 */4 * * *' },
    })
    .build();
```

## Context Utilities

### SecretResolver

Resolve secrets stored in Data Hub:

```typescript
async index(context, config, records) {
    const apiKey = await context.secrets.get(config.apiKeySecretCode);
    const username = await context.secrets.get(config.usernameSecretCode);
    // Use secrets...
}
```

### ConnectionResolver

Resolve connection configurations:

```typescript
async index(context, config, records) {
    const connection = await context.connections.get(config.connectionCode);
    const { host, port, credentials } = connection.config;
    // Use connection config...
}
```

### Logger

Use the provided logger:

```typescript
async index(context, config, records) {
    context.logger.debug(`Processing ${records.length} records`);
    context.logger.info(`Indexed successfully`);
    context.logger.warn(`Some records skipped`);
    context.logger.error(`Indexing failed`, error);
}
```

### Dry Run

Check if pipeline is running in dry-run mode:

```typescript
async index(context, config, records) {
    if (context.dryRun) {
        context.logger.info(`[DRY RUN] Would index ${records.length} records`);
        return { indexed: records.length, deleted: 0, failed: 0 };
    }
    // Actual indexing...
}
```

## Schema Field Types

Available field types for configuration schema:

| Type | UI Component | Example |
|------|--------------|---------|
| `string` | Text input | Host, index name |
| `number` | Number input | Port, batch size |
| `boolean` | Checkbox | SSL, refresh |
| `select` | Dropdown | Protocol selection |
| `json` | JSON editor | Custom headers |
| `textarea` | Multi-line text | Query templates |
| `password` | Password input | Inline secrets |

```typescript
const schema: StepConfigSchema = {
    fields: [
        { key: 'host', type: 'string', required: true, label: 'Host' },
        { key: 'port', type: 'number', placeholder: '9200' },
        { key: 'ssl', type: 'boolean', label: 'Use SSL' },
        {
            key: 'protocol',
            type: 'select',
            options: [
                { value: 'http', label: 'HTTP' },
                { value: 'https', label: 'HTTPS' },
            ],
        },
        { key: 'headers', type: 'json', label: 'Custom Headers' },
    ],
};
```

## Error Handling

Return errors in the result for proper tracking:

```typescript
async index(context, config, records) {
    const errors: SinkError[] = [];

    for (const record of records) {
        try {
            await indexRecord(record);
        } catch (err) {
            errors.push({
                record,
                message: err.message,
                statusCode: err.statusCode,
            });
        }
    }

    return {
        indexed: records.length - errors.length,
        deleted: 0,
        failed: errors.length,
        errors,
    };
}
```

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import { openSearchSink } from './opensearch-sink';

describe('OpenSearch Sink', () => {
    const mockContext = {
        ctx: {} as any,
        pipelineId: '123',
        stepKey: 'test-sink',
        secrets: {
            get: vi.fn().mockResolvedValue('test-api-key'),
        },
        connections: { get: vi.fn() },
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        dryRun: false,
    };

    it('should index records successfully', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ errors: false }),
        });

        const records = [
            { id: '1', name: 'Product 1' },
            { id: '2', name: 'Product 2' },
        ];

        const result = await openSearchSink.index(mockContext, {
            host: 'localhost',
            indexName: 'products',
            idField: 'id',
        }, records);

        expect(result.indexed).toBe(2);
        expect(result.failed).toBe(0);
    });

    it('should handle dry run', async () => {
        const dryRunContext = { ...mockContext, dryRun: true };

        const result = await openSearchSink.index(dryRunContext, {
            host: 'localhost',
            indexName: 'products',
            idField: 'id',
        }, [{ id: '1' }]);

        expect(result.indexed).toBe(1);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
```
