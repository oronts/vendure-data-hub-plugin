import {
    BaseConnectorConfig,
    ConnectorPipelineConfig,
} from '../types';

/**
 * Pimcore-specific sync configuration
 */
export interface PimcoreSyncConfig {
    /** Enable delta filtering of unchanged records */
    deltaSync?: boolean;
    /** Records requested per page */
    batchSize?: number;
    /** Maximum pages fetched per pipeline run */
    maxPages?: number;
    /** Include unpublished objects */
    includeUnpublished?: boolean;
    /** Include variants */
    includeVariants?: boolean;
    /** Object path filter (e.g., '/Products/B2C/') */
    pathFilter?: string;
}

/**
 * Pimcore to Vendure field mapping configuration
 */
export interface PimcoreProductMappingConfig {
    /** SKU field in Pimcore (default: 'sku' or 'itemNumber') */
    skuField?: string;
    /** Name field in Pimcore (default: 'name') */
    nameField?: string;
    /** Slug field in Pimcore (default: 'slug' or 'urlKey') */
    slugField?: string;
    /** Description field in Pimcore (default: 'description') */
    descriptionField?: string;
    /** Variants relation field (default: 'variants') */
    variantsField?: string;
    /** Variant/default-product price field (default: 'price') */
    priceField?: string;
    /** Variant stock quantity field (default: 'stockQuantity') */
    stockQuantityField?: string;
    /** Published/enabled field (default: 'published') */
    enabledField?: string;
}

export interface PimcoreProductTransformMappingConfig extends PimcoreProductMappingConfig {
    /** Assets relation field used by transformProduct */
    assetsField?: string;
    /** Vendure custom field to Pimcore source path mappings used by transformProduct */
    customFields?: Record<string, string>;
}

export interface PimcoreAssetMappingConfig {
    /** Asset URL field (default: 'fullpath') */
    urlField?: string;
    /** Filename field (default: 'filename') */
    filenameField?: string;
}

export interface PimcoreAssetTransformMappingConfig extends PimcoreAssetMappingConfig {
    /** Alt text field used by transformAsset */
    altField?: string;
}

export interface PimcoreMappingConfig {
    /** Product field mappings */
    product?: PimcoreProductMappingConfig;
    /** Category field mappings */
    category?: {
        /** Name field (default: 'name') */
        nameField?: string;
        /** Slug field (default: 'slug' or 'key') */
        slugField?: string;
        /** Description field (default: 'description') */
        descriptionField?: string;
        /** Parent relation field (default: 'parent') */
        parentField?: string;
        /** Position/sort order field (default: 'position') */
        positionField?: string;
    };
    /** Asset field mappings */
    asset?: PimcoreAssetMappingConfig;
}

type PimcorePipelineConfig = Pick<ConnectorPipelineConfig, 'enabled' | 'name' | 'schedule'>;

/**
 * Pipeline-specific configurations
 */
export interface PimcorePipelineConfigs {
    /** Product sync pipeline config */
    productSync?: PimcorePipelineConfig & {
        /** Include variants */
        syncVariants?: boolean;
    };
    /** Category sync pipeline config */
    categorySync?: PimcorePipelineConfig & {
        /** Root category path in Pimcore */
        rootPath?: string;
    };
    /** Asset sync pipeline config */
    assetSync?: PimcorePipelineConfig & {
        /** Asset folder path in Pimcore */
        folderPath?: string;
        /** Supported mime types */
        mimeTypes?: string[];
    };
}

/**
 * Complete Pimcore connector configuration
 */
export interface PimcoreConnectorConfig extends BaseConnectorConfig {
    /** Connector instances are identified by their registered connector code. */
    instanceId?: never;
    /** Enable or disable individual generated pipelines through pipelines.*.enabled. */
    enabled?: never;
    /** Connector-level tags are not applied to generated pipelines. */
    tags?: never;
    /** Saved HTTP, REST, or GraphQL connection containing the endpoint and authentication. */
    connectionCode: string;
    /** Request timeout in milliseconds. */
    timeoutMs?: number;
    /** Sync settings */
    sync?: PimcoreSyncConfig;
    /** Field mapping settings */
    mapping?: PimcoreMappingConfig;
    /** Pipeline-specific settings */
    pipelines?: PimcorePipelineConfigs;
    /** Vendure channel to sync to (default: '__default_channel__') */
    vendureChannel?: string;
    /** Default language code (default: 'en') */
    defaultLanguage?: string;
}

/**
 * Pimcore object listing response
 */
export interface PimcoreObjectListing<T = PimcoreObject> {
    totalCount: number;
    edges: Array<{
        node: T;
    }>;
}

/**
 * Base Pimcore object
 */
export interface PimcoreObject {
    id: string | number;
    key: string;
    path?: string;
    fullpath: string;
    classname?: string;
    published?: boolean;
    creationDate?: string;
    modificationDate?: string;
    index?: number;
}

/**
 * Pimcore product object
 */
export interface PimcoreProduct extends PimcoreObject {
    sku?: string;
    itemNumber?: string;
    name?: string | PimcoreLocalizedField;
    description?: string | PimcoreLocalizedField;
    shortDescription?: string | PimcoreLocalizedField;
    slug?: string | PimcoreLocalizedField;
    urlKey?: string | PimcoreLocalizedField;
    price?: number;
    images?: PimcoreAssetRelation[];
    assets?: PimcoreAssetRelation[];
    categories?: PimcoreObjectRelation[];
    variants?: PimcoreVariant[];
    channels?: string[];
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
}

/**
 * Pimcore variant (child product)
 */
export interface PimcoreVariant extends PimcoreObject {
    sku?: string;
    itemNumber?: string;
    name?: string | PimcoreLocalizedField;
    price?: number;
    stockQuantity?: number;
    options?: Record<string, string>;
    images?: PimcoreAssetRelation[];
    [key: string]: unknown;
}

/**
 * Pimcore category object
 */
export interface PimcoreCategory extends PimcoreObject {
    name?: string | PimcoreLocalizedField;
    description?: string | PimcoreLocalizedField;
    slug?: string | PimcoreLocalizedField;
    parent?: PimcoreObjectRelation;
    children?: PimcoreCategory[];
    image?: PimcoreAssetRelation;
    position?: number;
    [key: string]: unknown;
}

/**
 * Pimcore asset
 */
export interface PimcoreAsset {
    id: string | number;
    filename: string;
    fullpath: string;
    path?: string;
    mimetype?: string;
    filesize?: number;
    width?: number;
    height?: number;
    metadata?: PimcoreAssetMetadata[];
    [key: string]: unknown;
}

/**
 * Pimcore asset metadata
 */
export interface PimcoreAssetMetadata {
    name: string;
    language?: string;
    type: string;
    data: string | number | boolean;
}

/**
 * Pimcore localized field value
 */
export interface PimcoreLocalizedField {
    [languageCode: string]: string | null;
}

/**
 * Pimcore object relation
 */
export interface PimcoreObjectRelation {
    id: string | number;
    key?: string;
    path?: string;
    fullpath?: string;
    classname?: string;
    [key: string]: unknown;
}

/**
 * Pimcore asset relation
 */
export interface PimcoreAssetRelation {
    id: string | number;
    filename?: string;
    fullpath?: string;
    url?: string;
    mimetype?: string;
    metadata?: PimcoreAssetMetadata[];
    [key: string]: unknown;
}

/**
 * Vendure product structure for upsert
 */
export interface VendureProductInput {
    /** External ID from Pimcore */
    externalId: string;
    /** Product name */
    name: string;
    /** URL slug */
    slug: string;
    /** Description */
    description?: string;
    /** Whether product is enabled */
    enabled: boolean;
    /** Asset IDs */
    assetIds?: string[];
    /** Featured asset ID */
    featuredAssetId?: string;
    /** Facet value IDs */
    facetValueIds?: string[];
    /** Custom fields */
    customFields?: Record<string, unknown>;
    /** Translations */
    translations?: Array<{
        languageCode: string;
        name: string;
        slug: string;
        description?: string;
    }>;
}

/**
 * Vendure variant structure for upsert
 */
export interface VendureVariantInput {
    /** External ID from Pimcore */
    externalId: string;
    /** SKU */
    sku: string;
    /** Variant name */
    name: string;
    /** Price in cents */
    price: number;
    /** Whether variant is enabled */
    enabled: boolean;
    /** Stock on hand */
    stockOnHand?: number;
    /** Track inventory */
    trackInventory?: boolean;
    /** Option values */
    options?: Array<{ code: string; value: string }>;
    /** Asset IDs */
    assetIds?: string[];
    /** Custom fields */
    customFields?: Record<string, unknown>;
    /** Translations */
    translations?: Array<{
        languageCode: string;
        name: string;
    }>;
}

/**
 * Vendure category (collection) structure for upsert
 */
export interface VendureCategoryInput {
    /** External ID from Pimcore */
    externalId: string;
    /** Category name */
    name: string;
    /** URL slug */
    slug: string;
    /** Description */
    description?: string;
    /** Parent external ID */
    parentExternalId?: string;
    /** Position/sort order */
    position?: number;
    /** Whether visible */
    isPrivate?: boolean;
    /** Featured asset ID */
    featuredAssetId?: string;
    /** Custom fields */
    customFields?: Record<string, unknown>;
    /** Translations */
    translations?: Array<{
        languageCode: string;
        name: string;
        slug: string;
        description?: string;
    }>;
}
