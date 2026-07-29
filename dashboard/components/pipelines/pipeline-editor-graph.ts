import {
    MarkerType,
    type Connection,
    type Edge,
    type Node,
    type XYPosition,
} from '@xyflow/react';
import { EDGE_STYLE } from '../../constants';
import type {
    PipelineNodeData,
    ValidationIssue,
    VisualPipelineDefinition,
} from '../../types';

export interface CreatePipelineNodeOptions {
    readonly id: string;
    readonly adapterCode: string;
    readonly category: string;
    readonly label: string;
    readonly position: XYPosition;
}

export function createPipelineNode({
    id,
    adapterCode,
    category,
    label,
    position,
}: CreatePipelineNodeOptions): Node<PipelineNodeData> {
    return {
        id,
        type: category,
        position,
        data: {
            label,
            type: category,
            adapterCode,
            config: {},
        },
    };
}

export function createPipelineEdge(connection: Connection, id: string): Edge {
    return {
        ...connection,
        id,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: EDGE_STYLE.STROKE_WIDTH },
    };
}

export function getVisualDefinitionKey(
    definition: VisualPipelineDefinition | null,
): string {
    if (!definition) return '';
    const nodesKey = definition.nodes
        .map(node => `${node.id}:${JSON.stringify(node.data)}`)
        .sort()
        .join('|');
    const edgesKey = definition.edges
        .map(edge => [
            edge.id,
            edge.source,
            edge.target,
            edge.sourceHandle,
            edge.targetHandle,
            edge.label,
        ].map(value => JSON.stringify(value)).join(':'))
        .sort()
        .join('|');
    return `${nodesKey}::${edgesKey}`;
}

export function preserveNodePositions(
    incomingNodes: Node<PipelineNodeData>[],
    currentNodes: Node<PipelineNodeData>[],
): Node<PipelineNodeData>[] {
    const positionById = new Map(currentNodes.map(node => [node.id, node.position]));
    return incomingNodes.map(node => ({
        ...node,
        position: positionById.get(node.id) ?? node.position,
    }));
}

export function collectPipelineContextErrors(
    issues: ValidationIssue[],
): Record<string, string> {
    return Object.fromEntries(
        issues
            .filter(issue => !issue.stepKey && issue.field)
            .map(issue => [String(issue.field), issue.message]),
    );
}

export function collectNodeIssueCounts(
    issues: ValidationIssue[],
): Map<string, number> {
    const counts = new Map<string, number>();
    for (const issue of issues) {
        if (!issue.stepKey) continue;
        counts.set(issue.stepKey, (counts.get(issue.stepKey) ?? 0) + 1);
    }
    return counts;
}

export function decorateNodesWithIssueCounts(
    nodes: Node<PipelineNodeData>[],
    issueCounts: ReadonlyMap<string, number>,
): Node<PipelineNodeData>[] {
    return nodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            validationIssueCount: issueCounts.get(node.id),
        },
    }));
}
