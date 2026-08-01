export * from './extractor-config.types';
export * from './loader-core-config.types';
export * from './loader-catalog-config.types';
export * from './delivery-config.types';

import type {
    CustomerUpsertLoaderConfig,
    OrderNoteLoaderConfig,
    OrderTransitionLoaderConfig,
    OrderUpsertLoaderConfig,
    ProductUpsertLoaderConfig,
    RestPostLoaderConfig,
    StockAdjustLoaderConfig,
    VariantUpsertLoaderConfig,
} from './loader-core-config.types';
import type {
    ApplyCouponLoaderConfig,
    AssetAttachLoaderConfig,
    AssetImportLoaderConfig,
    ChannelUpsertLoaderConfig,
    CollectionUpsertLoaderConfig,
    CustomerGroupUpsertLoaderConfig,
    EntityDeletionLoaderConfig,
    FacetUpsertLoaderConfig,
    FacetValueUpsertLoaderConfig,
    GenericLoaderConfig,
    GraphqlMutationLoaderConfig,
    InventoryAdjustLoaderConfig,
    PaymentMethodUpsertLoaderConfig,
    PromotionUpsertLoaderConfig,
    ShippingMethodUpsertLoaderConfig,
    StockLocationUpsertLoaderConfig,
    TaxRateUpsertLoaderConfig,
} from './loader-catalog-config.types';

export type TypedLoaderConfig =
    | ProductUpsertLoaderConfig
    | VariantUpsertLoaderConfig
    | CustomerUpsertLoaderConfig
    | OrderUpsertLoaderConfig
    | StockAdjustLoaderConfig
    | RestPostLoaderConfig
    | GraphqlMutationLoaderConfig
    | OrderNoteLoaderConfig
    | OrderTransitionLoaderConfig
    | CollectionUpsertLoaderConfig
    | AssetAttachLoaderConfig
    | AssetImportLoaderConfig
    | ApplyCouponLoaderConfig
    | PromotionUpsertLoaderConfig
    | FacetUpsertLoaderConfig
    | FacetValueUpsertLoaderConfig
    | TaxRateUpsertLoaderConfig
    | PaymentMethodUpsertLoaderConfig
    | ChannelUpsertLoaderConfig
    | ShippingMethodUpsertLoaderConfig
    | CustomerGroupUpsertLoaderConfig
    | StockLocationUpsertLoaderConfig
    | InventoryAdjustLoaderConfig
    | EntityDeletionLoaderConfig
    | GenericLoaderConfig;
