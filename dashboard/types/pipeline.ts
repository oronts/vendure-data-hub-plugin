import type { Node, Edge } from '@xyflow/react';
import type {
    JsonObject,
    PipelineDefinition,
    StepContextOverride,
} from '../../shared/types';

export type UINodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'testing';

export interface PipelineNodeData {
    label: string;
    type: string;
    adapterCode?: string;
    config: JsonObject;
    context?: StepContextOverride;
    schemaRef?: { schemaId: string; version: string };
    status?: UINodeStatus;
    recordCount?: number;
    errorCount?: number;
    validationIssueCount?: number;
    // Index signature for ReactFlow compatibility
    [key: string]: unknown;
}

export type PipelineNode = Node<PipelineNodeData>;

export interface VisualNodeBaseline {
    sourceIndex: number;
    id: string;
    type: string;
    label: string;
    adapterCode?: string;
    config: JsonObject;
    context?: StepContextOverride;
    schemaRef?: { schemaId: string; version: string };
}

export interface VisualEdgeBaseline {
    sourceIndex?: number;
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    label?: string;
    inferred: boolean;
}

export interface VisualPipelineConversionMetadata {
    source: Record<string, unknown>;
    nodeIdentity: string;
    edgeIdentity: string;
    nodes: VisualNodeBaseline[];
    edges: VisualEdgeBaseline[];
}
/**
 * Visual pipeline definition (ReactFlow-based format) - dashboard version.
 * Uses ReactFlow PipelineNode/Edge types for the visual editor.
 *
 * Parallel definition in src/services/pipeline/pipeline-format.service.ts
 * uses backend VisualNode/VisualEdge types for pipeline format conversion.
 */
export interface VisualPipelineDefinition {
    nodes: PipelineNode[];
    edges: Edge[];
    variables?: JsonObject;
    capabilities?: PipelineDefinition['capabilities'];
    dependsOn?: string[];
    trigger?: unknown;
    conversion?: VisualPipelineConversionMetadata;
}

export type VisualNodeCategory =
    | 'trigger'
    | 'source'
    | 'transform'
    | 'validate'
    | 'condition'
    | 'load'
    | 'feed'
    | 'export'
    | 'sink'
    | 'enrich'
    | 'filter'
    | 'gate';
