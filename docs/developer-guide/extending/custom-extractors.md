# Custom Extractors

Create extractors to pull data from new sources.

## Interface

```typescript
interface ExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'EXTRACTOR';
    readonly code: string;
    readonly name?: string;
    readonly description?: string;
    readonly schema: StepConfigSchema;

    extract(
        context: ExtractContext,
        config: TConfig,
    ): AsyncGenerator<RecordEnvelope>;
}

// Alternative: batch extraction
interface BatchExtractorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    extractAll(context: ExtractContext, config: TConfig): Promise<ExtractResult>;
}

interface ExtractContext {
    ctx: RequestContext;
    pipelineId: ID;
    stepKey: string;
    checkpoint: PipelineCheckpoint;
    secrets: SecretResolver;
    connections: ConnectionResolver;
    logger: AdapterLogger;
    setCheckpoint(data: JsonObject): void;
}

interface RecordEnvelope {
    data: JsonObject;
    meta?: RecordMeta;
}
```

## Basic Example

```typescript
import { Injectable } from '@nestjs/common';
import { ExtractorAdapter, ExtractContext, StepConfigSchema, RecordEnvelope } from '@oronts/vendure-data-hub-plugin';

interface MyApiConfig {
    apiUrl: string;
    apiKeySecretCode: string;
    pageSize?: number;
}

@Injectable()
export class MyApiExtractor implements ExtractorAdapter<MyApiConfig> {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'my-api';
    readonly name = 'My API Extractor';
    readonly description = 'Fetches data from My API';

    readonly schema: StepConfigSchema = {
        fields: [
            { key: 'apiUrl', type: 'string', required: true, label: 'API URL' },
            { key: 'apiKeySecretCode', type: 'string', required: true, label: 'API Key Secret' },
            { key: 'pageSize', type: 'number', required: false, default: 100 },
        ],
    };

    async *extract(
        context: ExtractContext,
        config: MyApiConfig,
    ): AsyncGenerator<RecordEnvelope> {
        const { apiUrl, apiKeySecretCode, pageSize = 100 } = config;
        const { secrets, logger } = context;

        // Resolve API key from secrets
        const apiKey = await secrets.get(apiKeySecretCode);

        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(`${apiUrl}?page=${page}&limit=${pageSize}`, {
                headers: { 'X-API-Key': apiKey },
            });

            const data = await response.json();

            for (const item of data.items) {
                yield { data: item };
            }

            // Update checkpoint for resumability
            context.setCheckpoint({ lastPage: page });

            hasMore = data.items.length === pageSize;
            page++;
        }
    }
}
```

## Registering the Extractor

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';
import { MyApiExtractor } from './my-api.extractor';

@VendurePlugin({
    imports: [DataHubPlugin],
    providers: [MyApiExtractor],
})
export class MyExtractorPlugin implements OnModuleInit {
    constructor(
        private registry: DataHubRegistryService,
        private extractor: MyApiExtractor,
    ) {}

    onModuleInit() {
        this.registry.registerRuntime(this.extractor);
    }
}
```

## Config Schema

Define the configuration UI:

```typescript
readonly schema: StepConfigSchema = {
    fields: [
        // Text input
        { key: 'url', type: 'string', required: true, label: 'URL' },

        // Number input
        { key: 'limit', type: 'number', required: false, default: 100 },

        // Secret (masked input, resolved from secrets)
        { key: 'apiKey', type: 'secret', required: true, label: 'API Key' },

        // Dropdown
        {
            key: 'format',
            type: 'select',
            options: [
                { value: 'json', label: 'JSON' },
                { value: 'xml', label: 'XML' },
            ],
            default: 'json',
        },

        // Boolean
        { key: 'includeDeleted', type: 'boolean', default: false },

        // Connection reference
        { key: 'connection', type: 'connection', required: true },
    ],
};
```

## Extraction Context

The context provides pipeline runtime information and services:

```typescript
interface ExtractContext {
    ctx: RequestContext;            // Vendure request context
    pipelineId: ID;                 // Current pipeline ID
    stepKey: string;                // Current step key
    checkpoint: PipelineCheckpoint; // Resume data
    secrets: SecretResolver;        // Resolve secret values
    connections: ConnectionResolver; // Resolve connections
    logger: AdapterLogger;          // Logging
    setCheckpoint(data: JsonObject): void;  // Save progress
}
```

### Using Checkpoints

Resume from last position:

```typescript
async *extract(context, config) {
    const { checkpoint, logger } = context;
    const startFrom = checkpoint?.data?.lastId || 0;

    const items = await fetchItems({ after: startFrom });

    for (const item of items) {
        yield { data: item };

        // Update checkpoint periodically for resumability
        if (item.id % 100 === 0) {
            context.setCheckpoint({ lastId: item.id });
            logger.debug(`Checkpoint saved at ID ${item.id}`);
        }
    }
}
```

### Using Logger

```typescript
async *extract(context, config) {
    context.logger.info('Starting extraction');

    try {
        const data = await fetchData();
        context.logger.debug(`Fetched ${data.length} records`);

        for (const item of data) {
            yield { data: item };
        }

        context.logger.info('Extraction complete');
    } catch (error) {
        context.logger.error('Extraction failed', error);
        throw error;
    }
}
```

## Handling Pagination

### Offset-based

```typescript
async *extract(context, config) {
    let offset = 0;
    const limit = 100;

    while (true) {
        const data = await fetch(`${url}?offset=${offset}&limit=${limit}`);
        const items = await data.json();

        if (items.length === 0) break;

        for (const item of items) {
            yield { data: item };
        }

        offset += items.length;
    }
}
```

### Cursor-based

```typescript
async *extract(context, config) {
    let cursor: string | null = null;

    while (true) {
        const url = cursor
            ? `${baseUrl}?cursor=${cursor}`
            : baseUrl;

        const response = await fetch(url);
        const { items, nextCursor } = await response.json();

        for (const item of items) {
            yield { data: item };
        }

        if (!nextCursor) break;
        cursor = nextCursor;
    }
}
```

## Error Handling

`ExtractorError` is an interface, not a class. Use a plain `Error` with structured
properties attached:

```typescript
import type { ExtractorError } from '@oronts/vendure-data-hub-plugin';

async *extract(context, config) {
    try {
        const response = await fetch(config.url);

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`) as Error & ExtractorError;
            Object.assign(error, {
                code: 'HTTP_ERROR',
                statusCode: response.status,
                recoverable: response.status >= 500,
            });
            throw error;
        }

        // ...
    } catch (error) {
        if (error instanceof Error && 'code' in error) {
            throw error;
        }

        const wrapped = new Error(error.message);
        Object.assign(wrapped, {
            code: 'EXTRACTOR_ERROR',
            recoverable: true,
            cause: error,
        });
        throw wrapped;
    }
}
```

## Using Connections

Access saved connections via the context resolver:

```typescript
@Injectable()
export class MyExtractor implements ExtractorAdapter {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'my-extractor';
    readonly schema = { fields: [] };

    async *extract(context, config) {
        const connection = await context.connections.getRequired(config.connectionCode);

        const client = createClient({
            host: connection.config.host,
            port: connection.config.port,
        });

        // Use client...
    }
}
```

## Using Secrets

Access secret values via the context resolver:

```typescript
@Injectable()
export class MyExtractor implements ExtractorAdapter {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'my-extractor';
    readonly schema = { fields: [] };

    async *extract(context, config) {
        const apiKey = await context.secrets.getRequired(config.apiKeySecretCode);

        // Use apiKey...
    }
}
```

## Complete Example: GraphQL API Extractor

```typescript
import { Injectable } from '@nestjs/common';
import {
    ExtractorAdapter,
    ExtractContext,
    StepConfigSchema,
    JsonObject,
    RecordEnvelope,
} from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class GraphQLExtractor implements ExtractorAdapter {
    readonly type = 'EXTRACTOR' as const;
    readonly code = 'graphql-api';
    readonly name = 'GraphQL API';
    readonly description = 'Fetch data from GraphQL APIs';

    readonly schema: StepConfigSchema = {
        fields: [
            { key: 'endpoint', type: 'string', required: true, label: 'GraphQL Endpoint' },
            { key: 'query', type: 'text', required: true, label: 'Query' },
            { key: 'variables', type: 'json', required: false, label: 'Variables' },
            { key: 'itemsPath', type: 'string', required: true, label: 'Items Path' },
            { key: 'bearerToken', type: 'secret', required: false, label: 'Bearer Token' },
        ],
    };

    async *extract(
        context: ExtractContext,
        config: JsonObject,
    ): AsyncGenerator<RecordEnvelope> {
        const { endpoint, query, variables, itemsPath, bearerToken } = config;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (bearerToken) {
            const token = await context.secrets.get(String(bearerToken));
            if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        context.logger.info(`Querying GraphQL endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            const error = new Error(`GraphQL request failed: ${response.status}`);
            Object.assign(error, { code: 'HTTP_ERROR', recoverable: response.status >= 500 });
            throw error;
        }

        const result = await response.json();

        if (result.errors) {
            const error = new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            Object.assign(error, { code: 'GRAPHQL_ERROR', recoverable: false });
            throw error;
        }

        // Navigate to items using path
        const items = itemsPath.split('.').reduce(
            (obj, key) => obj?.[key],
            result.data,
        );

        if (!Array.isArray(items)) {
            const error = new Error(`Items path "${itemsPath}" did not return an array`);
            Object.assign(error, { code: 'INVALID_PATH', recoverable: false });
            throw error;
        }

        context.logger.info(`Extracted ${items.length} items`);

        for (const item of items) {
            yield { data: item };
        }
    }
}
```
