# Custom Loaders

Create loaders to write data to new entity types or external systems.

## Interface

```typescript
interface LoaderAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'LOADER';
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly schema: AdapterSchema;

    load(
        context: LoadContext,
        config: TConfig,
        records: readonly JsonObject[],
    ): Promise<LoadResult>;
}

interface LoadContext {
    ctx: RequestContext;
    pipelineId: ID;
    stepKey: string;
    pipelineContext: PipelineCtx;
    secrets: SecretResolver;
    connections: ConnectionResolver;
    logger: AdapterLogger;
    channelStrategy: ChannelStrategy;    // 'EXPLICIT' | 'INHERIT' | 'MULTI'
    channels: readonly ID[];
    languageStrategy: LanguageStrategy;
    validationMode: ValidationMode;       // 'STRICT' | 'LENIENT'
    conflictStrategy: ConflictStrategy;
    dryRun: boolean;
}
```

## Basic Example

```typescript
import { Injectable } from '@nestjs/common';
import { TransactionalConnection } from '@vendure/core';
import { LoaderAdapter, LoadContext, LoadResult, JsonObject } from '@oronts/vendure-data-hub-plugin';

interface CustomLoaderConfig {
    codeField: string;
    nameField: string;
    strategy?: 'CREATE' | 'UPDATE' | 'UPSERT';
}

@Injectable()
export class CustomEntityLoader implements LoaderAdapter<CustomLoaderConfig> {
    readonly type = 'LOADER' as const;
    readonly code = 'custom-entity';
    readonly name = 'Custom Entity Loader';

    readonly schema = {
        fields: [
            { key: 'codeField', type: 'string', required: true, label: 'Code Field' },
            { key: 'nameField', type: 'string', required: true, label: 'Name Field' },
        ],
    };

    constructor(private connection: TransactionalConnection) {}

    async load(
        context: LoadContext,
        config: CustomLoaderConfig,
        records: readonly JsonObject[],
    ): Promise<LoadResult> {
        const { ctx, dryRun, logger } = context;
        const results: LoadResult = {
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        if (dryRun) {
            logger.info(`[DRY RUN] Would process ${records.length} records`);
            return { ...results, skipped: records.length };
        }

        for (const record of records) {
            try {
                const code = record[config.codeField];
                const name = record[config.nameField];

                const existing = await this.connection
                    .getRepository(ctx, CustomEntity)
                    .findOne({ where: { code } });

                if (existing) {
                    if (config.strategy === 'CREATE') {
                        results.skipped++;
                        continue;
                    }

                    existing.name = name;
                    await this.connection.getRepository(ctx, CustomEntity).save(existing);
                    results.updated++;
                } else {
                    if (config.strategy === 'UPDATE') {
                        results.skipped++;
                        continue;
                    }

                    const entity = new CustomEntity({ code, name });
                    await this.connection.getRepository(ctx, CustomEntity).save(entity);
                    results.created++;
                }
            } catch (error) {
                results.failed++;
                results.errors.push({
                    record,
                    message: error.message,
                });
            }
        }

        return results;
    }
}
```

## Registering the Loader

```typescript
import { VendurePlugin, OnModuleInit } from '@vendure/core';
import { DataHubPlugin, DataHubRegistryService } from '@oronts/vendure-data-hub-plugin';
import { CustomEntityLoader } from './custom-entity.loader';

@VendurePlugin({
    imports: [DataHubPlugin],
    providers: [CustomEntityLoader],
})
export class MyLoaderPlugin implements OnModuleInit {
    constructor(
        private registry: DataHubRegistryService,
        private loader: CustomEntityLoader,
    ) {}

    onModuleInit() {
        this.registry.registerLoader(this.loader.code, this.loader);
    }
}
```

## Load Strategies

Available conflict resolution strategies:

```typescript
type LoadStrategy =
    | 'CREATE'        // Only create new, skip existing
    | 'UPDATE'        // Only update existing, skip new
    | 'UPSERT'        // Create or update
    | 'MERGE'         // Merge fields intelligently
    | 'SOURCE_WINS'   // Source data wins conflicts
    | 'VENDURE_WINS'  // Existing Vendure data wins
    | 'SOFT_DELETE'   // Mark as deleted
    | 'HARD_DELETE';  // Permanently delete
```

## Load Result

Return processing results:

```typescript
interface LoadResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{
        record: JsonObject;
        message: string;
        code?: string;
    }>;
}
```

## Using Vendure Services

Inject Vendure services for entity operations:

```typescript
import { ProductService, TransactionalConnection } from '@vendure/core';

@Injectable()
export class MyProductLoader implements LoaderAdapter {
    constructor(
        private productService: ProductService,
        private connection: TransactionalConnection,
    ) {}

    async load(ctx, records, config, context) {
        for (const record of records) {
            // Use Vendure's ProductService
            await this.productService.update(ctx, {
                id: record.id,
                translations: [{
                    languageCode: ctx.languageCode,
                    name: record.name,
                }],
            });
        }
    }
}
```

## Batch Processing

Process records in batches for better performance:

```typescript
async load(ctx, records, config, context) {
    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        await this.connection.withTransaction(ctx, async (manager) => {
            for (const record of batch) {
                try {
                    await this.processRecord(ctx, record, config, manager);
                    results.created++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({ record, message: error.message });
                }
            }
        });

        context.logger.debug(`Processed batch ${i / batchSize + 1}`);
    }

    return results;
}
```

## Channel Handling

Handle multi-channel properly:

```typescript
async load(ctx, records, config, context) {
    const channel = config.channel
        ? await this.channelService.findByCode(ctx, config.channel)
        : ctx.channel;

    const channelCtx = new RequestContext({
        ...ctx,
        channel,
    });

    // Use channelCtx for operations
}
```

## Validation

Validate records before loading:

```typescript
async load(ctx, records, config, context) {
    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    for (const record of records) {
        const validation = this.validate(record, config);

        if (!validation.valid) {
            results.failed++;
            results.errors.push({
                record,
                message: validation.errors.join(', '),
            });
            continue;
        }

        // Process valid record...
    }

    return results;
}

private validate(record: JsonObject, config: LoadConfig) {
    const errors: string[] = [];

    if (!record[config.codeField]) {
        errors.push(`Missing required field: ${config.codeField}`);
    }

    return { valid: errors.length === 0, errors };
}
```

## Complete Example: Tag Loader

```typescript
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Tag } from '@vendure/core';
import {
    LoaderAdapter,
    LoadConfig,
    LoadContext,
    LoadResult,
    AdapterSchema,
} from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class TagLoader implements LoaderAdapter {
    readonly code = 'tag';
    readonly name = 'Tag Loader';
    readonly entityType = 'Tag';
    readonly description = 'Create or update tags';

    readonly schema: AdapterSchema = {
        fields: [
            { key: 'valueField', type: 'string', required: true, label: 'Value Field', default: 'value' },
        ],
    };

    constructor(private connection: TransactionalConnection) {}

    async load(
        ctx: RequestContext,
        records: JsonObject[],
        config: LoadConfig,
        context: LoadContext,
    ): Promise<LoadResult> {
        const results: LoadResult = {
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        const repo = this.connection.getRepository(ctx, Tag);

        for (const record of records) {
            try {
                const value = String(record[config.valueField] || '').trim();

                if (!value) {
                    results.skipped++;
                    continue;
                }

                const existing = await repo.findOne({ where: { value } });

                if (existing) {
                    if (config.strategy === 'CREATE') {
                        results.skipped++;
                        context.logger.debug(`Tag "${value}" exists, skipping`);
                        continue;
                    }
                    results.updated++;
                } else {
                    if (config.strategy === 'UPDATE') {
                        results.skipped++;
                        context.logger.debug(`Tag "${value}" not found, skipping`);
                        continue;
                    }

                    const tag = repo.create({ value });
                    await repo.save(tag);
                    results.created++;
                    context.logger.debug(`Created tag: ${value}`);
                }
            } catch (error) {
                results.failed++;
                results.errors.push({
                    record,
                    message: error.message,
                });
                context.logger.error(`Failed to load tag`, error);
            }
        }

        context.logger.info(
            `Load complete: ${results.created} created, ${results.updated} updated, ` +
            `${results.skipped} skipped, ${results.failed} failed`,
        );

        return results;
    }
}
```
