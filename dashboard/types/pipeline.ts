/**
 * Pipeline Types
 * Shared type definitions for pipeline-related components
 */

import type { Node, Edge } from '@xyflow/react';

// =============================================================================
// NODE TYPES
// =============================================================================

export type PipelineNodeType =
    | 'source'
    | 'transform'
    | 'validate'
    | 'filter'
    | 'load'
    | 'condition'
    | 'feed'
    | 'export';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

// =============================================================================
// PIPELINE NODE DATA
// =============================================================================

export interface PipelineNodeData {
    label: string;
    type: PipelineNodeType;
    adapterCode?: string;
    config: Record<string, any>;
    status?: NodeStatus;
    recordCount?: number;
    errorCount?: number;
}

export type PipelineNode = Node<PipelineNodeData>;

// =============================================================================
// PIPELINE STEP
// =============================================================================

export interface PipelineStep {
    id: string;
    type: PipelineNodeType;
    adapterCode: string;
    label?: string;
    config: Record<string, any>;
    order: number;
}

// =============================================================================
// PIPELINE DEFINITION
// =============================================================================

export interface PipelineDefinition {
    nodes: PipelineNode[];
    edges: Edge[];
    variables?: Record<string, any>;
    triggers?: PipelineTrigger[];
}

// =============================================================================
// TRIGGER CONFIGURATION
// =============================================================================

export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'event';

/**
 * Webhook authentication type
 */
export type WebhookAuthType = 'NONE' | 'API_KEY' | 'HMAC' | 'BASIC' | 'JWT';

/**
 * Pipeline trigger configuration
 *
 * FIELD NAME REFERENCE (must match backend):
 * - cron: Cron expression for schedule triggers
 * - timezone: Optional timezone for schedule evaluation
 * - intervalSec: Interval in seconds for interval-based triggers
 * - webhookPath: Path for webhook endpoint (UI display)
 * - webhookCode: Code for registered webhook lookup (backend reference)
 * - eventType: Vendure event type for event triggers
 */
export interface PipelineTrigger {
    type: TriggerType;
    enabled?: boolean;
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
    /** HTTP method for webhook */
    method?: 'GET' | 'POST' | 'PUT';
    /** Authentication type for webhook */
    authentication?: WebhookAuthType;
    /** Secret code for HMAC authentication */
    secretCode?: string;
    /** Secret code for API key authentication */
    apiKeySecretCode?: string;
    /** Secret code for Basic authentication */
    basicSecretCode?: string;
    /** Secret code for JWT authentication */
    jwtSecretCode?: string;
    /** API key header name */
    apiKeyHeaderName?: string;
    /** API key prefix (e.g., "Bearer ") */
    apiKeyPrefix?: string;
    /** HMAC signature header name */
    hmacHeaderName?: string;
    /** HMAC algorithm */
    hmacAlgorithm?: 'sha256' | 'sha512';
    /** JWT authorization header name */
    jwtHeaderName?: string;
    /** Rate limit (requests per minute) */
    rateLimit?: number;
    /** Require idempotency key header */
    requireIdempotencyKey?: boolean;
    /** Vendure event type */
    eventType?: string;
    conditions?: TriggerCondition[];
}

export interface TriggerCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
    value: any;
}

// =============================================================================
// PIPELINE EXECUTION
// =============================================================================

export interface PipelineRun {
    id: string;
    pipelineId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt?: string;
    completedAt?: string;
    triggeredBy: 'manual' | 'schedule' | 'webhook' | 'event';
    stats?: PipelineRunStats;
    errors?: PipelineError[];
}

export interface PipelineRunStats {
    totalRecords: number;
    processedRecords: number;
    successfulRecords: number;
    failedRecords: number;
    skippedRecords: number;
    duration?: number;
    stepStats?: StepStats[];
}

export interface StepStats {
    stepId: string;
    inputRecords: number;
    outputRecords: number;
    errorRecords: number;
    duration: number;
}

export interface PipelineError {
    stepId?: string;
    recordIndex?: number;
    code: string;
    message: string;
    details?: Record<string, any>;
}

// =============================================================================
// ADAPTER TYPES
// =============================================================================

export interface AdapterSchema {
    fields: AdapterSchemaField[];
}

export interface AdapterSchemaField {
    key: string;
    label?: string;
    description?: string;
    type: string;
    required?: boolean;
    default?: any;
    options?: { value: string; label: string }[];
}

export interface AdapterInfo {
    type: string;
    code: string;
    name: string;
    description?: string;
    category?: string;
    schema: AdapterSchema;
    icon?: string;
    color?: string;
    pure?: boolean;
    async?: boolean;
    batchable?: boolean;
}

// =============================================================================
// NODE CATALOG
// =============================================================================

export interface NodeCatalogItem {
    type: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    description: string;
    category?: string;
}

export interface NodeCatalogItemWithType extends NodeCatalogItem {
    nodeType: PipelineNodeType;
}

// =============================================================================
// VISUAL EDITOR TYPES
// =============================================================================

/**
 * Visual node category type - matches all backend StepType values for lossless conversion
 */
export type VisualNodeCategory = 'trigger' | 'source' | 'transform' | 'validate' | 'condition' | 'load' | 'feed' | 'export' | 'sink' | 'enrich' | 'filter';

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
// COMPONENT PROPS - Common props for visual editor components
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
    node: PipelineNode | null;
    vendureSchemas: VendureEntitySchema[];
    onUpdate: (node: PipelineNode) => void;
    onDelete: () => void;
    onClose: () => void;
}

export interface TriggerPanelProps {
    triggers: PipelineTrigger[];
    onChange: (triggers: PipelineTrigger[]) => void;
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
