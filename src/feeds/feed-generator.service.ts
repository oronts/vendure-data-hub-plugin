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
} from '@vendure/common/lib/generated-types';
import {
    ConfigService,
    ID,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { CONTENT_TYPES, DISTRIBUTED_LOCK, FEED_FORMAT_MAP, LOGGER_CONTEXTS, PAGINATION } from '../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';
import { DistributedLockService } from '../services/runtime/distributed-lock.service';
import { createChannelRequestContext } from '../runtime/helpers/channel-request-context';
import { resolveMoneyPrecision } from '../utils/money.utils';
import { FeedCatalogService } from './feed-catalog.service';
import { validateFeedConfig } from './feed-config.validation';
import { FeedPersistenceService } from './feed-persistence.service';

import {
    FeedFormat,
    FeedConfig,
    GeneratedFeed,
    GeneratedFeedArtifact,
    RegisteredFeedConfig,
    CustomFeedGenerator,
    FeedGeneratorContext,
    FeedGenerationDiagnostics,
} from './generators/feed-types';
import { generateGoogleShoppingFeed } from './generators/google-shopping.generator';
import { generateFacebookCatalogFeed } from './generators/facebook-catalog.generator';
import { generateCSVFeed } from './generators/csv-feed.generator';
import { generateJSONFeed } from './generators/json-feed.generator';
import { generateXMLFeed } from './generators/xml-feed.generator';
import {
    appendFeedDiagnostics,
    resolveCustomFeedItemCount,
} from './generators/feed-diagnostics';

export { FeedConfigValidationError } from './feed-config.validation';

interface FeedGenerationOptions {
    maxItems?: number;
}


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
        private requestContextService: RequestContextService,
        private catalog: FeedCatalogService,
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
        const diagnostics: FeedGenerationDiagnostics = {
            itemCount: 0,
            warnings: [],
        };

        try {
            const moneyPrecision = resolveMoneyPrecision(this.configService);
            const products = await this.catalog.getFilteredVariants(
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
                    content = await generateGoogleShoppingFeed(
                        feedContext,
                        products,
                        runtimeConfig,
                        this.connection,
                        moneyPrecision,
                        diagnostics,
                    );
                    contentType = CONTENT_TYPES.XML;
                    filename = `${feedCode}.xml`;
                    break;

                case 'facebook_catalog':
                case 'meta_catalog':
                    content = await generateFacebookCatalogFeed(
                        feedContext,
                        products,
                        runtimeConfig,
                        this.connection,
                        moneyPrecision,
                        diagnostics,
                    );
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'csv':
                    content = await generateCSVFeed(
                        feedContext,
                        products,
                        runtimeConfig,
                        this.connection,
                        moneyPrecision,
                        undefined,
                        diagnostics,
                    );
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'json':
                    content = await generateJSONFeed(
                        feedContext,
                        products,
                        runtimeConfig,
                        this.connection,
                        moneyPrecision,
                        undefined,
                        diagnostics,
                    );
                    contentType = CONTENT_TYPES.JSON;
                    filename = `${feedCode}.json`;
                    break;

                case 'xml':
                    content = await generateXMLFeed(
                        feedContext,
                        products,
                        runtimeConfig,
                        this.connection,
                        moneyPrecision,
                        undefined,
                        diagnostics,
                    );
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
                    diagnostics.itemCount = resolveCustomFeedItemCount(
                        result.itemCount,
                        products.length,
                    );
                    appendFeedDiagnostics(diagnostics.warnings, result.warnings);
                    appendFeedDiagnostics(errors, result.errors);
                    contentType = result.contentType;
                    filename = `${feedCode}.${result.fileExtension}`;
                    break;
                }
            }

            const durationMs = Date.now() - startTime;
            this.logger.info('Feed generation completed', {
                feedCode,
                format: runtimeConfig.format,
                itemCount: diagnostics.itemCount,
                durationMs,
                contentLength: typeof content === 'string' ? content.length : 0,
            });

            return {
                content,
                contentType,
                filename,
                itemCount: diagnostics.itemCount,
                generatedAt: new Date(),
                errors,
                warnings: diagnostics.warnings,
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

    getContentType(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.contentType ?? CONTENT_TYPES.PLAIN;
    }

    getFileExtension(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.extension ?? 'txt';
    }
}
