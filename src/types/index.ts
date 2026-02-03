export type { JsonValue, JsonObject } from '../../shared/types';

export * from './pipeline';

export * from './step-configs';

export * from './extractor-interfaces';

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
} from '../../shared/types';

export * from './loader-interfaces';

export * from './plugin-options';

export * from './typed-config';

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
} from '../../shared/types';
export { DEFAULT_IMPACT_ANALYSIS_OPTIONS } from '../../shared/types';

export type {
    DiffEntry,
    RevisionDiff,
    TimelineEntry,
    SaveDraftOptions,
    PublishVersionOptions,
    RevertOptions,
    AutoSaveConfig,
} from '../../shared/types';
export { DEFAULT_AUTO_SAVE_CONFIG } from '../../shared/types';

export type { PipelineMetrics, PipelineRunMetrics } from '../../shared/types';

export type {
    HookAction,
    HookStageValue,
    WebhookHookAction,
    InterceptorHookAction,
    ScriptHookAction,
    LogHookAction,
    InterceptorResult,
    ScriptFunction,
    HookContext,
    PipelineHooks,
    PipelineHooksConfig,
    HookConfig,
    HookHandler,
} from '../../shared/types';

export type {
    Transform,
    TransformType,
    TransformConfig,
    TransformStep,
    FieldTransform,
    FieldTransformType,
    TransformOptions,
} from '../../shared/types';

export {
    TRIGGER_FIELDS,
    TRIGGER_TYPES,
    LOADER_FIELDS,
    LOAD_STRATEGIES,
    EXTRACTOR_FIELDS,
    EXPORT_FIELDS,
    FEED_FIELDS,
    TRANSFORM_FIELDS,
    THROUGHPUT_FIELDS,
    COMMON_FIELDS,
    STEP_RESULT_FIELDS,
    WEBHOOK_FIELDS,
} from '../../shared/types';

export type {
    TriggerTypeValue,
    LoadStrategyValue,
    CanonicalTriggerConfig,
    CanonicalLoaderConfig,
    ValidationError,
} from '../../shared/types';
