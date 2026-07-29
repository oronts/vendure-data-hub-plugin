/**
 * Utility functions for converting between canonical (steps-based) and visual (nodes/edges-based)
 * pipeline definitions.
 */
import type { PipelineDefinition } from '../../../../shared/types';
import type { VisualPipelineDefinition, PipelineNode } from '../../../types';
import { NODE_LAYOUT } from '../../../constants';
import {
    convertToCanonicalDefinition,
    convertToVisualDefinition,
} from './pipeline-format-conversion';

/**
 * Calculate node levels in DAG based on edge connections.
 * Nodes at the same level can run in parallel.
 * Protected against cycles with max iteration limit.
 */
function calculateNodeLevels(
    nodes: PipelineNode[],
    edges: Array<{ source: string; target: string }>
): Map<string, number> {
    const levels = new Map<string, number>();
    const incomingEdges = new Map<string, string[]>();
    const outgoingEdges = new Map<string, string[]>();

    for (const node of nodes) {
        incomingEdges.set(node.id, []);
        outgoingEdges.set(node.id, []);
    }

    for (const edge of edges) {
        const incoming = incomingEdges.get(edge.target) ?? [];
        incoming.push(edge.source);
        incomingEdges.set(edge.target, incoming);

        const outgoing = outgoingEdges.get(edge.source) ?? [];
        outgoing.push(edge.target);
        outgoingEdges.set(edge.source, outgoing);
    }

    const entryNodes = nodes.filter(n => (incomingEdges.get(n.id) ?? []).length === 0);
    for (const node of entryNodes) {
        levels.set(node.id, 0);
    }

    const queue = [...entryNodes.map(n => n.id)];
    const maxIterations = nodes.length * edges.length + nodes.length;
    let iterations = 0;

    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        const nodeId = queue.shift()!;
        const currentLevel = levels.get(nodeId) ?? 0;

        for (const targetId of outgoingEdges.get(nodeId) ?? []) {
            const existingLevel = levels.get(targetId);
            const newLevel = currentLevel + 1;

            if (existingLevel === undefined || newLevel > existingLevel) {
                levels.set(targetId, newLevel);
                queue.push(targetId);
            }
        }
    }

    for (const node of nodes) {
        if (!levels.has(node.id)) {
            levels.set(node.id, 0);
        }
    }

    return levels;
}

/**
 * Auto-layout nodes in DAG format - parallel nodes stacked vertically.
 */
export function layoutDagNodes(def: VisualPipelineDefinition): VisualPipelineDefinition {
    const nodes = def.nodes ?? [];
    const edges = def.edges ?? [];

    if (nodes.length === 0) {
        return def;
    }

    const levels = calculateNodeLevels(nodes, edges);

    const nodesByLevel = new Map<number, PipelineNode[]>();
    for (const node of nodes) {
        const level = levels.get(node.id) ?? 0;
        const levelNodes = nodesByLevel.get(level) ?? [];
        levelNodes.push(node);
        nodesByLevel.set(level, levelNodes);
    }

    const levelValues = Array.from(levels.values());
    const maxLevel = levelValues.length > 0 ? Math.max(...levelValues) : 0;
    const repositionedNodes: PipelineNode[] = [];

    for (let level = 0; level <= maxLevel; level++) {
        const levelNodes = nodesByLevel.get(level) ?? [];
        const count = levelNodes.length;
        const centerY = NODE_LAYOUT.INITIAL_Y;
        const startY = centerY - ((count - 1) * NODE_LAYOUT.SPACING_Y) / 2;

        for (let i = 0; i < levelNodes.length; i++) {
            const node = levelNodes[i];
            repositionedNodes.push({
                ...node,
                position: {
                    x: NODE_LAYOUT.INITIAL_X + level * NODE_LAYOUT.SPACING_X,
                    y: startY + i * NODE_LAYOUT.SPACING_Y,
                },
            });
        }
    }

    return {
        ...def,
        nodes: repositionedNodes,
    };
}

export function toVisualDefinition(
    def: PipelineDefinition | VisualPipelineDefinition | undefined,
): VisualPipelineDefinition {
    const candidate = def as VisualPipelineDefinition | undefined;
    if (candidate && Array.isArray(candidate.nodes)) {
        return candidate;
    }
    return layoutDagNodes(convertToVisualDefinition(def));
}

export function toCanonicalDefinition(
    def: VisualPipelineDefinition | PipelineDefinition | undefined,
): PipelineDefinition {
    return convertToCanonicalDefinition(def);
}
