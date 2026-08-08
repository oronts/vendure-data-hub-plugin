/** Typed lookup from built-in loader codes to their canonical configurations. */

import type {
    ApplyCouponLoaderConfig,
    AssetAttachLoaderConfig,
    AssetImportLoaderConfig,
    ChannelUpsertLoaderConfig,
    CollectionUpsertLoaderConfig,
    CustomerGroupUpsertLoaderConfig,
    CustomerUpsertLoaderConfig,
    EntityDeletionLoaderConfig,
    FacetUpsertLoaderConfig,
    FacetValueUpsertLoaderConfig,
    GenericLoaderConfig,
    GraphqlMutationLoaderConfig,
    InventoryAdjustLoaderConfig,
    OrderNoteLoaderConfig,
    OrderTransitionLoaderConfig,
    OrderUpsertLoaderConfig,
    PaymentMethodUpsertLoaderConfig,
    ProductUpsertLoaderConfig,
    PromotionUpsertLoaderConfig,
    RestPostLoaderConfig,
    ShippingMethodUpsertLoaderConfig,
    StockAdjustLoaderConfig,
    StockLocationUpsertLoaderConfig,
    TaxRateUpsertLoaderConfig,
    VariantUpsertLoaderConfig,
} from '../../shared/types';

export interface LoaderConfigMap {
    productUpsert: ProductUpsertLoaderConfig;
    variantUpsert: VariantUpsertLoaderConfig;
    customerUpsert: CustomerUpsertLoaderConfig;
    orderUpsert: OrderUpsertLoaderConfig;
    orderNote: OrderNoteLoaderConfig;
    stockAdjust: StockAdjustLoaderConfig;
    applyCoupon: ApplyCouponLoaderConfig;
    collectionUpsert: CollectionUpsertLoaderConfig;
    promotionUpsert: PromotionUpsertLoaderConfig;
    orderTransition: OrderTransitionLoaderConfig;
    assetAttach: AssetAttachLoaderConfig;
    assetImport: AssetImportLoaderConfig;
    facetUpsert: FacetUpsertLoaderConfig;
    facetValueUpsert: FacetValueUpsertLoaderConfig;
    restPost: RestPostLoaderConfig;
    graphqlMutation: GraphqlMutationLoaderConfig;
    taxRateUpsert: TaxRateUpsertLoaderConfig;
    paymentMethodUpsert: PaymentMethodUpsertLoaderConfig;
    channelUpsert: ChannelUpsertLoaderConfig;
    shippingMethodUpsert: ShippingMethodUpsertLoaderConfig;
    customerGroupUpsert: CustomerGroupUpsertLoaderConfig;
    stockLocationUpsert: StockLocationUpsertLoaderConfig;
    inventoryAdjust: InventoryAdjustLoaderConfig;
    entityDeletion: EntityDeletionLoaderConfig;
}

export type ConfigByCode<T extends string> = T extends keyof LoaderConfigMap
    ? LoaderConfigMap[T]
    : GenericLoaderConfig;

export const LOADER_CODES = [
    'productUpsert',
    'variantUpsert',
    'customerUpsert',
    'orderUpsert',
    'orderNote',
    'stockAdjust',
    'applyCoupon',
    'collectionUpsert',
    'promotionUpsert',
    'orderTransition',
    'assetAttach',
    'assetImport',
    'facetUpsert',
    'facetValueUpsert',
    'restPost',
    'graphqlMutation',
    'taxRateUpsert',
    'paymentMethodUpsert',
    'channelUpsert',
    'shippingMethodUpsert',
    'customerGroupUpsert',
    'stockLocationUpsert',
    'inventoryAdjust',
    'entityDeletion',
] as const;

export type LoaderCode = typeof LOADER_CODES[number];
