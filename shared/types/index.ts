export { TRIGGER_TYPES } from './field-constants';
export type { TriggerTypeValue } from './field-constants';

export type {
    TemplateCategory,
    TemplateDifficulty,
} from './template.types';

export type { JsonValue, JsonObject } from './json.types';

export type {
    StringValidation,
    NumberValidation,
    ArrayValidation,
    ObjectValidation,
    DateValidation,
    PrimitiveType,
    ComplexType,
    FieldType,
    EnhancedFieldDefinition,
    SchemaFieldTransform,
    FieldDependency,
    FieldUIHints,
    EnhancedSchemaDefinition,
    SchemaFieldGroup,
    SchemaIndex,
    SchemaValidationRule,
    ComputedField,
} from './schema.types';

export type {
    FilterOperator,
    LogicalOperator,
    FilterAction,
    FilterCondition,
    FilterConfig,
} from './filter.types';

export type {
    ValidationError,
    ValidationErrorCode,
} from './validation.types';
export {
    VALIDATION_PATTERNS,
    ERROR_MESSAGES,
    VALIDATION_ERROR_CODE,
} from './validation.types';

export type {
    ErrorSeverity,
    PipelineErrorStage,
    PipelineError,
    RecordError,
    PipelineStepError,
} from './error.types';
// NOTE: getErrorSeverity is intentionally NOT exported from shared/types.
// Import from src/constants/error-codes instead (authoritative implementation).

export type {
    TransformationType,
    TransformStep,
    AggregationFunction,
    AggregationConfig,
} from './transform.types';

export type {
    FieldTransformType,
    MathOperation,
    TransformOptions,
    FieldTransform,
    TransformType,
    PadPosition,
    LookupType,
    TransformConfig,
    Transform,
    MappingCondition,
    FieldMapping,
    MappingConfig,
    MappingResult,
    MappingError,
} from './mapping.types';

export type {
    HookStageValue,
    HookActionType,
    LogLevel,
    WebhookHookAction,
    LogHookAction,
    InterceptorHookAction,
    ScriptHookAction,
    HookAction,
    HookConfig,
    PipelineHooksConfig,
    PipelineHooks,
    HookContext,
    HookHandler,
    InterceptorResult,
    HookRegistration,
    ScriptFunction,
} from './hook.types';

export type {
    AdapterType,
    AdapterCategory,
    SchemaFieldType,
    DependsOnOperator,
    SelectOption,
    AdapterSchemaField,
    AdapterSchema,
    AdapterDefinition,
} from './adapter.types';

export type {
    ComparisonOperator,
    OperatorCondition,
    OperatorError,
    OperatorResult,
    BaseOperatorConfig,
    FieldPathConfig,
    SingleRecordOperatorFn,
    BatchOperatorFn,
    SecretResolver,
    ConnectionResolver,
    AdapterLogger,
    FormatHelpers,
    ConversionHelpers,
    CryptoHelpers,
    OperatorHelpers,
    JoinOperatorConfig,
    JoinType,
} from './operator.types';

export type {
    StepType,
    NodeStatus,
    StepResult,
    StepError,
    DrainStrategy,
    ChannelStrategy,
    OperatorConfig,
    RouteConditionOp,
    PipelineCapabilityDomain,
    Throughput,
    PipelineStepDefinition,
    PipelineEdge,
    StepMetrics,
    StepExecution,
    StepContextOverride,
    RouteCondition,
    RouteBranch,
    RouteStepConfig,
    PipelineCapabilities,
    ValidationModeType,
} from './step.types';

export type {
    RunStatus,
    TriggerSource,
    PipelineRunStats,
    PipelineRunError,
    PipelineRun,
    RunSummary,
    RunFilter,
    RunProgress,
} from './run.types';

export type {
    TriggerType,
    WebhookAuthType,
    HmacAlgorithm,
    TriggerConditionOperator,
    TriggerCondition,
    ScheduleTriggerConfig,
    WebhookTriggerConfig,
    EventTriggerConfig,
    QueueTypeValue,
    QueueTriggerConfig,
    FileWatchEvent,
    FileWatchTriggerConfig,
    AckMode,
    MessageTriggerConfig,
    TriggerConfig,
    PipelineTrigger,
} from './trigger.types';

export type {
    PipelineMetrics,
    LoadError,
    ExportError,
    SinkError,
    StepExecutionResult,
    LoadResult,
    ExportResult,
    SinkResult,
    ValidationResult,
    InvalidRecord,
} from './execution.types';

export type {
    PipelineType,
    TargetOperation,
    ErrorStrategy,
    VendureEntityType,
    SourceType,
    FileFormat,
    DestinationType,
    FeedType,
    ErrorHandlingConfig,
    CheckpointStrategy,
    CheckpointingConfig,
    RunModeValue,
    LanguageStrategyValue,
    ConflictStrategyValue,
    PipelineContext,
    ParallelExecutionConfig,
    PipelineCheckpoint,
    CheckpointData,
    ExecutorContext,
    PipelineOptions,
    ExportFormatConfig,
    CsvDelimiter,
    FileEncoding,
    HttpMethod,
    UnifiedPipelineDefinition,
    PipelineDefinition,
} from './pipeline.types';

export type {
    DiffEntry,
    RevisionDiff,
    TimelineEntry,
    SaveDraftOptions,
    PublishVersionOptions,
    RevertOptions,
    AutoSaveConfig,
} from './versioning.types';
export { DEFAULT_AUTO_SAVE_CONFIG } from './versioning.types';

export type {
    ImpactSummary,
    EntityOperations,
    FieldChangePreview,
    EntityImpact,
    RiskWarning,
    RiskAssessment,
    StepTransformation,
    SampleRecordFlow,
    DurationEstimate,
    ResourceEstimate,
    ImpactAnalysis,
    ImpactAnalysisOptions,
    RecordDetail,
    RiskRule,
    RiskContext,
} from './impact-analysis.types';
export { DEFAULT_IMPACT_ANALYSIS_OPTIONS } from './impact-analysis.types';

export type {
    ExtractorConfig,
    RateLimitConfig,
    RetryConfig,
    AuthConfig,
    PaginationType,
    PaginationConfig,
    ConnectionConfig,
    RecordEnvelope,
    RecordMetadata,
    ExtractorCheckpoint,
    ExtractorResult,
    ExtractorMetrics,
    ExtractorError,
    ExtractorResultMetadata,
    ExtractorValidationResult,
    ExtractorValidationError,
    ExtractorValidationWarning,
    StepConfigSchema,
    StepConfigField,
    StepConfigGroup,
    ExtractorCategory,
    ConnectionTestResult,
    ExtractorPreviewResult,
    HttpResponse,
    FtpFileInfo,
    S3ObjectInfo,
    DatabaseQueryResult,
} from './extractor.types';

export type {
    InputRecord,
    LoaderOptions,
    EntityLoadResult,
    EntityLoadError,
    EntityValidationResult,
    EntityValidationError,
    EntityValidationWarning,
    EntityFieldSchema,
    EntityFieldType,
    EntityField,
} from './loader.types';

export type {
    BatchConfig,
    HttpConfig,
    CircuitBreakerConfig,
    ConnectionPoolConfig,
    RuntimePaginationConfig,
    SchedulerConfig,
    EventTriggerServiceConfig,
    RuntimeLimitsConfig,
    CodeFirstPipeline,
    CodeFirstSecret,
    CodeFirstConnection,
} from './runtime-config.types';

export type {
    CsvExtractorConfig,
    JsonExtractorConfig,
    ExcelExtractorConfig,
    HttpApiExtractorConfig,
    GraphqlExtractorConfig,
    VendureQueryExtractorConfig,
    WebhookExtractorConfig,
    DatabaseExtractorConfig,
    CdcExtractorConfig,
    GenericExtractorConfig,
    TypedExtractorConfig,
    MapOperatorConfig,
    TemplateOperatorConfig,
    FilterOperatorConfig,
    WhenOperatorConfig,
    LookupOperatorConfig,
    AggregateOperatorConfig,
    DedupeOperatorConfig,
    CoerceOperatorConfig,
    EnrichOperatorConfig,
    GenericOperatorConfig,
    TypedOperatorConfig,
    ProductUpsertLoaderConfig,
    VariantUpsertLoaderConfig,
    CustomerUpsertLoaderConfig,
    StockAdjustLoaderConfig,
    RestPostLoaderConfig,
    OrderNoteLoaderConfig,
    OrderTransitionLoaderConfig,
    CollectionUpsertLoaderConfig,
    AssetAttachLoaderConfig,
    ApplyCouponLoaderConfig,
    PromotionUpsertLoaderConfig,
    GenericLoaderConfig,
    TypedLoaderConfig,
    CsvExportConfig,
    JsonExportConfig,
    XmlExportConfig,
    GenericExporterConfig,
    TypedExporterConfig,
    GoogleMerchantFeedConfig,
    MetaCatalogFeedConfig,
    AmazonFeedConfig,
    CustomFeedConfig,
    GenericFeedConfig,
    TypedFeedConfig,
    SchemaValidatorConfig,
    RouteConfig,
    UpdateCatalogLoaders,
    UpdateCustomerLoaders,
    UpdateOrderLoaders,
    UpdatePromotionLoaders,
    UpdateDataHubSettingsLoaders,
    LoaderAdapterCode,
} from './adapter-config.types';
export { LOADER_PERMISSIONS } from './adapter-config.types';
