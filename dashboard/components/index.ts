/**
 * DataHub Dashboard Components
 * Export all reusable components for the ETL UI
 *
 * Component organization:
 * - pipelines: Pipeline building and visualization components
 * - analytics: Dashboard analytics and metrics components
 * - common: Shared UI components (file upload, transformation toolkit, etc.)
 * - wizards: Multi-step wizard components (import/export wizards)
 */

// =============================================================================
// PIPELINE COMPONENTS
// =============================================================================

export {
    PipelineCanvas,
    PipelineEditor,
    StepConfigPanel,
    TriggerConfig,
    VisualPipelineEditor,
    ReactFlowPipelineEditor,
    PipelineExportDialog,
    PipelineImportDialog,
} from './pipelines';
export type {
    PipelineCanvasProps,
    TriggerConfigProps,
    Trigger,
    TriggerType,
    ScheduleTrigger,
    WebhookTrigger,
    EventTrigger,
    ManualTrigger,
    TriggerCondition,
    VisualPipelineEditorProps,
    ReactFlowPipelineEditorProps,
} from './pipelines';

// =============================================================================
// ANALYTICS COMPONENTS
// =============================================================================

export {
    AnalyticsDashboard,
    AnalyticsPanel,
} from './analytics';
export type {
    AnalyticsDashboardProps,
    RunMetrics,
    TimeSeriesPoint,
    PipelineStats,
} from './analytics';

// =============================================================================
// COMMON COMPONENTS
// =============================================================================

export {
    FileUploadMapper,
    TransformationToolkit,
    ImportWizard,
    ExportWizard,
    ConnectionConfigEditor,
} from './common';
export type {
    FileUploadMapperProps,
    ParsedFile,
    ParsedColumn,
    FieldMapping,
    TransformationToolkitProps,
    TransformStep,
    TransformationType,
    FilterCondition,
    FormulaField,
    AggregateConfig,
    ImportConfiguration,
    ImportWizardProps,
    ExportConfiguration,
    ExportWizardProps,
} from './common';

// =============================================================================
// WIZARD COMPONENTS
// =============================================================================

export { ImportWizard as WizardImport, ExportWizard as WizardExport } from './wizards';
