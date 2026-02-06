/**
 * Adapter Code Constants
 *
 * Centralized constants for adapter codes used throughout the DataHub plugin.
 */

/** Extractor adapter codes */
export const EXTRACTOR_CODE = {
    HTTP_API: 'httpApi',
    DATABASE: 'database',
    FILE: 'file',
    S3: 's3',
    FTP: 'ftp',
    GRAPHQL: 'graphql',
    VENDURE_QUERY: 'vendureQuery',
    WEBHOOK: 'webhook',
    CSV: 'csv',
    JSON: 'json',
    XML: 'xml',
    IN_MEMORY: 'inMemory',
    GENERATOR: 'generator',
} as const;

/** Type representing valid extractor adapter codes */
export type ExtractorCode = typeof EXTRACTOR_CODE[keyof typeof EXTRACTOR_CODE];

/** Loader adapter codes */
export const LOADER_CODE = {
    PRODUCT_UPSERT: 'productUpsert',
    VARIANT_UPSERT: 'variantUpsert',
    CUSTOMER_UPSERT: 'customerUpsert',
    ORDER_NOTE: 'orderNote',
    STOCK_ADJUST: 'stockAdjust',
    APPLY_COUPON: 'applyCoupon',
    COLLECTION_UPSERT: 'collectionUpsert',
    PROMOTION_UPSERT: 'promotionUpsert',
    ASSET_ATTACH: 'assetAttach',
    ASSET_IMPORT: 'assetImport',
    FACET_UPSERT: 'facetUpsert',
    FACET_VALUE_UPSERT: 'facetValueUpsert',
    ORDER_TRANSITION: 'orderTransition',
    REST_POST: 'restPost',
    TAX_RATE_UPSERT: 'taxRateUpsert',
    PAYMENT_METHOD_UPSERT: 'paymentMethodUpsert',
    CHANNEL_UPSERT: 'channelUpsert',
} as const;

/** Type representing valid loader adapter codes */
export type LoaderCode = typeof LOADER_CODE[keyof typeof LOADER_CODE];

/** Exporter adapter codes */
export const EXPORTER_CODE = {
    CSV: 'csvExport',
    JSON: 'jsonExport',
    XML: 'xmlExport',
    XLSX: 'xlsxExport',
    PARQUET: 'parquetExport',
    REST_POST: 'restPost',
    WEBHOOK: 'webhookExport',
} as const;

/** Type representing valid exporter adapter codes */
export type ExporterCode = typeof EXPORTER_CODE[keyof typeof EXPORTER_CODE];
