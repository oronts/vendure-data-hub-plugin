export { DataHubPlugin } from './data-hub.plugin';

export * from './types/index';

export {
    DATAHUB_PERMISSION_DEFINITIONS,
    DataHubPipelinePermission,
    DataHubSecretPermission,
    RunDataHubPipelinePermission,
    ViewDataHubRunsPermission,
    RetryDataHubRecordPermission,
    ManageDataHubAdaptersPermission,
    ManageDataHubConnectionsPermission,
    ViewQuarantinePermission,
    EditQuarantinePermission,
    ReplayRecordPermission,
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
    UpdateDataHubSettingsPermission,
} from './permissions';

export {
    DATAHUB_PLUGIN_OPTIONS,
    LOGGER_CTX,
    QUEUE_NAMES,
    DATAHUB_RUN_QUEUE,
    DATAHUB_SCHEDULE_QUEUE,
    NAV,
    DATAHUB_NAV_ID,
    DATAHUB_NAV_SECTION,
    DATAHUB_ROUTE_BASE,
    RETENTION,
    PAGINATION,
    BATCH,
    SCHEDULER,
    WEBHOOK,
    HTTP,
    RATE_LIMIT,
    FILE_STORAGE,
    TRUNCATION,
    NUMERIC,
    PORTS,
    DOMAIN_EVENTS,
    CONNECTION_POOL,
    METRICS,
    DEFAULTS,
    TIME_UNITS,
    TIME_INTERVALS,
    UI_TIMEOUTS,
    TIME,
    WEIGHT_UNITS,
    LENGTH_UNITS,
    VOLUME_UNITS,
    TEMPERATURE_UNITS,
    UNIT_CONVERSIONS,
    CURRENCY_DECIMALS,
    STEP_ICONS,
    ADAPTER_ICONS,
    STEP_COLORS,
    STATUS_COLORS,
    PIPELINE_STATUS_COLORS,
    NODE_COLORS,
    BRAND_COLORS,
    UI_COLORS,
    DISPLAY_CHARS,
    FILE_SIZE_UNITS,
    FILE_SIZE_BASE,
    SEARCH_SERVICE_URLS,
    EXAMPLE_URLS,
    SERVICE_DEFAULTS,
    FEED_NAMESPACES,
    RSS_VERSIONS,
    CONTENT_TYPES,
    HTTP_HEADERS,
    OAUTH2_GRANT_TYPES,
    BUILTIN_ADAPTERS,
    EXTRACTOR_ADAPTERS,
    OPERATOR_ADAPTERS,
    STRING_OPERATOR_ADAPTERS,
    ARRAY_OPERATOR_ADAPTERS,
    VALUE_OPERATOR_ADAPTERS,
    DATE_OPERATOR_ADAPTERS,
    JSON_OPERATOR_ADAPTERS,
    NUMERIC_OPERATOR_ADAPTERS,
    CONDITIONAL_OPERATOR_ADAPTERS,
    VALIDATION_OPERATOR_ADAPTERS,
    LOADER_ADAPTERS,
    EXPORTER_ADAPTERS,
    FEED_ADAPTERS,
    SINK_ADAPTERS,
} from './constants/index';

export {
    Pipeline,
    PipelineRun,
    DataHubRecordError,
    PipelineCheckpointEntity,
    DataHubRecordRetryAudit,
    DataHubSecret,
    PipelineRevision,
    DataHubConnection,
    DataHubSettings,
    PipelineLog,
} from './entities';

export {
    PipelineService,
    PipelineRunnerService,
    SecretService,
    ConnectionService,
    DataHubSettingsService,
    AnalyticsService,
    DataHubLoggerFactory,
    PipelineLogService,
    CheckpointService,
    RecordErrorService,
    HookService,
} from './services';
export {
    FeedGeneratorService,
    // Re-exported feed types for extensibility
    FeedFormat as CustomFeedFormat,
    FeedConfig,
    FeedFilters,
    FeedFieldMapping,
    FeedOptions,
    GeneratedFeed,
    CustomFeedGenerator,
    FeedGeneratorContext,
    CustomFeedResult,
} from './feeds/feed-generator.service';
export type { VariantWithCustomFields, ProductWithCustomFields } from './feeds/feed-generator.service';
export { DataHubScheduleHandler, DataHubRunQueueHandler } from './jobs';

export { createPipeline, definePipeline, step, steps, edge } from './sdk/dsl';

export type {
    AdapterType,
    AdapterCategory,
    BaseAdapter,
    AdapterDefinition,
    AdapterRegistration,
    DataHubAdapter,
    ExtractorAdapter,
    BatchExtractorAdapter,
    ExtractContext,
    OperatorAdapter,
    SingleRecordOperator,
    OperatorContext,
    LoaderAdapter,
    LoadContext,
    ValidatorAdapter,
    ValidateContext,
    EnricherAdapter,
    EnrichContext,
    ExporterAdapter,
    ExportContext,
    ExportTargetType,
    ExportFormat,
    FeedAdapter,
    FeedContext,
    FeedFormat,
    SinkAdapter,
    SinkContext,
    SinkType,
    TriggerAdapter,
    TriggerContext,
    OperatorHelpers,
    FormatHelpers,
    ConversionHelpers,
    CryptoHelpers,
    LookupEntity,
    SchemaFieldType,
    SelectOption,
    FieldValidation,
    StepConfigSchemaField,
    ConnectionType,
    ConnectionAuthType,
    ConnectionAuth,
    AdapterLogger,
    MessengerType,
    EnqueueOptions,
    QueueStats,
    MessengerAdapter,
    ExtractMetrics,
    ExtractResult,
    EnrichError,
    EnrichResult,
    FeedValidationError,
    FeedWarning,
    FeedResult,
    PipelineExecutionContext,
    PipelineRunInput,
    PipelineRunSummary,
    StepBuilder,
    PipelineBuilder,
    SchemaFieldTypeValue,
    SchemaFieldDefinition,
    SchemaDefinition,
    UnitType,
    MappingConfig,
    TransformStep,
    FilterConfig,
    AggregationFunction,
    AggregationConfig,
    RecordMeta,
} from './sdk/types';

export { AdapterRuntimeService } from './runtime/adapter-runtime.service';
export { ExtractExecutor } from './runtime/executors/extract.executor';
export { LoadExecutor } from './runtime/executors/load.executor';
export { ExportExecutor } from './runtime/executors/export.executor';
export { FeedExecutor } from './runtime/executors/feed.executor';
export { SinkExecutor } from './runtime/executors/sink.executor';
export { TransformExecutor as RuntimeTransformExecutor } from './runtime/executors/transform.executor';

export { ExtractorRegistryService, BUILT_IN_EXTRACTOR_CLASSES, BUILT_IN_EXTRACTORS } from './extractors';
export { HttpApiExtractor } from './extractors/http-api';
export { DatabaseExtractor } from './extractors/database';
export { S3Extractor } from './extractors/s3';
export { FtpExtractor } from './extractors/ftp';
export { WebhookExtractor } from './extractors/webhook';
export { VendureQueryExtractor } from './extractors/vendure-query';
export { FileExtractor } from './extractors/file';

export { LoaderRegistryService } from './loaders/registry';
export { ProductLoader } from './loaders/product';
export { ProductVariantLoader } from './loaders/product-variant';
export { CustomerLoader } from './loaders/customer';
export { CustomerGroupLoader } from './loaders/customer-group';
export { OrderLoader } from './loaders/order';
export { CollectionLoader } from './loaders/collection';
export { FacetLoader } from './loaders/facet';
export { FacetValueLoader } from './loaders/facet-value';
export { AssetLoader } from './loaders/asset';
export { PromotionLoader } from './loaders/promotion';
export { ShippingMethodLoader } from './loaders/shipping-method';
export { InventoryLoader } from './loaders/inventory';
export { StockLocationLoader } from './loaders/stock-location';

export { ALL_OPERATOR_DEFINITIONS, OPERATOR_DEFINITIONS_BY_CATEGORY } from './operators';

// SDK Registry Service - for runtime adapter registration
export { DataHubRegistryService } from './sdk/registry.service';

// Runtime Configuration Service - for accessing merged runtime configuration
export { RuntimeConfigService } from './services/runtime/runtime-config.service';

// Adapter Registry - Registration API
export {
    // Type-specific registration (with type validation and logging)
    registerExtractor,
    registerLoader,
    registerOperator,
    registerExporter,
    registerFeed,
    registerSink,
    registerValidator,
    registerEnricher,
    // Generic registration
    registerAdapter,
    registerAdapterSafe,
    registerAdapters,
    unregisterAdapter,
    clearRegistry,
    // Lookup functions
    getAdapter,
    getAdapterOrThrow,
    hasAdapter,
    getAllAdapters,
    getRegisteredAdapters,
    getAdaptersByType,
    getAdapterCodesByType,
    // Type-specific getters
    getExtractors,
    getLoaders,
    getOperators,
    getExporters,
    getFeeds,
    getSinks,
    getValidators,
    getEnrichers,
    // Query functions
    findAdapters,
    searchAdapters,
    // Registry info
    getAdapterCount,
    getAdapterCountByType,
    getAdapterCodes,
    getRegistrySummary,
} from './adapters/registry';

export { FieldMapperService, AutoMapperService } from './mappers';

export { FileParserService } from './parsers/file-parser.service';

export { TransformExecutor } from './transforms/transform-executor';

export { validatePipelineDefinition } from './validation/pipeline-definition.validator';

export type {
    PipelineRunJobData,
    ScheduledPipelineJobData,
    WebhookRetryJobData,
    JobResult,
    JobContext,
    ScheduledTimer,
    CronScheduleConfig,
    IntervalScheduleConfig,
    ScheduleConfig,
    JobQueueConfig,
    JobOptions,
} from './jobs';
export { isCronSchedule, isIntervalSchedule } from './jobs';
