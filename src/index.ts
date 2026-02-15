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
    ViewDataHubQuarantinePermission,
    EditDataHubQuarantinePermission,
    ReplayDataHubRecordPermission,
    PublishDataHubPipelinePermission,
    ReviewDataHubPipelinePermission,
    UpdateDataHubSettingsPermission,
    ViewDataHubAnalyticsPermission,
    ManageDataHubWebhooksPermission,
    ManageDataHubDestinationsPermission,
    ManageDataHubFeedsPermission,
    ViewDataHubEntitySchemasPermission,
    SubscribeDataHubEventsPermission,
    ManageDataHubFilesPermission,
    ReadDataHubFilesPermission,
} from './permissions';

export {
    DATAHUB_PLUGIN_OPTIONS,
    LOGGER_CTX,
    QUEUE_NAMES,
    NAV,
    RETENTION,
    PAGINATION,
    BATCH,
    SINK,
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
    TIME_UNITS,
    TIME_INTERVALS,
    UI_TIMEOUTS,
    TIME,
    WEIGHT_UNITS,
    LENGTH_UNITS,
    VOLUME_UNITS,
    UNIT_CONVERSIONS,
    CURRENCY_DECIMALS,
    STEP_ICONS,
    ADAPTER_ICONS,
    STEP_COLORS,
    STATUS_COLORS,
    PIPELINE_STATUS_COLORS,
    SEARCH_SERVICE_URLS,
    EXAMPLE_URLS,
    SERVICE_DEFAULTS,
    FEED_NAMESPACES,
    CONTENT_TYPES,
    HTTP_HEADERS,
    BUILTIN_ADAPTERS,
    EXTRACTOR_ADAPTERS,
    LOADER_ADAPTERS,
    EXPORTER_ADAPTERS,
    FEED_ADAPTERS,
    SINK_ADAPTERS,
} from './constants/index';

export {
    Pipeline,
    PipelineRun,
    DataHubRecordError,
    DataHubCheckpoint,
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
    FeedAdapter,
    FeedContext,
    FeedFormat,
    SinkAdapter,
    SinkContext,
    SinkType,
    TriggerAdapter,
    TriggerContext,
    AdapterOperatorHelpers,
    AdapterFormatHelpers,
    ConversionHelpers,
    AdapterCryptoHelpers,
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
    LoadError,
    LoadResult,
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

export { ExtractorRegistryService } from './extractors';
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

export { ALL_OPERATOR_DEFINITIONS } from './operators';

export { DataHubRegistryService } from './sdk/registry.service';

export { RuntimeConfigService } from './services/runtime/runtime-config.service';

export {
    registerExtractor,
    registerLoader,
    registerOperator,
    registerExporter,
    registerFeed,
    registerSink,
    registerValidator,
    registerEnricher,
    registerAdapter,
    registerAdapterSafe,
    registerAdapters,
    unregisterAdapter,
    clearRegistry,
    getAdapter,
    getAdapterOrThrow,
    hasAdapter,
    getAllAdapters,
    getRegisteredAdapters,
    getAdaptersByType,
    getAdapterCodesByType,
    getExtractors,
    getLoaders,
    getOperators,
    getExporters,
    getFeeds,
    getSinks,
    getValidators,
    getEnrichers,
    findAdapters,
    searchAdapters,
    getAdapterCount,
    getAdapterCountByType,
    getAdapterCodes,
    getRegistrySummary,
} from './adapters/registry';

export { FieldMapperService, AutoMapperService } from './mappers';

export { FileParserService } from './parsers/file-parser.service';

export { TransformExecutor } from './transforms/transform-executor';

export { validatePipelineDefinition } from './validation/pipeline-definition.validator';
export { PipelineDefinitionError, PipelineDefinitionIssue } from './validation/pipeline-definition-error';

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

// Script operator security exports
export {
    configureScriptOperators,
    isScriptOperatorsEnabled,
    disableScriptOperators,
    enableScriptOperators,
} from './operators/script';

// Safe evaluator exports for secure expression evaluation
export {
    SafeEvaluator,
    getDefaultEvaluator,
    createEvaluator,
    safeEvaluate,
    validateExpression,
    ALLOWED_OPERATORS,
    ALLOWED_STRING_METHODS,
    ALLOWED_ARRAY_METHODS,
    ALLOWED_NUMBER_METHODS,
    ALLOWED_METHODS,
    DEFAULT_EVALUATOR_CONFIG,
} from './runtime/sandbox';
export type { EvaluationResult, SafeEvaluatorConfig } from './runtime/sandbox';

// Code security utilities exports
export {
    validateUserCode,
    validateConditionExpression,
    createCodeSandbox,
    DANGEROUS_PATTERNS,
    DISALLOWED_KEYWORDS,
    PROTOTYPE_POLLUTION_PATTERNS,
    DEFAULT_CODE_SECURITY_CONFIG,
} from './utils/code-security.utils';
export type { CodeSecurityConfig } from './utils/code-security.utils';

// Security configuration type exports
export type { ScriptSecurityConfig, SecurityConfig } from './types/plugin-options';

// Import templates exports
export {
    getImportTemplates,
    getTemplateById,
    getTemplatesByCategory,
    getTemplatesByDifficulty,
    getTemplatesByTag,
    getFeaturedTemplates,
    searchTemplates,
    getTemplateCategories,
    getTemplateTags,
    getTemplateCount,
    validateTemplate,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_ICONS,
    DIFFICULTY_LABELS,
    DIFFICULTY_COLORS,
    productTemplates,
    customerTemplates,
    inventoryTemplates,
    catalogTemplates,
    promotionTemplates,
} from './templates';
export type {
    ImportTemplate,
    TemplateCategory,
    TemplateDifficulty,
    TemplateFileFormat,
    TemplateTag,
    TemplateCategoryInfo,
} from './templates';
