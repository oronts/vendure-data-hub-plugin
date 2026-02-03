import { StepType } from '../constants/index';
import {
    HttpApiExtractorConfig,
    type CsvExtractorConfig,
    type JsonExtractorConfig,
    type ExcelExtractorConfig,
    type GraphqlExtractorConfig,
    type VendureQueryExtractorConfig,
    type WebhookExtractorConfig,
    type DatabaseExtractorConfig,
    type GenericExtractorConfig,
    type TypedExtractorConfig,
    type MapOperatorConfig,
    type TemplateOperatorConfig,
    type FilterOperatorConfig,
    type WhenOperatorConfig,
    type LookupOperatorConfig,
    type AggregateOperatorConfig,
    type DedupeOperatorConfig,
    type CoerceOperatorConfig,
    type EnrichOperatorConfig,
    type GenericOperatorConfig,
    type TypedOperatorConfig,
    type ProductUpsertLoaderConfig,
    type VariantUpsertLoaderConfig,
    type CustomerUpsertLoaderConfig,
    type StockAdjustLoaderConfig,
    type RestPostLoaderConfig,
    type OrderNoteLoaderConfig,
    type OrderTransitionLoaderConfig,
    type CollectionUpsertLoaderConfig,
    type AssetAttachLoaderConfig,
    type ApplyCouponLoaderConfig,
    type PromotionUpsertLoaderConfig,
    type GenericLoaderConfig,
    type TypedLoaderConfig,
    type CsvExportConfig,
    type JsonExportConfig,
    type XmlExportConfig,
    type GenericExporterConfig,
    type TypedExporterConfig,
    type GoogleMerchantFeedConfig,
    type MetaCatalogFeedConfig,
    type AmazonFeedConfig,
    type CustomFeedConfig,
    type GenericFeedConfig,
    type TypedFeedConfig,
    type SchemaValidatorConfig,
    type RouteConfig,
    type LoaderAdapterCode,
    LOADER_PERMISSIONS,
} from '../../shared/types';

export type {
    CsvExtractorConfig,
    JsonExtractorConfig,
    ExcelExtractorConfig,
    HttpApiExtractorConfig,
    GraphqlExtractorConfig,
    VendureQueryExtractorConfig,
    WebhookExtractorConfig,
    DatabaseExtractorConfig,
    GenericExtractorConfig,
    TypedExtractorConfig,
    MapOperatorConfig,
    TemplateOperatorConfig,
    FilterOperatorConfig,
    WhenOperatorConfig,
    LookupOperatorConfig,
    AggregateOperatorConfig,
    DedupeOperatorConfig,
    CoerceOperatorConfig,
    EnrichOperatorConfig,
    GenericOperatorConfig,
    TypedOperatorConfig,
    ProductUpsertLoaderConfig,
    VariantUpsertLoaderConfig,
    CustomerUpsertLoaderConfig,
    StockAdjustLoaderConfig,
    RestPostLoaderConfig,
    OrderNoteLoaderConfig,
    OrderTransitionLoaderConfig,
    CollectionUpsertLoaderConfig,
    AssetAttachLoaderConfig,
    ApplyCouponLoaderConfig,
    PromotionUpsertLoaderConfig,
    GenericLoaderConfig,
    TypedLoaderConfig,
    CsvExportConfig,
    JsonExportConfig,
    XmlExportConfig,
    GenericExporterConfig,
    TypedExporterConfig,
    GoogleMerchantFeedConfig,
    MetaCatalogFeedConfig,
    AmazonFeedConfig,
    CustomFeedConfig,
    GenericFeedConfig,
    TypedFeedConfig,
    SchemaValidatorConfig,
    RouteConfig,
    UpdateCatalogLoaders,
    UpdateCustomerLoaders,
    UpdateOrderLoaders,
    UpdatePromotionLoaders,
    UpdateDataHubSettingsLoaders,
    LoaderAdapterCode,
} from '../../shared/types';

export { LOADER_PERMISSIONS } from '../../shared/types';

interface BaseStep {
    key: string;
    name?: string;
    async?: boolean;
    concurrency?: number;
}

export interface TypedExtractStep extends BaseStep {
    type: typeof StepType.EXTRACT;
    config: TypedExtractorConfig;
}

export interface TypedTransformStep extends BaseStep {
    type: typeof StepType.TRANSFORM;
    config: TypedOperatorConfig;
}

export interface TypedValidateStep extends BaseStep {
    type: typeof StepType.VALIDATE;
    config: SchemaValidatorConfig;
}

export interface TypedEnrichStep extends BaseStep {
    type: typeof StepType.ENRICH;
    config: EnrichOperatorConfig;
}

export interface TypedRouteStep extends BaseStep {
    type: typeof StepType.ROUTE;
    config: RouteConfig;
}

export interface TypedLoadStep extends BaseStep {
    type: typeof StepType.LOAD;
    config: TypedLoaderConfig;
}

export interface TypedExportStep extends BaseStep {
    type: typeof StepType.EXPORT;
    config: TypedExporterConfig;
}

export interface TypedFeedStep extends BaseStep {
    type: typeof StepType.FEED;
    config: TypedFeedConfig;
}

export type TypedStep =
    | TypedExtractStep
    | TypedTransformStep
    | TypedValidateStep
    | TypedEnrichStep
    | TypedRouteStep
    | TypedLoadStep
    | TypedExportStep
    | TypedFeedStep;

export function extractStep<T extends TypedExtractorConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedExtractStep {
    return {
        key,
        type: StepType.EXTRACT,
        config,
        ...options,
    };
}

export function transformStep<T extends TypedOperatorConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedTransformStep {
    return {
        key,
        type: StepType.TRANSFORM,
        config,
        ...options,
    };
}

export function validateStep(
    key: string,
    config: SchemaValidatorConfig,
    options?: Omit<BaseStep, 'key'>
): TypedValidateStep {
    return {
        key,
        type: StepType.VALIDATE,
        config,
        ...options,
    };
}

export function enrichStep(
    key: string,
    config: EnrichOperatorConfig,
    options?: Omit<BaseStep, 'key'>
): TypedEnrichStep {
    return {
        key,
        type: StepType.ENRICH,
        config,
        ...options,
    };
}

export function loadStep<T extends TypedLoaderConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedLoadStep {
    return {
        key,
        type: StepType.LOAD,
        config,
        ...options,
    };
}

export function routeStep(
    key: string,
    config: RouteConfig,
    options?: Omit<BaseStep, 'key'>
): TypedRouteStep {
    return {
        key,
        type: StepType.ROUTE,
        config,
        ...options,
    };
}

export function exportStep<T extends TypedExporterConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedExportStep {
    return {
        key,
        type: StepType.EXPORT,
        config,
        ...options,
    };
}

export function feedStep<T extends TypedFeedConfig>(
    key: string,
    config: T,
    options?: Omit<BaseStep, 'key'>
): TypedFeedStep {
    return {
        key,
        type: StepType.FEED,
        config,
        ...options,
    };
}

export function deriveRequiredPermissions(steps: TypedStep[]): string[] {
    const permissions = new Set<string>();

    for (const step of steps) {
        if (step.type === StepType.LOAD) {
            const adapterCode = (step.config as TypedLoaderConfig).adapterCode;
            const permission = LOADER_PERMISSIONS[adapterCode as LoaderAdapterCode];
            if (permission) {
                permissions.add(permission);
            }
        }
    }

    return Array.from(permissions);
}

export function deriveWrites(steps: TypedStep[]): Array<'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'INVENTORY' | 'PROMOTIONS' | 'CUSTOM'> {
    const writes = new Set<'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'INVENTORY' | 'PROMOTIONS' | 'CUSTOM'>();

    for (const step of steps) {
        if (step.type === StepType.LOAD) {
            const adapterCode = (step.config as TypedLoaderConfig).adapterCode;
            switch (adapterCode) {
                case 'productUpsert':
                case 'variantUpsert':
                case 'collectionUpsert':
                case 'assetAttach':
                    writes.add('CATALOG');
                    break;
                case 'stockAdjust':
                    writes.add('INVENTORY');
                    break;
                case 'customerUpsert':
                    writes.add('CUSTOMERS');
                    break;
                case 'orderNote':
                case 'orderTransition':
                case 'applyCoupon':
                    writes.add('ORDERS');
                    break;
                case 'promotionUpsert':
                    writes.add('PROMOTIONS');
                    break;
                case 'restPost':
                    writes.add('CUSTOM');
                    break;
            }
        }
    }

    return Array.from(writes);
}

/**
 * Create capabilities from steps (auto-derives permissions and writes)
 */
export function deriveCapabilities(steps: TypedStep[]): {
    requires: string[];
    writes: Array<'CATALOG' | 'CUSTOMERS' | 'ORDERS' | 'INVENTORY' | 'PROMOTIONS' | 'CUSTOM'>;
} {
    return {
        requires: deriveRequiredPermissions(steps),
        writes: deriveWrites(steps),
    };
}

export const Extractors = {
    csv: (config: Omit<CsvExtractorConfig, 'adapterCode'>): CsvExtractorConfig => ({ adapterCode: 'csv', ...config }),
    json: (config: Omit<JsonExtractorConfig, 'adapterCode'>): JsonExtractorConfig => ({ adapterCode: 'json', ...config }),
    excel: (config: Omit<ExcelExtractorConfig, 'adapterCode'>): ExcelExtractorConfig => ({ adapterCode: 'excel', ...config }),
    httpApi: (config: Omit<HttpApiExtractorConfig, 'adapterCode'>): HttpApiExtractorConfig => ({ adapterCode: 'httpApi', ...config }),
    graphql: (config: Omit<GraphqlExtractorConfig, 'adapterCode'>): GraphqlExtractorConfig => ({ adapterCode: 'graphql', ...config }),
    vendureQuery: (config: Omit<VendureQueryExtractorConfig, 'adapterCode'>): VendureQueryExtractorConfig => ({ adapterCode: 'vendureQuery', ...config }),
    webhook: (config: Omit<WebhookExtractorConfig, 'adapterCode'>): WebhookExtractorConfig => ({ adapterCode: 'webhook', ...config }),
    database: (config: Omit<DatabaseExtractorConfig, 'adapterCode'>): DatabaseExtractorConfig => ({ adapterCode: 'database', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericExtractorConfig => ({ adapterCode, ...config }),
};

export const Operators = {
    map: (config: Omit<MapOperatorConfig, 'adapterCode'>): MapOperatorConfig => ({ adapterCode: 'map', ...config }),
    template: (config: Omit<TemplateOperatorConfig, 'adapterCode'>): TemplateOperatorConfig => ({ adapterCode: 'template', ...config }),
    filter: (config: Omit<FilterOperatorConfig, 'adapterCode'>): FilterOperatorConfig => ({ adapterCode: 'filter', ...config }),
    when: (config: Omit<WhenOperatorConfig, 'adapterCode'>): WhenOperatorConfig => ({ adapterCode: 'when', ...config }),
    lookup: (config: Omit<LookupOperatorConfig, 'adapterCode'>): LookupOperatorConfig => ({ adapterCode: 'lookup', ...config }),
    aggregate: (config: Omit<AggregateOperatorConfig, 'adapterCode'>): AggregateOperatorConfig => ({ adapterCode: 'aggregate', ...config }),
    dedupe: (config: Omit<DedupeOperatorConfig, 'adapterCode'>): DedupeOperatorConfig => ({ adapterCode: 'dedupe', ...config }),
    coerce: (config: Omit<CoerceOperatorConfig, 'adapterCode'>): CoerceOperatorConfig => ({ adapterCode: 'coerce', ...config }),
    enrich: (config: Omit<EnrichOperatorConfig, 'adapterCode'>): EnrichOperatorConfig => ({ adapterCode: 'enrich', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericOperatorConfig => ({ adapterCode, ...config }),
};

export const Loaders = {
    productUpsert: (config: Omit<ProductUpsertLoaderConfig, 'adapterCode'>): ProductUpsertLoaderConfig => ({ adapterCode: 'productUpsert', ...config }),
    variantUpsert: (config: Omit<VariantUpsertLoaderConfig, 'adapterCode'>): VariantUpsertLoaderConfig => ({ adapterCode: 'variantUpsert', ...config }),
    customerUpsert: (config: Omit<CustomerUpsertLoaderConfig, 'adapterCode'>): CustomerUpsertLoaderConfig => ({ adapterCode: 'customerUpsert', ...config }),
    stockAdjust: (config: Omit<StockAdjustLoaderConfig, 'adapterCode'>): StockAdjustLoaderConfig => ({ adapterCode: 'stockAdjust', ...config }),
    restPost: (config: Omit<RestPostLoaderConfig, 'adapterCode'>): RestPostLoaderConfig => ({ adapterCode: 'restPost', ...config }),
    orderNote: (config: Omit<OrderNoteLoaderConfig, 'adapterCode'>): OrderNoteLoaderConfig => ({ adapterCode: 'orderNote', ...config }),
    orderTransition: (config: Omit<OrderTransitionLoaderConfig, 'adapterCode'>): OrderTransitionLoaderConfig => ({ adapterCode: 'orderTransition', ...config }),
    collectionUpsert: (config: Omit<CollectionUpsertLoaderConfig, 'adapterCode'>): CollectionUpsertLoaderConfig => ({ adapterCode: 'collectionUpsert', ...config }),
    assetAttach: (config: Omit<AssetAttachLoaderConfig, 'adapterCode'>): AssetAttachLoaderConfig => ({ adapterCode: 'assetAttach', ...config }),
    applyCoupon: (config: Omit<ApplyCouponLoaderConfig, 'adapterCode'>): ApplyCouponLoaderConfig => ({ adapterCode: 'applyCoupon', ...config }),
    promotionUpsert: (config: Omit<PromotionUpsertLoaderConfig, 'adapterCode'>): PromotionUpsertLoaderConfig => ({ adapterCode: 'promotionUpsert', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericLoaderConfig => ({ adapterCode, ...config }),
};

export const Exporters = {
    csv: (config: Omit<CsvExportConfig, 'adapterCode'>): CsvExportConfig => ({ adapterCode: 'csvExport', ...config }),
    json: (config: Omit<JsonExportConfig, 'adapterCode'>): JsonExportConfig => ({ adapterCode: 'jsonExport', ...config }),
    xml: (config: Omit<XmlExportConfig, 'adapterCode'>): XmlExportConfig => ({ adapterCode: 'xmlExport', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericExporterConfig => ({ adapterCode, ...config }),
};

export const Feeds = {
    googleMerchant: (config: Omit<GoogleMerchantFeedConfig, 'adapterCode'>): GoogleMerchantFeedConfig => ({ adapterCode: 'googleMerchant', ...config }),
    metaCatalog: (config: Omit<MetaCatalogFeedConfig, 'adapterCode'>): MetaCatalogFeedConfig => ({ adapterCode: 'metaCatalog', ...config }),
    amazon: (config: Omit<AmazonFeedConfig, 'adapterCode'>): AmazonFeedConfig => ({ adapterCode: 'amazonFeed', ...config }),
    customFeed: (config: Omit<CustomFeedConfig, 'adapterCode'>): CustomFeedConfig => ({ adapterCode: 'customFeed', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericFeedConfig => ({ adapterCode, ...config }),
};
