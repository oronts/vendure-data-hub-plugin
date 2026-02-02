import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ProductService,
    FacetValueService,
    AssetService,
} from '@vendure/core';
import {
    EntityLoader,
    LoaderContext,
    EntityLoadResult,
    EntityValidationResult,
    EntityFieldSchema,
} from '../../types/index';
import { TargetOperation } from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import {
    ProductInput,
    ExistingEntityResult,
    PRODUCT_LOADER_METADATA,
} from './types';
import {
    resolveFacetValueIds,
    slugify,
    isRecoverableError,
    shouldUpdateField,
} from './helpers';

@Injectable()
export class ProductLoader implements EntityLoader<ProductInput> {
    private readonly logger: DataHubLogger;

    readonly entityType = PRODUCT_LOADER_METADATA.entityType;
    readonly name = PRODUCT_LOADER_METADATA.name;
    readonly description = PRODUCT_LOADER_METADATA.description;
    readonly supportedOperations: TargetOperation[] = [...PRODUCT_LOADER_METADATA.supportedOperations];
    readonly lookupFields = [...PRODUCT_LOADER_METADATA.lookupFields];
    readonly requiredFields = [...PRODUCT_LOADER_METADATA.requiredFields];

    constructor(
        private _connection: TransactionalConnection,
        private productService: ProductService,
        private facetValueService: FacetValueService,
        private _assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_LOADER);
    }

    async load(context: LoaderContext, records: ProductInput[]): Promise<EntityLoadResult> {
        const result: EntityLoadResult = {
            succeeded: 0,
            failed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
            affectedIds: [],
        };

        for (const record of records) {
            try {
                const validation = await this.validate(context.ctx, record, context.operation);
                if (!validation.valid) {
                    result.failed++;
                    result.errors.push({
                        record,
                        message: validation.errors.map(e => e.message).join('; '),
                        recoverable: false,
                    });
                    continue;
                }

                const existing = await this.findExisting(context.ctx, context.lookupFields, record);

                if (existing) {
                    if (context.operation === TARGET_OPERATION.CREATE) {
                        if (context.options.skipDuplicates) {
                            result.skipped++;
                            continue;
                        }
                        result.failed++;
                        result.errors.push({
                            record,
                            message: `Product with slug "${record.slug}" already exists`,
                            code: 'DUPLICATE',
                            recoverable: false,
                        });
                        continue;
                    }

                    // UPDATE or UPSERT
                    if (!context.dryRun) {
                        await this.updateProduct(context, existing.id, record);
                    }
                    result.updated++;
                    result.affectedIds.push(existing.id);
                } else {
                    if (context.operation === TARGET_OPERATION.UPDATE) {
                        result.skipped++;
                        continue;
                    }

                    // CREATE or UPSERT
                    if (!context.dryRun) {
                        const newId = await this.createProduct(context, record);
                        result.affectedIds.push(newId);
                    }
                    result.created++;
                }

                result.succeeded++;
            } catch (error) {
                result.failed++;
                result.errors.push({
                    record,
                    message: error instanceof Error ? error.message : String(error),
                    recoverable: isRecoverableError(error),
                });
                this.logger.error(`Failed to load product`, error instanceof Error ? error : undefined);
            }
        }

        return result;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ProductInput,
    ): Promise<ExistingEntityResult | null> {
        // Primary lookup: by slug
        if (record.slug && lookupFields.includes('slug')) {
            const products = await this.productService.findAll(ctx, {
                filter: { slug: { eq: record.slug } },
            });

            if (products.totalItems > 0) {
                return { id: products.items[0].id, entity: products.items[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const product = await this.productService.findOne(ctx, record.id as ID);
            if (product) {
                return { id: product.id, entity: product };
            }
        }

        // Fallback: by name (exact match)
        if (record.name) {
            const products = await this.productService.findAll(ctx, {
                filter: { name: { eq: record.name } },
            });

            if (products.totalItems > 0) {
                return { id: products.items[0].id, entity: products.items[0] };
            }
        }

        return null;
    }

    async validate(
        _ctx: RequestContext,
        record: ProductInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        // Required field validation
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                errors.push({ field: 'name', message: 'Product name is required', code: 'REQUIRED' });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    getFieldSchema(): EntityFieldSchema {
        return {
            entityType: VendureEntityType.PRODUCT,
            fields: [
                {
                    key: 'name',
                    label: 'Product Name',
                    type: 'string',
                    required: true,
                    translatable: true,
                    description: 'Display name for the product',
                    example: 'Premium Widget',
                },
                {
                    key: 'slug',
                    label: 'URL Slug',
                    type: 'string',
                    lookupable: true,
                    description: 'URL-friendly identifier (auto-generated if not provided)',
                    example: 'premium-widget',
                },
                {
                    key: 'description',
                    label: 'Description',
                    type: 'string',
                    translatable: true,
                    description: 'Product description (HTML supported)',
                },
                {
                    key: 'enabled',
                    label: 'Enabled',
                    type: 'boolean',
                    description: 'Whether the product is published',
                },
                {
                    key: 'facetValueCodes',
                    label: 'Facet Values',
                    type: 'array',
                    description: 'Array of facet value codes to assign',
                    example: ['category-electronics', 'brand-acme'],
                },
                {
                    key: 'assetUrls',
                    label: 'Asset URLs',
                    type: 'array',
                    description: 'URLs of images to attach',
                },
                {
                    key: 'featuredAssetUrl',
                    label: 'Featured Asset URL',
                    type: 'string',
                    description: 'URL of the featured/main image',
                },
                {
                    key: 'customFields',
                    label: 'Custom Fields',
                    type: 'object',
                    description: 'Custom field values',
                },
            ],
        };
    }

    private async createProduct(context: LoaderContext, record: ProductInput): Promise<ID> {
        const { ctx } = context;

        const slug = record.slug || slugify(record.name);

        const facetValueIds = await resolveFacetValueIds(
            ctx,
            this.facetValueService,
            record.facetValueCodes ?? [],
            this.logger,
        );

        const product = await this.productService.create(ctx, {
            enabled: record.enabled ?? true,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: record.name,
                    slug,
                    description: record.description || '',
                },
            ],
            facetValueIds,
            customFields: record.customFields as Record<string, unknown>,
        });

        this.logger.log(`Created product ${record.name} (ID: ${product.id})`);
        return product.id;
    }

    private async updateProduct(context: LoaderContext, productId: ID, record: ProductInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: productId };

        const translations: Array<Record<string, unknown>> = [];
        if ((record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) ||
            (record.slug !== undefined && shouldUpdateField('slug', options.updateOnlyFields)) ||
            (record.description !== undefined && shouldUpdateField('description', options.updateOnlyFields))) {
            translations.push({
                languageCode: ctx.languageCode,
                name: record.name,
                slug: record.slug,
                description: record.description,
            });
        }
        if (translations.length > 0) {
            updateInput.translations = translations;
        }

        if (record.enabled !== undefined && shouldUpdateField('enabled', options.updateOnlyFields)) {
            updateInput.enabled = record.enabled;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        if (record.facetValueCodes && shouldUpdateField('facetValueCodes', options.updateOnlyFields)) {
            updateInput.facetValueIds = await resolveFacetValueIds(
                ctx,
                this.facetValueService,
                record.facetValueCodes,
                this.logger,
            );
        }

        await this.productService.update(ctx, updateInput as Parameters<typeof this.productService.update>[1]);

        this.logger.debug(`Updated product ${record.name} (ID: ${productId})`);
    }
}
