/**
 * Visual Pipeline Editor
 * Barrel export for the visual pipeline editor module
 */

// Main component
export { VisualPipelineEditor } from './VisualPipelineEditor';
export { default } from './VisualPipelineEditor';

// Types
export type {
    PipelineNodeData,
    PipelineDefinition,
    TriggerConfig,
    TriggerType,
    NodeType,
    AdapterInfo,
    SchemaField,
    VendureEntitySchema,
    VendureSchemaField,
    NodeCatalogItem,
    NodeCatalogItemWithNodeType,
    VisualPipelineEditorProps,
    NodePaletteProps,
    NodePropertiesPanelProps,
    TriggerPanelProps,
    FileUploadDialogProps,
    FieldMappingDialogProps,
} from './types';

// Constants
export {
    NODE_CATALOG,
    ALL_ADAPTERS,
    getAdapterInfo,
    DEFAULT_EDGE_STYLE,
    FILE_SOURCE_ADAPTERS,
    VENDURE_LOADER_ADAPTERS,
    NODE_TYPE_COLORS,
} from './constants';

// Queries
export {
    adaptersQuery,
    vendureSchemasQuery,
    feedFormatsQuery,
} from './queries';

// Node components
export {
    BaseNode,
    SourceNode,
    TransformNode,
    ValidateNode,
    ConditionNode,
    LoadNode,
    FeedNode,
    ExportNode,
    nodeTypes,
} from './nodes';

// Panel components
export { NodePalette } from './panels/NodePalette';
export { TriggerPanel } from './panels/TriggerPanel';
export { NodePropertiesPanel } from './panels/NodePropertiesPanel';

// Dialog components
export { FileUploadDialog, FieldMappingDialog } from './dialogs';
