import type { PipelineCapabilityDomain } from '../../shared/types';
import type { LoaderCode } from './loader-configs';

export interface LoaderCapabilities {
    readonly requires: readonly string[];
    readonly writes: readonly PipelineCapabilityDomain[];
}

interface LoaderCapabilityMetadata {
    readonly permission: string;
    readonly domain: PipelineCapabilityDomain;
}

const LOADER_CAPABILITIES = {
    productUpsert: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    variantUpsert: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    customerUpsert: { permission: 'UpdateCustomer', domain: 'CUSTOMERS' },
    orderUpsert: { permission: 'UpdateOrder', domain: 'ORDERS' },
    orderNote: { permission: 'UpdateOrder', domain: 'ORDERS' },
    stockAdjust: { permission: 'UpdateCatalog', domain: 'INVENTORY' },
    applyCoupon: { permission: 'UpdateOrder', domain: 'ORDERS' },
    collectionUpsert: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    promotionUpsert: { permission: 'UpdatePromotion', domain: 'PROMOTIONS' },
    orderTransition: { permission: 'UpdateOrder', domain: 'ORDERS' },
    assetAttach: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    assetImport: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    facetUpsert: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    facetValueUpsert: { permission: 'UpdateCatalog', domain: 'CATALOG' },
    restPost: { permission: 'UpdateDataHubSettings', domain: 'CUSTOM' },
    graphqlMutation: { permission: 'UpdateDataHubSettings', domain: 'CUSTOM' },
    taxRateUpsert: { permission: 'UpdateSettings', domain: 'CUSTOM' },
    paymentMethodUpsert: { permission: 'UpdateSettings', domain: 'CUSTOM' },
    channelUpsert: { permission: 'UpdateSettings', domain: 'CUSTOM' },
    shippingMethodUpsert: { permission: 'UpdateShippingMethod', domain: 'CUSTOM' },
    customerGroupUpsert: { permission: 'UpdateCustomer', domain: 'CUSTOMERS' },
    stockLocationUpsert: { permission: 'UpdateCatalog', domain: 'INVENTORY' },
    inventoryAdjust: { permission: 'UpdateCatalog', domain: 'INVENTORY' },
    entityDeletion: { permission: 'UpdateCatalog', domain: 'CATALOG' },
} as const satisfies Record<LoaderCode, LoaderCapabilityMetadata>;

const DELETION_CAPABILITIES = {
    product: LOADER_CAPABILITIES.productUpsert,
    variant: LOADER_CAPABILITIES.variantUpsert,
    collection: LOADER_CAPABILITIES.collectionUpsert,
    promotion: LOADER_CAPABILITIES.promotionUpsert,
    'shipping-method': LOADER_CAPABILITIES.shippingMethodUpsert,
    customer: LOADER_CAPABILITIES.customerUpsert,
    'payment-method': LOADER_CAPABILITIES.paymentMethodUpsert,
    facet: LOADER_CAPABILITIES.facetUpsert,
    'facet-value': LOADER_CAPABILITIES.facetValueUpsert,
    'customer-group': LOADER_CAPABILITIES.customerGroupUpsert,
    'tax-rate': LOADER_CAPABILITIES.taxRateUpsert,
    asset: LOADER_CAPABILITIES.assetImport,
    'stock-location': LOADER_CAPABILITIES.stockLocationUpsert,
} as const;

function isLoaderCode(adapterCode: string): adapterCode is LoaderCode {
    return Object.prototype.hasOwnProperty.call(LOADER_CAPABILITIES, adapterCode);
}

function getConfigRecord(config: unknown): Record<string, unknown> {
    return typeof config === 'object' && config !== null
        ? config as Record<string, unknown>
        : {};
}

function getDeletionCapability(config: Record<string, unknown>): LoaderCapabilityMetadata {
    const entityType = typeof config.entityType === 'string'
        ? config.entityType
        : 'product';
    return Object.prototype.hasOwnProperty.call(DELETION_CAPABILITIES, entityType)
        ? DELETION_CAPABILITIES[entityType as keyof typeof DELETION_CAPABILITIES]
        : LOADER_CAPABILITIES.entityDeletion;
}

export function getLoaderCapabilities(
    adapterCode: string,
    config?: unknown,
): LoaderCapabilities | undefined {
    if (!isLoaderCode(adapterCode)) return undefined;

    const configRecord = getConfigRecord(config);
    const capability = adapterCode === 'entityDeletion'
        ? getDeletionCapability(configRecord)
        : LOADER_CAPABILITIES[adapterCode];
    const writes = new Set<PipelineCapabilityDomain>([capability.domain]);

    if (
        (adapterCode === 'productUpsert' || adapterCode === 'variantUpsert')
        && (
            typeof configRecord.stockField === 'string'
            || typeof configRecord.stockByLocationField === 'string'
        )
    ) {
        writes.add('INVENTORY');
    }

    return {
        requires: [capability.permission],
        writes: [...writes],
    };
}
