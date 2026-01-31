import { JsonObject, JsonValue } from '../types/index';
import { AuthType, LoadStrategy } from '../constants/index';

export interface BaseStepConfig {
    /** Adapter code identifying the operation */
    adapterCode?: string;
}

export interface CsvExtractorConfig extends BaseStepConfig {
    adapterCode: 'csv';
    /** Raw CSV text content */
    csvText?: string;
    /** Pre-parsed rows */
    rows?: JsonValue[][];
    /** Path to CSV file */
    csvPath?: string;
    /** Field delimiter */
    delimiter?: string;
    /** Whether first row is header */
    hasHeader?: boolean;
}

export interface GraphqlExtractorConfig extends BaseStepConfig {
    adapterCode: 'graphql';
    /** GraphQL endpoint URL */
    endpoint: string;
    /** GraphQL query string */
    query: string;
    /** Query variables */
    variables?: Record<string, JsonValue>;
    /** Request headers */
    headers?: Record<string, string>;
    /** JSON path to items array */
    itemsField?: string;
    /** JSON path to edges array */
    edgesField?: string;
    /** Node field name within edges */
    nodeField?: string;
    /** Cursor variable name */
    cursorVar?: string;
    /** JSON path to next cursor */
    nextCursorField?: string;
    /** JSON path to page info */
    pageInfoField?: string;
    /** JSON path to hasNextPage */
    hasNextPageField?: string;
    /** JSON path to endCursor */
    endCursorField?: string;
    /** Auth type */
    auth?: AuthType;
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
}

export interface MapTransformConfig extends BaseStepConfig {
    adapterCode: 'map';
    /** Source to target field mapping */
    mapping: Record<string, string>;
}

export interface WhenTransformConfig extends BaseStepConfig {
    adapterCode: 'when';
    /** Conditions to evaluate */
    conditions: Array<{
        field: string;
        cmp: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';
        value: JsonValue;
    }>;
    /** Action when conditions match */
    action?: 'keep' | 'drop';
}

export interface DeltaFilterConfig extends BaseStepConfig {
    adapterCode: 'deltaFilter';
    /** Path to unique ID field */
    idPath: string;
    /** Fields to include in hash */
    includePaths?: string[];
    /** Fields to exclude from hash */
    excludePaths?: string[];
}

export interface EnrichTransformConfig extends BaseStepConfig {
    adapterCode: 'enrich';
    /** Static values to set */
    set?: Record<string, JsonValue>;
    /** Default values for missing fields */
    defaults?: Record<string, JsonValue>;
}

export interface TemplateTransformConfig extends BaseStepConfig {
    adapterCode: 'template';
    /** Template string with ${field} placeholders */
    template: string;
    /** Target field for result */
    target: string;
    /** Treat missing fields as empty string */
    missingAsEmpty?: boolean;
}

export interface LookupTransformConfig extends BaseStepConfig {
    adapterCode: 'lookup';
    /** Source field path */
    source: string;
    /** Lookup map */
    map: Record<string, JsonValue>;
    /** Target field path */
    target: string;
    /** Default value if not found */
    default?: JsonValue;
}

export interface CurrencyTransformConfig extends BaseStepConfig {
    adapterCode: 'currency';
    /** Source field path */
    source: string;
    /** Target field path */
    target: string;
    /** Decimal places */
    decimals?: number;
    /** Rounding mode */
    round?: 'round' | 'floor' | 'ceil';
}

export interface UnitTransformConfig extends BaseStepConfig {
    adapterCode: 'unit';
    /** Source field path */
    source: string;
    /** Target field path */
    target: string;
    /** From unit */
    from: string;
    /** To unit */
    to: string;
}

export interface SetTransformConfig extends BaseStepConfig {
    adapterCode: 'set';
    /** Field path to set */
    path: string;
    /** Value to set */
    value: JsonValue;
}

export interface RemoveTransformConfig extends BaseStepConfig {
    adapterCode: 'remove';
    /** Field path to remove */
    path: string;
}

export interface RenameTransformConfig extends BaseStepConfig {
    adapterCode: 'rename';
    /** Source field path */
    from: string;
    /** Target field path */
    to: string;
}

export interface AggregateTransformConfig extends BaseStepConfig {
    adapterCode: 'aggregate';
    /** Aggregation operation */
    op: 'count' | 'sum';
    /** Source field for sum */
    source?: string;
    /** Target field for result */
    target: string;
}

export interface BaseLoaderConfig extends BaseStepConfig {
    /** Load strategy */
    strategy?: LoadStrategy;
}

export interface ProductLoaderConfig extends BaseLoaderConfig {
    adapterCode: 'productUpsert';
    /** Field for matching existing products */
    matchField?: 'slug' | 'sku' | 'externalId';
    /** Source field for name */
    nameField?: string;
    /** Source field for slug */
    slugField?: string;
    /** Source field for description */
    descriptionField?: string;
    /** Source field for SKU */
    skuField?: string;
    /** Source field for price */
    priceField?: string;
    /** Whether to track inventory */
    trackInventory?: boolean;
}

export interface VariantLoaderConfig extends BaseLoaderConfig {
    adapterCode: 'variantUpsert';
    /** Field for matching existing variants */
    matchField?: 'sku' | 'externalId';
    /** Source field for product ID */
    productIdField?: string;
    /** Source field for SKU */
    skuField?: string;
    /** Source field for name */
    nameField?: string;
    /** Source field for price */
    priceField?: string;
    /** Source field for stock */
    stockField?: string;
    /** Whether to track inventory */
    trackInventory?: boolean;
}

export interface CustomerLoaderConfig extends BaseLoaderConfig {
    adapterCode: 'customerUpsert';
    /** Field for matching existing customers */
    matchField?: 'email' | 'externalId';
    /** Source field for email */
    emailField?: string;
    /** Source field for first name */
    firstNameField?: string;
    /** Source field for last name */
    lastNameField?: string;
    /** Source field for phone */
    phoneField?: string;
}

export interface StockAdjustConfig extends BaseLoaderConfig {
    adapterCode: 'stockAdjust';
    /** Source field for SKU */
    skuField?: string;
    /** Source field for quantity delta */
    quantityField?: string;
    /** Stock location ID */
    locationId?: string;
}

export interface RestPostLoaderConfig extends BaseLoaderConfig {
    adapterCode: 'restPost';
    /** Target endpoint URL */
    endpoint: string;
    /** Request headers */
    headers?: Record<string, string>;
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
    /** Batch size for chunking */
    batchSize?: number;
}

export interface CsvExportConfig extends BaseStepConfig {
    adapterCode: 'csvExport';
    /** Output file path */
    path?: string;
    outputPath?: string;
    /** Field delimiter */
    delimiter?: string;
    /** Include header row */
    includeHeader?: boolean;
    /** Fields to include */
    fields?: string[];
    /** Fields to exclude */
    excludeFields?: string[];
    /** Field mapping */
    fieldMapping?: Record<string, string>;
}

export interface JsonExportConfig extends BaseStepConfig {
    adapterCode: 'jsonExport';
    /** Output file path */
    path?: string;
    outputPath?: string;
    /** Output format */
    format?: 'json' | 'ndjson' | 'jsonl';
    /** Pretty print output */
    pretty?: boolean;
    /** Fields to include */
    fields?: string[];
    /** Fields to exclude */
    excludeFields?: string[];
    /** Field mapping */
    fieldMapping?: Record<string, string>;
}

export interface XmlExportConfig extends BaseStepConfig {
    adapterCode: 'xmlExport';
    /** Output file path */
    path?: string;
    outputPath?: string;
    /** Root element name */
    rootElement?: string;
    /** Item element name */
    itemElement?: string;
    /** Include XML declaration */
    declaration?: boolean;
}

export interface WebhookExportConfig extends BaseStepConfig {
    adapterCode: 'webhookExport' | 'restPost';
    /** Target endpoint URL */
    endpoint?: string;
    url?: string;
    /** HTTP method */
    method?: 'POST' | 'PUT';
    /** Request headers */
    headers?: Record<string, string>;
    /** Bearer token secret code */
    bearerTokenSecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
    /** Batch size for chunking */
    batchSize?: number;
}

export interface BaseFeedConfig extends BaseStepConfig {
    /** Output file path */
    outputPath?: string;
    /** Field for product title */
    titleField?: string;
    /** Field for description */
    descriptionField?: string;
    /** Field for price */
    priceField?: string;
    /** Field for image URL */
    imageField?: string;
    /** Field for product link */
    linkField?: string;
    /** Field for brand */
    brandField?: string;
    /** Field for GTIN/barcode */
    gtinField?: string;
    /** Field for availability status */
    availabilityField?: string;
    /** Currency code */
    currency?: string;
    /** Alias for currency (for compatibility) */
    currencyCode?: string;
    /** Channel ID for feed context */
    channelId?: string;
    /** Language code for translations */
    languageCode?: string;
}

export interface GoogleMerchantFeedConfig extends BaseFeedConfig {
    adapterCode: 'googleMerchant';
    /** Shop URL for feed */
    shopUrl?: string;
}

export interface MetaCatalogFeedConfig extends BaseFeedConfig {
    adapterCode: 'metaCatalog';
}

export interface AmazonFeedConfig extends BaseFeedConfig {
    adapterCode: 'amazonFeed';
}

export interface CustomFeedConfig extends BaseFeedConfig {
    adapterCode: 'customFeed';
    /** Output format */
    format?: 'json' | 'csv' | 'tsv' | 'xml';
    /** Custom field mappings */
    customFields?: Record<string, string>;
}

export interface BaseSinkConfig extends BaseStepConfig {
    /** Index/collection name */
    indexName?: string;
    /** Field containing document ID */
    idField?: string;
    /** Bulk indexing batch size */
    bulkSize?: number;
    /** Fields to include */
    fields?: string[];
    /** Fields to exclude */
    excludeFields?: string[];
}

export interface MeilisearchSinkConfig extends BaseSinkConfig {
    adapterCode: 'meilisearch';
    /** MeiliSearch host URL */
    host?: string;
    /** API key secret code */
    apiKeySecretCode?: string;
    /** Primary key field */
    primaryKey?: string;
}

export interface ElasticsearchSinkConfig extends BaseSinkConfig {
    adapterCode: 'elasticsearch' | 'opensearch';
    /** Host URLs */
    hosts?: string[];
    host?: string;
    /** API key secret code */
    apiKeySecretCode?: string;
    /** Basic auth secret code */
    basicSecretCode?: string;
}

export interface AlgoliaSinkConfig extends BaseSinkConfig {
    adapterCode: 'algolia';
    /** Algolia application ID */
    applicationId: string;
    /** API key secret code */
    apiKeySecretCode: string;
}

export interface TypesenseSinkConfig extends BaseSinkConfig {
    adapterCode: 'typesense';
    /** Typesense host URL */
    host?: string;
    /** API key secret code */
    apiKeySecretCode?: string;
    /** Collection name */
    collectionName?: string;
}

export interface ValidateConfig extends BaseStepConfig {
    /** Schema ID to validate against */
    schemaId?: string;
    /** Validation mode */
    mode?: 'fail-fast' | 'accumulate';
}

export interface RouteConfig extends BaseStepConfig {
    /** Routing branches */
    branches: Array<{
        name: string;
        when: Array<{
            field: string;
            cmp: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';
            value: JsonValue;
        }>;
    }>;
}

export type ExtractorConfig = CsvExtractorConfig | GraphqlExtractorConfig;

export type TransformConfig =
    | MapTransformConfig
    | WhenTransformConfig
    | DeltaFilterConfig
    | EnrichTransformConfig
    | TemplateTransformConfig
    | LookupTransformConfig
    | CurrencyTransformConfig
    | UnitTransformConfig
    | SetTransformConfig
    | RemoveTransformConfig
    | RenameTransformConfig
    | AggregateTransformConfig;

export type LoaderConfig =
    | ProductLoaderConfig
    | VariantLoaderConfig
    | CustomerLoaderConfig
    | StockAdjustConfig
    | RestPostLoaderConfig;

export type ExportConfig = CsvExportConfig | JsonExportConfig | XmlExportConfig | WebhookExportConfig;

export type FeedConfig = GoogleMerchantFeedConfig | MetaCatalogFeedConfig | AmazonFeedConfig | CustomFeedConfig;

export type SinkConfig = MeilisearchSinkConfig | ElasticsearchSinkConfig | AlgoliaSinkConfig | TypesenseSinkConfig;

export type StepConfig =
    | ExtractorConfig
    | TransformConfig
    | LoaderConfig
    | ExportConfig
    | FeedConfig
    | SinkConfig
    | ValidateConfig
    | RouteConfig
    | BaseStepConfig;
