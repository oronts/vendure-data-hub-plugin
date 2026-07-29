/**
 * Product upsert loader handler
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    ProductVariantService,
    RequestContextService,
    TaxCategoryService,
    ChannelService,
    ConfigService,
    Product,
    ProductVariant,
    StockLocationService,
    FacetValueService,
    AssetService,
    ID,
    LanguageCode,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import {
    CreateProductInput,
    UpdateProductInput,
    ProductTranslationInput,
} from '@vendure/common/lib/generated-types';
import {
    PipelineStepDefinition,
    ErrorHandlingConfig,
    ProductUpsertLoaderConfig,
} from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler, CoercedProductFields, LoaderSimulationResult } from './types';
import { assertCreateDuplicateCanBeSkipped } from './duplicate-handling';
import {
    findVariantBySku,
    resolveChannelIds,
    parseTranslationsInput,
} from './shared-lookups';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { LoadStrategy, ConflictStrategy } from '../../../constants/enums';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { resolveMoneyPrecision } from '../../../utils/money.utils';
import { applyEntityAssetInput } from './entity-asset-input';
import { handleFacetValues, slugify } from '../../../loaders/shared-helpers';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
} from './loader-simulation';
import {
    coerceProductFields,
    getProductHandlerConfig,
    parseFacetValueCodes,
} from './product-record-fields';
import { persistDefaultProductVariant } from './product-default-variant-persistence';

/**
 * Context for processing a single product record
 */
interface ProductProcessingContext {
    ctx: RequestContext;
    opCtx: RequestContext;
    step: PipelineStepDefinition;
    cfg: ProductUpsertLoaderConfig;
    fields: CoercedProductFields;
    rec: RecordObject;
    existingProduct?: Product;
    existingVariant?: ProductVariant;
}

interface ProductIdentity {
    existingProduct?: Product;
    existingVariant?: ProductVariant;
}

interface ProductUpsertResult {
    productId: ID | undefined;
    existing: Product | undefined;
    skipped?: boolean;
}

@Injectable()
export class ProductHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private requestContextService: RequestContextService,
        private taxCategoryService: TaxCategoryService,
        private channelService: ChannelService,
        private stockLocationService: StockLocationService,
        private facetValueService: FacetValueService,
        private assetService: AssetService,
        private configService: ConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PRODUCT_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const cfg = getProductHandlerConfig(step.config);
        const channelCache = new Map<string, ID>();

        for (const rec of input) {
            try {
                const fields = coerceProductFields(
                    rec,
                    cfg,
                    resolveMoneyPrecision(this.configService),
                );
                this.applyTranslationIdentityFallback(rec, cfg, fields);

                if (!fields.slug || !fields.name) {
                    if (onRecordError) {
                        const missing = !fields.name ? 'name' : 'slug';
                        await onRecordError(step.key, `Missing required field "${missing}" for productUpsert`, rec);
                    }
                    fail++;
                    continue;
                }

                const opCtx = await this.resolveRequestContext(ctx, cfg);
                const identity = await this.resolveProductIdentity(opCtx, cfg, fields);
                const procCtx: ProductProcessingContext = {
                    ctx,
                    opCtx,
                    step,
                    cfg,
                    fields,
                    rec,
                    ...identity,
                };

                const productResult = await this.createOrUpdateProduct(procCtx);
                if (productResult.skipped) {
                    skipped++;
                    continue;
                }
                if (!productResult.productId) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Product not found for update: ${fields.slug}`, rec);
                    }
                    fail++;
                    continue;
                }

                await this.assignProductToChannel(procCtx, productResult.productId);
                await this.assignToRecordChannels(opCtx, rec, cfg, productResult.productId, channelCache);
                await this.handleProductFacetValues(procCtx, productResult.productId);
                await applyEntityAssetInput({
                    ctx: opCtx,
                    record: rec,
                    config: cfg,
                    entityId: productResult.productId,
                    assetService: this.assetService,
                    entityService: this.productService,
                    logger: this.logger,
                });
                if (cfg.createVariants !== false) {
                    await persistDefaultProductVariant({
                        sourceContext: procCtx.ctx,
                        operationContext: procCtx.opCtx,
                        stepKey: procCtx.step.key,
                        productId: productResult.productId,
                        config: procCtx.cfg,
                        fields: procCtx.fields,
                        existingVariant: procCtx.existingVariant,
                    }, {
                        productVariantService: this.productVariantService,
                        taxCategoryService: this.taxCategoryService,
                        stockLocationService: this.stockLocationService,
                        channelService: this.channelService,
                        logger: this.logger,
                    });
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'productUpsert failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
    }

    private async handleProductFacetValues(
        procCtx: ProductProcessingContext,
        productId: ID,
    ): Promise<void> {
        const { opCtx, cfg, rec } = procCtx;
        const field = cfg.facetValuesField ?? 'facetValueCodes';
        const codes = parseFacetValueCodes(rec[field]);
        if (codes === undefined) {
            return;
        }

        await handleFacetValues(
            opCtx,
            this.productService,
            this.facetValueService,
            productId,
            codes,
            cfg.facetValuesMode ?? 'REPLACE_ALL',
            this.logger,
        );
    }

    /**
     * Resolve the appropriate request context (handles channel switching)
     */
    private async resolveRequestContext(
        ctx: RequestContext,
        cfg: ProductUpsertLoaderConfig,
    ): Promise<RequestContext> {
        const targetChannel = cfg.channel;
        if (!targetChannel) {
            return ctx;
        }

        return createChannelCodeRequestContext(
            this.requestContextService,
            this.channelService,
            ctx,
            targetChannel,
        );
    }

    /**
     * Create or update a product based on strategy and conflict resolution
     * Returns an explicit skip state so CREATE duplicates do not trigger downstream side effects
     */
    private async createOrUpdateProduct(
        procCtx: ProductProcessingContext,
    ): Promise<ProductUpsertResult> {
        const { ctx, opCtx, cfg, fields, rec, existingProduct } = procCtx;
        const { slug, customFields, enabled } = fields;
        const strategy = cfg.strategy ?? LoadStrategy.UPSERT;
        const conflictResolution = cfg.conflictStrategy ?? ConflictStrategy.SOURCE_WINS;

        const existing = existingProduct;

        // Build translations: multi-language from record field, or single-language default
        const translations = this.buildProductTranslations(ctx, rec, cfg, fields);

        if (existing) {
            // Skip if strategy is 'create' only (don't update existing)
            if (strategy === LoadStrategy.CREATE) {
                assertCreateDuplicateCanBeSkipped(cfg, 'product', slug!);
                return { productId: existing.id, existing, skipped: true };
            }
            // Keep existing Vendure data, don't update
            if (conflictResolution === ConflictStrategy.VENDURE_WINS) {
                return { productId: existing.id, existing };
            }
            // strategy is 'UPDATE' or 'UPSERT', and conflictStrategy is 'SOURCE_WINS' or 'MERGE'
            const updateInput: UpdateProductInput = {
                id: existing.id,
                translations,
                ...(typeof enabled === 'boolean' ? { enabled } : {}),
                ...(customFields ? { customFields } : {}),
            };
            const updated = await this.productService.update(opCtx, updateInput);
            return { productId: updated.id, existing };
        }

        // Product doesn't exist - skip if strategy is 'update' only
        if (strategy === LoadStrategy.UPDATE) {
            return { productId: undefined, existing: undefined };
        }

        // strategy is 'create' or 'upsert' - create the product
        const createInput: CreateProductInput = {
            translations,
            ...(typeof enabled === 'boolean' ? { enabled } : {}),
            ...(customFields ? { customFields } : {}),
        };
        const created = await this.productService.create(opCtx, createInput);
        return { productId: created.id, existing: undefined };
    }

    /**
     * Build product translations from record.
     * If translationsField is set, reads multi-language array/object from the record.
     * Otherwise builds a single translation from nameField/slugField/descriptionField.
     */
    private buildProductTranslations(
        ctx: RequestContext,
        rec: RecordObject,
        cfg: ProductUpsertLoaderConfig,
        fields: CoercedProductFields,
    ): ProductTranslationInput[] {
        if (cfg.translationsField) {
            const raw = rec[cfg.translationsField];
            if (raw) {
                const parsed = parseTranslationsInput(raw);
                if (parsed.length > 0) {
                    return parsed.map(t => {
                        const tName = String(t.name ?? fields.name!);
                        return {
                            languageCode: t.languageCode as LanguageCode,
                            name: tName,
                            slug: t.slug != null ? String(t.slug) : slugify(tName),
                            description: t.description != null ? String(t.description) : '',
                        };
                    });
                }
            }
        }

        // Single-language fallback
        return [{
            languageCode: ctx.languageCode as LanguageCode,
            name: fields.name!,
            slug: fields.slug!,
            description: fields.description ?? '',
        }];
    }

    /**
     * Assign product to the target channel if specified
     */
    private async assignProductToChannel(procCtx: ProductProcessingContext, productId: ID): Promise<void> {
        const { opCtx, step, cfg } = procCtx;
        const targetChannel = cfg.channel;

        if (!targetChannel) {
            return;
        }

        try {
            await this.channelService.assignToChannels(opCtx, Product, productId, [opCtx.channelId]);
        } catch (error) {
            this.logger.warn('Failed to assign product to target channel', {
                stepKey: step.key,
                productId,
                targetChannel,
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    /**
     * Assign product to dynamically resolved channels from a record field
     */
    private async assignToRecordChannels(
        opCtx: RequestContext,
        rec: RecordObject,
        cfg: ProductUpsertLoaderConfig,
        productId: ID,
        channelCache: Map<string, ID>,
    ): Promise<void> {
        if (!cfg.channelsField) return;
        const rawValue = rec[cfg.channelsField];
        if (rawValue == null) return;

        const channelIds = await resolveChannelIds(this.channelService, opCtx, rawValue, channelCache, this.logger);
        if (channelIds.length === 0) return;

        try {
            await this.channelService.assignToChannels(opCtx, Product, productId, channelIds);
        } catch (error) {
            this.logger.warn('Failed to assign product to record channels', {
                productId,
                channelIds,
                error: getErrorMessage(error),
            });
            throw error;
        }
    }

    async simulate(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult> {
        const cfg = getProductHandlerConfig(step.config);
        const recordDetails = [];
        for (let index = 0; index < input.length; index++) {
            const record = input[index];
            const fields = coerceProductFields(
                record,
                cfg,
                resolveMoneyPrecision(this.configService),
            );
            this.applyTranslationIdentityFallback(record, cfg, fields);
            const opCtx = await this.resolveRequestContext(ctx, cfg);
            const missingField = !fields.name ? 'name' : !fields.slug ? 'slug' : undefined;
            let identity: ProductIdentity = {};
            let identityError: string | undefined;
            if (!missingField) {
                try {
                    identity = await this.resolveProductIdentity(opCtx, cfg, fields);
                } catch (error) {
                    identityError = getErrorMessage(error);
                }
            }
            recordDetails.push(createUpsertSimulationDetail({
                record,
                index,
                entityType: 'Product',
                existing: identity.existingProduct,
                strategy: cfg.strategy ? LoadStrategy[cfg.strategy] : undefined,
                skipDuplicates: cfg.skipDuplicates,
                identifier: fields.slug,
                missingIdentifier: identityError ?? (missingField
                    ? `Missing required field "${missingField}" for productUpsert`
                    : undefined),
            }));
        }
        return {
            supported: true,
            recordsIn: input.length,
            recordDetails,
            ...summarizeSimulationDetails(recordDetails),
        };
    }

    private async resolveProductIdentity(
        opCtx: RequestContext,
        cfg: ProductUpsertLoaderConfig,
        fields: CoercedProductFields,
    ): Promise<ProductIdentity> {
        const existingBySlug = fields.slug
            ? await this.productService.findOneBySlug(opCtx, fields.slug)
            : undefined;
        if (cfg.createVariants === false || !fields.sku) {
            return { existingProduct: existingBySlug };
        }

        const existingVariant = await findVariantBySku(
            this.productVariantService,
            opCtx,
            fields.sku,
        );
        if (!existingVariant) {
            return { existingProduct: existingBySlug };
        }

        const parentId = existingVariant.productId;
        if (parentId == null) {
            throw new Error(`Product variant with SKU "${fields.sku}" has no parent product`);
        }
        if (existingBySlug && String(existingBySlug.id) !== String(parentId)) {
            throw new Error(
                `Product identity conflict: slug "${fields.slug}" and SKU "${fields.sku}" resolve to different products`,
            );
        }

        const existingProduct = existingBySlug
            ?? await this.productService.findOne(opCtx, parentId);
        if (!existingProduct) {
            throw new Error(`Parent product for SKU "${fields.sku}" was not found`);
        }
        return { existingProduct, existingVariant };
    }

    private applyTranslationIdentityFallback(
        record: RecordObject,
        config: ProductUpsertLoaderConfig,
        fields: CoercedProductFields,
    ): void {
        if ((fields.name && fields.slug) || !config.translationsField) return;
        const raw = record[config.translationsField];
        if (!raw) return;
        const first = parseTranslationsInput(raw)[0];
        if (!first) return;
        const firstName = first.name != null ? String(first.name) : undefined;
        if (!fields.name && firstName) fields.name = firstName;
        if (!fields.slug && firstName) {
            fields.slug = first.slug != null ? String(first.slug) : slugify(firstName);
        }
    }

}
