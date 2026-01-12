/**
 * Visual Editor Types
 *
 * Re-exports from central dashboard types for backwards compatibility.
 * New code should import directly from '@dashboard/types'.
 */

export type {
    // Node types
    PipelineNodeType as NodeType,
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

    // Node catalog
    NodeCatalogItem,
    NodeCatalogItemWithType as NodeCatalogItemWithNodeType,

    // Component props
    VisualPipelineEditorProps,
    NodePaletteProps,
    NodePropertiesPanelProps,
    TriggerPanelProps,
    FileUploadDialogProps,
    FieldMappingDialogProps,
} from '../../../types';
