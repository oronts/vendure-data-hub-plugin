// CORE CONSTANTS - Plugin identifiers and navigation

/**
 * Symbol for injecting DataHub plugin options
 */
export const DATAHUB_PLUGIN_OPTIONS = Symbol('DATAHUB_PLUGIN_OPTIONS');

/**
 * Logger context for DataHub plugin
 */
export const LOGGER_CTX = 'DataHubPlugin';

// QUEUE IDENTIFIERS

/**
 * Queue names used by DataHub for job processing
 */
export const QUEUE_NAMES = {
    /** Queue for pipeline run jobs */
    RUN: 'data-hub.run',
    /** Queue for scheduled pipeline jobs */
    SCHEDULE: 'data-hub.schedule',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// Individual exports for convenience
export const DATAHUB_RUN_QUEUE = QUEUE_NAMES.RUN;
export const DATAHUB_SCHEDULE_QUEUE = QUEUE_NAMES.SCHEDULE;

// UI / NAVIGATION CONSTANTS

/**
 * Navigation identifiers for admin UI
 */
export const NAV = {
    /** Unique ID for navigation item */
    ID: 'data-hub-pipelines',
    /** Navigation section name */
    SECTION: 'data-hub',
    /** Base route for DataHub pages */
    ROUTE_BASE: '/data-hub/pipelines',
} as const;

// Individual exports for convenience
export const DATAHUB_NAV_ID = NAV.ID;
export const DATAHUB_NAV_SECTION = NAV.SECTION;
export const DATAHUB_ROUTE_BASE = NAV.ROUTE_BASE;

// LOGGER CONTEXT CONSTANTS

/**
 * Logger context identifiers for services, loaders, extractors, and handlers
 * Provides consistent naming for log messages across the plugin
 */
export const LOGGER_CONTEXTS = {
    // Services
    PIPELINE_SERVICE: 'PipelineService',
    PIPELINE_RUNNER: 'PipelineRunner',
    CONNECTION_SERVICE: 'ConnectionService',
    SECRET_SERVICE: 'SecretService',
    HOOK_SERVICE: 'HookService',
    ANALYTICS_SERVICE: 'AnalyticsService',
    WEBHOOK_RETRY: 'WebhookRetry',
    FEED_GENERATOR_SERVICE: 'FeedGeneratorService',
    EXECUTION_LOGGER: 'ExecutionLogger',
    RECORD_ERROR_SERVICE: 'RecordErrorService',
    DOMAIN_EVENTS_SERVICE: 'DomainEventsService',

    // Extractors
    HTTP_API_EXTRACTOR: 'HttpApiExtractor',
    WEBHOOK_EXTRACTOR: 'WebhookExtractor',
    VENDURE_QUERY_EXTRACTOR: 'VendureQueryExtractor',
    FILE_EXTRACTOR: 'FileExtractor',
    FTP_EXTRACTOR: 'FtpExtractor',
    DATABASE_EXTRACTOR: 'DatabaseExtractor',
    S3_EXTRACTOR: 'S3Extractor',
    GRAPHQL_EXTRACTOR: 'GraphQLExtractor',
    EXTRACTOR_REGISTRY: 'ExtractorRegistry',

    // Loaders
    PRODUCT_LOADER: 'ProductLoader',
    PRODUCT_VARIANT_LOADER: 'ProductVariantLoader',
    CUSTOMER_LOADER: 'CustomerLoader',
    CUSTOMER_GROUP_LOADER: 'CustomerGroupLoader',
    ORDER_LOADER: 'OrderLoader',
    COLLECTION_LOADER: 'CollectionLoader',
    ASSET_LOADER: 'AssetLoader',
    FACET_LOADER: 'FacetLoader',
    FACET_VALUE_LOADER: 'FacetValueLoader',
    INVENTORY_LOADER: 'InventoryLoader',
    STOCK_LOCATION_LOADER: 'StockLocationLoader',
    SHIPPING_METHOD_LOADER: 'ShippingMethodLoader',
    PROMOTION_LOADER: 'PromotionLoader',
    TAX_RATE_LOADER: 'TaxRateLoader',
    PAYMENT_METHOD_LOADER: 'PaymentMethodLoader',
    CHANNEL_LOADER: 'ChannelLoader',
    LOADER_REGISTRY: 'LoaderRegistry',

    // Handlers
    RUN_QUEUE_HANDLER: 'RunQueueHandler',
    SCHEDULE_HANDLER: 'ScheduleHandler',

    // Runtime Executors
    ADAPTER_RUNTIME: 'AdapterRuntime',
    EXTRACT_EXECUTOR: 'ExtractExecutor',
    TRANSFORM_EXECUTOR: 'TransformExecutor',
    LOAD_EXECUTOR: 'LoadExecutor',
    EXPORT_EXECUTOR: 'ExportExecutor',
    SINK_EXECUTOR: 'SinkExecutor',
    FEED_EXECUTOR: 'FeedExecutor',

    // Bootstrap
    BOOTSTRAP: 'DataHub:Bootstrap',

    // Storage & Retention
    RETENTION_SERVICE: 'RetentionService',
    FILE_STORAGE_SERVICE: 'FileStorageService',

    // Validation
    DEFINITION_VALIDATOR: 'DefinitionValidator',

    // Event Services
    EVENT_TRIGGER_SERVICE: 'EventTriggerService',

    // Rate Limiting & Webhooks
    RATE_LIMIT: 'RateLimitService',
    WEBHOOK: 'WebhookController',
} as const;

export type LoggerContext = typeof LOGGER_CONTEXTS[keyof typeof LOGGER_CONTEXTS];
