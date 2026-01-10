/**
 * Visual Pipeline Editor Types
 * Type definitions for the visual pipeline editor components
 */

import type { Node, Edge } from '@xyflow/react';

// =============================================================================
// PIPELINE NODE DATA
// =============================================================================

export type NodeType = 'source' | 'transform' | 'validate' | 'filter' | 'load' | 'condition' | 'feed' | 'export';

export interface PipelineNodeData {
    label: string;
    type: NodeType;
    adapterCode?: string;
    config: Record<string, any>;
    status?: 'idle' | 'running' | 'success' | 'error';
    recordCount?: number;
    errorCount?: number;
}

// =============================================================================
// PIPELINE DEFINITION
// =============================================================================

export interface PipelineDefinition {
    nodes: Node<PipelineNodeData>[];
    edges: Edge[];
    variables?: Record<string, any>;
    triggers?: TriggerConfig[];
}

// =============================================================================
// TRIGGER CONFIGURATION
// =============================================================================

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'event';

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
    type: TriggerType;
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

// =============================================================================
// ADAPTER INFO
// =============================================================================

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

// =============================================================================
// VENDURE ENTITY SCHEMA
// =============================================================================

export interface VendureEntitySchema {
    entity: string;
    label: string;
    description?: string;
    fields: VendureSchemaField[];
    lookupFields: string[];
    importable: boolean;
    exportable: boolean;
}

export interface VendureSchemaField {
    key: string;
    type: string;
    required: boolean;
    readonly: boolean;
    description?: string;
}

// =============================================================================
// NODE CATALOG TYPES
// =============================================================================

export interface NodeCatalogItem {
    type: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    description: string;
    category?: string;
}

export interface NodeCatalogItemWithNodeType extends NodeCatalogItem {
    nodeType: NodeType;
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
