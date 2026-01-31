import type { Node, Edge } from '@xyflow/react';
import type {
    StepType,
    JsonObject,
    PipelineDefinition,
} from '../../shared/types';

export type PipelineNodeType = StepType;

export type UINodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'testing';

export interface PipelineNodeData {
    label: string;
    type: PipelineNodeType;
    adapterCode?: string;
    config: JsonObject;
    status?: UINodeStatus;
    recordCount?: number;
    errorCount?: number;
    // Index signature for ReactFlow compatibility
    [key: string]: unknown;
}

export type PipelineNode = Node<PipelineNodeData>;

/**
 * Visual pipeline definition (ReactFlow-based format)
 */
export interface VisualPipelineDefinition {
    nodes: PipelineNode[];
    edges: Edge[];
    variables?: JsonObject;
    capabilities?: PipelineDefinition['capabilities'];
    dependsOn?: string[];
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
    | 'filter';
