import { Injectable } from '@nestjs/common';
import {
    ID,
    RequestContext,
    TransactionalConnection,
    ProductVariantService,
    ProductService,
    FacetValueService,
    AssetService,
    TaxCategoryService,
    ProductOptionGroupService,
    ProductVariant,
    ConfigService,
} from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import {
    LoaderContext,
    EntityValidationResult,
    EntityFieldSchema,
    TargetOperation,
} from '../../types/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger/datahub-logger';
import { LOGGER_CONTEXTS } from '../../constants/core';
import { TARGET_OPERATION } from '../../constants/enums';
import {
    BaseEntityLoader,
    ExistingEntityLookupResult,
    LoaderMetadata,
    ValidationBuilder,
    EntityLookupHelper,
} from '../base';
import {
    ProductVariantInput,
    PRODUCT_VARIANT_LOADER_METADATA,
} from './types';
import {
    resolveFacetValueIds,
    shouldUpdateField,
    handleFacetValues,
    handleAssets,
    handleFeaturedAsset,
} from '../shared-helpers';
import {
    createVariantExternalIdLookupStrategy,
    handleOptions,
    resolveOptionIds,
    resolveVariantTaxCategoryId,
} from './helpers';
import { VariantUpsertLoaderConfig } from '../../types/index';
import { majorToMinorUnits, resolveMoneyPrecision } from '../../utils/money.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { PRODUCT_VARIANT_FIELD_SCHEMA } from './field-schema';
import { resolveVariantProduct } from './product-reference';
import {
    buildCreateVariantTranslations,
    buildVariantUpdateInput,
} from './variant-input';

/** Loads ProductVariant entities via ProductVariantService. Supports CREATE, UPDATE, UPSERT. */
@Injectable()
export class ProductVariantLoader extends BaseEntityLoader<ProductVariantInput, ProductVariant> {
    protected readonly logger: DataHubLogger;
    protected readonly metadata: LoaderMetadata = PRODUCT_VARIANT_LOADER_METADATA;

    private readonly lookupHelper: EntityLookupHelper<TransactionalConnection, ProductVariant, ProductVariantInput>;

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly variantService: ProductVariantService,
        private readonly productService: ProductService,
        private readonly facetValueService: FacetValueService,
        private readonly assetService: AssetService,
        private readonly taxCategoryService: TaxCategoryService,
        private readonly optionGroupService: ProductOptionGroupService,
        private readonly configService: ConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        super();
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_VARIANT_LOADER);
        this.lookupHelper = new EntityLookupHelper<TransactionalConnection, ProductVariant, ProductVariantInput>(this.connection)
            .addCustomStrategy({
                fieldName: 'sku',
                lookup: async (ctx, _conn, value) => {
                    if (!value) return null;
                    const variants = await this.variantService.findAll(ctx, {
                        filter: { sku: { eq: String(value) } },
                        take: 1,
                    });
                    if (variants.items.length > 0) {
                        return {
                            id: variants.items[0].id,
                            entity: variants.items[0],
                        };
                    }
                    return null;
                },
            })
            .addCustomStrategy({
                fieldName: 'id',
                lookup: async (ctx, _conn, value) => {
                    if (!value) return null;
                    const variant = await this.variantService.findOne(
                        ctx,
                        value as ID,
                        ['product'],
                    );
                    if (variant) {
                        return { id: variant.id, entity: variant };
                    }
                    return null;
                },
            })
            .addCustomStrategy(createVariantExternalIdLookupStrategy(this.connection));
    }

    protected getDuplicateErrorMessage(record: ProductVariantInput): string {
        return `Variant with SKU "${record.sku}" already exists`;
    }

    async findExisting(
        ctx: RequestContext,
        lookupFields: string[],
        record: ProductVariantInput,
    ): Promise<ExistingEntityLookupResult<ProductVariant> | null> {
        return this.lookupHelper.findExisting(ctx, lookupFields, record);
    }

    async validate(
        ctx: RequestContext,
        record: ProductVariantInput,
        operation: TargetOperation,
    ): Promise<EntityValidationResult> {
        const builder = new ValidationBuilder()
            .requireStringForCreate('sku', record.sku, operation, 'SKU is required');
        this.validatePrice(builder, record, operation);
        this.validateCreateProductReference(builder, record, operation);
        this.validateOptionalFields(builder, record);
        await this.validateTaxCategory(ctx, builder, record);
        return builder.build();
    }

    private validatePrice(
        builder: ValidationBuilder,
        record: ProductVariantInput,
        operation: TargetOperation,
    ): void {
        const priceRequired = operation === TARGET_OPERATION.CREATE
            || operation === TARGET_OPERATION.UPSERT;
        if (priceRequired && (record.price === undefined || record.price === null)) {
            builder.addError('price', 'Price is required', 'REQUIRED');
            return;
        }
        if (record.price === undefined || record.price === null) return;
        if (typeof record.price !== 'number' || !Number.isFinite(record.price)) {
            builder.addError('price', 'Price must be a valid number', 'INVALID_TYPE');
        } else if (record.price < 0) {
            builder.addError('price', 'Price cannot be negative', 'INVALID_VALUE');
        }
    }

    private validateCreateProductReference(
        builder: ValidationBuilder,
        record: ProductVariantInput,
        operation: TargetOperation,
    ): void {
        if (operation !== TARGET_OPERATION.CREATE && operation !== TARGET_OPERATION.UPSERT) {
            return;
        }
        builder.addErrorIf(
            record.productId === undefined
                && !record.productSlug?.trim()
                && !record.productName?.trim(),
            'productId',
            'Product reference (productId, productSlug, or productName) is required for new variants',
            'REQUIRED',
        );
    }

    private validateOptionalFields(
        builder: ValidationBuilder,
        record: ProductVariantInput,
    ): void {
        if (record.stockOnHand !== undefined) {
            if (!Number.isFinite(record.stockOnHand) || !Number.isInteger(record.stockOnHand)) {
                builder.addError(
                    'stockOnHand',
                    'Stock must be a finite whole number',
                    'INVALID_TYPE',
                );
            } else if (record.stockOnHand < 0) {
                builder.addError('stockOnHand', 'Stock cannot be negative', 'INVALID_VALUE');
            }
        }
        if (record.trackInventory !== undefined && typeof record.trackInventory !== 'boolean') {
            builder.addError(
                'trackInventory',
                'Track inventory must be a boolean',
                'INVALID_TYPE',
            );
        }
        if (record.name !== undefined && record.name.trim().length === 0) {
            builder.addError('name', 'Variant name must not be empty', 'INVALID_VALUE');
        }
    }

    private async validateTaxCategory(
        ctx: RequestContext,
        builder: ValidationBuilder,
        record: ProductVariantInput,
    ): Promise<void> {
        if (record.taxCategoryId !== undefined && record.taxCategoryCode !== undefined) {
            builder.addError(
                'taxCategoryId',
                'Provide either taxCategoryId or taxCategoryCode, not both',
                'INVALID_VALUE',
            );
        } else if (record.taxCategoryId !== undefined || record.taxCategoryCode !== undefined) {
            try {
                await resolveVariantTaxCategoryId(ctx, this.taxCategoryService, record);
            } catch (error) {
                builder.addError(
                    record.taxCategoryId !== undefined ? 'taxCategoryId' : 'taxCategoryCode',
                    getErrorMessage(error),
                    'INVALID_VALUE',
                );
            }
        }
    }

    getFieldSchema(): EntityFieldSchema {
        return PRODUCT_VARIANT_FIELD_SCHEMA;
    }

    protected async createEntity(context: LoaderContext, record: ProductVariantInput): Promise<ID | null> {
        return this.connection.withTransaction(context.ctx, async ctx =>
            this.createVariantEntity({ ...context, ctx }, record),
        );
    }

    private async createVariantEntity(
        context: LoaderContext,
        record: ProductVariantInput,
    ): Promise<ID> {
        const { ctx } = context;
        const { product, created: productCreated } = await resolveVariantProduct(
            ctx,
            this.productService,
            record,
        );
        if (productCreated) {
            this.logger.log(`Created product "${product.name}" (ID: ${product.id})`);
        }
        const config = (context.options.config ?? {}) as unknown as VariantUpsertLoaderConfig;
        const taxCategoryId = await resolveVariantTaxCategoryId(
            ctx, this.taxCategoryService, record,
        );
        const { facetValueIds, optionIds } = await this.resolveCreateRelationIds(
            ctx,
            product.id,
            record,
            config,
        );
        const [createdVariant] = await this.variantService.create(ctx, [{
            productId: product.id,
            sku: record.sku,
            translations: buildCreateVariantTranslations(record, ctx.languageCode),
            price: majorToMinorUnits(record.price, resolveMoneyPrecision(this.configService)),
            taxCategoryId,
            facetValueIds,
            optionIds,
            trackInventory: record.trackInventory === undefined
                ? undefined
                : record.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
            stockOnHand: record.stockOnHand,
            customFields: record.customFields,
        }]);

        await this.applyCreateMedia(ctx, createdVariant.id, record, config);

        this.logger.log(`Created variant ${record.sku} (ID: ${createdVariant.id})`);
        return createdVariant.id;
    }

    private async resolveCreateRelationIds(
        ctx: RequestContext,
        productId: ID,
        record: ProductVariantInput,
        config: VariantUpsertLoaderConfig,
    ): Promise<{ facetValueIds: ID[]; optionIds: ID[] | undefined }> {
        const facetValueIds = config.facetValuesMode === 'SKIP'
            ? []
            : await resolveFacetValueIds(
                ctx,
                this.facetValueService,
                record.facetValueCodes ?? [],
                this.logger,
            );
        const optionIds = config.optionsMode === 'SKIP'
            ? undefined
            : await resolveOptionIds(
                ctx,
                this.optionGroupService,
                productId,
                record.optionCodes ?? [],
            );
        return { facetValueIds, optionIds };
    }

    private async applyCreateMedia(
        ctx: RequestContext,
        variantId: ID,
        record: ProductVariantInput,
        config: VariantUpsertLoaderConfig,
    ): Promise<void> {
        if (record.assetUrls) {
            await handleAssets(
                ctx, this.assetService, this.variantService, variantId,
                record.assetUrls, config.assetsMode ?? 'UPSERT_BY_URL', this.logger,
            );
        }
        if (record.featuredAssetUrl) {
            await handleFeaturedAsset(
                ctx, this.assetService, this.variantService, variantId,
                record.featuredAssetUrl,
                config.featuredAssetMode ?? 'UPSERT_BY_URL',
                this.logger,
            );
        }
    }

    protected async updateEntity(
        context: LoaderContext,
        variantId: ID,
        record: ProductVariantInput,
    ): Promise<void> {
        await this.connection.withTransaction(context.ctx, async ctx =>
            this.updateVariantEntity({ ...context, ctx }, variantId, record),
        );
    }

    private async updateVariantEntity(
        context: LoaderContext,
        variantId: ID,
        record: ProductVariantInput,
    ): Promise<void> {
        const { ctx, options } = context;
        const updateInput = buildVariantUpdateInput(
            variantId,
            record,
            ctx.languageCode,
            options.updateOnlyFields,
        );
        if (record.price !== undefined && shouldUpdateField('price', options.updateOnlyFields)) {
            updateInput.price = majorToMinorUnits(record.price, resolveMoneyPrecision(this.configService));
        }
        const taxCategoryField = record.taxCategoryId !== undefined
            ? 'taxCategoryId'
            : 'taxCategoryCode';
        if (
            (record.taxCategoryId !== undefined || record.taxCategoryCode !== undefined)
            && shouldUpdateField(taxCategoryField, options.updateOnlyFields)
        ) {
            updateInput.taxCategoryId = await resolveVariantTaxCategoryId(
                ctx, this.taxCategoryService, record,
            );
        }
        await this.variantService.update(ctx, [updateInput]);
        await this.updateRelations(context, variantId, record);
        this.logger.debug(`Updated variant ${record.sku} (ID: ${variantId})`);
    }

    private async updateRelations(
        context: LoaderContext,
        variantId: ID,
        record: ProductVariantInput,
    ): Promise<void> {
        const { ctx, options } = context;
        const config = (options.config ?? {}) as unknown as VariantUpsertLoaderConfig;
        if (record.facetValueCodes && shouldUpdateField('facetValueCodes', options.updateOnlyFields)) {
            await handleFacetValues(
                ctx, this.variantService, this.facetValueService, variantId,
                record.facetValueCodes, config.facetValuesMode ?? 'REPLACE_ALL', this.logger,
            );
        }
        if (record.optionCodes && shouldUpdateField('optionCodes', options.updateOnlyFields)) {
            await handleOptions(
                ctx, this.optionGroupService, this.variantService, variantId,
                record.optionCodes, config.optionsMode ?? 'REPLACE_ALL', this.logger,
            );
        }
        await this.updateMedia(context, variantId, record, config);
    }

    private async updateMedia(
        context: LoaderContext,
        variantId: ID,
        record: ProductVariantInput,
        config: VariantUpsertLoaderConfig,
    ): Promise<void> {
        const { ctx, options } = context;
        if (record.assetUrls && shouldUpdateField('assetUrls', options.updateOnlyFields)) {
            await handleAssets(
                ctx, this.assetService, this.variantService, variantId,
                record.assetUrls, config.assetsMode ?? 'UPSERT_BY_URL', this.logger,
            );
        }
        if (record.featuredAssetUrl && shouldUpdateField('featuredAssetUrl', options.updateOnlyFields)) {
            await handleFeaturedAsset(
                ctx, this.assetService, this.variantService, variantId,
                record.featuredAssetUrl,
                config.featuredAssetMode ?? 'UPSERT_BY_URL', this.logger,
            );
        }
    }
}
