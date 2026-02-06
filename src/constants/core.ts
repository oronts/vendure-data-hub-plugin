/**
 * Symbol for injecting DataHub plugin options
 */
export const DATAHUB_PLUGIN_OPTIONS = Symbol('DATAHUB_PLUGIN_OPTIONS');

/**
 * Logger context for DataHub plugin
 */
export const LOGGER_CTX = 'DataHubPlugin';

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

/**
 * Logger context identifiers for services, loaders, extractors, and handlers
 * Consistent naming for log messages across the plugin
 */
export const LOGGER_CONTEXTS = {
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
    HTTP_API_EXTRACTOR: 'HttpApiExtractor',
    WEBHOOK_EXTRACTOR: 'WebhookExtractor',
    VENDURE_QUERY_EXTRACTOR: 'VendureQueryExtractor',
    FILE_EXTRACTOR: 'FileExtractor',
    FTP_EXTRACTOR: 'FtpExtractor',
    DATABASE_EXTRACTOR: 'DatabaseExtractor',
    S3_EXTRACTOR: 'S3Extractor',
    GRAPHQL_EXTRACTOR: 'GraphQLExtractor',
    EXTRACTOR_REGISTRY: 'ExtractorRegistry',
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
    RUN_QUEUE_HANDLER: 'RunQueueHandler',
    SCHEDULE_HANDLER: 'ScheduleHandler',
    ADAPTER_RUNTIME: 'AdapterRuntime',
    EXTRACT_EXECUTOR: 'ExtractExecutor',
    TRANSFORM_EXECUTOR: 'TransformExecutor',
    LOAD_EXECUTOR: 'LoadExecutor',
    EXPORT_EXECUTOR: 'ExportExecutor',
    SINK_EXECUTOR: 'SinkExecutor',
    FEED_EXECUTOR: 'FeedExecutor',
    BOOTSTRAP: 'DataHub:Bootstrap',
    RETENTION_SERVICE: 'RetentionService',
    FILE_STORAGE_SERVICE: 'FileStorageService',
    DEFINITION_VALIDATOR: 'DefinitionValidator',
    EVENT_TRIGGER_SERVICE: 'EventTriggerService',
    MESSAGE_CONSUMER: 'MessageConsumerService',
    RATE_LIMIT: 'RateLimitService',
    WEBHOOK: 'WebhookController',
    EXPORT_DESTINATION: 'ExportDestinationService',
    FILE_UPLOAD_CONTROLLER: 'FileUploadController',
    PIPELINE_LOG_SERVICE: 'PipelineLogService',
    CONFIG_SYNC: 'ConfigSync',
    JOB_PROCESSOR: 'JobProcessor',
    FTP_HANDLER: 'FtpHandler',
    DELIVERY_UTILS: 'DeliveryUtils',
    EMAIL_HANDLER: 'EmailHandler',
    RABBITMQ_ADAPTER: 'RabbitMQAdapter',
    ERROR_RESOLVER: 'ErrorResolver',
    QUEUE_RESOLVER: 'QueueResolver',
    FEED_RESOLVER: 'FeedResolver',
    LOOKUP_TRANSFORMS: 'LookupTransforms',
    DEFINITION_VALIDATION_SERVICE: 'DefinitionValidationService',
    CIRCUIT_BREAKER: 'CircuitBreaker',
} as const;

export type LoggerContext = typeof LOGGER_CONTEXTS[keyof typeof LOGGER_CONTEXTS];
