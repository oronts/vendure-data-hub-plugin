import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Injector,
    ProductService,
    ProductVariantService,
    TransactionalConnection,
} from '@vendure/core';
import type { JsonObject, LoadContext } from '../../../../src';
import {
    createVendureProductSyncLoader,
    vendureProductSyncLoaderFactory,
} from './vendure-product-sync.loader';

function createContext(dryRun = false): LoadContext {
    return {
        ctx: { languageCode: 'en', channelId: '1' },
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        dryRun,
    } as unknown as LoadContext;
}

function createDependencies() {
    const connection = {
        withTransaction: vi.fn(async (ctx, work: (transactionContext: unknown) => Promise<unknown>) => work(ctx)),
    };
    const productService = {
        findOne: vi.fn(),
        findOneBySlug: vi.fn(),
        create: vi.fn(),
    };
    const variantService = {
        findAll: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    };
    const dependencies = {
        connection: connection as unknown as TransactionalConnection,
        productService: productService as unknown as ProductService,
        variantService: variantService as unknown as ProductVariantService,
    };
    return { connection, productService, variantService, dependencies };
}

describe('Vendure product sync loader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a product and variant through Vendure services', async () => {
        const fixture = createDependencies();
        fixture.variantService.findAll.mockResolvedValue({ items: [] });
        fixture.productService.findOneBySlug.mockResolvedValue(undefined);
        fixture.productService.create.mockResolvedValue({ id: 'product-1' });
        fixture.variantService.create.mockResolvedValue([{ id: 'variant-1' }]);
        const loader = createVendureProductSyncLoader(fixture.dependencies);

        const result = await loader.load(createContext(), {}, [{
            sku: 'SKU-1',
            productName: 'First Product',
            price: 1200,
            stockOnHand: 3,
        }]);

        expect(result).toMatchObject({
            succeeded: 1,
            failed: 0,
            created: 1,
            updated: 0,
            skipped: 0,
            affectedIds: ['variant-1'],
        });
        expect(fixture.productService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                translations: [expect.objectContaining({ name: 'First Product', slug: 'first-product' })],
            }),
        );
        expect(fixture.variantService.create).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({ productId: 'product-1', sku: 'SKU-1', price: 1200, stockOnHand: 3 })],
        );
    });

    it('updates an existing variant and reports only the persisted update', async () => {
        const fixture = createDependencies();
        fixture.variantService.findAll.mockResolvedValue({ items: [{ id: 'variant-1' }] });
        fixture.variantService.update.mockResolvedValue([{ id: 'variant-1' }]);
        const loader = createVendureProductSyncLoader(fixture.dependencies);

        const result = await loader.load(createContext(), {}, [{
            sku: 'SKU-1',
            variantName: 'Updated Variant',
            price: 1500,
        }]);

        expect(result).toMatchObject({
            succeeded: 1,
            failed: 0,
            created: 0,
            updated: 1,
            skipped: 0,
            affectedIds: ['variant-1'],
        });
        expect(fixture.variantService.update).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({ id: 'variant-1', price: 1500 })],
        );
        expect(fixture.variantService.create).not.toHaveBeenCalled();
    });

    it('reports validation and service failures per record without false success', async () => {
        const fixture = createDependencies();
        fixture.variantService.findAll.mockResolvedValue({ items: [] });
        fixture.productService.findOneBySlug.mockResolvedValue({ id: 'product-1' });
        fixture.variantService.create.mockRejectedValue(new Error('variant create failed'));
        const loader = createVendureProductSyncLoader(fixture.dependencies);
        const records: JsonObject[] = [
            { name: 'Missing SKU' },
            { sku: 'SKU-2', productName: 'Second Product', price: 2500 },
        ];

        const result = await loader.load(createContext(), {}, records);

        expect(result).toMatchObject({
            succeeded: 0,
            failed: 2,
            created: 0,
            updated: 0,
            skipped: 0,
        });
        expect(result.errors).toEqual([
            expect.objectContaining({ record: records[0], message: 'Missing required match field: sku' }),
            expect.objectContaining({ record: records[1], message: 'variant create failed' }),
        ]);
    });

    it('reports a predicted create in dry-run without writes or affected IDs', async () => {
        const fixture = createDependencies();
        fixture.variantService.findAll.mockResolvedValue({ items: [] });
        const loader = createVendureProductSyncLoader(fixture.dependencies);

        const result = await loader.load(createContext(true), {}, [{
            sku: 'SKU-2',
            productName: 'Second Product',
            price: 2500,
        }]);

        expect(result).toMatchObject({
            succeeded: 1,
            failed: 0,
            created: 1,
            updated: 0,
            skipped: 0,
        });
        expect(result).not.toHaveProperty('affectedIds');
        expect(fixture.connection.withTransaction).not.toHaveBeenCalled();
        expect(fixture.productService.create).not.toHaveBeenCalled();
        expect(fixture.variantService.create).not.toHaveBeenCalled();
        expect(fixture.variantService.update).not.toHaveBeenCalled();
    });

    it('reports a predicted update and preserves real skips in simulation', async () => {
        const fixture = createDependencies();
        fixture.variantService.findAll.mockResolvedValue({ items: [{ id: 'variant-1' }] });
        const loader = createVendureProductSyncLoader(fixture.dependencies);

        const result = await loader.load(createContext(), { demoMode: true }, [
            { sku: 'SKU-1', price: 1200 },
            { sku: 'SKU-1' },
        ]);

        expect(result).toMatchObject({
            succeeded: 1,
            failed: 0,
            created: 0,
            updated: 1,
            skipped: 1,
        });
        expect(result).not.toHaveProperty('affectedIds');
        expect(fixture.connection.withTransaction).not.toHaveBeenCalled();
        expect(fixture.productService.create).not.toHaveBeenCalled();
        expect(fixture.variantService.create).not.toHaveBeenCalled();
        expect(fixture.variantService.update).not.toHaveBeenCalled();
    });

    it('resolves the Vendure services through the registered adapter factory', () => {
        const fixture = createDependencies();
        const moduleRef = {
            get: vi.fn(token => {
                const services = new Map<unknown, unknown>([
                    [TransactionalConnection, fixture.dependencies.connection],
                    [ProductService, fixture.dependencies.productService],
                    [ProductVariantService, fixture.dependencies.variantService],
                ]);
                return services.get(token);
            }),
        };
        const injector = new Injector(moduleRef as never);

        const adapter = vendureProductSyncLoaderFactory.create(injector);

        expect(adapter).toMatchObject({ code: 'vendure-product-sync', type: 'LOADER' });
        expect(moduleRef.get).toHaveBeenCalledTimes(3);
        expect(moduleRef.get).toHaveBeenCalledWith(ProductService, { strict: false });
    });
});
