/**
 * Typed Pipeline Configuration
 *
 * Type-safe utility functions and namespace objects for building pipeline
 * definitions with compile-time validation. Provides:
 *
 * - Namespace objects (Extractors, Loaders, Exporters, Feeds) with
 *   factory functions that return correctly-typed adapter configs
 * - Step factory functions (extractStep, transformStep, etc.) that produce
 *   PipelineStepDefinition with the correct `type` field
 * - deriveCapabilities() to auto-derive required permissions from steps
 * - TypedStep union type covering all typed step definitions
 */

import type { JsonObject } from '../../shared/types';
import type {
    PipelineStepDefinition,
    PipelineCapabilities,
    PipelineCapabilityDomain,
} from '../../shared/types';
import {
    type CsvExtractorConfig,
    type JsonExtractorConfig,
    type XmlExtractorConfig,
    type XlsxExtractorConfig,
    type HttpApiExtractorConfig,
    type GraphqlExtractorConfig,
    type VendureQueryExtractorConfig,
    type DatabaseExtractorConfig,
    type GenericExtractorConfig,
    type TypedExtractorConfig,
    type OperatorConfig,
    type ProductUpsertLoaderConfig,
    type VariantUpsertLoaderConfig,
    type CustomerUpsertLoaderConfig,
    type OrderUpsertLoaderConfig,
    type StockAdjustLoaderConfig,
    type RestPostLoaderConfig,
    type GraphqlMutationLoaderConfig,
    type OrderNoteLoaderConfig,
    type OrderTransitionLoaderConfig,
    type CollectionUpsertLoaderConfig,
    type AssetAttachLoaderConfig,
    type AssetImportLoaderConfig,
    type ApplyCouponLoaderConfig,
    type PromotionUpsertLoaderConfig,
    type FacetUpsertLoaderConfig,
    type FacetValueUpsertLoaderConfig,
    type TaxRateUpsertLoaderConfig,
    type PaymentMethodUpsertLoaderConfig,
    type ChannelUpsertLoaderConfig,
    type ShippingMethodUpsertLoaderConfig,
    type CustomerGroupUpsertLoaderConfig,
    type StockLocationUpsertLoaderConfig,
    type InventoryAdjustLoaderConfig,
    type EntityDeletionLoaderConfig,
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
    type RouteConfig,
} from '../../shared/types';
import type { ValidateStepConfig } from '../sdk/dsl/step-configs';
import type { LoaderCode, LoaderConfigMap } from './loader-configs';
import { getLoaderCapabilities } from './loader-capabilities';

export type {
    CsvExtractorConfig,
    JsonExtractorConfig,
    XmlExtractorConfig,
    XlsxExtractorConfig,
    HttpApiExtractorConfig,
    GraphqlExtractorConfig,
    VendureQueryExtractorConfig,
    DatabaseExtractorConfig,
    GenericExtractorConfig,
    TypedExtractorConfig,
    ProductUpsertLoaderConfig,
    VariantUpsertLoaderConfig,
    CustomerUpsertLoaderConfig,
    OrderUpsertLoaderConfig,
    StockAdjustLoaderConfig,
    RestPostLoaderConfig,
    GraphqlMutationLoaderConfig,
    OrderNoteLoaderConfig,
    OrderTransitionLoaderConfig,
    CollectionUpsertLoaderConfig,
    AssetAttachLoaderConfig,
    AssetImportLoaderConfig,
    ApplyCouponLoaderConfig,
    PromotionUpsertLoaderConfig,
    FacetUpsertLoaderConfig,
    FacetValueUpsertLoaderConfig,
    TaxRateUpsertLoaderConfig,
    PaymentMethodUpsertLoaderConfig,
    ChannelUpsertLoaderConfig,
    ShippingMethodUpsertLoaderConfig,
    CustomerGroupUpsertLoaderConfig,
    StockLocationUpsertLoaderConfig,
    InventoryAdjustLoaderConfig,
    EntityDeletionLoaderConfig,
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
    RouteConfig,
    UpdateCatalogLoaders,
    UpdateCustomerLoaders,
    UpdateOrderLoaders,
    UpdatePromotionLoaders,
    UpdateSettingsLoaders,
    UpdateShippingMethodLoaders,
    UpdateDataHubSettingsLoaders,
    LoaderAdapterCode,
} from '../../shared/types';

export type {
    FeedLocalizationConfig,
    CommerceFeedFieldMappingConfig,
} from '../../shared/types';

// ============================================================================
// Step Extras (optional metadata for step definitions)
// ============================================================================

/** Optional metadata to attach to a step definition */
type StepExtras = Partial<Pick<
    PipelineStepDefinition,
    'name' | 'label' | 'description' | 'order' | 'disabled' |
    'parallel' | 'async' | 'throughput' |
    'context' |
    'retries' | 'retryDelayMs' | 'timeoutMs' | 'continueOnError' |
    'condition' | 'inputs' | 'outputs'
>>;

// ============================================================================
// TypedStep (union type for typed step definitions)
// ============================================================================

/**
 * A PipelineStepDefinition produced by one of the typed step factory functions.
 * Carries a `__adapterCode` brand for capability derivation.
 */
interface TypedStepDefinition extends PipelineStepDefinition {
    /** Adapter code extracted from the typed config, used by deriveCapabilities */
    readonly __adapterCode?: string;
}

/** Union type covering all typed step definitions produced by step factory functions. */
export type TypedStep = TypedStepDefinition;

export interface TypedTransformConfig {
    operators: OperatorConfig[];
    retryPerRecord?: {
        maxRetries: number;
        retryDelayMs?: number;
        backoff?: 'FIXED' | 'EXPONENTIAL';
        retryableErrors?: string[];
    };
}

// ============================================================================
// Step Factory Functions
// ============================================================================

function makeStep(
    key: string,
    type: PipelineStepDefinition['type'],
    config: Record<string, unknown>,
    extras?: StepExtras,
): TypedStepDefinition {
    const adapterCode = typeof config.adapterCode === 'string' ? config.adapterCode : undefined;
    return {
        key,
        type,
        config: config as JsonObject,
        __adapterCode: adapterCode,
        ...(extras ?? {}),
    };
}

/** Create a typed EXTRACT step definition. */
export function extractStep(
    key: string,
    config: TypedExtractorConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'EXTRACT', config as Record<string, unknown>, extras);
}

/** Create a typed TRANSFORM step definition. */
export function transformStep(
    key: string,
    config: TypedTransformConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'TRANSFORM', config as unknown as Record<string, unknown>, extras);
}

/** Create a typed VALIDATE step definition. */
export function validateStep(
    key: string,
    config: ValidateStepConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'VALIDATE', config as unknown as Record<string, unknown>, extras);
}

/** Create a typed LOAD step definition. */
export function loadStep(
    key: string,
    config: TypedLoaderConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'LOAD', config as Record<string, unknown>, extras);
}

/** Create a typed ROUTE step definition. */
export function routeStep(
    key: string,
    config: RouteConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'ROUTE', config as unknown as Record<string, unknown>, extras);
}

/** Create a typed EXPORT step definition. */
export function exportStep(
    key: string,
    config: TypedExporterConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'EXPORT', config as Record<string, unknown>, extras);
}

/** Create a typed FEED step definition. */
export function feedStep(
    key: string,
    config: TypedFeedConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'FEED', config as Record<string, unknown>, extras);
}

export const Extractors = {
    csv: (config: Omit<CsvExtractorConfig, 'adapterCode'>): CsvExtractorConfig => ({ adapterCode: 'csv', ...config }),
    json: (config: Omit<JsonExtractorConfig, 'adapterCode'>): JsonExtractorConfig => ({ adapterCode: 'json', ...config }),
    xml: (config: Omit<XmlExtractorConfig, 'adapterCode'>): XmlExtractorConfig => ({ adapterCode: 'xml', ...config }),
    xlsx: (config: Omit<XlsxExtractorConfig, 'adapterCode'>): XlsxExtractorConfig => ({ adapterCode: 'xlsx', ...config }),
    httpApi: (config: Omit<HttpApiExtractorConfig, 'adapterCode'>): HttpApiExtractorConfig => ({ adapterCode: 'httpApi', ...config }),
    graphql: (config: Omit<GraphqlExtractorConfig, 'adapterCode'>): GraphqlExtractorConfig => ({ adapterCode: 'graphql', ...config }),
    vendureQuery: (config: Omit<VendureQueryExtractorConfig, 'adapterCode'>): VendureQueryExtractorConfig => ({ adapterCode: 'vendureQuery', ...config }),
    database: (config: Omit<DatabaseExtractorConfig, 'adapterCode'>): DatabaseExtractorConfig => ({ adapterCode: 'database', ...config }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericExtractorConfig => ({ adapterCode, ...config }),
};

type LoaderFactoryMap = {
    readonly [Code in LoaderCode]: (
        config: Omit<LoaderConfigMap[Code], 'adapterCode'>,
    ) => LoaderConfigMap[Code];
};

type LoaderFactories = LoaderFactoryMap & {
    custom<T extends Record<string, unknown>>(
        adapterCode: string,
        config: T,
    ): GenericLoaderConfig;
};

export const Loaders = {
    productUpsert: (config: Omit<ProductUpsertLoaderConfig, 'adapterCode'>): ProductUpsertLoaderConfig => ({ ...config, adapterCode: 'productUpsert' }),
    variantUpsert: (config: Omit<VariantUpsertLoaderConfig, 'adapterCode'>): VariantUpsertLoaderConfig => ({ ...config, adapterCode: 'variantUpsert' }),
    customerUpsert: (config: Omit<CustomerUpsertLoaderConfig, 'adapterCode'>): CustomerUpsertLoaderConfig => ({ ...config, adapterCode: 'customerUpsert' }),
    orderUpsert: (config: Omit<OrderUpsertLoaderConfig, 'adapterCode'>): OrderUpsertLoaderConfig => ({ ...config, adapterCode: 'orderUpsert' }),
    orderNote: (config: Omit<OrderNoteLoaderConfig, 'adapterCode'>): OrderNoteLoaderConfig => ({ ...config, adapterCode: 'orderNote' }),
    stockAdjust: (config: Omit<StockAdjustLoaderConfig, 'adapterCode'>): StockAdjustLoaderConfig => ({ ...config, adapterCode: 'stockAdjust' }),
    applyCoupon: (config: Omit<ApplyCouponLoaderConfig, 'adapterCode'>): ApplyCouponLoaderConfig => ({ ...config, adapterCode: 'applyCoupon' }),
    collectionUpsert: (config: Omit<CollectionUpsertLoaderConfig, 'adapterCode'>): CollectionUpsertLoaderConfig => ({ ...config, adapterCode: 'collectionUpsert' }),
    promotionUpsert: (config: Omit<PromotionUpsertLoaderConfig, 'adapterCode'>): PromotionUpsertLoaderConfig => ({ ...config, adapterCode: 'promotionUpsert' }),
    orderTransition: (config: Omit<OrderTransitionLoaderConfig, 'adapterCode'>): OrderTransitionLoaderConfig => ({ ...config, adapterCode: 'orderTransition' }),
    assetAttach: (config: Omit<AssetAttachLoaderConfig, 'adapterCode'>): AssetAttachLoaderConfig => ({ ...config, adapterCode: 'assetAttach' }),
    assetImport: (config: Omit<AssetImportLoaderConfig, 'adapterCode'>): AssetImportLoaderConfig => ({ ...config, adapterCode: 'assetImport' }),
    facetUpsert: (config: Omit<FacetUpsertLoaderConfig, 'adapterCode'>): FacetUpsertLoaderConfig => ({ ...config, adapterCode: 'facetUpsert' }),
    facetValueUpsert: (config: Omit<FacetValueUpsertLoaderConfig, 'adapterCode'>): FacetValueUpsertLoaderConfig => ({ ...config, adapterCode: 'facetValueUpsert' }),
    restPost: (config: Omit<RestPostLoaderConfig, 'adapterCode'>): RestPostLoaderConfig => ({ ...config, adapterCode: 'restPost' }),
    graphqlMutation: (config: Omit<GraphqlMutationLoaderConfig, 'adapterCode'>): GraphqlMutationLoaderConfig => ({ ...config, adapterCode: 'graphqlMutation' }),
    taxRateUpsert: (config: Omit<TaxRateUpsertLoaderConfig, 'adapterCode'>): TaxRateUpsertLoaderConfig => ({ ...config, adapterCode: 'taxRateUpsert' }),
    paymentMethodUpsert: (config: Omit<PaymentMethodUpsertLoaderConfig, 'adapterCode'>): PaymentMethodUpsertLoaderConfig => ({ ...config, adapterCode: 'paymentMethodUpsert' }),
    channelUpsert: (config: Omit<ChannelUpsertLoaderConfig, 'adapterCode'>): ChannelUpsertLoaderConfig => ({ ...config, adapterCode: 'channelUpsert' }),
    shippingMethodUpsert: (config: Omit<ShippingMethodUpsertLoaderConfig, 'adapterCode'>): ShippingMethodUpsertLoaderConfig => ({ ...config, adapterCode: 'shippingMethodUpsert' }),
    customerGroupUpsert: (config: Omit<CustomerGroupUpsertLoaderConfig, 'adapterCode'>): CustomerGroupUpsertLoaderConfig => ({ ...config, adapterCode: 'customerGroupUpsert' }),
    stockLocationUpsert: (config: Omit<StockLocationUpsertLoaderConfig, 'adapterCode'>): StockLocationUpsertLoaderConfig => ({ ...config, adapterCode: 'stockLocationUpsert' }),
    inventoryAdjust: (config: Omit<InventoryAdjustLoaderConfig, 'adapterCode'>): InventoryAdjustLoaderConfig => ({ ...config, adapterCode: 'inventoryAdjust' }),
    entityDeletion: (config: Omit<EntityDeletionLoaderConfig, 'adapterCode'>): EntityDeletionLoaderConfig => ({ ...config, adapterCode: 'entityDeletion' }),
    custom: <T extends Record<string, unknown>>(adapterCode: string, config: T): GenericLoaderConfig => ({ ...config, adapterCode }),
} satisfies LoaderFactories;

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

// ============================================================================
// Capability Derivation
// ============================================================================

/**
 * Derive pipeline capabilities (required permissions and write domains)
 * from an array of typed step definitions.
 *
 * Inspects each step's adapter code and maps it to the required Vendure
 * permissions and capability domains.
 *
 * @param steps - Array of TypedStep definitions (from the step factory functions)
 * @returns PipelineCapabilities with `requires` and `writes` populated
 */
export function deriveCapabilities(
    steps: readonly PipelineStepDefinition[],
): PipelineCapabilities {
    const requires = new Set<string>();
    const writes = new Set<PipelineCapabilityDomain>();

    for (const step of steps) {
        const adapterCode =
            (step as TypedStepDefinition).__adapterCode ??
            step.adapterCode ??
            (typeof step.config === 'object' && step.config !== null
                ? (step.config as Record<string, unknown>).adapterCode
                : undefined);

        if (typeof adapterCode !== 'string') continue;

        const capability = getLoaderCapabilities(adapterCode, step.config);
        if (!capability) continue;
        capability.requires.forEach(permission => requires.add(permission));
        capability.writes.forEach(domain => writes.add(domain));
    }

    return {
        ...(requires.size > 0 ? { requires: [...requires] } : {}),
        ...(writes.size > 0 ? { writes: [...writes] } : {}),
    };
}
