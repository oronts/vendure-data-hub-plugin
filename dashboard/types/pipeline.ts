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
