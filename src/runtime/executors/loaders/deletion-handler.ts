/**
 * Entity Deletion loader handler
 *
 * Deletes entities (Products, Variants, Collections, Promotions, ShippingMethods,
 * Customers, PaymentMethods, Facets, FacetValues, CustomerGroups, TaxRates,
 * Assets, StockLocations) by slug, SKU, code, email, name, or ID.
 * Supports cascade deletion of variants when deleting a product.
 */
import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    ProductService,
    ProductVariantService,
    PromotionService,
    ShippingMethodService,
    CustomerService,
    PaymentMethodService,
    FacetService,
    FacetValueService,
    CollectionService,
    CustomerGroupService,
    TaxRateService,
    AssetService,
    StockLocationService,
    RequestContextService,
    TransactionalConnection,
    ID,
    LanguageCode,
} from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { findVariantBySku } from './shared-lookups';
import { getStringValue } from '../../../loaders/shared-helpers';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { LOGGER_CONTEXTS } from '../../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger';

/**
 * Configuration for entity deletion handler step
 */
type DeletionEntityType = 'product' | 'variant' | 'collection' | 'promotion' | 'shipping-method' | 'customer' | 'payment-method' | 'facet' | 'facet-value' | 'customer-group' | 'tax-rate' | 'asset' | 'stock-location';
type DeletionMatchBy = 'slug' | 'sku' | 'id' | 'code' | 'email' | 'name';

interface DeletionHandlerConfig {
    /** Entity type to delete (default: 'product') */
    entityType?: DeletionEntityType;
    /** Record field containing the identifier to match (default depends on entity type) */
    identifierField?: string;
    /** How to find the entity (default depends on entity type) */
    matchBy?: DeletionMatchBy;
    /** Delete variants when deleting a product (default: true) */
    cascadeVariants?: boolean;
    /** Channel code for context */
    channel?: string;
}

/** Default matchBy per entity type */
const DEFAULT_MATCH_BY: Record<DeletionEntityType, DeletionMatchBy> = {
    product: 'slug',
    variant: 'sku',
    collection: 'slug',
    promotion: 'code',
    'shipping-method': 'code',
    customer: 'email',
    'payment-method': 'code',
    facet: 'code',
    'facet-value': 'code',
    'customer-group': 'name',
    'tax-rate': 'name',
    asset: 'name',
    'stock-location': 'name',
};

function getConfig(config: Record<string, unknown>): DeletionHandlerConfig {
    return config as unknown as DeletionHandlerConfig;
}

@Injectable()
export class DeletionHandler implements LoaderHandler {
    private readonly logger: DataHubLogger;

    constructor(
        private productService: ProductService,
        private productVariantService: ProductVariantService,
        private collectionService: CollectionService,
        private promotionService: PromotionService,
        private shippingMethodService: ShippingMethodService,
        private customerService: CustomerService,
        private paymentMethodService: PaymentMethodService,
        private facetService: FacetService,
        private facetValueService: FacetValueService,
        private customerGroupService: CustomerGroupService,
        private taxRateService: TaxRateService,
        private assetService: AssetService,
        private stockLocationService: StockLocationService,
        private requestContextService: RequestContextService,
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.ENTITY_DELETION_LOADER);
    }

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult> {
        let ok = 0;
        let fail = 0;
        const cfg = getConfig(step.config);
        const entityType: DeletionEntityType = cfg.entityType ?? 'product';
        const cascadeVariants = cfg.cascadeVariants !== false;

        // Resolve defaults based on entity type
        const matchBy = cfg.matchBy ?? DEFAULT_MATCH_BY[entityType] ?? 'slug';
        const identifierField = cfg.identifierField ?? matchBy;

        let opCtx = ctx;
        if (cfg.channel) {
            try {
                opCtx = await this.requestContextService.create({ apiType: 'admin', channelOrToken: cfg.channel });
            } catch {
                this.logger.warn('Failed to create context for channel, using original', { channel: cfg.channel });
            }
        }

        for (const rec of input) {
            try {
                const identifier = getStringValue(rec, identifierField);
                if (!identifier) {
                    if (onRecordError) {
                        await onRecordError(step.key, `Missing identifier field "${identifierField}"`, rec);
                    }
                    fail++;
                    continue;
                }

                switch (entityType) {
                    case 'product':
                        await this.deleteProduct(opCtx, identifier, matchBy, cascadeVariants);
                        break;
                    case 'variant':
                        await this.deleteVariant(opCtx, identifier, matchBy);
                        break;
                    case 'collection':
                        await this.deleteCollection(opCtx, identifier, matchBy);
                        break;
                    case 'promotion':
                        await this.deletePromotion(opCtx, identifier, matchBy);
                        break;
                    case 'shipping-method':
                        await this.deleteShippingMethod(opCtx, identifier, matchBy);
                        break;
                    case 'customer':
                        await this.deleteCustomer(opCtx, identifier, matchBy);
                        break;
                    case 'payment-method':
                        await this.deletePaymentMethod(opCtx, identifier, matchBy);
                        break;
                    case 'facet':
                        await this.deleteFacet(opCtx, identifier, matchBy);
                        break;
                    case 'facet-value':
                        await this.deleteFacetValue(opCtx, identifier, matchBy);
                        break;
                    case 'customer-group':
                        await this.deleteCustomerGroup(opCtx, identifier, matchBy);
                        break;
                    case 'tax-rate':
                        await this.deleteTaxRate(opCtx, identifier, matchBy);
                        break;
                    case 'asset':
                        await this.deleteAsset(opCtx, identifier, matchBy);
                        break;
                    case 'stock-location':
                        await this.deleteStockLocation(opCtx, identifier, matchBy);
                        break;
                    default:
                        throw new Error(`Unsupported entity type for deletion: ${entityType}`);
                }
                ok++;
            } catch (e: unknown) {
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'entityDeletion failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail };
    }

    private async deleteVariant(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let variantId: ID | undefined;

        if (matchBy === 'id') {
            variantId = identifier as unknown as ID;
        } else {
            // matchBy === 'sku' or 'slug', find by SKU (variants are identified by SKU)
            const variant = await findVariantBySku(this.productVariantService, ctx, identifier);
            variantId = variant?.id;
        }

        if (!variantId) {
            this.logger.warn(`Variant not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.productVariantService.softDelete(ctx, variantId);
    }

    private async deleteProduct(
        ctx: RequestContext,
        identifier: string,
        matchBy: string,
        cascadeVariants: boolean,
    ): Promise<void> {
        let productId: ID | undefined;

        if (matchBy === 'id') {
            productId = identifier as unknown as ID;
        } else if (matchBy === 'sku') {
            // Find product via variant SKU
            const variant = await findVariantBySku(this.productVariantService, ctx, identifier);
            if (variant) {
                productId = variant.productId;
            }
        } else {
            // matchBy === 'slug'
            const product = await this.productService.findOneBySlug(ctx, identifier);
            productId = product?.id;
        }

        if (!productId) {
            this.logger.warn(`Product not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        if (cascadeVariants) {
            const variants = await this.productVariantService.findAll(ctx, {
                filter: { productId: { eq: String(productId) } },
            } as never);
            for (const v of variants.items) {
                await this.productVariantService.softDelete(ctx, v.id);
            }
        }

        await this.productService.softDelete(ctx, productId);
    }

    private async deletePromotion(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let promotionId: ID | undefined;

        if (matchBy === 'id') {
            promotionId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by couponCode
            const list = await this.promotionService.findAll(ctx, {
                filter: { couponCode: { eq: identifier } },
                take: 1,
            });
            promotionId = list.items[0]?.id;
        }

        if (!promotionId) {
            this.logger.warn(`Promotion not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.promotionService.softDeletePromotion(ctx, promotionId);
    }

    private async deleteShippingMethod(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let shippingMethodId: ID | undefined;

        if (matchBy === 'id') {
            shippingMethodId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by code
            const list = await this.shippingMethodService.findAll(ctx, {
                filter: { code: { eq: identifier } },
            } as never);
            shippingMethodId = list.items[0]?.id;
        }

        if (!shippingMethodId) {
            this.logger.warn(`Shipping method not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.shippingMethodService.softDelete(ctx, shippingMethodId);
    }

    private async deleteCustomer(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let customerId: ID | undefined;

        if (matchBy === 'id') {
            customerId = identifier as unknown as ID;
        } else {
            // matchBy === 'email', find by emailAddress
            const list = await this.customerService.findAll(ctx, {
                filter: { emailAddress: { eq: identifier } },
            } as never);
            customerId = list.items[0]?.id;
        }

        if (!customerId) {
            this.logger.warn(`Customer not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.customerService.softDelete(ctx, customerId);
    }

    private async deletePaymentMethod(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let paymentMethodId: ID | undefined;

        if (matchBy === 'id') {
            paymentMethodId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by code
            const list = await this.paymentMethodService.findAll(ctx, {
                filter: { code: { eq: identifier } },
            });
            paymentMethodId = list.items[0]?.id;
        }

        if (!paymentMethodId) {
            this.logger.warn(`Payment method not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.paymentMethodService.delete(ctx, paymentMethodId);
    }

    private async deleteFacet(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let facetId: ID | undefined;

        if (matchBy === 'id') {
            facetId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by code
            const facet = await this.facetService.findByCode(ctx, identifier, ctx.languageCode as LanguageCode);
            facetId = facet?.id;
        }

        if (!facetId) {
            this.logger.warn(`Facet not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.facetService.delete(ctx, facetId);
    }

    private async deleteFacetValue(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let facetValueId: ID | undefined;

        if (matchBy === 'id') {
            facetValueId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', use findAllList for paginated/filtered query
            const list = await this.facetValueService.findAllList(ctx, {
                filter: { code: { eq: identifier } },
                take: 1,
            } as never);
            facetValueId = list.items[0]?.id;
        }

        if (!facetValueId) {
            this.logger.warn(`Facet value not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.facetValueService.delete(ctx, facetValueId);
    }

    private async deleteCustomerGroup(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let groupId: ID | undefined;

        if (matchBy === 'id') {
            groupId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.customerGroupService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 1,
            } as never);
            groupId = list.items[0]?.id;
        }

        if (!groupId) {
            this.logger.warn(`Customer group not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.customerGroupService.delete(ctx, groupId);
    }

    private async deleteTaxRate(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let taxRateId: ID | undefined;

        if (matchBy === 'id') {
            taxRateId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.taxRateService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 1,
            });
            taxRateId = list.items[0]?.id;
        }

        if (!taxRateId) {
            this.logger.warn(`Tax rate not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.taxRateService.delete(ctx, taxRateId);
    }

    private async deleteAsset(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let assetId: ID | undefined;

        if (matchBy === 'id') {
            assetId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.assetService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 1,
            } as never);
            assetId = list.items[0]?.id;
        }

        if (!assetId) {
            this.logger.warn(`Asset not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.assetService.delete(ctx, [assetId]);
    }

    private async deleteStockLocation(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let stockLocationId: ID | undefined;

        if (matchBy === 'id') {
            stockLocationId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.stockLocationService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 1,
            });
            stockLocationId = list.items[0]?.id;
        }

        if (!stockLocationId) {
            this.logger.warn(`Stock location not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.stockLocationService.delete(ctx, { id: stockLocationId });
    }

    private async deleteCollection(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let collectionId: ID | undefined;

        if (matchBy === 'id') {
            collectionId = identifier as unknown as ID;
        } else {
            // matchBy === 'slug', find by slug
            const collection = await this.collectionService.findOneBySlug(ctx, identifier);
            collectionId = collection?.id;
        }

        if (!collectionId) {
            this.logger.warn(`Collection not found for deletion: ${identifier} (matchBy: ${matchBy})`);
            return;
        }

        await this.collectionService.delete(ctx, collectionId);
    }
}
