/**
 * Feed Generator Service
 *
 * NestJS service for managing and generating product feeds.
 * Routes feed generation to specialized generators.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    CurrencyCode,
    LanguageCode,
    SortOrder,
} from '@vendure/common/lib/generated-types';
import {
    CollectionService,
    ConfigService,
    ID,
    ProductService,
    ProductVariantService,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CONTENT_TYPES, DISTRIBUTED_LOCK, FEED_FORMAT_MAP, LOGGER_CONTEXTS, PAGINATION } from '../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { DistributedLockService } from '../services/runtime/distributed-lock.service';
import { createChannelRequestContext } from '../runtime/helpers/channel-request-context';
import { majorToMinorUnits, resolveMoneyPrecision } from '../utils/money.utils';
import { validateFeedConfig } from './feed-config.validation';
import { FeedPersistenceService } from './feed-persistence.service';

import {
    FeedFormat,
    FeedConfig,
    FeedFilters,
    GeneratedFeed,
    GeneratedFeedArtifact,
    RegisteredFeedConfig,
    VariantWithCustomFields,
    CustomFeedGenerator,
    FeedGeneratorContext,
} from './generators/feed-types';

export { FeedConfigValidationError } from './feed-config.validation';

interface FeedGenerationOptions {
    maxItems?: number;
}

import { generateGoogleShoppingFeed } from './generators/google-shopping.generator';
import { generateFacebookCatalogFeed } from './generators/facebook-catalog.generator';
import { generateCSVFeed } from './generators/csv-feed.generator';
import { generateJSONFeed } from './generators/json-feed.generator';
import { generateXMLFeed } from './generators/xml-feed.generator';

export {
    FeedFormat,
    FeedConfig,
    FeedFilters,
    FeedFieldMapping,
    FeedOptions,
    GeneratedFeed,
    GeneratedFeedArtifact,
    RegisteredFeedConfig,
    VariantWithCustomFields,
    ProductWithCustomFields,
    GoogleShoppingItem,
    FacebookCatalogItem,
    CustomFeedGenerator,
    FeedGeneratorContext,
    CustomFeedResult,
} from './generators/feed-types';

@Injectable()
export class FeedGeneratorService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private customGenerators: Map<string, CustomFeedGenerator> = new Map();

    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
        private productVariantService: ProductVariantService,
        private productService: ProductService,
        private collectionService: CollectionService,
        private requestContextService: RequestContextService,
        private persistence: FeedPersistenceService,
        private distributedLock: DistributedLockService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FEED_GENERATOR_SERVICE);
    }

    async onModuleInit() {
        this.logger.info('FeedGeneratorService initialized');
    }

    /**
     * Register a custom feed generator
     */
    registerCustomGenerator(generator: CustomFeedGenerator): void {
        this.customGenerators.set(generator.code, generator);
        this.logger.info('Registered custom feed generator', {
            generatorCode: generator.code,
            name: generator.name,
        });
    }

    /**
     * Unregister a custom feed generator
     */
    unregisterCustomGenerator(code: string): boolean {
        const deleted = this.customGenerators.delete(code);
        if (deleted) {
            this.logger.info('Unregistered custom feed generator', { generatorCode: code });
        }
        return deleted;
    }

    /**
     * Get all registered custom generators
     */
    getCustomGenerators(): CustomFeedGenerator[] {
        return Array.from(this.customGenerators.values());
    }

    /**
     * Check if a custom generator exists
     */
    hasCustomGenerator(code: string): boolean {
        return this.customGenerators.has(code);
    }

    async createFeed(
        ctx: RequestContext,
        config: FeedConfig,
    ): Promise<RegisteredFeedConfig> {
        validateFeedConfig(config, this.customGenerators);
        return this.persistence.create(ctx, config);
    }

    async updateFeed(
        ctx: RequestContext,
        id: ID,
        config: FeedConfig,
    ): Promise<RegisteredFeedConfig | undefined> {
        validateFeedConfig(config, this.customGenerators);
        const entity = await this.persistence.getEntityById(ctx, id);
        if (!entity) return undefined;
        return this.withLifecycleLocks(entity.channelId, entity.id, () => (
            this.persistence.update(ctx, id, config)
        ));
    }

    async deleteFeed(ctx: RequestContext, id: ID): Promise<boolean> {
        const entity = await this.persistence.getEntityById(ctx, id);
        if (!entity) return false;
        return this.withLifecycleLocks(entity.channelId, entity.id, () => (
            this.persistence.delete(ctx, id)
        ));
    }

    /**
     * Get a feed configuration by code
     */
    async getFeed(
        ctx: RequestContext,
        feedCode: string,
    ): Promise<RegisteredFeedConfig | undefined> {
        return this.persistence.get(ctx, feedCode);
    }

    async getFeedById(
        ctx: RequestContext,
        id: ID,
    ): Promise<RegisteredFeedConfig | undefined> {
        return this.persistence.getById(ctx, id);
    }

    /**
     * Get all registered feeds
     */
    async getRegisteredFeeds(ctx: RequestContext): Promise<RegisteredFeedConfig[]> {
        return this.persistence.list(ctx);
    }

    /**
     * Check if a feed exists
     */
    async hasFeed(ctx: RequestContext, feedCode: string): Promise<boolean> {
        return (await this.persistence.getEntity(ctx, feedCode)) !== null;
    }

    /**
     * Generate a feed
     */
    async generateFeed(
        ctx: RequestContext,
        feedCode: string,
    ): Promise<GeneratedFeed> {
        return this.generateFeedWithOptions(ctx, feedCode);
    }

    async generateFeedPreview(
        ctx: RequestContext,
        feedCode: string,
        maxItems: number,
    ): Promise<GeneratedFeed> {
        if (
            !Number.isInteger(maxItems) ||
            maxItems < 1 ||
            maxItems > PAGINATION.FEED_PREVIEW_MAX_LIMIT
        ) {
            throw new UserInputError(
                `limit must be an integer between 1 and ${PAGINATION.FEED_PREVIEW_MAX_LIMIT}`,
            );
        }

        const result = await this.generateFeedWithOptions(ctx, feedCode, { maxItems });
        const byteLength = typeof result.content === 'string'
            ? Buffer.byteLength(result.content, 'utf8')
            : result.content.byteLength;
        if (byteLength > PAGINATION.FEED_PREVIEW_MAX_BYTES) {
            throw new UserInputError(
                `Feed preview exceeds the ${PAGINATION.FEED_PREVIEW_MAX_BYTES}-byte limit; request fewer items`,
            );
        }
        return result;
    }

    private async generateFeedWithOptions(
        ctx: RequestContext,
        feedCode: string,
        options: FeedGenerationOptions = {},
    ): Promise<GeneratedFeed> {
        const config = await this.getFeed(ctx, feedCode);
        if (!config) {
            this.logger.warn('Feed not found', { feedCode });
            throw new Error(`Feed not found: ${feedCode}`);
        }
        validateFeedConfig(config, this.customGenerators);
        const feedContext = await this.createFeedContext(ctx, config);
        const runtimeConfig: FeedConfig = {
            ...config,
            options: {
                ...config.options,
                currency: String(feedContext.currencyCode),
                language: String(feedContext.languageCode),
            },
        };

        this.logger.info('Starting feed generation', {
            feedCode,
            format: runtimeConfig.format,
        });

        const startTime = Date.now();
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const moneyPrecision = resolveMoneyPrecision(this.configService);
            const products = await this.getFilteredProducts(
                feedContext,
                runtimeConfig.filters,
                moneyPrecision,
                runtimeConfig.options?.includeVariants,
                options.maxItems,
            );
            this.logger.debug('Products retrieved for feed', {
                feedCode,
                productCount: products.length,
            });

            let content: string;
            let contentType: string;
            let filename: string;

            const formatLower = runtimeConfig.format.toLowerCase();
            switch (formatLower) {
                case 'google_shopping':
                    content = await generateGoogleShoppingFeed(feedContext, products, runtimeConfig, this.connection, moneyPrecision);
                    contentType = CONTENT_TYPES.XML;
                    filename = `${feedCode}.xml`;
                    break;

                case 'facebook_catalog':
                case 'meta_catalog':
                    content = await generateFacebookCatalogFeed(feedContext, products, runtimeConfig, this.connection, moneyPrecision);
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'csv':
                    content = await generateCSVFeed(feedContext, products, runtimeConfig, this.connection, moneyPrecision);
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'json':
                    content = await generateJSONFeed(feedContext, products, runtimeConfig, this.connection, moneyPrecision);
                    contentType = CONTENT_TYPES.JSON;
                    filename = `${feedCode}.json`;
                    break;

                case 'xml':
                    content = await generateXMLFeed(feedContext, products, runtimeConfig, this.connection, moneyPrecision);
                    contentType = CONTENT_TYPES.XML;
                    filename = `${feedCode}.xml`;
                    break;

                case 'custom':
                default: {
                    const generatorCode = runtimeConfig.customGeneratorCode;
                    if (!generatorCode) {
                        throw new Error(`Custom feed format requires customGeneratorCode to be specified`);
                    }
                    const customGenerator = this.customGenerators.get(generatorCode);
                    if (!customGenerator) {
                        throw new Error(`Custom feed generator not found: ${generatorCode}. Available: ${Array.from(this.customGenerators.keys()).join(', ') || 'none'}`);
                    }
                    const generatorContext: FeedGeneratorContext = {
                        ctx: feedContext,
                        connection: this.connection,
                        config: runtimeConfig,
                        products,
                        moneyPrecision,
                    };
                    const result = await customGenerator.generate(generatorContext);
                    content = result.content;
                    contentType = result.contentType;
                    filename = `${feedCode}.${result.fileExtension}`;
                    break;
                }
            }

            const durationMs = Date.now() - startTime;
            this.logger.info('Feed generation completed', {
                feedCode,
                format: runtimeConfig.format,
                itemCount: products.length,
                durationMs,
                contentLength: typeof content === 'string' ? content.length : 0,
            });

            return {
                content,
                contentType,
                filename,
                itemCount: products.length,
                generatedAt: new Date(),
                errors,
                warnings,
            };
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error('Feed generation failed', error instanceof Error ? error : new Error(String(error)), {
                feedCode,
                format: runtimeConfig.format,
                durationMs,
            });
            throw error;
        }
    }

    /**
     * Generate feed and return as buffer (for file downloads)
     */
    async generateFeedAsBuffer(ctx: RequestContext, feedCode: string): Promise<GeneratedFeed> {
        const result = await this.generateFeed(ctx, feedCode);
        if (typeof result.content === 'string') {
            result.content = Buffer.from(result.content, 'utf-8');
        }
        return result;
    }

    async generateFeedArtifact(
        ctx: RequestContext,
        feedCode: string,
    ): Promise<GeneratedFeedArtifact> {
        const entity = await this.persistence.getEntity(ctx, feedCode);
        if (!entity) throw new Error(`Feed not found: ${feedCode}`);
        return this.withArtifactLock(
            entity.channelId,
            entity.id,
            () => this.generateAndStoreArtifact(ctx, feedCode),
        );
    }

    private withArtifactLock<T>(
        channelId: string,
        feedId: ID,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.distributedLock.withLock(
            `feed-artifact:${channelId}:${feedId}`,
            operation,
            {
                ttlMs: DISTRIBUTED_LOCK.PIPELINE_LOCK_TTL_MS,
                waitForLock: false,
            },
        );
    }

    private withLifecycleLocks<T>(
        channelId: string,
        feedId: ID,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.distributedLock.withLock(
            `feed-schedule:${feedId}`,
            () => this.withArtifactLock(channelId, feedId, operation),
            {
                ttlMs: DISTRIBUTED_LOCK.SCHEDULER_LOCK_TTL_MS,
                waitForLock: false,
            },
        );
    }

    private async generateAndStoreArtifact(
        ctx: RequestContext,
        feedCode: string,
    ): Promise<GeneratedFeedArtifact> {
        const entity = await this.persistence.getEntity(ctx, feedCode);
        if (!entity) throw new Error(`Feed not found: ${feedCode}`);
        const generated = await this.generateFeedAsBuffer(ctx, feedCode);
        return this.persistence.storeArtifact(ctx, entity, generated);
    }

    /**
     * Get filtered products for feed generation
     */
    private async getFilteredProducts(
        ctx: RequestContext,
        filters: FeedFilters | undefined,
        moneyPrecision: number,
        includeVariants: boolean | undefined,
        maxItems?: number,
    ): Promise<VariantWithCustomFields[]> {
        const result: VariantWithCustomFields[] = [];
        const seenProductIds = new Set<string>();
        let skip = 0;

        while (maxItems === undefined || result.length < maxItems) {
            const take = Math.min(
                PAGINATION.FEED_QUERY_PAGE_SIZE,
                maxItems === undefined ? PAGINATION.FEED_QUERY_PAGE_SIZE : maxItems - result.length,
            );
            const page = await this.productVariantService.findAll(ctx, {
                skip,
                take,
                filter: filters?.enabled === false
                    ? undefined
                    : { enabled: { eq: true } },
                sort: { id: SortOrder.ASC },
            });
            if (page.items.length === 0) break;

            const variants = await this.hydrateFeedVariants(ctx, page.items);
            for (const variant of variants) {
                if (!this.matchesFeedFilters(variant, filters, moneyPrecision)) continue;
                const productId = String(variant.productId);
                if (includeVariants === false && seenProductIds.has(productId)) continue;
                seenProductIds.add(productId);
                result.push(variant);
                if (maxItems !== undefined && result.length >= maxItems) break;
            }

            skip += page.items.length;
            if (skip >= page.totalItems) break;
        }

        return result;
    }

    private async createFeedContext(
        ctx: RequestContext,
        config: FeedConfig,
    ): Promise<RequestContext> {
        const languageCode = config.options?.language as LanguageCode | undefined;
        const currencyCode = config.options?.currency as CurrencyCode | undefined;
        if (languageCode === undefined && currencyCode === undefined) return ctx;
        return createChannelRequestContext(
            this.requestContextService,
            ctx,
            ctx.channel,
            languageCode,
            currencyCode,
        );
    }

    private async hydrateFeedVariants(
        ctx: RequestContext,
        variants: ReadonlyArray<{ id: ID }>,
    ): Promise<VariantWithCustomFields[]> {
        const hydrated = await this.productVariantService.findByIds(
            ctx,
            variants.map(variant => variant.id),
        );
        const productIds = Array.from(new Set(hydrated.map(variant => String(variant.productId))));
        const products = await this.productService.findByIds(ctx, productIds, [
            'featuredAsset',
            'assets',
            'assets.asset',
            'facetValues',
            'facetValues.facet',
        ]);
        const productsById = new Map(await this.mapWithConcurrency(products, async product => {
            const collections = await this.collectionService.getCollectionsByProductId(
                ctx,
                product.id,
                true,
            );
            const enrichedProduct = Object.assign(product, {
                feedCollections: collections.map(collection => ({
                    name: collection.name,
                    slug: collection.slug,
                })),
            });
            return [String(product.id), enrichedProduct] as const;
        }));

        return this.mapWithConcurrency(hydrated, async variant => Object.assign(variant, {
            product: productsById.get(String(variant.productId)),
            saleableStockLevel: await this.productVariantService.getSaleableStockLevel(ctx, variant),
        }) as unknown as VariantWithCustomFields);
    }

    private async mapWithConcurrency<T, R>(
        items: readonly T[],
        operation: (item: T) => Promise<R>,
    ): Promise<R[]> {
        const results = new Array<R>(items.length);
        let nextIndex = 0;
        const workers = Array.from({
            length: Math.min(PAGINATION.FEED_HYDRATION_CONCURRENCY, items.length),
        }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                results[index] = await operation(items[index]);
            }
        });
        await Promise.all(workers);
        return results;
    }

    private matchesFeedFilters(
        variant: VariantWithCustomFields,
        filters: FeedFilters | undefined,
        moneyPrecision: number,
    ): boolean {
        if (filters?.enabled !== false && (!variant.enabled || !variant.product?.enabled)) {
            return false;
        }
        if (filters?.inStock && (variant.saleableStockLevel ?? 0) <= 0) return false;
        if (filters?.hasPrice && variant.priceWithTax <= 0) return false;
        if (
            filters?.minPrice !== undefined
            && variant.priceWithTax < majorToMinorUnits(filters.minPrice, moneyPrecision)
        ) return false;
        if (
            filters?.maxPrice !== undefined
            && variant.priceWithTax > majorToMinorUnits(filters.maxPrice, moneyPrecision)
        ) return false;

        const productCollections = new Set(
            (variant.product as VariantWithCustomFields['product'] & {
                feedCollections?: Array<{ slug: string }>;
            } | undefined)?.feedCollections?.map(collection => collection.slug.toLowerCase()) ?? [],
        );
        const included = filters?.categories?.map(slug => slug.trim().toLowerCase()).filter(Boolean);
        if (included && included.length > 0 && !included.some(slug => productCollections.has(slug))) {
            return false;
        }
        const excluded = filters?.excludeCategories
            ?.map(slug => slug.trim().toLowerCase())
            .filter(Boolean);
        return !excluded?.some(slug => productCollections.has(slug));
    }

    getContentType(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.contentType ?? CONTENT_TYPES.PLAIN;
    }

    getFileExtension(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.extension ?? 'txt';
    }
}
