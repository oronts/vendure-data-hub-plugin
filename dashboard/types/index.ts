/**
 * Dashboard Types
 * Barrel export for shared type definitions
 */

// Pipeline types
export type {
    PipelineNodeType,
    NodeStatus,
    PipelineNodeData,
    PipelineNode,
    PipelineStep,
    PipelineDefinition,
    TriggerType,
    PipelineTrigger,
    TriggerCondition,
    PipelineRun,
    PipelineRunStats,
    StepStats,
    PipelineError,
    AdapterSchema,
    AdapterSchemaField,
    AdapterInfo,
    NodeCatalogItem,
    NodeCatalogItemWithType,
} from './pipeline';

// Wizard types
export type {
    WizardStep,
    WizardProgress,
    ImportConfig,
    ImportSourceConfig,
    FileSourceConfig,
    ApiSourceConfig,
    DatabaseSourceConfig,
    WebhookSourceConfig,
    ImportFieldMapping,
    ImportStrategies,
    ImportTriggerConfig,
    ExportConfig,
    QueryConfig,
    FilterCondition,
    ExportField,
    ExportFormatConfig,
    DestinationConfig,
    FileDestinationConfig,
    SftpDestinationConfig,
    HttpDestinationConfig,
    S3DestinationConfig,
    WebhookDestinationConfig,
    ExportTriggerConfig,
    CacheConfig,
    ExportOptions,
    TransformationType,
    TransformationStep,
    ParsedData,
    FeedTemplate,
} from './wizard';
