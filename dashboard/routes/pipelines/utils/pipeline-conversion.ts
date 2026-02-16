/**
 * Utility functions for converting between canonical (steps-based) and visual (nodes/edges-based)
 * pipeline definitions.
 */
import type { PipelineDefinition } from '../../../../shared/types';
import type { VisualPipelineDefinition, PipelineNode } from '../../../types';
import { NODE_LAYOUT, mapStepTypeToCategory, mapCategoryToStepType } from '../../../constants';

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

/**
 * Convert a canonical pipeline definition to a visual definition for the ReactFlow editor.
 *
 * @param def - The canonical or visual pipeline definition
 * @returns A visual pipeline definition with nodes and edges
 */
export function toVisualDefinition(
    def: PipelineDefinition | VisualPipelineDefinition | undefined
): VisualPipelineDefinition {
    if (!def) {
        return {
            nodes: [],
            edges: [],
            variables: {},
            capabilities: undefined,
            dependsOn: undefined,
            trigger: undefined,
        };
    }

    // Already in visual format
    if ('nodes' in def && def.nodes) {
        return def as VisualPipelineDefinition;
    }

    const canonicalDef = def as PipelineDefinition;
    const steps = Array.isArray(canonicalDef.steps) ? canonicalDef.steps : [];

    const nodes: PipelineNode[] = steps.map((step, i) => {
        const id = String(step.key ?? `step-${i}`);
        const category = mapStepTypeToCategory(step.type);
        const adapterCode = step.config?.adapterCode;
        const label = step.name || step.key || `Step ${i + 1}`;

        return {
            id,
            type: category,
            position: { x: 0, y: 0 },
            data: {
                label,
                type: category,
                adapterCode,
                config: step.config ?? {},
            },
        };
    });

    const canonicalEdges = canonicalDef.edges;
    let edges: Array<{ id: string; source: string; target: string }>;

    if (Array.isArray(canonicalEdges) && canonicalEdges.length) {
        edges = canonicalEdges.map((e, idx) => ({
            id: String(e.id ?? `edge-${idx}`),
            source: String(e.from),
            target: String(e.to),
        }));
    } else {
        edges = nodes.slice(1).map((n, i) => ({
            id: `edge-${i}`,
            source: nodes[i].id,
            target: n.id,
        }));
    }

    const visualDef: VisualPipelineDefinition = {
        nodes,
        edges,
        variables: canonicalDef.context ?? {},
        capabilities: canonicalDef.capabilities,
        dependsOn: canonicalDef.dependsOn,
        trigger: canonicalDef.trigger,
    };

    return layoutDagNodes(visualDef);
}

/**
 * Convert a visual pipeline definition back to canonical format for storage.
 *
 * @param def - The visual or canonical pipeline definition
 * @returns A canonical pipeline definition with steps and edges
 */
export function toCanonicalDefinition(
    def: VisualPipelineDefinition | PipelineDefinition | undefined
): PipelineDefinition {
    if (!def) {
        return { version: 1, steps: [] };
    }

    // Check if it's a visual definition with nodes
    if ('nodes' in def && Array.isArray(def.nodes) && def.nodes.length > 0) {
        const visualDef = def as VisualPipelineDefinition;
        const steps = visualDef.nodes.map((node, idx) => {
            const stepType = mapCategoryToStepType(node.data?.type);
            const adapterCode =
                node.data?.adapterCode || (node.data?.config?.adapterCode as string) || '';
            const existingConfig = node.data?.config ?? {};
            const { adapterCode: _, ...restConfig } = existingConfig;

            return {
                key: node.id ?? `step-${idx}`,
                type: stepType,
                name: node.data?.label,
                config: {
                    ...restConfig,
                    adapterCode,
                },
            };
        });

        const edges = (visualDef.edges ?? []).map((e, i) => ({
            id: e.id ?? `edge-${i}`,
            from: e.source,
            to: e.target,
        }));

        return {
            version: 1,
            steps,
            edges,
            context: visualDef.variables ?? {},
            ...(visualDef.capabilities ? { capabilities: visualDef.capabilities } : {}),
            ...(visualDef.dependsOn ? { dependsOn: visualDef.dependsOn } : {}),
            ...(visualDef.trigger ? { trigger: visualDef.trigger } : {}),
        };
    }

    // Check if it's already canonical format
    if ('steps' in def && Array.isArray(def.steps)) {
        const canonicalDef = def as PipelineDefinition;
        return {
            ...canonicalDef,
            version:
                typeof canonicalDef.version === 'number' && canonicalDef.version > 0
                    ? canonicalDef.version
                    : 1,
        };
    }

    // Fallback: return default with any extra properties
    return { version: 1, steps: [], ...def };
}
