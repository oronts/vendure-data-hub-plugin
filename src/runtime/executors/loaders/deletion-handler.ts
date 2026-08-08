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
    ChannelService,
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
    ID,
    LanguageCode,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { findVariantBySku } from './shared-lookups';
import { getStringValue } from '../../../loaders/shared-helpers';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { LOGGER_CONTEXTS } from '../../../constants/core';
import { DataHubLogger, DataHubLoggerFactory } from '../../../services/logger/datahub-logger';
import {
    assertDeletionSucceeded,
    DeletionTargetNotFoundError,
    isDeletionTargetNotFoundError,
    resolveUniqueDeletionTargetId,
} from './deletion-handler-errors';
import { parseDeletionHandlerConfig } from './deletion-handler-config';

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
        private channelService: ChannelService,
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
    ): Promise<LoaderExecutionResult> {
        let ok = 0;
        let fail = 0;
        let skipped = 0;
        const cfg = parseDeletionHandlerConfig(step.config);
        const { entityType, matchBy, identifierField } = cfg;

        let opCtx = ctx;
        if (cfg.channel) {
            opCtx = await createChannelCodeRequestContext(
                this.requestContextService,
                this.channelService,
                ctx,
                cfg.channel,
            );
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
                        await this.deleteProduct(opCtx, identifier, matchBy);
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
                if (isDeletionTargetNotFoundError(e)) {
                    this.logger.warn(getErrorMessage(e));
                    skipped++;
                    continue;
                }
                if (onRecordError) {
                    await onRecordError(step.key, getErrorMessage(e) || 'entityDeletion failed', rec, getErrorStack(e));
                }
                fail++;
            }
        }
        return { ok, fail, skipped };
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
            throw new DeletionTargetNotFoundError(
                `Variant not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('variant', identifier, await this.productVariantService.softDelete(ctx, variantId));
    }

    private async deleteProduct(
        ctx: RequestContext,
        identifier: string,
        matchBy: string,
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
            throw new DeletionTargetNotFoundError(
                `Product not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('product', identifier, await this.productService.softDelete(ctx, productId));
    }

    private async deletePromotion(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let promotionId: ID | undefined;

        if (matchBy === 'id') {
            promotionId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by couponCode
            const list = await this.promotionService.findAll(ctx, {
                filter: { couponCode: { eq: identifier } },
                take: 2,
            });
            promotionId = resolveUniqueDeletionTargetId(list.items, 'promotion', identifier);
        }

        if (!promotionId) {
            throw new DeletionTargetNotFoundError(
                `Promotion not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('promotion', identifier, await this.promotionService.softDeletePromotion(ctx, promotionId));
    }

    private async deleteShippingMethod(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let shippingMethodId: ID | undefined;

        if (matchBy === 'id') {
            shippingMethodId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by code
            const list = await this.shippingMethodService.findAll(ctx, {
                filter: { code: { eq: identifier } },
                take: 2,
            } as never);
            shippingMethodId = resolveUniqueDeletionTargetId(list.items, 'shipping method', identifier);
        }

        if (!shippingMethodId) {
            throw new DeletionTargetNotFoundError(
                `Shipping method not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('shipping method', identifier, await this.shippingMethodService.softDelete(ctx, shippingMethodId));
    }

    private async deleteCustomer(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let customerId: ID | undefined;

        if (matchBy === 'id') {
            customerId = identifier as unknown as ID;
        } else {
            // matchBy === 'email', find by emailAddress
            const list = await this.customerService.findAll(ctx, {
                filter: { emailAddress: { eq: identifier } },
                take: 2,
            } as never);
            customerId = resolveUniqueDeletionTargetId(list.items, 'customer', identifier);
        }

        if (!customerId) {
            throw new DeletionTargetNotFoundError(
                `Customer not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('customer', identifier, await this.customerService.softDelete(ctx, customerId));
    }

    private async deletePaymentMethod(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let paymentMethodId: ID | undefined;

        if (matchBy === 'id') {
            paymentMethodId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', find by code
            const list = await this.paymentMethodService.findAll(ctx, {
                filter: { code: { eq: identifier } },
                take: 2,
            });
            paymentMethodId = resolveUniqueDeletionTargetId(list.items, 'payment method', identifier);
        }

        if (!paymentMethodId) {
            throw new DeletionTargetNotFoundError(
                `Payment method not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('payment method', identifier, await this.paymentMethodService.delete(ctx, paymentMethodId));
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
            throw new DeletionTargetNotFoundError(
                `Facet not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('facet', identifier, await this.facetService.delete(ctx, facetId));
    }

    private async deleteFacetValue(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let facetValueId: ID | undefined;

        if (matchBy === 'id') {
            facetValueId = identifier as unknown as ID;
        } else {
            // matchBy === 'code', use findAllList for paginated/filtered query
            const list = await this.facetValueService.findAllList(ctx, {
                filter: { code: { eq: identifier } },
                take: 2,
            } as never);
            facetValueId = resolveUniqueDeletionTargetId(list.items, 'facet value', identifier);
        }

        if (!facetValueId) {
            throw new DeletionTargetNotFoundError(
                `Facet value not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('facet value', identifier, await this.facetValueService.delete(ctx, facetValueId));
    }

    private async deleteCustomerGroup(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let groupId: ID | undefined;

        if (matchBy === 'id') {
            groupId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.customerGroupService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 2,
            } as never);
            groupId = resolveUniqueDeletionTargetId(list.items, 'customer group', identifier);
        }

        if (!groupId) {
            throw new DeletionTargetNotFoundError(
                `Customer group not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('customer group', identifier, await this.customerGroupService.delete(ctx, groupId));
    }

    private async deleteTaxRate(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let taxRateId: ID | undefined;

        if (matchBy === 'id') {
            taxRateId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.taxRateService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 2,
            });
            taxRateId = resolveUniqueDeletionTargetId(list.items, 'tax rate', identifier);
        }

        if (!taxRateId) {
            throw new DeletionTargetNotFoundError(
                `Tax rate not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('tax rate', identifier, await this.taxRateService.delete(ctx, taxRateId));
    }

    private async deleteAsset(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let assetId: ID | undefined;

        if (matchBy === 'id') {
            assetId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.assetService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 2,
            } as never);
            assetId = resolveUniqueDeletionTargetId(list.items, 'asset', identifier);
        }

        if (!assetId) {
            throw new DeletionTargetNotFoundError(
                `Asset not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('asset', identifier, await this.assetService.delete(ctx, [assetId]));
    }

    private async deleteStockLocation(ctx: RequestContext, identifier: string, matchBy: string): Promise<void> {
        let stockLocationId: ID | undefined;

        if (matchBy === 'id') {
            stockLocationId = identifier as unknown as ID;
        } else {
            // matchBy === 'name', find by name
            const list = await this.stockLocationService.findAll(ctx, {
                filter: { name: { eq: identifier } },
                take: 2,
            });
            stockLocationId = resolveUniqueDeletionTargetId(list.items, 'stock location', identifier);
        }

        if (!stockLocationId) {
            throw new DeletionTargetNotFoundError(
                `Stock location not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('stock location', identifier, await this.stockLocationService.delete(ctx, { id: stockLocationId }));
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
            throw new DeletionTargetNotFoundError(
                `Collection not found for deletion: ${identifier} (matchBy: ${matchBy})`,
            );
        }

        assertDeletionSucceeded('collection', identifier, await this.collectionService.delete(ctx, collectionId));
    }
}
