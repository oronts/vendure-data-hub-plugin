# Custom Loaders

Create loaders to write data to new entity types or external systems.

## Interface

```typescript
interface LoaderAdapter<TConfig = JsonObject> extends BaseAdapter<TConfig> {
    readonly type: 'LOADER';
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly schema: StepConfigSchema;

    load(
        context: LoadContext,
        config: TConfig,
        records: readonly JsonObject[],
    ): Promise<LoadResult>;
}

interface LoadContext {
    readonly ctx: RequestContext;
    readonly pipelineId: ID;
    readonly stepKey: string;
    readonly pipelineContext: PipelineCtx;
    readonly secrets: SecretResolver;
    readonly connections: ConnectionResolver;
    readonly logger: AdapterLogger;
    readonly channelStrategy: ChannelStrategy;
    readonly channels: readonly ID[];
    readonly languageStrategy: LanguageStrategyValue;
    readonly validationMode: ValidationModeType;
    readonly conflictStrategy: ConflictStrategyValue;
    readonly dryRun: boolean;
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
        let succeeded = 0;
        let failed = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: LoadError[] = [];

        if (dryRun) {
            logger.info(`[DRY RUN] Would process ${records.length} records`);
            return { succeeded: 0, failed: 0, skipped: records.length };
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
                        skipped++;
                        continue;
                    }

                    existing.name = name;
                    await this.connection.getRepository(ctx, CustomEntity).save(existing);
                    updated++;
                    succeeded++;
                } else {
                    if (config.strategy === 'UPDATE') {
                        skipped++;
                        continue;
                    }

                    const entity = new CustomEntity({ code, name });
                    await this.connection.getRepository(ctx, CustomEntity).save(entity);
                    created++;
                    succeeded++;
                }
            } catch (error) {
                failed++;
                errors.push({
                    record,
                    message: error.message,
                });
            }
        }

        return { succeeded, failed, created, updated, skipped, errors };
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
        this.registry.registerRuntime(this.loader);
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
    | 'SOFT_DELETE'   // Mark as deleted
    | 'HARD_DELETE';  // Permanently delete
```

## Load Result

Return processing results:

```typescript
interface LoadResult {
    readonly succeeded: number;      // Number of successfully loaded records (REQUIRED)
    readonly failed: number;         // Number of failed records (REQUIRED)
    readonly created?: number;       // Number of newly created entities
    readonly updated?: number;       // Number of updated entities
    readonly skipped?: number;       // Number of skipped records (e.g., duplicates)
    readonly errors?: readonly LoadError[];  // Load errors
    readonly affectedIds?: readonly ID[];    // IDs of affected entities
}

interface LoadError {
    readonly record: JsonObject;
    readonly message: string;
    readonly field?: string;
    readonly code?: string;
    readonly recoverable?: boolean;
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

    async load(context, config, records) {
        const { ctx } = context;
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
async load(context, config, records) {
    const { ctx, logger } = context;
    let succeeded = 0;
    let failed = 0;
    let created = 0;
    const errors: LoadError[] = [];
    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        await this.connection.withTransaction(ctx, async (manager) => {
            for (const record of batch) {
                try {
                    await this.processRecord(ctx, record, config, manager);
                    created++;
                    succeeded++;
                } catch (error) {
                    failed++;
                    errors.push({ record, message: error.message });
                }
            }
        });

        logger.debug(`Processed batch ${i / batchSize + 1}`);
    }

    return { succeeded, failed, created, errors };
}
```

## Channel Handling

Handle multi-channel properly:

```typescript
async load(context, config, records) {
    const { ctx } = context;
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
async load(context, config, records) {
    let succeeded = 0;
    let failed = 0;
    let created = 0;
    let updated = 0;
    const errors: LoadError[] = [];

    for (const record of records) {
        const validation = this.validate(record, config);

        if (!validation.valid) {
            failed++;
            errors.push({
                record,
                message: validation.errors.join(', '),
            });
            continue;
        }

        // Process valid record...
        // succeeded++; created++ or updated++;
    }

    return { succeeded, failed, created, updated, errors };
}

private validate(record: JsonObject, config: JsonObject) {
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
    LoadContext,
    LoadResult,
    StepConfigSchema,
    JsonObject,
} from '@oronts/vendure-data-hub-plugin';

@Injectable()
export class TagLoader implements LoaderAdapter {
    readonly type = 'LOADER' as const;
    readonly code = 'tag';
    readonly name = 'Tag Loader';
    readonly entityType = 'Tag';
    readonly description = 'Create or update tags';

    readonly schema: StepConfigSchema = {
        fields: [
            { key: 'valueField', type: 'string', required: true, label: 'Value Field', default: 'value' },
        ],
    };

    constructor(private connection: TransactionalConnection) {}

    async load(
        context: LoadContext,
        config: JsonObject,
        records: readonly JsonObject[],
    ): Promise<LoadResult> {
        const { ctx, logger } = context;
        let succeeded = 0;
        let failed = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: LoadError[] = [];

        const repo = this.connection.getRepository(ctx, Tag);

        for (const record of records) {
            try {
                const value = String(record[config.valueField] || '').trim();

                if (!value) {
                    skipped++;
                    continue;
                }

                const existing = await repo.findOne({ where: { value } });

                if (existing) {
                    if (config.strategy === 'CREATE') {
                        skipped++;
                        logger.debug(`Tag "${value}" exists, skipping`);
                        continue;
                    }
                    updated++;
                    succeeded++;
                } else {
                    if (config.strategy === 'UPDATE') {
                        skipped++;
                        logger.debug(`Tag "${value}" not found, skipping`);
                        continue;
                    }

                    const tag = repo.create({ value });
                    await repo.save(tag);
                    created++;
                    succeeded++;
                    logger.debug(`Created tag: ${value}`);
                }
            } catch (error) {
                failed++;
                errors.push({
                    record,
                    message: error.message,
                });
                logger.error(`Failed to load tag`, error);
            }
        }

        logger.info(
            `Load complete: ${created} created, ${updated} updated, ` +
            `${skipped} skipped, ${failed} failed`,
        );

        return { succeeded, failed, created, updated, skipped, errors };
    }
}
```
