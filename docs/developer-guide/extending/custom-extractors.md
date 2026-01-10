# Custom Extractors

Create extractors to pull data from new sources.

## Interface

```typescript
interface DataExtractor {
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly configSchema: AdapterSchema;

    extract(
        ctx: RequestContext,
        config: JsonObject,
        context: ExtractionContext,
    ): AsyncGenerator<JsonObject>;
}
```

## Basic Example

```typescript
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DataExtractor, ExtractionContext, AdapterSchema } from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class MyApiExtractor implements DataExtractor {
    readonly code = 'my-api';
    readonly name = 'My API Extractor';
    readonly description = 'Fetches data from My API';

    readonly configSchema: AdapterSchema = {
        fields: [
            { key: 'apiUrl', type: 'string', required: true, label: 'API URL' },
            { key: 'apiKey', type: 'secret', required: true, label: 'API Key' },
            { key: 'pageSize', type: 'number', required: false, default: 100 },
        ],
    };

    async *extract(
        ctx: RequestContext,
        config: JsonObject,
        context: ExtractionContext,
    ): AsyncGenerator<JsonObject> {
        const { apiUrl, apiKey, pageSize = 100 } = config as {
            apiUrl: string;
            apiKey: string;
            pageSize?: number;
        };

        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(`${apiUrl}?page=${page}&limit=${pageSize}`, {
                headers: { 'X-API-Key': apiKey },
            });

            const data = await response.json();

            for (const item of data.items) {
                yield item;
            }

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
        this.registry.registerExtractor(this.extractor.code, this.extractor);
    }
}
```

## Config Schema

Define the configuration UI:

```typescript
readonly configSchema: AdapterSchema = {
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

The context provides pipeline runtime information:

```typescript
interface ExtractionContext {
    runId: string;
    pipelineId: string;
    pipelineCode: string;
    triggeredBy: string;
    parameters: Record<string, any>;
    checkpoint?: CheckpointData;
    logger: ExecutionLogger;
}
```

### Using Checkpoints

Resume from last position:

```typescript
async *extract(ctx, config, context) {
    const startFrom = context.checkpoint?.lastId || 0;

    const items = await fetchItems({ after: startFrom });

    for (const item of items) {
        yield item;

        // Update checkpoint periodically
        if (item.id % 100 === 0) {
            context.checkpoint = { lastId: item.id };
        }
    }
}
```

### Using Logger

```typescript
async *extract(ctx, config, context) {
    context.logger.info('Starting extraction');

    try {
        const data = await fetchData();
        context.logger.debug(`Fetched ${data.length} records`);

        for (const item of data) {
            yield item;
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
async *extract(ctx, config, context) {
    let offset = 0;
    const limit = 100;

    while (true) {
        const data = await fetch(`${url}?offset=${offset}&limit=${limit}`);
        const items = await data.json();

        if (items.length === 0) break;

        for (const item of items) {
            yield item;
        }

        offset += items.length;
    }
}
```

### Cursor-based

```typescript
async *extract(ctx, config, context) {
    let cursor: string | null = null;

    while (true) {
        const url = cursor
            ? `${baseUrl}?cursor=${cursor}`
            : baseUrl;

        const response = await fetch(url);
        const { items, nextCursor } = await response.json();

        for (const item of items) {
            yield item;
        }

        if (!nextCursor) break;
        cursor = nextCursor;
    }
}
```

## Error Handling

```typescript
import { ExtractorError } from '@oronts/vendure-data-hub-plugin';

async *extract(ctx, config, context) {
    try {
        const response = await fetch(config.url);

        if (!response.ok) {
            throw new ExtractorError(`HTTP ${response.status}`, {
                retryable: response.status >= 500,
                code: 'HTTP_ERROR',
            });
        }

        // ...
    } catch (error) {
        if (error instanceof ExtractorError) {
            throw error;
        }

        throw new ExtractorError(error.message, {
            retryable: true,
            cause: error,
        });
    }
}
```

## Using Connections

Access saved connections:

```typescript
import { ConnectionService } from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class MyExtractor implements DataExtractor {
    constructor(private connectionService: ConnectionService) {}

    async *extract(ctx, config, context) {
        const connection = await this.connectionService.getConnection(
            ctx,
            config.connectionCode,
        );

        const client = createClient({
            host: connection.settings.host,
            port: connection.settings.port,
            password: connection.settings.password, // Already resolved
        });

        // Use client...
    }
}
```

## Using Secrets

Access secret values:

```typescript
import { SecretService } from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class MyExtractor implements DataExtractor {
    constructor(private secretService: SecretService) {}

    async *extract(ctx, config, context) {
        const apiKey = await this.secretService.resolveSecretValue(
            ctx,
            config.apiKeySecretCode,
        );

        // Use apiKey...
    }
}
```

## Complete Example: GraphQL API Extractor

```typescript
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import {
    DataExtractor,
    ExtractionContext,
    AdapterSchema,
    SecretService,
    ExtractorError,
} from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class GraphQLExtractor implements DataExtractor {
    readonly code = 'graphql-api';
    readonly name = 'GraphQL API';
    readonly description = 'Fetch data from GraphQL APIs';

    readonly configSchema: AdapterSchema = {
        fields: [
            { key: 'endpoint', type: 'string', required: true, label: 'GraphQL Endpoint' },
            { key: 'query', type: 'text', required: true, label: 'Query' },
            { key: 'variables', type: 'json', required: false, label: 'Variables' },
            { key: 'itemsPath', type: 'string', required: true, label: 'Items Path' },
            { key: 'bearerToken', type: 'secret', required: false, label: 'Bearer Token' },
        ],
    };

    constructor(private secretService: SecretService) {}

    async *extract(
        ctx: RequestContext,
        config: JsonObject,
        context: ExtractionContext,
    ): AsyncGenerator<JsonObject> {
        const { endpoint, query, variables, itemsPath, bearerToken } = config;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (bearerToken) {
            const token = await this.secretService.resolveSecretValue(ctx, bearerToken);
            headers['Authorization'] = `Bearer ${token}`;
        }

        context.logger.info(`Querying GraphQL endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new ExtractorError(`GraphQL request failed: ${response.status}`, {
                retryable: response.status >= 500,
            });
        }

        const result = await response.json();

        if (result.errors) {
            throw new ExtractorError(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }

        // Navigate to items using path
        const items = itemsPath.split('.').reduce(
            (obj, key) => obj?.[key],
            result.data,
        );

        if (!Array.isArray(items)) {
            throw new ExtractorError(`Items path "${itemsPath}" did not return an array`);
        }

        context.logger.info(`Extracted ${items.length} items`);

        for (const item of items) {
            yield item;
        }
    }
}
```
