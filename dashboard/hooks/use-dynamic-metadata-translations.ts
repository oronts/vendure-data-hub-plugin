import { useLingui } from '@lingui/react';

const BUILT_IN_IMPORT_TEMPLATE_IDS = new Set([
    'simple-products-csv',
    'products-with-variants-csv',
    'shopify-products-csv',
    'woocommerce-products-csv',
    'price-update-csv',
    'simple-customers-csv',
    'customers-with-addresses-csv',
    'stock-update-csv',
    'multi-location-inventory-csv',
    'collections-csv',
    'facets-csv',
    'coupons-csv',
    'api-product-sync',
    'json-product-import',
    'magento-product-csv',
    'xml-product-feed',
    'erp-inventory-sync',
    'customer-crm-sync',
]);

const BUILT_IN_EXPORT_TEMPLATE_IDS = new Set([
    'product-xml-feed',
    'product-csv-export',
    'product-json-export',
    'order-analytics-csv',
    'order-csv-export',
    'customer-export-gdpr',
    'customer-csv-export',
    'pimcore-product-export',
]);

const BUILT_IN_IMPORT_CATEGORY_IDS = new Set([
    'products',
    'customers',
    'inventory',
    'orders',
    'promotions',
    'catalog',
]);

const BUILT_IN_ENTITY_IDS = new Set([
    'product',
    'product-variant',
    'customer',
    'customer-group',
    'order',
    'collection',
    'facet',
    'facet-value',
    'promotion',
    'asset',
    'shipping-method',
    'payment-method',
    'tax-rate',
    'channel',
    'stock-location',
    'inventory',
]);

export type DynamicMetadataField = 'name' | 'description';
export type DynamicMetadataTranslator = (id: string) => string;

export function translateKnownMetadata(
    translate: DynamicMetadataTranslator,
    namespace: string,
    identity: string,
    field: DynamicMetadataField,
    fallback: string,
    known: boolean,
): string {
    if (!known) return fallback;
    const translationId = `dataHubMetadata.${namespace}.${identity}.${field}`;
    const translated = translate(translationId);
    return translated === translationId ? fallback : translated;
}

export function useDynamicMetadataTranslations() {
    const { i18n } = useLingui();
    const translate = (id: string) => i18n.t(id);

    const translateImportTemplate = (
        id: string,
        field: DynamicMetadataField,
        fallback: string,
    ) => translateKnownMetadata(
        translate,
        'importTemplate',
        id,
        field,
        fallback,
        BUILT_IN_IMPORT_TEMPLATE_IDS.has(id),
    );
    const translateExportTemplate = (
        id: string,
        field: DynamicMetadataField,
        fallback: string,
    ) => translateKnownMetadata(
        translate,
        'exportTemplate',
        id,
        field,
        fallback,
        BUILT_IN_EXPORT_TEMPLATE_IDS.has(id),
    );
    const translateImportCategory = (
        id: string,
        field: DynamicMetadataField,
        fallback: string,
    ) => translateKnownMetadata(
        translate,
        'importCategory',
        id,
        field,
        fallback,
        BUILT_IN_IMPORT_CATEGORY_IDS.has(id),
    );
    const translateEntity = (
        id: string,
        field: DynamicMetadataField,
        fallback: string,
    ) => translateKnownMetadata(
        translate,
        'entity',
        id,
        field,
        fallback,
        BUILT_IN_ENTITY_IDS.has(id),
    );
    const translateAdapter = (
        type: string,
        code: string,
        field: DynamicMetadataField,
        fallback: string,
        builtIn: boolean,
    ) => translateKnownMetadata(
        translate,
        'adapter',
        `${type}:${code}`,
        field,
        fallback,
        builtIn,
    );

    return {
        translateAdapter,
        translateEntity,
        translateExportTemplate,
        translateImportCategory,
        translateImportTemplate,
    };
}
