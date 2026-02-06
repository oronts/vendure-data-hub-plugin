import {
    BaseConnectorConfig,
    ConnectorConnectionConfig,
    ConnectorSyncConfig,
    ConnectorMappingConfig,
    ConnectorPipelineConfig,
} from '../types';

/**
 * Pimcore DataHub connection configuration
 */
export interface PimcoreConnectionConfig extends ConnectorConnectionConfig {
    /** Pimcore DataHub GraphQL endpoint */
    endpoint: string;
    /** API key for authentication */
    apiKey?: string;
    /** Secret code for API key (reference to DataHub secret) */
    apiKeySecretCode?: string;
    /** Workspace/configuration name in Pimcore DataHub */
    workspace?: string;
}

/**
 * Pimcore-specific sync configuration
 */
export interface PimcoreSyncConfig extends ConnectorSyncConfig {
    /** Pimcore class names to sync (e.g., ['Product', 'Category']) */
    classNames?: string[];
    /** Include unpublished objects */
    includeUnpublished?: boolean;
    /** Include variants */
    includeVariants?: boolean;
    /** Object path filter (e.g., '/Products/B2C/') */
    pathFilter?: string;
    /** Modified since timestamp for delta sync */
    modifiedSince?: string;
}

/**
 * Pimcore to Vendure field mapping configuration
 */
export interface PimcoreMappingConfig extends ConnectorMappingConfig {
    /** Product field mappings */
    product?: {
        /** SKU field in Pimcore (default: 'sku' or 'itemNumber') */
        skuField?: string;
        /** Name field in Pimcore (default: 'name') */
        nameField?: string;
        /** Slug field in Pimcore (default: 'slug' or 'urlKey') */
        slugField?: string;
        /** Description field in Pimcore (default: 'description') */
        descriptionField?: string;
        /** Assets relation field (default: 'images' or 'assets') */
        assetsField?: string;
        /** Categories relation field (default: 'categories') */
        categoriesField?: string;
        /** Variants relation field (default: 'variants') */
        variantsField?: string;
        /** Published/enabled field (default: 'published') */
        enabledField?: string;
        /** Custom field mappings */
        customFields?: Record<string, string>;
    };
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
    asset?: {
        /** Asset URL field (default: 'fullPath' or 'url') */
        urlField?: string;
        /** Alt text field (default: 'alt' or 'title') */
        altField?: string;
        /** Filename field (default: 'filename') */
        filenameField?: string;
    };
}

/**
 * Pipeline-specific configurations
 */
export interface PimcorePipelineConfigs {
    /** Product sync pipeline config */
    productSync?: ConnectorPipelineConfig & {
        /** Include product assets */
        syncAssets?: boolean;
        /** Include product categories */
        syncCategories?: boolean;
        /** Include variants */
        syncVariants?: boolean;
        /** Delete products not in Pimcore */
        deleteOrphans?: boolean;
    };
    /** Category sync pipeline config */
    categorySync?: ConnectorPipelineConfig & {
        /** Max depth of category tree */
        maxDepth?: number;
        /** Root category path in Pimcore */
        rootPath?: string;
    };
    /** Asset sync pipeline config */
    assetSync?: ConnectorPipelineConfig & {
        /** Asset folder path in Pimcore */
        folderPath?: string;
        /** Supported mime types */
        mimeTypes?: string[];
    };
    /** Facet sync pipeline config */
    facetSync?: ConnectorPipelineConfig & {
        /** Attribute groups to sync as facets */
        attributeGroups?: string[];
    };
}

/**
 * Complete Pimcore connector configuration
 */
export interface PimcoreConnectorConfig extends BaseConnectorConfig {
    /** Connection settings */
    connection: PimcoreConnectionConfig;
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
    /** Supported languages for translations */
    languages?: string[];
}

/**
 * Pimcore object listing response
 */
export interface PimcoreObjectListing<T = PimcoreObject> {
    totalCount: number;
    edges: Array<{
        node: T;
        cursor?: string;
    }>;
    pageInfo?: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor?: string;
        endCursor?: string;
    };
}

/**
 * Base Pimcore object
 */
export interface PimcoreObject {
    id: string | number;
    key: string;
    path: string;
    fullPath: string;
    classname?: string;
    published?: boolean;
    creationDate?: number;
    modificationDate?: number;
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
    fullPath: string;
    path: string;
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
    fullPath?: string;
    classname?: string;
    [key: string]: unknown;
}

/**
 * Pimcore asset relation
 */
export interface PimcoreAssetRelation {
    id: string | number;
    filename?: string;
    fullPath?: string;
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
