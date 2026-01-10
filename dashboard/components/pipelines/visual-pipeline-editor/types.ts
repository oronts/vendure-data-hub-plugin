import type { Node, Edge } from '@xyflow/react';

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Visual node category type - matches all backend StepType values for lossless conversion
 */
export type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'feed' | 'export' | 'sink' | 'enrich' | 'filter';

export interface PipelineNodeData {
    label: string;
    type: VisualNodeCategory;
    adapterCode?: string;
    config: Record<string, any>;
    status?: 'idle' | 'running' | 'success' | 'error';
    recordCount?: number;
    errorCount?: number;
}

export interface PipelineDefinition {
    nodes: Node<PipelineNodeData>[];
    edges: Edge[];
    variables?: Record<string, any>;
    triggers?: TriggerConfig[];
}

/**
 * Trigger configuration interface
 *
 * FIELD NAME REFERENCE (must match backend):
 * - cron: Cron expression for schedule triggers
 * - timezone: Optional timezone for schedule evaluation
 * - intervalSec: Interval in seconds for interval-based triggers
 * - webhookPath: Path for webhook endpoint (UI display)
 * - webhookCode: Code for registered webhook lookup (backend reference)
 * - eventType: Vendure event type for event triggers
 */
export interface TriggerConfig {
    type: 'manual' | 'schedule' | 'webhook' | 'event';
    /** Cron expression (5 fields: minute hour day month weekday) */
    cron?: string;
    /** Timezone for schedule evaluation */
    timezone?: string;
    /** Interval in seconds (alternative to cron) */
    intervalSec?: number;
    /** Webhook path/endpoint for UI display */
    webhookPath?: string;
    /** Webhook code for backend reference */
    webhookCode?: string;
    /** Vendure event type */
    eventType?: string;
    /** Whether trigger is enabled */
    enabled?: boolean;
}

export interface AdapterInfo {
    type: string;
    code: string;
    name: string;
    description?: string;
    category?: string;
    schema: { fields: SchemaField[] };
    icon?: string;
    color?: string;
}

export interface SchemaField {
    key: string;
    label?: string;
    description?: string;
    type: string;
    required?: boolean;
    options?: { value: string; label: string }[];
}

export interface VendureEntitySchema {
    entity: string;
    label: string;
    description?: string;
    fields: { key: string; type: string; required: boolean; readonly: boolean; description?: string }[];
    lookupFields: string[];
    importable: boolean;
    exportable: boolean;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface VisualPipelineEditorProps {
    definition: PipelineDefinition;
    onChange: (definition: PipelineDefinition) => void;
    onRun?: () => void;
    onSave?: () => void;
    readOnly?: boolean;
}

export interface NodePaletteProps {
    onDragStart: (event: React.DragEvent, nodeType: string, category: string, label: string) => void;
    adapters?: AdapterInfo[];
}

export interface FileUploadDialogProps {
    open: boolean;
    onClose: () => void;
    onFileSelected: (file: File, preview: any[]) => void;
    acceptedFormats: string[];
}

export interface FieldMappingDialogProps {
    open: boolean;
    onClose: () => void;
    sourceFields: string[];
    targetSchema?: VendureEntitySchema;
    mappings: Record<string, string>;
    onSave: (mappings: Record<string, string>) => void;
}

export interface NodePropertiesPanelProps {
    node: Node<PipelineNodeData> | null;
    vendureSchemas: VendureEntitySchema[];
    onUpdate: (node: Node<PipelineNodeData>) => void;
    onDelete: () => void;
    onClose: () => void;
}

export interface TriggerPanelProps {
    triggers: TriggerConfig[];
    onChange: (triggers: TriggerConfig[]) => void;
}
