/**
 * Feed Generator Service
 *
 * NestJS service for managing and generating product feeds.
 * Routes feed generation to specialized generators.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    TransactionalConnection,
    ProductVariant,
    RequestContext,
} from '@vendure/core';
import { LOGGER_CONTEXTS, CONTENT_TYPES, FEED_FORMAT_MAP, FIELD_LIMITS, VALIDATION_PATTERNS, TRANSFORM_LIMITS } from '../constants/index';
import { isValidCron } from '../../shared/utils/validation';
import { DataHubLogger, DataHubLoggerFactory } from '../services/logger';

import {
    FeedFormat,
    FeedConfig,
    FeedFilters,
    GeneratedFeed,
    VariantWithCustomFields,
    CustomFeedGenerator,
    FeedGeneratorContext,
    BuiltInFeedFormat,
} from './generators/feed-types';

/**
 * Valid built-in feed formats
 */
const VALID_BUILT_IN_FORMATS: readonly BuiltInFeedFormat[] = ['google_shopping', 'facebook_catalog', 'csv', 'json', 'xml'];

/**
 * Validation error for feed configuration
 */
export class FeedConfigValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value?: unknown,
    ) {
        super(message);
        this.name = 'FeedConfigValidationError';
    }
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
     * Validate a feed configuration
     * @throws FeedConfigValidationError if validation fails
     */
    private validateFeedConfig(config: FeedConfig): void {
        // Validate required code field
        if (!config.code || typeof config.code !== 'string') {
            throw new FeedConfigValidationError('Feed code is required and must be a string', 'code', config.code);
        }

        // Validate code format (alphanumeric with underscores/hyphens)
        if (!VALIDATION_PATTERNS.SLUG.test(config.code)) {
            throw new FeedConfigValidationError(
                'Feed code must contain only alphanumeric characters, underscores, and hyphens',
                'code',
                config.code,
            );
        }

        // Validate code length
        if (config.code.length > FIELD_LIMITS.CODE_MAX) {
            throw new FeedConfigValidationError(
                `Feed code must not exceed ${FIELD_LIMITS.CODE_MAX} characters`,
                'code',
                config.code,
            );
        }

        // Validate required name field
        if (!config.name || typeof config.name !== 'string') {
            throw new FeedConfigValidationError('Feed name is required and must be a string', 'name', config.name);
        }

        // Validate name length
        if (config.name.length > FIELD_LIMITS.NAME_MAX) {
            throw new FeedConfigValidationError(
                `Feed name must not exceed ${FIELD_LIMITS.NAME_MAX} characters`,
                'name',
                config.name,
            );
        }

        // Validate format
        if (!config.format || typeof config.format !== 'string') {
            throw new FeedConfigValidationError('Feed format is required and must be a string', 'format', config.format);
        }

        // Validate custom format has customGeneratorCode
        if (config.format === 'custom') {
            if (!config.customGeneratorCode) {
                throw new FeedConfigValidationError(
                    'customGeneratorCode is required when format is "custom"',
                    'customGeneratorCode',
                    config.customGeneratorCode,
                );
            }
            if (!this.customGenerators.has(config.customGeneratorCode)) {
                throw new FeedConfigValidationError(
                    `Custom generator "${config.customGeneratorCode}" is not registered. Available: ${Array.from(this.customGenerators.keys()).join(', ') || 'none'}`,
                    'customGeneratorCode',
                    config.customGeneratorCode,
                );
            }
        } else if (!VALID_BUILT_IN_FORMATS.includes(config.format as BuiltInFeedFormat)) {
            // Unknown format that's not 'custom' - warn but allow (for future extensibility)
            this.logger.warn('Unknown feed format registered', {
                feedCode: config.code,
                format: config.format,
                validFormats: VALID_BUILT_IN_FORMATS,
            });
        }

        // Validate baseUrl if provided
        if (config.options?.baseUrl) {
            if (!VALIDATION_PATTERNS.URL.test(config.options.baseUrl)) {
                throw new FeedConfigValidationError(
                    'baseUrl must be a valid URL',
                    'options.baseUrl',
                    config.options.baseUrl,
                );
            }
        }

        // Validate price filters
        if (config.filters?.minPrice !== undefined && config.filters.minPrice < 0) {
            throw new FeedConfigValidationError(
                'minPrice must be a non-negative number',
                'filters.minPrice',
                config.filters.minPrice,
            );
        }
        if (config.filters?.maxPrice !== undefined && config.filters.maxPrice < 0) {
            throw new FeedConfigValidationError(
                'maxPrice must be a non-negative number',
                'filters.maxPrice',
                config.filters.maxPrice,
            );
        }
        if (
            config.filters?.minPrice !== undefined &&
            config.filters?.maxPrice !== undefined &&
            config.filters.minPrice > config.filters.maxPrice
        ) {
            throw new FeedConfigValidationError(
                'minPrice cannot be greater than maxPrice',
                'filters.minPrice',
                { minPrice: config.filters.minPrice, maxPrice: config.filters.maxPrice },
            );
        }

        // Validate schedule cron expression if provided
        if (config.schedule?.enabled && config.schedule.cron) {
            if (!isValidCron(config.schedule.cron)) {
                throw new FeedConfigValidationError(
                    'Invalid cron expression: must be a valid 5-field cron (minute hour day month weekday)',
                    'schedule.cron',
                    config.schedule.cron,
                );
            }
        }
    }

    /**
     * Register a feed configuration
     * @throws FeedConfigValidationError if configuration is invalid
     */
    registerFeed(config: FeedConfig): void {
        this.validateFeedConfig(config);
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
        ctx: RequestContext,
        filters?: FeedFilters,
    ): Promise<VariantWithCustomFields[]> {
        const queryBuilder = this.connection
            .getRepository(ctx, ProductVariant)
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
                minPrice: filters.minPrice * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER,
            });
        }

        if (filters?.maxPrice) {
            queryBuilder.andWhere('variant.priceWithTax <= :maxPrice', {
                maxPrice: filters.maxPrice * TRANSFORM_LIMITS.CURRENCY_MINOR_UNITS_MULTIPLIER,
            });
        }

        // TypeORM returns ProductVariant[] but the entities already have the
        // customFields and stockLevels properties loaded via joins
        return queryBuilder.getMany() as Promise<VariantWithCustomFields[]>;
    }

    getContentType(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.contentType ?? CONTENT_TYPES.PLAIN;
    }

    getFileExtension(format: FeedFormat): string {
        return FEED_FORMAT_MAP.get(format)?.extension ?? 'txt';
    }
}
