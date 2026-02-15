# Extending the Plugin

Create custom extractors, loaders, operators, sinks, feeds, and triggers to extend Data Hub functionality.

## Contents

1. [Custom Extractors](./custom-extractors.md) - Pull data from new sources
2. [Custom Loaders](./custom-loaders.md) - Load data to new entity types
3. [Custom Operators](./custom-operators.md) - Add new transform operations
4. [Custom Sinks](./custom-sinks.md) - Index to custom search engines
5. [Custom Feeds](./custom-feeds.md) - Generate custom product feeds
6. [Custom Triggers](./custom-triggers.md) - Add new trigger types (queues, etc.)
7. [Validator Adapters](#validator-adapters) - Validate records against rules
8. [Enricher Adapters](#enricher-adapters) - Enrich records with external data
9. [Exporter Adapters](#exporter-adapters) - Export to external systems

## When to Extend

Create custom adapters when you need to:

- Connect to proprietary systems (ERP, PIM, WMS)
- Implement business-specific logic
- Load to custom Vendure entities
- Add specialized transformations
- Index to custom search engines
- Generate marketplace-specific feeds
- Trigger pipelines from message queues

## Extension Points

| Adapter Type | Purpose | Interface | Documentation |
|--------------|---------|-----------|---------------|
| Extractor | Pull data from sources | `ExtractorAdapter` | [Guide](./custom-extractors.md) |
| Operator | Transform record fields | `OperatorAdapter` | [Guide](./custom-operators.md) |
| Loader | Load to Vendure entities | `LoaderAdapter` | [Guide](./custom-loaders.md) |
| Sink | Index to search engines | `SinkAdapter` | [Guide](./custom-sinks.md) |
| Feed Generator | Create product feeds | `FeedAdapter` | [Guide](./custom-feeds.md) |
| Trigger | Start pipelines from events | `TriggerAdapter` | [Guide](./custom-triggers.md) |
| Validator | Validate records | `ValidatorAdapter` | [Guide](#validator-adapters) |
| Enricher | Enrich with external data | `EnricherAdapter` | [Guide](#enricher-adapters) |
| Exporter | Export to external targets | `ExporterAdapter` | [Guide](#exporter-adapters) |

## Quick Registration

### Via Plugin Options (Recommended)

```typescript
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { myExtractor } from './my-extractor';
import { myOperator } from './my-operator';
import { myLoader } from './my-loader';
import { mySink } from './my-sink';
import { myFeedGenerator } from './my-feed-generator';

export const config: VendureConfig = {
    plugins: [
        DataHubPlugin.init({
            // Register all custom adapters
            adapters: [
                myExtractor,
                myOperator,
                myLoader,
                mySink,
            ],
            // Register custom feed generators
            feedGenerators: [
                myFeedGenerator,
            ],
        }),
    ],
};
```

### Programmatic Registration

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService, FeedGeneratorService } from '@oronts/vendure-data-hub-plugin';

@VendurePlugin({
    imports: [DataHubPlugin],
})
export class MyExtensionPlugin implements OnModuleInit {
    constructor(
        private registry: DataHubRegistryService,
        private feedService: FeedGeneratorService,
    ) {}

    onModuleInit() {
        // Register adapters using type-specific methods
        this.registry.registerExtractor(myExtractor);
        this.registry.registerOperator(myOperator);
        this.registry.registerLoader(myLoader);
        this.registry.registerSink(mySink);

        // Or use generic registration
        this.registry.registerAdapter(myFeedAdapter);

        // Register feed generators
        this.feedService.registerCustomGenerator(myFeedGenerator);
    }
}
```

## Adapter Structure

All adapters follow a common structure:

```typescript
interface BaseAdapter {
    // Required
    type: AdapterType;    // 'EXTRACTOR' | 'OPERATOR' | 'LOADER' | 'SINK' | etc.
    code: string;         // Unique identifier
    schema: StepConfigSchema;  // Configuration form

    // Optional metadata
    name?: string;        // Display name
    description?: string; // Help text
    category?: string;    // UI grouping
    icon?: string;        // Icon name
    version?: string;     // Adapter version
}
```

## Schema Definition

Define configuration UI with schema fields:

```typescript
const schema: StepConfigSchema = {
    fields: [
        // Text input
        { key: 'host', type: 'string', required: true, label: 'Host', placeholder: 'api.example.com' },

        // Number input
        { key: 'port', type: 'number', label: 'Port', placeholder: '443' },

        // Checkbox
        { key: 'ssl', type: 'boolean', label: 'Use SSL' },

        // Dropdown
        { key: 'method', type: 'select', label: 'Method', options: [
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
        ]},

        // JSON editor
        { key: 'headers', type: 'json', label: 'Headers' },

        // Multi-line text
        { key: 'query', type: 'textarea', label: 'Query' },

        // Secret reference
        { key: 'apiKeySecretCode', type: 'string', label: 'API Key Secret' },
    ],
};
```

## Context Objects

Adapters receive context with useful services:

```typescript
interface AdapterContext {
    ctx: RequestContext;           // Vendure request context
    pipelineId: ID;                // Current pipeline ID
    stepKey: string;               // Current step key
    secrets: SecretResolver;       // Resolve secret values
    connections: ConnectionResolver; // Resolve connections
    logger: AdapterLogger;         // Logging
    dryRun: boolean;               // Skip actual writes
}
```

### Using Secrets

```typescript
async execute(context, config) {
    const apiKey = await context.secrets.get(config.apiKeySecretCode);
    // Use apiKey...
}
```

### Using Connections

```typescript
async execute(context, config) {
    const connection = await context.connections.get(config.connectionCode);
    const { host, port, credentials } = connection.config;
    // Use connection config...
}
```

### Logging

```typescript
async execute(context, config) {
    context.logger.debug('Starting processing');
    context.logger.info(`Processed ${count} records`);
    context.logger.warn('Field missing, using default');
    context.logger.error('Processing failed', error);
}
```

## Best Practices

### Error Handling

Return errors in results for proper tracking:

```typescript
async execute(context, config, records) {
    const errors = [];

    for (const record of records) {
        try {
            await process(record);
        } catch (error) {
            errors.push({
                record,
                message: error.message,
                field: error.field,
                recoverable: error.code !== 'FATAL',
            });
        }
    }

    return { succeeded: records.length - errors.length, failed: errors.length, errors };
}
```

### Dry Run Support

Always check `context.dryRun`:

```typescript
async execute(context, config, records) {
    if (context.dryRun) {
        context.logger.info(`[DRY RUN] Would process ${records.length} records`);
        return { succeeded: records.length, failed: 0 };
    }

    // Actual processing...
}
```

### Batch Processing

Process records in batches for efficiency:

```typescript
const BATCH_SIZE = 100;

async execute(context, config, records) {
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        await processBatch(batch);
    }
}
```

### Streaming for Large Datasets

Use async generators for extractors:

```typescript
async *extract(context, config) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const data = await fetchPage(page);
        for (const item of data.items) {
            yield { data: item };
        }
        hasMore = data.hasMore;
        page++;
    }
}
```

### Caching

Cache repeated lookups:

```typescript
private cache = new Map<string, any>();

async lookup(key: string) {
    if (this.cache.has(key)) {
        return this.cache.get(key);
    }
    const value = await fetchFromApi(key);
    this.cache.set(key, value);
    return value;
}
```

## Testing

### Unit Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myOperator } from './my-operator';

describe('MyOperator', () => {
    const mockHelpers = {
        get: (record, path) => record[path],
        set: (record, path, value) => { record[path] = value; },
    };

    it('should transform records', () => {
        const records = [{ name: 'Test' }];
        const config = { field: 'name', uppercase: true };

        const result = myOperator.apply(records, config, mockHelpers);

        expect(result.records[0].name).toBe('TEST');
    });
});
```

### Integration Testing

```typescript
import { createTestEnvironment } from '@vendure/testing';
import { DataHubPlugin } from '@oronts/vendure-data-hub-plugin';
import { myExtractor } from './my-extractor';

describe('MyExtractor Integration', () => {
    const { server, adminClient } = createTestEnvironment({
        plugins: [
            DataHubPlugin.init({
                adapters: [myExtractor],
            }),
        ],
    });

    beforeAll(async () => {
        await server.init({ ... });
    });

    it('should extract data from source', async () => {
        // Test with real pipeline execution
    });
});
```

## Validator Adapters

Validators check records against rules and separate valid from invalid records.

### Interface

```typescript
interface ValidatorAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'VALIDATOR';

    validate(
        context: ValidateContext,
        config: TConfig,
        records: readonly JsonObject[],
    ): Promise<ValidationResult>;
}

interface ValidateContext {
    readonly ctx: RequestContext;
    readonly pipelineId: ID;
    readonly stepKey: string;
    readonly pipelineContext: PipelineCtx;
    readonly mode: 'FAIL_FAST' | 'ACCUMULATE';  // Stop on first error or collect all
    readonly logger: AdapterLogger;
}

interface ValidationResult {
    readonly valid: readonly JsonObject[];      // Records that passed validation
    readonly invalid: readonly InvalidRecord[]; // Records that failed validation
}

interface InvalidRecord {
    readonly record: JsonObject;
    readonly errors: readonly ValidationError[];
}

interface ValidationError {
    readonly field?: string;   // Field that failed validation
    readonly rule: string;     // Validation rule that failed
    readonly message: string;  // Human-readable error message
    readonly code?: string;    // Error code for programmatic handling
}
```

### Example: Schema Validator

```typescript
import { ValidatorAdapter, ValidateContext, ValidationResult, JsonObject, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';

interface SchemaValidatorConfig {
    rules: Array<{
        field: string;
        type: 'required' | 'string' | 'number' | 'email' | 'url' | 'regex';
        pattern?: string;
        min?: number;
        max?: number;
        message?: string;
    }>;
    failOnFirstError?: boolean;
}

const schemaValidatorSchema: StepConfigSchema = {
    fields: [
        { key: 'rules', type: 'json', label: 'Validation Rules', required: true },
        { key: 'failOnFirstError', type: 'boolean', label: 'Fail on First Error' },
    ],
};

export const schemaValidator: ValidatorAdapter<SchemaValidatorConfig> = {
    type: 'VALIDATOR',
    code: 'schema-validator',
    name: 'Schema Validator',
    description: 'Validate records against a schema definition',
    category: 'validation',
    schema: schemaValidatorSchema,

    async validate(
        context: ValidateContext,
        config: SchemaValidatorConfig,
        records: readonly JsonObject[],
    ): Promise<ValidationResult> {
        const valid: JsonObject[] = [];
        const invalid: Array<{ record: JsonObject; errors: Array<{ field?: string; rule: string; message: string }> }> = [];

        for (const record of records) {
            const errors: Array<{ field: string; rule: string; message: string }> = [];

            for (const rule of config.rules) {
                const value = record[rule.field];
                let isValid = true;
                let message = rule.message || '';

                switch (rule.type) {
                    case 'required':
                        isValid = value !== undefined && value !== null && value !== '';
                        message = message || `${rule.field} is required`;
                        break;

                    case 'string':
                        isValid = typeof value === 'string';
                        if (isValid && rule.min !== undefined) isValid = value.length >= rule.min;
                        if (isValid && rule.max !== undefined) isValid = value.length <= rule.max;
                        message = message || `${rule.field} must be a string`;
                        break;

                    case 'number':
                        isValid = typeof value === 'number' && !isNaN(value);
                        if (isValid && rule.min !== undefined) isValid = value >= rule.min;
                        if (isValid && rule.max !== undefined) isValid = value <= rule.max;
                        message = message || `${rule.field} must be a valid number`;
                        break;

                    case 'email':
                        isValid = typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                        message = message || `${rule.field} must be a valid email`;
                        break;

                    case 'url':
                        try {
                            new URL(value);
                            isValid = true;
                        } catch {
                            isValid = false;
                        }
                        message = message || `${rule.field} must be a valid URL`;
                        break;

                    case 'regex':
                        if (rule.pattern) {
                            isValid = new RegExp(rule.pattern).test(String(value || ''));
                        }
                        message = message || `${rule.field} does not match pattern`;
                        break;
                }

                if (!isValid) {
                    errors.push({ field: rule.field, rule: rule.type, message });
                    if (config.failOnFirstError) break;
                }
            }

            if (errors.length > 0) {
                invalid.push({ record, errors });
            } else {
                valid.push(record);
            }
        }

        context.logger.info(`Validated ${records.length} records: ${valid.length} valid, ${invalid.length} invalid`);
        return { valid, invalid };
    },
};
```

### Registration

```typescript
DataHubPlugin.init({
    adapters: [schemaValidator],
})
```

---

## Enricher Adapters

Enrichers add data to records from external sources (APIs, databases, lookups).

### Interface

```typescript
interface EnricherAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'ENRICHER';

    enrich(
        context: EnrichContext,
        config: TConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult>;
}

interface EnrichContext {
    readonly ctx: RequestContext;
    readonly pipelineId: ID;
    readonly stepKey: string;
    readonly pipelineContext: PipelineCtx;
    readonly secrets: SecretResolver;
    readonly connections: ConnectionResolver;
    readonly logger: AdapterLogger;
}

interface EnrichResult {
    readonly records: readonly JsonObject[];  // Enriched records
    readonly errors?: readonly EnrichError[]; // Enrichment errors
}

interface EnrichError {
    readonly record: JsonObject;
    readonly message: string;
}
```

### Example: API Lookup Enricher

```typescript
import { EnricherAdapter, EnrichContext, EnrichResult, JsonObject, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';

interface ApiLookupConfig {
    lookupField: string;
    apiUrl: string;
    apiKeySecretCode?: string;
    resultPath?: string;
    targetField: string;
    cacheResults?: boolean;
    batchSize?: number;
}

const apiLookupSchema: StepConfigSchema = {
    fields: [
        { key: 'lookupField', type: 'string', label: 'Lookup Field', required: true },
        { key: 'apiUrl', type: 'string', label: 'API URL Template', required: true,
          placeholder: 'https://api.example.com/lookup/{{value}}' },
        { key: 'apiKeySecretCode', type: 'string', label: 'API Key Secret' },
        { key: 'resultPath', type: 'string', label: 'Result Path', placeholder: 'data.result' },
        { key: 'targetField', type: 'string', label: 'Target Field', required: true },
        { key: 'cacheResults', type: 'boolean', label: 'Cache Results' },
        { key: 'batchSize', type: 'number', label: 'Batch Size', placeholder: '10' },
    ],
};

export const apiLookupEnricher: EnricherAdapter<ApiLookupConfig> = {
    type: 'ENRICHER',
    code: 'api-lookup',
    name: 'API Lookup Enricher',
    description: 'Enrich records with data from an external API',
    category: 'enrichment',
    schema: apiLookupSchema,
    async: true,
    batchable: true,

    async enrich(
        context: EnrichContext,
        config: ApiLookupConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult> {
        const { secrets, logger } = context;
        const enrichedRecords: JsonObject[] = [];
        const errors: Array<{ record: JsonObject; message: string }> = [];
        const cache = new Map<string, unknown>();

        // Resolve API key if provided
        const apiKey = config.apiKeySecretCode
            ? await secrets.get(config.apiKeySecretCode)
            : undefined;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        for (const record of records) {
            try {
                const lookupValue = String(record[config.lookupField] || '');

                if (!lookupValue) {
                    enrichedRecords.push(record);
                    continue;
                }

                // Check cache
                if (config.cacheResults && cache.has(lookupValue)) {
                    enrichedRecords.push({
                        ...record,
                        [config.targetField]: cache.get(lookupValue),
                    });
                    continue;
                }

                // Make API call
                const url = config.apiUrl.replace('{{value}}', encodeURIComponent(lookupValue));
                const response = await fetch(url, { headers });

                if (!response.ok) {
                    throw new Error(`API returned ${response.status}`);
                }

                const data = await response.json();

                // Extract result using path
                let result = data;
                if (config.resultPath) {
                    for (const key of config.resultPath.split('.')) {
                        result = result?.[key];
                    }
                }

                // Cache result
                if (config.cacheResults) {
                    cache.set(lookupValue, result);
                }

                enrichedRecords.push({
                    ...record,
                    [config.targetField]: result,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                logger.warn(`Failed to enrich record: ${message}`);
                errors.push({ record, message });
                // Still include original record on error
                enrichedRecords.push(record);
            }
        }

        logger.info(`Enriched ${enrichedRecords.length} records with ${errors.length} errors`);
        return { records: enrichedRecords, errors };
    },
};
```

### Example: Database Lookup Enricher

```typescript
import { EnricherAdapter, EnrichContext, EnrichResult, JsonObject, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';

interface DbLookupConfig {
    connectionCode: string;
    lookupField: string;
    table: string;
    matchColumn: string;
    selectColumns: string[];
    targetPrefix?: string;
}

export const dbLookupEnricher: EnricherAdapter<DbLookupConfig> = {
    type: 'ENRICHER',
    code: 'db-lookup',
    name: 'Database Lookup Enricher',
    description: 'Enrich records with data from a database table',
    category: 'enrichment',
    schema: {
        fields: [
            { key: 'connectionCode', type: 'string', label: 'Connection', required: true },
            { key: 'lookupField', type: 'string', label: 'Lookup Field', required: true },
            { key: 'table', type: 'string', label: 'Table Name', required: true },
            { key: 'matchColumn', type: 'string', label: 'Match Column', required: true },
            { key: 'selectColumns', type: 'json', label: 'Select Columns', required: true },
            { key: 'targetPrefix', type: 'string', label: 'Target Field Prefix' },
        ],
    },
    async: true,

    async enrich(
        context: EnrichContext,
        config: DbLookupConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult> {
        const { connections, logger } = context;

        // Get database connection
        const connection = await connections.get(config.connectionCode);
        if (!connection) {
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        // Build lookup map for batch efficiency
        const lookupValues = [...new Set(records.map(r => r[config.lookupField]).filter(Boolean))];

        // Query database (pseudocode - implement with your DB client)
        const lookupMap = new Map<string, JsonObject>();
        // const results = await db.query(
        //   `SELECT ${config.selectColumns.join(',')} FROM ${config.table} WHERE ${config.matchColumn} IN (?)`,
        //   [lookupValues]
        // );
        // results.forEach(row => lookupMap.set(row[config.matchColumn], row));

        const enrichedRecords = records.map(record => {
            const lookupValue = String(record[config.lookupField] || '');
            const lookupData = lookupMap.get(lookupValue);

            if (!lookupData) return record;

            const prefix = config.targetPrefix || '';
            const enriched = { ...record };
            for (const col of config.selectColumns) {
                enriched[`${prefix}${col}`] = lookupData[col];
            }
            return enriched;
        });

        logger.info(`Enriched ${records.length} records from ${config.table}`);
        return { records: enrichedRecords };
    },
};
```

### Registration

```typescript
DataHubPlugin.init({
    adapters: [apiLookupEnricher, dbLookupEnricher],
})
```

---

## Exporter Adapters

Exporters send data to external systems (files, APIs, cloud storage, data warehouses).

### Interface

```typescript
interface ExporterAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'EXPORTER';
    readonly targetType: ExportTargetType;
    readonly formats?: readonly ExportFormat[];

    export(
        context: ExportContext,
        config: TConfig,
        records: readonly JsonObject[],
    ): Promise<ExportResult>;

    finalize?(context: ExportContext, config: TConfig): Promise<void>;
}

type ExportTargetType =
    | 'FILE'        // CSV, JSON, XML files
    | 'FEED'        // Google Merchant, Meta, etc.
    | 'API'         // REST/GraphQL endpoints
    | 'SEARCH'      // Elasticsearch, MeiliSearch
    | 'WAREHOUSE'   // BigQuery, Snowflake, Redshift
    | 'MESSAGING'   // RabbitMQ, Kafka
    | 'STORAGE';    // S3, GCS, Azure Blob

type ExportFormat = 'CSV' | 'JSON' | 'NDJSON' | 'XML' | 'PARQUET' | 'AVRO';

interface ExportContext {
    readonly ctx: RequestContext;
    readonly pipelineId: ID;
    readonly stepKey: string;
    readonly pipelineContext: PipelineCtx;
    readonly secrets: SecretResolver;
    readonly connections: ConnectionResolver;
    readonly logger: AdapterLogger;
    readonly dryRun: boolean;
    readonly incremental: boolean;
    readonly checkpoint: PipelineCheckpoint;
    setCheckpoint(data: JsonObject): void;
}

interface ExportResult {
    readonly succeeded: number;
    readonly failed: number;
    readonly exported?: number;
    readonly skipped?: number;
    readonly errors?: readonly ExportError[];
    readonly outputPath?: string;   // Local file path if exported to file
    readonly outputUrl?: string;    // URL if exported to cloud storage
    readonly metadata?: JsonObject;
}

interface ExportError {
    readonly record: JsonObject;
    readonly message: string;
    readonly code?: string;
    readonly recoverable?: boolean;
}
```

### Example: S3 File Exporter

```typescript
import { ExporterAdapter, ExportContext, ExportResult, JsonObject, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface S3ExportConfig {
    connectionCode: string;
    bucket: string;
    keyTemplate: string;
    format: 'JSON' | 'NDJSON' | 'CSV';
    compress?: boolean;
}

const s3ExportSchema: StepConfigSchema = {
    fields: [
        { key: 'connectionCode', type: 'string', label: 'S3 Connection', required: true },
        { key: 'bucket', type: 'string', label: 'Bucket Name', required: true },
        { key: 'keyTemplate', type: 'string', label: 'Key Template', required: true,
          placeholder: 'exports/${date}/${pipeline}.json' },
        { key: 'format', type: 'select', label: 'Format', required: true,
          options: [
            { value: 'json', label: 'JSON' },
            { value: 'ndjson', label: 'NDJSON (Line-delimited)' },
            { value: 'csv', label: 'CSV' },
          ] },
        { key: 'compress', type: 'boolean', label: 'Compress (gzip)' },
    ],
};

export const s3Exporter: ExporterAdapter<S3ExportConfig> = {
    type: 'EXPORTER',
    code: 's3-export',
    name: 'S3 File Export',
    description: 'Export records to S3 bucket',
    category: 'external',
    targetType: 'STORAGE',
    formats: ['JSON', 'NDJSON', 'CSV'],
    schema: s3ExportSchema,

    async export(
        context: ExportContext,
        config: S3ExportConfig,
        records: readonly JsonObject[],
    ): Promise<ExportResult> {
        const { connections, logger, dryRun } = context;

        // Get S3 connection config
        const connection = await connections.get(config.connectionCode);
        if (!connection) {
            throw new Error(`Connection not found: ${config.connectionCode}`);
        }

        // Generate key from template
        const now = new Date();
        const key = config.keyTemplate
            .replace('${date}', now.toISOString().split('T')[0])
            .replace('${timestamp}', now.toISOString())
            .replace('${pipeline}', context.pipelineContext.pipelineCode || 'export');

        if (dryRun) {
            logger.info(`[DRY RUN] Would export ${records.length} records to s3://${config.bucket}/${key}`);
            return { succeeded: records.length, failed: 0, outputUrl: `s3://${config.bucket}/${key}` };
        }

        // Format content
        let content: string;
        let contentType: string;

        switch (config.format) {
            case 'json':
                content = JSON.stringify(records, null, 2);
                contentType = 'application/json';
                break;
            case 'ndjson':
                content = records.map(r => JSON.stringify(r)).join('\n');
                contentType = 'application/x-ndjson';
                break;
            case 'csv':
                content = convertToCSV(records);
                contentType = 'text/csv';
                break;
            default:
                throw new Error(`Unsupported format: ${config.format}`);
        }

        // Compress if requested
        let body: Buffer | string = content;
        if (config.compress) {
            const zlib = await import('zlib');
            body = zlib.gzipSync(content);
        }

        // Upload to S3
        const s3 = new S3Client({
            region: connection.config.region,
            credentials: {
                accessKeyId: connection.config.accessKeyId,
                secretAccessKey: connection.config.secretAccessKey,
            },
        });

        await s3.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: config.compress ? `${key}.gz` : key,
            Body: body,
            ContentType: contentType,
            ContentEncoding: config.compress ? 'gzip' : undefined,
        }));

        const outputUrl = `s3://${config.bucket}/${config.compress ? `${key}.gz` : key}`;
        logger.info(`Exported ${records.length} records to ${outputUrl}`);

        return {
            succeeded: records.length,
            failed: 0,
            exported: records.length,
            outputUrl,
            metadata: {
                format: config.format,
                compressed: config.compress,
                size: typeof body === 'string' ? body.length : body.byteLength,
            },
        };
    },
};

function convertToCSV(records: readonly JsonObject[]): string {
    if (records.length === 0) return '';

    const headers = Object.keys(records[0]);
    const rows = records.map(record =>
        headers.map(h => {
            const value = record[h];
            if (value === null || value === undefined) return '';
            const str = String(value);
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}
```

### Example: REST API Exporter

```typescript
import { ExporterAdapter, ExportContext, ExportResult, JsonObject, StepConfigSchema } from '@oronts/vendure-data-hub-plugin';

interface ApiExportConfig {
    endpoint: string;
    method: 'POST' | 'PUT' | 'PATCH';
    apiKeySecretCode?: string;
    headers?: Record<string, string>;
    batchSize?: number;
    idField?: string;
}

export const apiExporter: ExporterAdapter<ApiExportConfig> = {
    type: 'EXPORTER',
    code: 'api-export',
    name: 'REST API Export',
    description: 'Export records to a REST API endpoint',
    category: 'external',
    targetType: 'API',
    schema: {
        fields: [
            { key: 'endpoint', type: 'string', label: 'API Endpoint', required: true },
            { key: 'method', type: 'select', label: 'HTTP Method', required: true,
              options: [
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
              ] },
            { key: 'apiKeySecretCode', type: 'string', label: 'API Key Secret' },
            { key: 'headers', type: 'json', label: 'Custom Headers' },
            { key: 'batchSize', type: 'number', label: 'Batch Size', placeholder: '100' },
            { key: 'idField', type: 'string', label: 'ID Field (for URL)' },
        ],
    },
    batchable: true,

    async export(
        context: ExportContext,
        config: ApiExportConfig,
        records: readonly JsonObject[],
    ): Promise<ExportResult> {
        const { secrets, logger, dryRun } = context;
        let succeeded = 0;
        let failed = 0;
        const errors: Array<{ record: JsonObject; message: string }> = [];

        // Build headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...config.headers,
        };

        if (config.apiKeySecretCode) {
            const apiKey = await secrets.get(config.apiKeySecretCode);
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        if (dryRun) {
            logger.info(`[DRY RUN] Would export ${records.length} records to ${config.endpoint}`);
            return { succeeded: records.length, failed: 0 };
        }

        const batchSize = config.batchSize || 100;

        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);

            try {
                // Build URL (optionally include ID)
                let url = config.endpoint;
                if (config.idField && batch.length === 1) {
                    url = `${config.endpoint}/${batch[0][config.idField]}`;
                }

                const response = await fetch(url, {
                    method: config.method,
                    headers,
                    body: JSON.stringify(batch.length === 1 ? batch[0] : batch),
                });

                if (response.ok) {
                    succeeded += batch.length;
                } else {
                    const errorText = await response.text();
                    failed += batch.length;
                    for (const record of batch) {
                        errors.push({ record, message: `HTTP ${response.status}: ${errorText}` });
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

        logger.info(`Exported ${succeeded} records, ${failed} failed`);
        return { succeeded, failed, errors };
    },
};
```

### Registration

```typescript
DataHubPlugin.init({
    adapters: [s3Exporter, apiExporter],
})
```

---

## Examples

See complete examples in the codebase:

- **Operators:** `src/operators/` - 57 built-in operators
- **Extractors:** `src/extractors/` - REST, GraphQL, CSV, etc.
- **Loaders:** `src/loaders/` - Product, Customer, Order, etc.
- **Sinks:** `src/runtime/executors/sink.executor.ts` - MeiliSearch, Elasticsearch, etc.
- **Feeds:** `src/feeds/generators/` - Google Shopping, Facebook Catalog
- **Dev Examples:** `dev-server/examples/custom/` - Custom adapter examples
