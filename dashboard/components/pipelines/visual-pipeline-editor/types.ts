/**
 * Visual Pipeline Editor Types
 *
 * Re-exports from central dashboard types for module convenience.
 */

export type {
    // Node types
    PipelineNodeType,
    VisualNodeCategory,
    NodeStatus,
    PipelineNodeData,
    PipelineNode,

    // Pipeline definition
    PipelineDefinition,

    // Trigger configuration
    TriggerType,
    WebhookAuthType,
    PipelineTrigger as TriggerConfig,

    // Adapter types
    AdapterInfo,
    AdapterSchema,
    AdapterSchemaField as SchemaField,

    // Vendure entity schema
    VendureEntitySchema,
    VendureSchemaField,

    // Component props
    VisualPipelineEditorProps,
    NodePaletteProps,
    NodePropertiesPanelProps,
    TriggerPanelProps,
    FileUploadDialogProps,
    FieldMappingDialogProps,
} from '../../../types';
