import { Injectable } from '@nestjs/common';
import {
    ID,
    Product,
    RequestContext,
    TransactionalConnection,
    ProductService,
    FacetValueService,
    AssetService,
} from '@vendure/core';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
    createLookupHelper,
} from '../base';
import {
    ProductInput,
    PRODUCT_LOADER_METADATA,
} from './types';
import {
    resolveFacetValueIds,
    slugify,
    shouldUpdateField,
} from '../shared-helpers';

/**
 * ProductLoader - Refactored to extend BaseEntityLoader
 *
 * This eliminates ~60 lines of duplicate load() method code that was
 * copy-pasted across all loaders. The base class handles:
 * - Result initialization
 * - Validation loop
 * - Duplicate detection
 * - CREATE/UPDATE/UPSERT operation logic
 * - Dry run mode
 * - Error handling
 */
@Injectable()
export class ProductLoader extends BaseEntityLoader<ProductInput, Product> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = PRODUCT_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<ProductService, Product, ProductInput>;

    constructor(
        private connection: TransactionalConnection,
        private productService: ProductService,
        private facetValueService: FacetValueService,
        private assetService: AssetService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_LOADER);
        this.lookupHelper = createLookupHelper<ProductService, Product, ProductInput>(this.productService)
            .addFilterStrategy('slug', 'slug', (ctx, svc, opts) => svc.findAll(ctx, opts))
            .addIdStrategy((ctx, svc, id) => svc.findOne(ctx, id))
            .addFilterStrategy('name', 'name', (ctx, svc, opts) => svc.findAll(ctx, opts));
    }

    protected getDuplicateErrorMessage(record: ProductInput): string {
        return `Product with slug "${record.slug}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ProductInput,
    ): Promise<ExistingEntityLookupResult<Product> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        _ctx: RequestContext,
        record: ProductInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        return new ValidationBuilder()
            .requireStringForCreate('name', record.name, operation, 'Product name is required')
            .build();
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

    protected async createEntity(context: LoaderContext, record: ProductInput): Promise<ID | null> {
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

    protected async updateEntity(context: LoaderContext, productId: ID, record: ProductInput): Promise<void> {
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
