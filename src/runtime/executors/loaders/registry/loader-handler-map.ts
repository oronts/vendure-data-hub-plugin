import type { Type } from '@vendure/core';
import type { LoaderHandler } from '../types';
import { ApplyCouponHandler, OrderNoteHandler, OrderTransitionHandler } from '../order-handler';
import { AssetAttachHandler } from '../asset-handler';
import { AssetImportHandler } from '../asset-import-handler';
import { ChannelHandler } from '../channel-handler';
import { CollectionHandler } from '../collection-handler';
import { CustomerGroupHandler } from '../customer-group-handler';
import { CustomerHandler } from '../customer-handler';
import { DeletionHandler } from '../deletion-handler';
import { FacetHandler, FacetValueHandler } from '../facet-handler';
import { GraphqlMutationHandler } from '../graphql-mutation-handler';
import { InventoryAdjustHandler } from '../inventory-adjust-handler';
import { StockAdjustHandler } from '../inventory-handler';
import { OrderUpsertHandler } from '../order-upsert-handler';
import { PaymentMethodHandler } from '../payment-method-handler';
import { ProductHandler } from '../product-handler';
import { PromotionHandler } from '../promotion-handler';
import { RestPostHandler } from '../rest-handler';
import { ShippingMethodHandler } from '../shipping-method-handler';
import { StockLocationHandler } from '../stock-location-handler';
import { TaxRateHandler } from '../tax-rate-handler';
import { VariantHandler } from '../variant-handler';

export const LOADER_HANDLER_MAP = new Map<string, Type<LoaderHandler>>([
    ['productUpsert', ProductHandler],
    ['variantUpsert', VariantHandler],
    ['customerUpsert', CustomerHandler],
    ['orderUpsert', OrderUpsertHandler],
    ['orderNote', OrderNoteHandler],
    ['stockAdjust', StockAdjustHandler],
    ['applyCoupon', ApplyCouponHandler],
    ['collectionUpsert', CollectionHandler],
    ['promotionUpsert', PromotionHandler],
    ['orderTransition', OrderTransitionHandler],
    ['assetAttach', AssetAttachHandler],
    ['assetImport', AssetImportHandler],
    ['facetUpsert', FacetHandler],
    ['facetValueUpsert', FacetValueHandler],
    ['restPost', RestPostHandler],
    ['graphqlMutation', GraphqlMutationHandler],
    ['taxRateUpsert', TaxRateHandler],
    ['paymentMethodUpsert', PaymentMethodHandler],
    ['channelUpsert', ChannelHandler],
    ['shippingMethodUpsert', ShippingMethodHandler],
    ['customerGroupUpsert', CustomerGroupHandler],
    ['stockLocationUpsert', StockLocationHandler],
    ['inventoryAdjust', InventoryAdjustHandler],
    ['entityDeletion', DeletionHandler],
]);
