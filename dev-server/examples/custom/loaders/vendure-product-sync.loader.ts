import { GlobalFlag } from '@vendure/common/lib/generated-types';
import {
    ID,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    type AdapterDefinition,
    CURRENT_ADAPTER_API_VERSION,
    DataHubAdapterFactory,
    JsonObject,
    LoaderAdapter,
    LoadContext,
    LoadResult,
    StepConfigSchema,
} from '../../../../src';

const ADAPTER_CODE = 'vendure-product-sync';

export const vendureProductSyncSchema: StepConfigSchema = {
    fields: [
        {
            key: 'matchField',
            type: 'select',
            label: 'Match Field',
            required: true,
            defaultValue: 'sku',
            options: [{ value: 'sku', label: 'SKU' }],
            description: 'Vendure product variant field used to find an existing record',
        },
        { key: 'createMissing', type: 'boolean', label: 'Create Missing', required: false, defaultValue: true },
        { key: 'updateExisting', type: 'boolean', label: 'Update Existing', required: false, defaultValue: true },
        {
            key: 'demoMode',
            type: 'boolean',
            label: 'Simulation Mode',
            required: false,
            defaultValue: false,
            description: 'Inspect records and existing variants without persisting changes',
        },
    ],
};

interface VendureProductSyncConfig {
    matchField?: 'sku';
    createMissing?: boolean;
    updateExisting?: boolean;
    demoMode?: boolean;
}

interface VendureProductSyncDependencies {
    readonly connection: TransactionalConnection;
    readonly productService: ProductService;
    readonly variantService: ProductVariantService;
}

interface SyncStats {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ record: JsonObject; message: string; field?: string }>;
    affectedIds: ID[];
}

type RecordOutcome =
    | { kind: 'created' | 'updated'; id?: ID }
    | { kind: 'skipped' };

type VariantCreateInput = Parameters<ProductVariantService['create']>[1][number];
type VariantUpdateInput = Parameters<ProductVariantService['update']>[1][number];

export const vendureProductSyncDefinition = {
    type: 'LOADER',
    code: ADAPTER_CODE,
    name: 'Vendure Product Sync',
    description: 'Create or update Vendure product variants through Vendure services',
    category: 'DATA_SOURCE',
    schema: vendureProductSyncSchema,
    icon: 'refresh',
    version: '1.1.0',
    apiVersion: CURRENT_ADAPTER_API_VERSION,
} as const satisfies AdapterDefinition;

export function createVendureProductSyncLoader(
    dependencies: VendureProductSyncDependencies,
): LoaderAdapter<VendureProductSyncConfig> {
    return {
        ...vendureProductSyncDefinition,
        async load(context, config, records) {
            return loadRecords(dependencies, context, config, records);
        },
    };
}

export const vendureProductSyncLoaderFactory: DataHubAdapterFactory = {
    code: ADAPTER_CODE,
    definition: vendureProductSyncDefinition,
    create(injector) {
        return createVendureProductSyncLoader({
            connection: injector.get(TransactionalConnection),
            productService: injector.get(ProductService),
            variantService: injector.get(ProductVariantService),
        });
    },
};

async function loadRecords(
    dependencies: VendureProductSyncDependencies,
    context: LoadContext,
    config: VendureProductSyncConfig,
    records: readonly JsonObject[],
): Promise<LoadResult> {
    const matchField = config.matchField ?? 'sku';
    const simulate = context.dryRun || config.demoMode === true;
    const stats = createStats();

    context.logger.info('Vendure Product Sync started', {
        records: records.length,
        matchField,
        createMissing: config.createMissing ?? true,
        updateExisting: config.updateExisting ?? true,
        simulation: simulate,
    });
    if (matchField !== 'sku') {
        return invalidConfigurationResult(records, matchField);
    }

    await processRecords(dependencies, context, config, records, stats, simulate);
    context.logger.info('Vendure Product Sync completed', {
        created: stats.created, updated: stats.updated, skipped: stats.skipped,
        failed: stats.failed, simulation: simulate,
    });
    return toLoadResult(stats);
}

async function processRecords(
    dependencies: VendureProductSyncDependencies,
    context: LoadContext,
    config: VendureProductSyncConfig,
    records: readonly JsonObject[],
    stats: SyncStats,
    simulate: boolean,
): Promise<void> {
    for (const record of records) {
        try {
            const outcome = simulate
                ? await simulateRecord(dependencies, context, config, record)
                : await persistRecord(dependencies, context, config, record);
            recordOutcome(stats, outcome);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stats.failed++;
            stats.errors.push({ record, message, field: 'sku' });
            context.logger.error(
                'Vendure product sync record failed',
                error instanceof Error ? error : { message },
            );
        }
    }
}

function toLoadResult(stats: SyncStats): LoadResult {
    return {
        succeeded: stats.created + stats.updated,
        failed: stats.failed,
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        ...(stats.errors.length > 0 ? { errors: stats.errors } : {}),
        ...(stats.affectedIds.length > 0 ? { affectedIds: stats.affectedIds } : {}),
    };
}

function createStats(): SyncStats {
    return {
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        affectedIds: [],
    };
}

function invalidConfigurationResult(
    records: readonly JsonObject[],
    matchField: string,
): LoadResult {
    const message = `Unsupported match field: ${matchField}. Use sku.`;
    return {
        succeeded: 0,
        failed: records.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: records.map(record => ({ record, field: 'matchField', message })),
    };
}

function recordOutcome(stats: SyncStats, outcome: RecordOutcome): void {
    if (outcome.kind === 'skipped') {
        stats.skipped++;
        return;
    }
    stats[outcome.kind]++;
    if (outcome.id !== undefined) {
        stats.affectedIds.push(outcome.id);
    }
}

async function simulateRecord(
    dependencies: VendureProductSyncDependencies,
    context: LoadContext,
    config: VendureProductSyncConfig,
    record: JsonObject,
): Promise<RecordOutcome> {
    const sku = requireSku(record);
    const existing = await findVariant(dependencies.variantService, context.ctx, sku);

    if (existing) {
        if (config.updateExisting === false || !buildVariantUpdate(context.ctx, existing.id, record)) {
            return { kind: 'skipped' };
        }
        context.logger.debug('Simulation would update Vendure variant', { sku, variantId: String(existing.id) });
        return { kind: 'updated' };
    }

    if (config.createMissing === false) {
        return { kind: 'skipped' };
    }
    await validateCreateRecord(dependencies.productService, context.ctx, record);
    context.logger.debug('Simulation would create Vendure variant', { sku });
    return { kind: 'created' };
}

async function persistRecord(
    dependencies: VendureProductSyncDependencies,
    context: LoadContext,
    config: VendureProductSyncConfig,
    record: JsonObject,
): Promise<RecordOutcome> {
    return dependencies.connection.withTransaction(context.ctx, async transactionContext => {
        const sku = requireSku(record);
        const existing = await findVariant(dependencies.variantService, transactionContext, sku);

        if (existing) {
            if (config.updateExisting === false) {
                return { kind: 'skipped' };
            }
            const update = buildVariantUpdate(transactionContext, existing.id, record);
            if (!update) {
                return { kind: 'skipped' };
            }
            const [updated] = await dependencies.variantService.update(transactionContext, [update]);
            if (!updated) {
                throw new Error(`Vendure did not return the updated variant for SKU ${sku}`);
            }
            return { kind: 'updated', id: updated.id };
        }

        if (config.createMissing === false) {
            return { kind: 'skipped' };
        }
        const productId = await resolveProductId(dependencies.productService, transactionContext, record);
        const [variant] = await dependencies.variantService.create(transactionContext, [
            buildVariantCreate(transactionContext, productId, record),
        ]);
        if (!variant) {
            throw new Error(`Vendure did not return the created variant for SKU ${sku}`);
        }
        return { kind: 'created', id: variant.id };
    });
}

async function findVariant(
    variantService: ProductVariantService,
    ctx: RequestContext,
    sku: string,
): Promise<ProductVariant | undefined> {
    const result = await variantService.findAll(ctx, {
        filter: { sku: { eq: sku } },
        take: 2,
    });
    if (result.items.length > 1) {
        throw new Error(`Multiple Vendure variants found for SKU ${sku}`);
    }
    return result.items[0];
}

async function validateCreateRecord(
    productService: ProductService,
    ctx: RequestContext,
    record: JsonObject,
): Promise<void> {
    requireSku(record);
    readOptionalInteger(record, ['price']);
    readOptionalInteger(record, ['stockOnHand', 'inventoryQuantity']);
    readOptionalBoolean(record, 'enabled');
    const productId = readString(record, 'productId');
    if (productId && !await productService.findOne(ctx, productId)) {
        throw new Error(`Vendure product ${productId} does not exist`);
    }
}

async function resolveProductId(
    productService: ProductService,
    ctx: RequestContext,
    record: JsonObject,
): Promise<ID> {
    const explicitProductId = readString(record, 'productId');
    if (explicitProductId) {
        const product = await productService.findOne(ctx, explicitProductId);
        if (!product) {
            throw new Error(`Vendure product ${explicitProductId} does not exist`);
        }
        return product.id;
    }

    const productName = firstString(record, ['productName', 'name']) ?? requireSku(record);
    const slug = firstString(record, ['productSlug', 'slug']) ?? slugify(productName);
    const existing = await productService.findOneBySlug(ctx, slug);
    if (existing) {
        return existing.id;
    }

    const product = await productService.create(ctx, {
        enabled: readOptionalBoolean(record, 'enabled') ?? true,
        translations: [{
            languageCode: ctx.languageCode,
            name: productName,
            slug,
            description: readString(record, 'description') ?? '',
        }],
    });
    return product.id;
}

function buildVariantCreate(
    ctx: RequestContext,
    productId: ID,
    record: JsonObject,
): VariantCreateInput {
    const sku = requireSku(record);
    const trackInventory = readOptionalBoolean(record, 'trackInventory');
    return {
        productId,
        sku,
        translations: [{
            languageCode: ctx.languageCode,
            name: firstString(record, ['variantName', 'name', 'productName']) ?? sku,
        }],
        price: readOptionalInteger(record, ['price']),
        stockOnHand: readOptionalInteger(record, ['stockOnHand', 'inventoryQuantity']),
        enabled: readOptionalBoolean(record, 'enabled'),
        trackInventory: trackInventory === undefined
            ? undefined
            : trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
    };
}

function buildVariantUpdate(
    ctx: RequestContext,
    variantId: ID,
    record: JsonObject,
): VariantUpdateInput | undefined {
    const update: VariantUpdateInput = { id: variantId };
    const name = firstString(record, ['variantName', 'name']);
    const price = readOptionalInteger(record, ['price']);
    const stockOnHand = readOptionalInteger(record, ['stockOnHand', 'inventoryQuantity']);
    const enabled = readOptionalBoolean(record, 'enabled');
    const trackInventory = readOptionalBoolean(record, 'trackInventory');

    if (name) update.translations = [{ languageCode: ctx.languageCode, name }];
    if (price !== undefined) update.price = price;
    if (stockOnHand !== undefined) update.stockOnHand = stockOnHand;
    if (enabled !== undefined) update.enabled = enabled;
    if (trackInventory !== undefined) {
        update.trackInventory = trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE;
    }

    return Object.keys(update).length > 1 ? update : undefined;
}

function requireSku(record: JsonObject): string {
    const sku = readString(record, 'sku');
    if (!sku) {
        throw new Error('Missing required match field: sku');
    }
    return sku;
}

function firstString(record: JsonObject, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = readString(record, key);
        if (value) return value;
    }
}

function readString(record: JsonObject, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    return normalized || undefined;
}

function readOptionalBoolean(record: JsonObject, key: string): boolean | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'boolean') {
        throw new Error(`${key} must be a boolean`);
    }
    return value;
}

function readOptionalInteger(record: JsonObject, keys: readonly string[]): number | undefined {
    const key = keys.find(candidate => record[candidate] !== undefined && record[candidate] !== null);
    if (!key) return undefined;
    const value = record[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${key} must be a non-negative safe integer`);
    }
    return parsed;
}

function slugify(value: string): string {
    const slug = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return slug || 'product';
}
