/**
 * Feed Generator Service
 *
 * NestJS service for managing and generating product feeds.
 * Delegates feed generation to specialized generators.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    TransactionalConnection,
    ProductVariant,
    RequestContext,
} from '@vendure/core';
import { LOGGER_CONTEXTS, CONTENT_TYPES, FEED_FORMAT_MAP } from '../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';

import {
    FeedFormat,
    FeedConfig,
    FeedFilters,
    GeneratedFeed,
    VariantWithCustomFields,
    CustomFeedGenerator,
    FeedGeneratorContext,
} from './generators/feed-types';

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
    private feedConfigs: Map<string, FeedConfig> = new Map();
    private customGenerators: Map<string, CustomFeedGenerator> = new Map();

    constructor(
        private connection: TransactionalConnection,
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

    /**
     * Register a feed configuration
     */
    registerFeed(config: FeedConfig): void {
        this.feedConfigs.set(config.code, config);
        this.logger.info('Registered feed configuration', {
            feedCode: config.code,
            format: config.format,
        });
    }

    /**
     * Unregister a feed configuration
     */
    unregisterFeed(feedCode: string): boolean {
        const deleted = this.feedConfigs.delete(feedCode);
        if (deleted) {
            this.logger.info('Unregistered feed configuration', { feedCode });
        }
        return deleted;
    }

    /**
     * Get a feed configuration by code
     */
    getFeed(feedCode: string): FeedConfig | undefined {
        return this.feedConfigs.get(feedCode);
    }

    /**
     * Get all registered feeds
     */
    getRegisteredFeeds(): FeedConfig[] {
        return Array.from(this.feedConfigs.values());
    }

    /**
     * Check if a feed exists
     */
    hasFeed(feedCode: string): boolean {
        return this.feedConfigs.has(feedCode);
    }

    /**
     * Generate a feed
     */
    async generateFeed(ctx: RequestContext, feedCode: string): Promise<GeneratedFeed> {
        const config = this.feedConfigs.get(feedCode);
        if (!config) {
            this.logger.warn('Feed not found', { feedCode });
            throw new Error(`Feed not found: ${feedCode}`);
        }

        this.logger.info('Starting feed generation', {
            feedCode,
            format: config.format,
        });

        const startTime = Date.now();
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const products = await this.getFilteredProducts(ctx, config.filters);
            this.logger.debug('Products retrieved for feed', {
                feedCode,
                productCount: products.length,
            });

            let content: string;
            let contentType: string;
            let filename: string;

            switch (config.format) {
                case 'google_shopping':
                    content = await generateGoogleShoppingFeed(ctx, products, config, this.connection);
                    contentType = CONTENT_TYPES.XML;
                    filename = `${feedCode}.xml`;
                    break;

                case 'facebook_catalog':
                    content = await generateFacebookCatalogFeed(ctx, products, config, this.connection);
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'csv':
                    content = await generateCSVFeed(ctx, products, config, this.connection);
                    contentType = CONTENT_TYPES.CSV;
                    filename = `${feedCode}.csv`;
                    break;

                case 'json':
                    content = await generateJSONFeed(ctx, products, config, this.connection);
                    contentType = CONTENT_TYPES.JSON;
                    filename = `${feedCode}.json`;
                    break;

                case 'xml':
                    content = await generateXMLFeed(ctx, products, config, this.connection);
                    contentType = CONTENT_TYPES.XML;
                    filename = `${feedCode}.xml`;
                    break;

                case 'custom':
                default: {
                    const generatorCode = config.customGeneratorCode;
                    if (!generatorCode) {
                        throw new Error(`Custom feed format requires customGeneratorCode to be specified`);
                    }
                    const customGenerator = this.customGenerators.get(generatorCode);
                    if (!customGenerator) {
                        throw new Error(`Custom feed generator not found: ${generatorCode}. Available: ${Array.from(this.customGenerators.keys()).join(', ') || 'none'}`);
                    }
                    const generatorContext: FeedGeneratorContext = {
                        ctx,
                        connection: this.connection,
                        config,
                        products,
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
                format: config.format,
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
                format: config.format,
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

    /**
     * Get filtered products for feed generation
     */
    private async getFilteredProducts(
        _ctx: RequestContext,
        filters?: FeedFilters,
    ): Promise<VariantWithCustomFields[]> {
        const queryBuilder = this.connection.rawConnection
            .getRepository(ProductVariant)
            .createQueryBuilder('variant')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('variant.options', 'options')
            .leftJoinAndSelect('options.group', 'optionGroup')
            .leftJoinAndSelect('variant.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.featuredAsset', 'productFeaturedAsset')
            .leftJoinAndSelect('product.facetValues', 'facetValues')
            .leftJoinAndSelect('facetValues.facet', 'facet')
            .leftJoinAndSelect('variant.stockLevels', 'stockLevels')
            .where('variant.deletedAt IS NULL')
            .andWhere('product.deletedAt IS NULL');

        if (filters?.enabled !== false) {
            queryBuilder.andWhere('variant.enabled = true');
            queryBuilder.andWhere('product.enabled = true');
        }

        if (filters?.inStock) {
            queryBuilder.andWhere('variant.stockOnHand > 0');
        }

        if (filters?.hasPrice) {
            queryBuilder.andWhere('variant.priceWithTax > 0');
        }

        if (filters?.minPrice) {
            queryBuilder.andWhere('variant.priceWithTax >= :minPrice', {
                minPrice: filters.minPrice * 100,
            });
        }

        if (filters?.maxPrice) {
            queryBuilder.andWhere('variant.priceWithTax <= :maxPrice', {
                maxPrice: filters.maxPrice * 100,
            });
        }

        return queryBuilder.getMany();
    }

    getContentType(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.contentType ?? CONTENT_TYPES.PLAIN;
    }

    getFileExtension(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.extension ?? 'txt';
    }
}
