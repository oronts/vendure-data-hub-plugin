import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ProductVariantService,
    ProductService,
    FacetValueService,
    AssetService,
    ChannelService,
    TaxCategoryService,
    ProductOptionService,
    StockMovementService,
    StockLevelService,
    Product,
    ProductVariant,
} from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { VendureEntityType, TARGET_OPERATION } from '../../constants/enums';
import { BaseEntityLoader, ExistingEntityLookupResult, LoaderMetadata } from '../base';
import {
    ProductVariantInput,
    PRODUCT_VARIANT_LOADER_METADATA,
    DEFAULT_PRODUCT_NAME,
} from './types';
import {
    resolveFacetValueIds,
    slugify,
    shouldUpdateField,
} from '../shared-helpers';

/**
 * ProductVariantLoader - Refactored to extend BaseEntityLoader
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
export class ProductVariantLoader extends BaseEntityLoader<ProductVariantInput, ProductVariant> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = PRODUCT_VARIANT_LOADER_METADATA;

    constructor(
        private connection: TransactionalConnection,
        private variantService: ProductVariantService,
        private productService: ProductService,
        private facetValueService: FacetValueService,
        private assetService: AssetService,
        private channelService: ChannelService,
        private taxCategoryService: TaxCategoryService,
        private optionService: ProductOptionService,
        private stockMovementService: StockMovementService,
        private stockLevelService: StockLevelService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_VARIANT_LOADER);
    }

    protected getDuplicateErrorMessage(record: ProductVariantInput): string {
        return `Variant with SKU "${record.sku}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ProductVariantInput,
    ): Promise<ExistingEntityLookupResult<ProductVariant> | null> {
        // Primary lookup: by SKU
        if (record.sku && lookupFields.includes('sku')) {
            const variants = await this.connection
                .getRepository(ctx, ProductVariant)
                .find({ where: { sku: record.sku }, relations: ['product'] });

            if (variants.length > 0) {
                return { id: variants[0].id, entity: variants[0] };
            }
        }

        // Fallback: by ID
        if (record.id && lookupFields.includes('id')) {
            const variant = await this.connection
                .getRepository(ctx, ProductVariant)
                .findOne({ where: { id: record.id as ID }, relations: ['product'] });

            if (variant) {
                return { id: variant.id, entity: variant };
            }
        }

        return null;
    }

    async validate(
        ctx: RequestContext,
        record: ProductVariantInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const errors: { field: string; message: string; code?: string }[] = [];
        const warnings: { field: string; message: string }[] = [];

        // Required field validation
        if (operation === TARGET_OPERATION.CREATE || operation === TARGET_OPERATION.UPSERT) {
            if (!record.sku || typeof record.sku !== 'string' || record.sku.trim() === '') {
                errors.push({ field: 'sku', message: 'SKU is required', code: 'REQUIRED' });
            }

            if (record.price === undefined || record.price === null) {
                errors.push({ field: 'price', message: 'Price is required', code: 'REQUIRED' });
            } else if (typeof record.price !== 'number' || isNaN(record.price)) {
                errors.push({ field: 'price', message: 'Price must be a valid number', code: 'INVALID_TYPE' });
            } else if (record.price < 0) {
                errors.push({ field: 'price', message: 'Price cannot be negative', code: 'INVALID_VALUE' });
            }

            // For new variants, we need either product reference or product data
            if (!record.productId && !record.productSlug && !record.productName) {
                errors.push({
                    field: 'productId',
                    message: 'Product reference (productId, productSlug, or productName) is required for new variants',
                    code: 'REQUIRED',
                });
            }
        }

        // Optional field validation
        if (record.stockOnHand !== undefined && typeof record.stockOnHand !== 'number') {
            errors.push({ field: 'stockOnHand', message: 'Stock must be a number', code: 'INVALID_TYPE' });
        }

        // Validate tax category if provided
        if (record.taxCategoryCode) {
            const taxCatList = await this.taxCategoryService.findAll(ctx);
            const taxCat = taxCatList.items.find(tc => tc.name === record.taxCategoryCode);
            if (!taxCat) {
                warnings.push({
                    field: 'taxCategoryCode',
                    message: `Tax category "${record.taxCategoryCode}" not found, will use default`,
                });
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
            entityType: VendureEntityType.PRODUCT_VARIANT,
            fields: [
                {
                    key: 'sku',
                    label: 'SKU',
                    type: 'string',
                    required: true,
                    lookupable: true,
                    description: 'Unique stock keeping unit',
                    example: 'PROD-001-BLK-L',
                },
                {
                    key: 'name',
                    label: 'Variant Name',
                    type: 'string',
                    translatable: true,
                    description: 'Display name for the variant',
                },
                {
                    key: 'price',
                    label: 'Price',
                    type: 'number',
                    required: true,
                    description: 'Price in cents (e.g., 1999 = $19.99)',
                    example: 1999,
                },
                {
                    key: 'productName',
                    label: 'Product Name',
                    type: 'string',
                    description: 'Name of the parent product (for auto-creation)',
                },
                {
                    key: 'productSlug',
                    label: 'Product Slug',
                    type: 'string',
                    description: 'URL slug of the parent product',
                },
                {
                    key: 'productId',
                    label: 'Product ID',
                    type: 'string',
                    description: 'ID of the parent product',
                },
                {
                    key: 'stockOnHand',
                    label: 'Stock On Hand',
                    type: 'number',
                    description: 'Available inventory quantity',
                    example: 100,
                },
                {
                    key: 'trackInventory',
                    label: 'Track Inventory',
                    type: 'boolean',
                    description: 'Whether to track stock levels',
                },
                {
                    key: 'taxCategoryCode',
                    label: 'Tax Category',
                    type: 'string',
                    description: 'Tax category code or name',
                },
                {
                    key: 'facetValueCodes',
                    label: 'Facet Values',
                    type: 'array',
                    description: 'Array of facet value codes to assign',
                    example: ['color-black', 'size-large'],
                },
                {
                    key: 'optionCodes',
                    label: 'Options',
                    type: 'array',
                    description: 'Array of product option codes',
                    example: ['black', 'large'],
                },
                {
                    key: 'assetUrls',
                    label: 'Asset URLs',
                    type: 'array',
                    description: 'URLs of images to attach',
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

    protected async createEntity(context: LoaderContext, record: ProductVariantInput): Promise<ID | null> {
        const { ctx } = context;

        const product = await this.findOrCreateProduct(ctx, record);

        const taxCatList = await this.taxCategoryService.findAll(ctx);
        let taxCategoryId = taxCatList.items[0]?.id;
        if (record.taxCategoryCode) {
            const taxCat = taxCatList.items.find(tc => tc.name === record.taxCategoryCode);
            if (taxCat) {
                taxCategoryId = taxCat.id;
            }
        }

        const facetValueIds = await resolveFacetValueIds(
            ctx,
            this.facetValueService,
            record.facetValueCodes ?? [],
            this.logger,
        );

        const variant = await this.variantService.create(ctx, [
            {
                productId: product.id,
                sku: record.sku,
                translations: [
                    {
                        languageCode: ctx.languageCode,
                        name: record.name || record.sku,
                    },
                ],
                price: record.price,
                taxCategoryId,
                facetValueIds,
                trackInventory: record.trackInventory === false ? GlobalFlag.FALSE : GlobalFlag.TRUE,
                stockOnHand: record.stockOnHand,
            },
        ]);

        const createdVariant = variant[0];

        this.logger.log(`Created variant ${record.sku} (ID: ${createdVariant.id})`);
        return createdVariant.id;
    }

    protected async updateEntity(context: LoaderContext, variantId: ID, record: ProductVariantInput): Promise<void> {
        const { ctx, options } = context;

        const updateInput: Record<string, unknown> = { id: variantId };

        if (record.name !== undefined && shouldUpdateField('name', options.updateOnlyFields)) {
            updateInput.name = record.name;
        }
        if (record.sku !== undefined && shouldUpdateField('sku', options.updateOnlyFields)) {
            updateInput.sku = record.sku;
        }
        if (record.price !== undefined && shouldUpdateField('price', options.updateOnlyFields)) {
            updateInput.price = record.price;
        }
        if (record.trackInventory !== undefined && shouldUpdateField('trackInventory', options.updateOnlyFields)) {
            updateInput.trackInventory = record.trackInventory;
        }
        if (record.customFields !== undefined && shouldUpdateField('customFields', options.updateOnlyFields)) {
            updateInput.customFields = record.customFields;
        }

        if (record.taxCategoryCode && shouldUpdateField('taxCategoryCode', options.updateOnlyFields)) {
            const taxCatList = await this.taxCategoryService.findAll(ctx);
            const taxCat = taxCatList.items.find(tc => tc.name === record.taxCategoryCode);
            if (taxCat) {
                updateInput.taxCategoryId = taxCat.id;
            }
        }

        if (record.facetValueCodes && shouldUpdateField('facetValueCodes', options.updateOnlyFields)) {
            updateInput.facetValueIds = await resolveFacetValueIds(
                ctx,
                this.facetValueService,
                record.facetValueCodes,
                this.logger,
            );
        }

        await this.variantService.update(ctx, [updateInput as Parameters<typeof this.variantService.update>[1][0]]);

        if (record.stockOnHand !== undefined && shouldUpdateField('stockOnHand', options.updateOnlyFields)) {
            await this.updateStock(ctx, variantId, record.stockOnHand);
        }

        this.logger.debug(`Updated variant ${record.sku} (ID: ${variantId})`);
    }

    private async findOrCreateProduct(ctx: RequestContext, record: ProductVariantInput): Promise<Product> {
        if (record.productSlug) {
            const products = await this.productService.findAll(ctx, {
                filter: { slug: { eq: record.productSlug } },
            });
            if (products.totalItems > 0) {
                return products.items[0];
            }
        }

        if (record.productId) {
            const product = await this.connection
                .getRepository(ctx, Product)
                .findOne({ where: { id: record.productId as ID } });
            if (product) {
                return product;
            }
        }

        if (record.productName) {
            const products = await this.productService.findAll(ctx, {
                filter: { name: { eq: record.productName } },
            });
            if (products.totalItems > 0) {
                return products.items[0];
            }
        }

        const productName = record.productName || record.sku.split('-')[0] || DEFAULT_PRODUCT_NAME;
        const product = await this.productService.create(ctx, {
            enabled: true,
            translations: [
                {
                    languageCode: ctx.languageCode,
                    name: productName,
                    slug: slugify(productName),
                    description: '',
                },
            ],
        });

        this.logger.log(`Created product "${productName}" (ID: ${product.id})`);
        return product;
    }

    private async updateStock(ctx: RequestContext, variantId: ID, quantity: number): Promise<void> {
        try {
            const stockLevels = await this.stockLevelService.getStockLevelsForVariant(ctx, variantId);
            const currentStock = stockLevels.reduce((sum, sl) => sum + sl.stockOnHand, 0);
            const adjustment = quantity - currentStock;

            if (adjustment !== 0) {
                // Use stock adjustment to set the desired quantity
                await this.stockMovementService.adjustProductVariantStock(ctx, variantId, quantity);
            }
        } catch (error) {
            this.logger.warn(`Failed to update stock for variant ${variantId}: ${error}`);
        }
    }
}
