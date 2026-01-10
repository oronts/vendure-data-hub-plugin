/**
 * Pipeline Components
 * Core components for building and configuring data pipelines
 */

// Pipeline Canvas (Visual Builder)
export { PipelineCanvas } from './pipeline-canvas';
export type { PipelineCanvasProps } from './pipeline-canvas';

// Pipeline Editor (Form-based)
export { PipelineEditor } from './pipeline-editor';

// Step Configuration
export { StepConfigPanel } from './step-config-panel';

// Trigger Configuration
export { TriggerConfig } from './trigger-config';
export type {
    TriggerConfigProps,
    Trigger,
    TriggerType,
    ScheduleTrigger,
    WebhookTrigger,
    EventTrigger,
    ManualTrigger,
    TriggerCondition,
} from './trigger-config';

// Visual Pipeline Editor (ReactFlow-based) - New modular version
export { VisualPipelineEditor } from './visual-editor';
export type { VisualPipelineEditorProps } from './visual-editor';

// Visual Editor sub-components (for advanced usage)
export {
    NODE_CATALOG,
    ALL_ADAPTERS,
    getAdapterInfo,
    nodeTypes,
    NodePalette,
    TriggerPanel,
    NodePropertiesPanel,
    FileUploadDialog,
    FieldMappingDialog,
} from './visual-editor';

// Visual Editor types
export type {
    PipelineNodeData,
    PipelineDefinition,
    TriggerConfig as VisualTriggerConfig,
    NodeType,
    AdapterInfo as VisualAdapterInfo,
    VendureEntitySchema,
    NodeCatalogItem,
} from './visual-editor';

// ReactFlow Pipeline Editor
export { ReactFlowPipelineEditor } from './reactflow-pipeline-editor';
export type { ReactFlowPipelineEditorProps } from './reactflow-pipeline-editor';

// Pipeline Export/Import
export { PipelineExportDialog } from './pipeline-export';
export { PipelineImportDialog } from './pipeline-import';
