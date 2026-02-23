/**
 * Typed Pipeline Configuration
 *
 * Type-safe utility functions and namespace objects for building pipeline
 * definitions with compile-time validation. Provides:
 *
 * - Namespace objects (Extractors, Operators, Loaders, Exporters, Feeds) with
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
    type ExcelExtractorConfig,
    type HttpApiExtractorConfig,
    type GraphqlExtractorConfig,
    type VendureQueryExtractorConfig,
    type WebhookExtractorConfig,
    type DatabaseExtractorConfig,
    type CdcExtractorConfig,
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
    type UpdateCatalogLoaders,
    type UpdateCustomerLoaders,
    type UpdateOrderLoaders,
    type UpdatePromotionLoaders,
    type UpdateDataHubSettingsLoaders,
    type LoaderAdapterCode,
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
    CdcExtractorConfig,
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

// ============================================================================
// Step Extras (optional metadata for step definitions)
// ============================================================================

/** Optional metadata to attach to a step definition */
type StepExtras = Partial<Pick<
    PipelineStepDefinition,
    'name' | 'label' | 'description' | 'order' | 'disabled' |
    'parallel' | 'async' | 'concurrency' | 'throughput' |
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
    config: TypedOperatorConfig,
    extras?: StepExtras,
): TypedStep {
    return makeStep(key, 'TRANSFORM', config as Record<string, unknown>, extras);
}

/** Create a typed VALIDATE step definition. */
export function validateStep(
    key: string,
    config: SchemaValidatorConfig,
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

// ============================================================================
// Capability Derivation
// ============================================================================

/** Adapter codes that require UpdateCatalog permission */
const CATALOG_LOADERS: ReadonlySet<string> = new Set<UpdateCatalogLoaders>([
    'productUpsert', 'variantUpsert', 'stockAdjust', 'collectionUpsert', 'assetAttach',
]);

/** Adapter codes that require UpdateCustomer permission */
const CUSTOMER_LOADERS: ReadonlySet<string> = new Set<UpdateCustomerLoaders>([
    'customerUpsert',
]);

/** Adapter codes that require UpdateOrder permission */
const ORDER_LOADERS: ReadonlySet<string> = new Set<UpdateOrderLoaders>([
    'orderNote', 'orderTransition', 'applyCoupon',
]);

/** Adapter codes that require UpdatePromotion permission */
const PROMOTION_LOADERS: ReadonlySet<string> = new Set<UpdatePromotionLoaders>([
    'promotionUpsert',
]);

/** Adapter codes that require UpdateDataHubSettings permission */
const DATAHUB_LOADERS: ReadonlySet<string> = new Set<UpdateDataHubSettingsLoaders>([
    'restPost',
]);

function getPermissionForAdapter(adapterCode: string): string | undefined {
    if (CATALOG_LOADERS.has(adapterCode)) return 'UpdateCatalog';
    if (CUSTOMER_LOADERS.has(adapterCode)) return 'UpdateCustomer';
    if (ORDER_LOADERS.has(adapterCode)) return 'UpdateOrder';
    if (PROMOTION_LOADERS.has(adapterCode)) return 'UpdatePromotion';
    if (DATAHUB_LOADERS.has(adapterCode)) return 'UpdateDataHubSettings';
    return undefined;
}

function getWriteDomain(adapterCode: string): PipelineCapabilityDomain | undefined {
    if (adapterCode === 'stockAdjust') return 'INVENTORY';
    if (CATALOG_LOADERS.has(adapterCode)) return 'CATALOG';
    if (CUSTOMER_LOADERS.has(adapterCode)) return 'CUSTOMERS';
    if (ORDER_LOADERS.has(adapterCode)) return 'ORDERS';
    if (PROMOTION_LOADERS.has(adapterCode)) return 'PROMOTIONS';
    if (DATAHUB_LOADERS.has(adapterCode)) return 'CUSTOM';
    return undefined;
}

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
export function deriveCapabilities(steps: readonly TypedStep[]): PipelineCapabilities {
    const requires = new Set<string>();
    const writes = new Set<PipelineCapabilityDomain>();

    for (const step of steps) {
        const adapterCode =
            (step as TypedStepDefinition).__adapterCode ??
            (typeof step.config === 'object' && step.config !== null
                ? (step.config as Record<string, unknown>).adapterCode
                : undefined);

        if (typeof adapterCode !== 'string') continue;

        const permission = getPermissionForAdapter(adapterCode);
        if (permission) requires.add(permission);

        const domain = getWriteDomain(adapterCode);
        if (domain) writes.add(domain);
    }

    return {
        ...(requires.size > 0 ? { requires: [...requires] } : {}),
        ...(writes.size > 0 ? { writes: [...writes] } : {}),
    };
}
