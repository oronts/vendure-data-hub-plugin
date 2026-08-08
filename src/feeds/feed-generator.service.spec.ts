import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGINATION } from '../constants';
import { DataHubFeed } from '../entities/config';
import {
    FeedConfigValidationError,
    FeedGeneratorService,
} from './feed-generator.service';
import { FeedCatalogService } from './feed-catalog.service';
import { FeedPersistenceService } from './feed-persistence.service';
import type { FeedConfig } from './generators/feed-types';

const TEST_FEED_BASE_URL = 'https://shop.example.com';

function createGenerationFixture(
    variantCount: number,
    createContent: (products: unknown[]) => string = products => JSON.stringify(products),
    configOverrides: Partial<FeedConfig> = {},
) {
    const variants = Array.from({ length: variantCount }, (_, index) => ({
        id: String(index + 1),
        productId: `product-${index + 1}`,
        enabled: true,
        priceWithTax: 1000 + index,
        currencyCode: 'USD',
    }));
    const productVariantService = {
        findAll: vi.fn(async (
            _ctx: RequestContext,
            options: { skip?: number; take?: number },
        ) => ({
            items: variants.slice(
                options.skip ?? 0,
                (options.skip ?? 0) + (options.take ?? PAGINATION.FEED_QUERY_PAGE_SIZE),
            ),
            totalItems: variants.length,
        })),
        findByIds: vi.fn(async (_ctx: RequestContext, ids: Array<string | number>) => (
            variants.filter(variant => ids.map(String).includes(variant.id))
        )),
        getSaleableStockLevel: vi.fn(async (
            _ctx: RequestContext,
            _variant: { id: string },
        ) => 5),
    };
    const productService = {
        findByIds: vi.fn(async (_ctx: RequestContext, ids: Array<string | number>) => (
            ids.map(id => ({ id, enabled: true }))
        )),
    };
    const collectionService = {
        getCollectionsByProductId: vi.fn(async (
            _ctx: RequestContext,
            _productId: string,
        ): Promise<Array<{ name: string; slug: string }>> => []),
    };
    const generate = vi.fn(async (context: { products: unknown[] }) => ({
        content: createContent(context.products),
        contentType: 'application/json',
        fileExtension: 'json',
    }));
    const catalog = new FeedCatalogService(
        productVariantService as never,
        productService as never,
        collectionService as never,
    );
    const service = new FeedGeneratorService(
        {} as never,
        { entityOptions: { moneyStrategy: { precision: 2 } } } as never,
        {} as never,
        catalog,
        {
            get: vi.fn(async () => ({
                code: 'catalog',
                name: 'Catalog',
                format: 'CUSTOM',
                customGeneratorCode: 'bounded-json',
                ...configOverrides,
            })),
        } as never,
        {} as never,
        { createLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })) } as never,
    );
    service.registerCustomGenerator({
        code: 'bounded-json',
        name: 'Bounded JSON',
        generate,
    });
    return {
        service,
        productVariantService,
        productService,
        collectionService,
        variants,
        generate,
    };
}

function createContext(
    channelId = 'channel-1',
    channelToken = 'default-channel',
): RequestContext {
    return {
        channelId,
        channel: { token: channelToken },
        currencyCode: 'USD',
        languageCode: 'en',
    } as RequestContext;
}

function createFixture() {
    const entities: DataHubFeed[] = [];
    let nextId = 1;
    const repository = {
        findOne: vi.fn(async ({ where }: { where: Partial<DataHubFeed> }) => (
            entities.find(entity => Object.entries(where).every(
                ([key, value]) => entity[key as keyof DataHubFeed] === value,
            )) ?? null
        )),
        find: vi.fn(async ({ where }: { where: Partial<DataHubFeed> }) => (
            entities
                .filter(entity => Object.entries(where).every(
                    ([key, value]) => entity[key as keyof DataHubFeed] === value,
                ))
                .sort((left, right) => left.code.localeCompare(right.code))
        )),
        save: vi.fn(async (entity: DataHubFeed) => {
            const now = new Date();
            if (!entity.id) {
                entity.id = String(nextId++);
                entity.createdAt = now;
                entities.push(entity);
            }
            entity.updatedAt = now;
            return entity;
        }),
        remove: vi.fn(async (entity: DataHubFeed) => {
            const index = entities.indexOf(entity);
            if (index >= 0) entities.splice(index, 1);
            return entity;
        }),
    };
    const fileStorage = {
        storeFile: vi.fn().mockResolvedValue({
            success: true,
            file: { id: 'file_1_0123456789abcdef' },
        }),
        deleteFile: vi.fn().mockResolvedValue(true),
    };
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const distributedLock = {
        withLock: vi.fn(async (
            _key: string,
            action: () => Promise<unknown>,
        ) => action()),
    };
    const connection = { getRepository: vi.fn(() => repository) };
    const loggerFactory = { createLogger: vi.fn(() => logger) };
    const createService = () => {
        const persistence = new FeedPersistenceService(
            connection as never,
            fileStorage as never,
            loggerFactory as never,
        );
        return new FeedGeneratorService(
            connection as never,
            {} as never,
            {} as never,
            { getFilteredVariants: vi.fn() } as never,
            persistence,
            distributedLock as never,
            loggerFactory as never,
        );
    };
    return {
        createService,
        entities,
        repository,
        fileStorage,
        distributedLock,
    };
}

describe('FeedGeneratorService durable contract', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('applies a preview item cap to the catalog query and generator input', async () => {
        const fixture = createGenerationFixture(5);

        const result = await fixture.service.generateFeedPreview(
            createContext(),
            'catalog',
            2,
        );

        expect(fixture.productVariantService.findAll).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ skip: 0, take: 2 }),
        );
        expect(fixture.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                products: [
                    expect.objectContaining({ id: '1' }),
                    expect.objectContaining({ id: '2' }),
                ],
            }),
        );
        expect(result.itemCount).toBe(2);
    });

    it('does not cap normal artifact generation', async () => {
        const fixture = createGenerationFixture(5);

        const result = await fixture.service.generateFeed(createContext(), 'catalog');

        expect(fixture.productVariantService.findAll).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                skip: 0,
                take: PAGINATION.FEED_QUERY_PAGE_SIZE,
            }),
        );
        expect(fixture.generate).toHaveBeenCalledWith(
            expect.objectContaining({ products: expect.arrayContaining([
                expect.objectContaining({ id: '1' }),
                expect.objectContaining({ id: '5' }),
            ]) }),
        );
        expect(result.itemCount).toBe(5);
    });

    it('uses diagnostics reported by a custom generator', async () => {
        const fixture = createGenerationFixture(3);
        fixture.service.registerCustomGenerator({
            code: 'bounded-json',
            name: 'Bounded JSON',
            generate: vi.fn().mockResolvedValue({
                content: '[{"id":"1"}]',
                contentType: 'application/json',
                fileExtension: 'json',
                itemCount: 1,
                warnings: ['Skipped two invalid variants'],
                errors: ['Variant 2 was rejected'],
            }),
        });

        const result = await fixture.service.generateFeed(
            createContext(),
            'catalog',
        );

        expect(result.itemCount).toBe(1);
        expect(result.warnings).toEqual(['Skipped two invalid variants']);
        expect(result.errors).toEqual(['Variant 2 was rejected']);
    });

    it('rejects an invalid custom generator item count', async () => {
        const fixture = createGenerationFixture(1);
        fixture.service.registerCustomGenerator({
            code: 'bounded-json',
            name: 'Bounded JSON',
            generate: vi.fn().mockResolvedValue({
                content: '[]',
                contentType: 'application/json',
                fileExtension: 'json',
                itemCount: -1,
            }),
        });

        await expect(fixture.service.generateFeed(
            createContext(),
            'catalog',
        )).rejects.toThrow(
            'Custom feed generator itemCount must be a non-negative safe integer',
        );
    });


    it('backfills preview results after Vendure price and stock filters', async () => {
        const fixture = createGenerationFixture(3, undefined, {
            filters: { inStock: true, minPrice: 10, maxPrice: 20 },
        });
        fixture.variants[0].priceWithTax = 500;
        fixture.variants[1].priceWithTax = 1500;
        fixture.variants[2].priceWithTax = 1500;
        fixture.productVariantService.getSaleableStockLevel.mockImplementation(
            async (_ctx: RequestContext, variant: { id: string }) => (
                variant.id === '2' ? 0 : 5
            ),
        );

        const result = await fixture.service.generateFeedPreview(
            createContext(),
            'catalog',
            1,
        );

        expect(fixture.productVariantService.findAll).toHaveBeenCalledTimes(3);
        expect(fixture.generate).toHaveBeenCalledWith(expect.objectContaining({
            products: [expect.objectContaining({ id: '3' })],
        }));
        expect(result.itemCount).toBe(1);
    });

    it('filters by included and excluded collection slugs', async () => {
        const fixture = createGenerationFixture(3, undefined, {
            filters: {
                categories: ['electronics', 'accessories'],
                excludeCategories: ['clearance'],
            },
        });
        fixture.collectionService.getCollectionsByProductId.mockImplementation(
            async (_ctx: RequestContext, productId: string) => ({
                'product-1': [{ name: 'Electronics', slug: 'electronics' }],
                'product-2': [{ name: 'Clearance', slug: 'clearance' }],
                'product-3': [{ name: 'Accessories', slug: 'accessories' }],
            })[productId] ?? [],
        );

        const result = await fixture.service.generateFeed(createContext(), 'catalog');

        expect(fixture.generate).toHaveBeenCalledWith(expect.objectContaining({
            products: [
                expect.objectContaining({ id: '1' }),
                expect.objectContaining({ id: '3' }),
            ],
        }));
        expect(result.itemCount).toBe(2);
    });

    it('returns one variant per product when includeVariants is disabled', async () => {
        const fixture = createGenerationFixture(3, undefined, {
            options: { includeVariants: false },
        });
        fixture.variants[1].productId = fixture.variants[0].productId;

        const result = await fixture.service.generateFeed(createContext(), 'catalog');

        expect(fixture.generate).toHaveBeenCalledWith(expect.objectContaining({
            products: [
                expect.objectContaining({ id: '1' }),
                expect.objectContaining({ id: '3' }),
            ],
        }));
        expect(result.itemCount).toBe(2);
    });

    it.each([0, -1, 1.5, PAGINATION.FEED_PREVIEW_MAX_LIMIT + 1])(
        'rejects invalid direct preview limit %s before querying',
        async limit => {
            const fixture = createGenerationFixture(5);

            await expect(fixture.service.generateFeedPreview(
                createContext(),
                'catalog',
                limit,
            )).rejects.toThrow(
                `limit must be an integer between 1 and ${PAGINATION.FEED_PREVIEW_MAX_LIMIT}`,
            );
            expect(fixture.productVariantService.findAll).not.toHaveBeenCalled();
        },
    );

    it('rejects oversized preview content without returning malformed output', async () => {
        const fixture = createGenerationFixture(
            1,
            () => 'x'.repeat(PAGINATION.FEED_PREVIEW_MAX_BYTES + 1),
        );

        await expect(fixture.service.generateFeedPreview(
            createContext(),
            'catalog',
            1,
        )).rejects.toThrow(
            `Feed preview exceeds the ${PAGINATION.FEED_PREVIEW_MAX_BYTES}-byte limit`,
        );
    });

    it('persists GraphQL Node metadata and survives a new service instance', async () => {
        const fixture = createFixture();
        const ctx = createContext();
        const input: FeedConfig = {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        };

        const registered = await fixture.createService().createFeed(ctx, input);
        const afterRestart = await fixture.createService().getRegisteredFeeds(ctx);

        expect(registered).toMatchObject({
            id: '1',
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            channelToken: 'default-channel',
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });
        expect(afterRestart).toEqual([registered]);
        expect(input).not.toHaveProperty('id');
    });

    it('isolates feed definitions by active channel', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        await service.createFeed(createContext('channel-1', 'channel-one'), {
            code: 'catalog',
            name: 'Channel one',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });
        await service.createFeed(createContext('channel-2', 'channel-two'), {
            code: 'catalog',
            name: 'Channel two',
            format: 'JSON',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });

        await expect(service.getRegisteredFeeds(
            createContext('channel-1', 'channel-one'),
        )).resolves.toEqual([
            expect.objectContaining({ name: 'Channel one', channelToken: 'channel-one' }),
        ]);
        await expect(service.getRegisteredFeeds(
            createContext('channel-2', 'channel-two'),
        )).resolves.toEqual([
            expect.objectContaining({ name: 'Channel two', channelToken: 'channel-two' }),
        ]);
    });

    it('accepts implemented formats and rejects unsupported formats and schedules', async () => {
        const service = createFixture().createService();
        const ctx = createContext();
        await expect(service.createFeed(ctx, {
            code: 'meta',
            name: 'Meta',
            format: 'META_CATALOG',
            options: { baseUrl: TEST_FEED_BASE_URL },
        })).resolves.toMatchObject({ format: 'META_CATALOG' });
        await expect(service.createFeed(ctx, {
            code: 'missing-base-url',
            name: 'Missing base URL',
            format: 'CSV',
        })).rejects.toThrow('baseUrl is required for built-in feed formats');
        await expect(service.createFeed(ctx, {
            code: 'amazon',
            name: 'Amazon',
            format: 'AMAZON',
        })).rejects.toBeInstanceOf(FeedConfigValidationError);
        await expect(service.createFeed(ctx, {
            code: 'invalid-cron',
            name: 'Invalid cron',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
            schedule: { enabled: true, cron: '' },
        })).rejects.toThrow('Invalid cron expression');
        await expect(service.createFeed(ctx, {
            code: 'invalid-timezone',
            name: 'Invalid timezone',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
            schedule: {
                enabled: true,
                cron: '0 4 * * *',
                timezone: 'Not/A_Timezone',
            },
        })).rejects.toThrow('Invalid IANA timezone');
        await expect(service.createFeed(ctx, {
            code: 'unsafe-filter',
            name: 'Unsafe filter',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
            filters: { customFilter: 'variant.enabled' } as never,
        })).rejects.toThrow('customFilter is not supported');
        await expect(service.createFeed(ctx, {
            code: 'invalid-image-size',
            name: 'Invalid image size',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL, imageSize: 'thumbnail' } as never,
        })).rejects.toThrow('imageSize must be "preview" or "original"');
        await expect(service.createFeed(ctx, {
            code: 'invalid-currency',
            name: 'Invalid currency',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL, currency: 'usd' },
        })).rejects.toThrow('currency must be an uppercase ISO 4217 code');
    });

    it('rejects malformed JSON-backed feed configuration', async () => {
        const service = createFixture().createService();
        const ctx = createContext();
        const baseConfig = {
            name: 'Invalid JSON config',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        } as const;

        await expect(service.createFeed(ctx, {
            ...baseConfig,
            code: 'invalid-filter-boolean',
            filters: { inStock: 'true' } as never,
        })).rejects.toThrow('inStock must be a boolean');
        await expect(service.createFeed(ctx, {
            ...baseConfig,
            code: 'invalid-utm-params',
            options: {
                baseUrl: TEST_FEED_BASE_URL,
                utmParams: { campaign: 42 },
            } as never,
        })).rejects.toThrow('utmParams must be an object with string values');
        await expect(service.createFeed(ctx, {
            ...baseConfig,
            code: 'invalid-field-mapping',
            fieldMappings: { sku: { default: 'missing-source' } } as never,
        })).rejects.toThrow('fieldMappings must map non-empty headers');
        await expect(service.createFeed(ctx, {
            ...baseConfig,
            code: 'invalid-schedule-enabled',
            schedule: { enabled: 'false', cron: '' } as never,
        })).rejects.toThrow('schedule must be an object with a boolean enabled value');
    });

    it('uses the request channel as authority instead of accepting another token', async () => {
        const service = createFixture().createService();

        await expect(service.createFeed(createContext(), {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            channelToken: 'another-channel',
            options: { baseUrl: TEST_FEED_BASE_URL },
        })).rejects.toThrow('must match the active request channel');
    });

    it('invalidates and removes the previous artifact when a definition changes', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const ctx = createContext();
        const created = await service.createFeed(ctx, {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });
        fixture.entities[0].artifactFileId = 'file_old_0123456789abcdef';
        fixture.entities[0].artifactGeneratedAt = new Date();

        const updated = await service.updateFeed(ctx, created.id, {
            code: 'catalog',
            name: 'Updated catalog',
            format: 'JSON',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });

        expect(updated?.id).toBe('1');
        expect(updated?.downloadUrl).toBeUndefined();
        expect(fixture.fileStorage.deleteFile).toHaveBeenCalledWith(
            ctx,
            'file_old_0123456789abcdef',
        );
    });

    it('stores a generated artifact and returns the existing permissioned file route', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const ctx = createContext();
        await service.createFeed(ctx, {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });
        vi.spyOn(service, 'generateFeedAsBuffer').mockResolvedValue({
            content: Buffer.from('sku,name\nSKU-1,Product'),
            contentType: 'text/csv',
            filename: 'catalog.csv',
            itemCount: 1,
            generatedAt: new Date('2026-07-16T12:00:00.000Z'),
            errors: [],
            warnings: [],
        });

        const artifact = await service.generateFeedArtifact(ctx, 'catalog');

        expect(fixture.fileStorage.storeFile).toHaveBeenCalledWith(
            ctx,
            expect.any(Buffer),
            'catalog.csv',
            'text/csv',
            expect.objectContaining({
                metadata: expect.objectContaining({ feedCode: 'catalog', itemCount: 1 }),
            }),
        );
        expect(artifact.downloadUrl).toBe(
            '/data-hub/files/file_1_0123456789abcdef/download',
        );
        expect(fixture.distributedLock.withLock).toHaveBeenCalledWith(
            'feed-artifact:channel-1:1',
            expect.any(Function),
            expect.objectContaining({ waitForLock: false }),
        );
        await expect(service.getFeed(ctx, 'catalog')).resolves.toMatchObject({
            lastGeneratedAt: new Date('2026-07-16T12:00:00.000Z'),
            lastItemCount: 1,
            downloadUrl: '/data-hub/files/file_1_0123456789abcdef/download',
        });
    });

    it('rejects duplicate create instead of overwriting an existing definition', async () => {
        const service = createFixture().createService();
        const ctx = createContext();
        await service.createFeed(ctx, {
            code: 'catalog',
            name: 'Original',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });

        await expect(service.createFeed(ctx, {
            code: 'catalog',
            name: 'Replacement',
            format: 'JSON',
            options: { baseUrl: TEST_FEED_BASE_URL },
        })).rejects.toThrow('already exists in this channel');
        await expect(service.getFeed(ctx, 'catalog')).resolves.toMatchObject({
            name: 'Original',
            format: 'CSV',
        });
    });

    it('does not update or delete another channel feed by id', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const channelOne = createContext('channel-1', 'channel-one');
        const channelTwo = createContext('channel-2', 'channel-two');
        const created = await service.createFeed(channelOne, {
            code: 'catalog',
            name: 'Channel one',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });

        await expect(service.updateFeed(channelTwo, created.id, {
            code: 'catalog',
            name: 'Cross-channel update',
            format: 'JSON',
            options: { baseUrl: TEST_FEED_BASE_URL },
        })).resolves.toBeUndefined();
        await expect(service.deleteFeed(channelTwo, created.id)).resolves.toBe(false);
        await expect(service.getFeed(channelOne, 'catalog')).resolves.toMatchObject({
            name: 'Channel one',
            format: 'CSV',
        });
    });

    it('deletes the channel-scoped definition and its generated artifact under lock', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const ctx = createContext();
        const created = await service.createFeed(ctx, {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        });
        fixture.entities[0].artifactFileId = 'file_old_0123456789abcdef';

        await expect(service.deleteFeed(ctx, created.id)).resolves.toBe(true);

        expect(fixture.entities).toEqual([]);
        expect(fixture.fileStorage.deleteFile).toHaveBeenCalledWith(
            ctx,
            'file_old_0123456789abcdef',
        );
        expect(fixture.distributedLock.withLock).toHaveBeenCalledWith(
            'feed-artifact:channel-1:1',
            expect.any(Function),
            expect.objectContaining({ waitForLock: false }),
        );
        expect(fixture.distributedLock.withLock).toHaveBeenCalledWith(
            'feed-schedule:1',
            expect.any(Function),
            expect.objectContaining({ waitForLock: false }),
        );
    });

    it('preserves artifact metadata for an idempotent full update', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const ctx = createContext();
        const definition: FeedConfig = {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
        };
        const created = await service.createFeed(ctx, definition);
        fixture.entities[0].artifactFileId = 'file_old_0123456789abcdef';

        const updated = await service.updateFeed(ctx, created.id, definition);

        expect(updated?.downloadUrl).toBe(
            '/data-hub/files/file_old_0123456789abcdef/download',
        );
        expect(fixture.fileStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('resets the durable minute claim when the schedule definition changes', async () => {
        const fixture = createFixture();
        const service = fixture.createService();
        const ctx = createContext();
        const created = await service.createFeed(ctx, {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
            schedule: {
                enabled: true,
                cron: '0 4 * * *',
                timezone: 'Europe/Berlin',
            },
        });
        fixture.entities[0].lastScheduledAt = new Date('2026-07-16T04:00:00.000Z');

        await service.updateFeed(ctx, created.id, {
            code: 'catalog',
            name: 'Catalog',
            format: 'CSV',
            options: { baseUrl: TEST_FEED_BASE_URL },
            schedule: {
                enabled: true,
                cron: '30 4 * * *',
                timezone: 'Europe/Berlin',
            },
        });

        expect(fixture.entities[0].lastScheduledAt).toBeNull();
    });
});
