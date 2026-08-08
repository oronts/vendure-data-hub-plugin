import type { PipelineDefinition, PipelineEdge, PipelineStepDefinition } from '../../types';
import {
    cloneValue,
    hasOwn,
    isRecord,
    mergeEditedValue,
    stableIdentity,
    valuesEqual,
    type UnknownRecord,
} from '../../../shared/utils/lossless-conversion';
import type {
    BackendVisualConversionMetadata,
    BackendVisualEdgeBaseline,
    BackendVisualNodeBaseline,
    VisualEdge,
    VisualNode,
    VisualNodeCategory,
    VisualPipelineDefinition,
} from './pipeline-format.service';

export interface BackendFormatMappings {
    stepTypeToCategory(stepType: string): VisualNodeCategory;
    categoryToStepType(category: string): string;
    categoryToNodeType(category: VisualNodeCategory): string;
    nodePosition(index: number): { x: number; y: number };
}

function resolvedAdapterCode(step: PipelineStepDefinition): string | undefined {
    if (typeof step.adapterCode === 'string') {
        return step.adapterCode;
    }
    const configCode = step.config?.adapterCode;
    return typeof configCode === 'string' ? configCode : undefined;
}

function nodeView(node: VisualNode): UnknownRecord {
    return {
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        adapterCode: node.data.adapterCode,
        config: node.data.config,
        context: node.data.context,
        schemaRef: node.data.schemaRef,
    };
}

function edgeView(edge: VisualEdge): UnknownRecord {
    return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
    };
}

function nodeIdentity(nodes: VisualNode[]): string {
    return stableIdentity(nodes
        .map(nodeView)
        .sort((left, right) => String(left.id).localeCompare(String(right.id))));
}

function edgeIdentity(edges: VisualEdge[]): string {
    return stableIdentity(edges
        .map(edgeView)
        .sort((left, right) => String(left.id).localeCompare(String(right.id))));
}

function rootViewFromSource(source: UnknownRecord): UnknownRecord {
    return {
        variables: isRecord(source.context) ? source.context : {},
        capabilities: source.capabilities,
        dependsOn: source.dependsOn,
        trigger: source.trigger,
    };
}

function rootViewFromVisual(visual: VisualPipelineDefinition): UnknownRecord {
    return {
        variables: visual.variables ?? {},
        capabilities: visual.capabilities,
        dependsOn: visual.dependsOn,
        trigger: visual.trigger,
    };
}

function createVisualNodes(
    steps: PipelineStepDefinition[],
    mappings: BackendFormatMappings,
): VisualNode[] {
    return steps.map((step, index) => {
        const id = String(step.key ?? `step-${index}`);
        const category = mappings.stepTypeToCategory(String(step.type));
        return {
            id,
            type: mappings.categoryToNodeType(category),
            position: mappings.nodePosition(index),
            data: {
                label: step.name || step.label || step.key || `Step ${index + 1}`,
                type: category,
                adapterCode: resolvedAdapterCode(step),
                config: cloneValue(step.config ?? {}) as Record<string, unknown>,
                context: cloneValue(step.context),
                schemaRef: cloneValue(step.schemaRef),
            },
        };
    });
}

function createVisualEdges(
    canonicalEdges: PipelineEdge[] | undefined,
    nodes: VisualNode[],
): { edges: VisualEdge[]; inferred: boolean } {
    if (Array.isArray(canonicalEdges)) {
        return {
            inferred: false,
            edges: canonicalEdges.map((edge, index) => ({
                id: String(edge.id ?? `edge-${index}`),
                source: String(edge.from),
                target: String(edge.to),
                sourceHandle: edge.branch,
                label: edge.label,
            })),
        };
    }
    return {
        inferred: true,
        edges: nodes.slice(1).map((node, index) => ({
            id: `edge-${index}`,
            source: nodes[index].id,
            target: node.id,
        })),
    };
}

function createMetadata(
    source: UnknownRecord,
    nodes: VisualNode[],
    edges: VisualEdge[],
    inferredEdges: boolean,
): BackendVisualConversionMetadata {
    const nodeBaselines: BackendVisualNodeBaseline[] = nodes.map((node, sourceIndex) => ({
        sourceIndex,
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        adapterCode: node.data.adapterCode,
        config: cloneValue(node.data.config),
        context: cloneValue(node.data.context),
        schemaRef: cloneValue(node.data.schemaRef),
    }));
    const edgeBaselines: BackendVisualEdgeBaseline[] = edges.map((edge, sourceIndex) => ({
        sourceIndex: inferredEdges ? undefined : sourceIndex,
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
        inferred: inferredEdges,
    }));
    return {
        source: cloneValue(source),
        nodeIdentity: nodeIdentity(nodes),
        edgeIdentity: edgeIdentity(edges),
        nodes: nodeBaselines,
        edges: edgeBaselines,
    };
}

export function convertBackendToVisual(
    definition: PipelineDefinition | null | undefined,
    mappings: BackendFormatMappings,
): VisualPipelineDefinition {
    if (!definition) {
        return { nodes: [], edges: [], variables: {} };
    }
    const candidate = definition as unknown as UnknownRecord;
    if (Array.isArray(candidate.nodes)) {
        return definition as unknown as VisualPipelineDefinition;
    }

    const source = cloneValue(candidate);
    const steps = Array.isArray(definition.steps) ? definition.steps : [];
    const nodes = createVisualNodes(steps, mappings);
    const { edges, inferred } = createVisualEdges(definition.edges, nodes);
    return {
        nodes,
        edges,
        variables: cloneValue((definition.context ?? {}) as unknown as Record<string, unknown>),
        capabilities: cloneValue(definition.capabilities),
        dependsOn: cloneValue(definition.dependsOn),
        trigger: cloneValue(source.trigger),
        conversion: createMetadata(source, nodes, edges, inferred),
    };
}

function updateAdapterCode(
    result: UnknownRecord,
    sourceStep: UnknownRecord,
    adapterCode: string | undefined,
): void {
    const sourceConfig = isRecord(sourceStep.config) ? sourceStep.config : {};
    const resultConfig = isRecord(result.config) ? result.config : {};
    const hadStepCode = hasOwn(sourceStep, 'adapterCode');
    const hadConfigCode = hasOwn(sourceConfig, 'adapterCode');
    if (adapterCode) {
        if (hadStepCode || !hadConfigCode) {
            result.adapterCode = adapterCode;
        }
        if (hadConfigCode) {
            resultConfig.adapterCode = adapterCode;
        }
    } else {
        delete result.adapterCode;
        delete resultConfig.adapterCode;
    }
    result.config = resultConfig;
}

function updateStepLabel(result: UnknownRecord, sourceStep: UnknownRecord, label: string): void {
    if (hasOwn(sourceStep, 'name')) {
        result.name = label;
    } else if (hasOwn(sourceStep, 'label')) {
        result.label = label;
    } else {
        result.name = label;
    }
}

function convertNode(
    node: VisualNode,
    index: number,
    metadata: BackendVisualConversionMetadata | undefined,
    mappings: BackendFormatMappings,
): PipelineStepDefinition {
    const baseline = metadata?.nodes.find(item => item.id === node.id)
        ?? metadata?.nodes[index];
    const sourceSteps = metadata && Array.isArray(metadata.source.steps)
        ? metadata.source.steps
        : [];
    const sourceValue = baseline ? sourceSteps[baseline.sourceIndex] : undefined;
    if (!baseline || !isRecord(sourceValue)) {
        const config = cloneValue(node.data.config ?? {});
        const result: UnknownRecord = {
            key: node.id ?? `step-${index}`,
            type: mappings.categoryToStepType(node.data.type),
            name: node.data.label,
            config,
        };
        if (node.data.adapterCode && !hasOwn(config, 'adapterCode')) {
            result.adapterCode = node.data.adapterCode;
        }
        if (node.data.context !== undefined) {
            result.context = cloneValue(node.data.context);
        }
        if (node.data.schemaRef !== undefined) {
            result.schemaRef = cloneValue(node.data.schemaRef);
        }
        return result as unknown as PipelineStepDefinition;
    }

    const result = cloneValue(sourceValue);
    if (node.id !== baseline.id) {
        result.key = node.id;
    }
    if (node.data.type !== baseline.type) {
        result.type = mappings.categoryToStepType(node.data.type);
    }
    if (node.data.label !== baseline.label) {
        updateStepLabel(result, sourceValue, node.data.label);
    }
    result.config = mergeEditedValue(
        sourceValue.config ?? {},
        baseline.config,
        node.data.config ?? {},
    );
    if (node.data.adapterCode !== baseline.adapterCode) {
        updateAdapterCode(result, sourceValue, node.data.adapterCode);
    }
    if (!valuesEqual(node.data.context, baseline.context)) {
        if (node.data.context === undefined) {
            delete result.context;
        } else {
            result.context = mergeEditedValue(
                sourceValue.context,
                baseline.context,
                node.data.context,
            );
        }
    }
    if (!valuesEqual(node.data.schemaRef, baseline.schemaRef)) {
        if (node.data.schemaRef === undefined) {
            delete result.schemaRef;
        } else {
            result.schemaRef = cloneValue(node.data.schemaRef);
        }
    }
    return result as unknown as PipelineStepDefinition;
}

function convertEdge(
    edge: VisualEdge,
    index: number,
    metadata: BackendVisualConversionMetadata | undefined,
): PipelineEdge {
    const baseline = metadata?.edges.find(item => item.id === edge.id)
        ?? metadata?.edges[index];
    const sourceEdges = metadata && Array.isArray(metadata.source.edges)
        ? metadata.source.edges
        : [];
    const sourceValue = baseline?.sourceIndex !== undefined
        ? sourceEdges[baseline.sourceIndex]
        : undefined;
    if (!baseline || !isRecord(sourceValue)) {
        return {
            id: edge.id ?? `edge-${index}`,
            from: edge.source,
            to: edge.target,
            ...(edge.sourceHandle ? { branch: edge.sourceHandle } : {}),
            ...(edge.label === undefined ? {} : { label: edge.label }),
        };
    }

    const result = cloneValue(sourceValue);
    if (edge.id !== baseline.id) result.id = edge.id;
    if (edge.source !== baseline.source) result.from = edge.source;
    if (edge.target !== baseline.target) result.to = edge.target;
    if (edge.sourceHandle !== baseline.sourceHandle) {
        if (edge.sourceHandle) result.branch = edge.sourceHandle;
        else delete result.branch;
    }
    if (edge.label !== baseline.label) {
        if (edge.label === undefined) delete result.label;
        else result.label = edge.label;
    }
    return result as unknown as PipelineEdge;
}

function applyRootEdit(
    result: UnknownRecord,
    source: UnknownRecord,
    canonicalKey: string,
    baseline: unknown,
    current: unknown,
): void {
    if (valuesEqual(current, baseline)) return;
    if (current === undefined) {
        delete result[canonicalKey];
        return;
    }
    result[canonicalKey] = mergeEditedValue(source[canonicalKey], baseline, current);
}

function assertUniqueVisualIds(visual: VisualPipelineDefinition): void {
    const nodeIds = new Set<string>();
    for (const node of visual.nodes ?? []) {
        if (nodeIds.has(node.id)) {
            throw new Error(`Duplicate visual node id: "${node.id}"`);
        }
        nodeIds.add(node.id);
    }
    const edgeIds = new Set<string>();
    for (const edge of visual.edges ?? []) {
        if (edgeIds.has(edge.id)) {
            throw new Error(`Duplicate visual edge id: "${edge.id}"`);
        }
        edgeIds.add(edge.id);
    }
}

function visualToCanonical(
    visual: VisualPipelineDefinition,
    mappings: BackendFormatMappings,
): PipelineDefinition {
    assertUniqueVisualIds(visual);
    const metadata = visual.conversion;
    const source = metadata?.source ?? {};
    const nodesUnchanged = metadata?.nodeIdentity === nodeIdentity(visual.nodes ?? []);
    const edgesUnchanged = metadata?.edgeIdentity === edgeIdentity(visual.edges ?? []);
    const rootUnchanged = valuesEqual(rootViewFromVisual(visual), rootViewFromSource(source));
    if (metadata && nodesUnchanged && edgesUnchanged && rootUnchanged) {
        return cloneValue(source) as unknown as PipelineDefinition;
    }

    const result: UnknownRecord = metadata ? cloneValue(source) : { version: 1 };
    if (!metadata || !nodesUnchanged) {
        result.steps = (visual.nodes ?? []).map((node, index) =>
            convertNode(node, index, metadata, mappings));
    }
    if (!metadata || !edgesUnchanged) {
        result.edges = (visual.edges ?? []).map((edge, index) =>
            convertEdge(edge, index, metadata));
    }

    const sourceRoot = rootViewFromSource(source);
    const visualRoot = rootViewFromVisual(visual);
    applyRootEdit(result, source, 'context', sourceRoot.variables, visualRoot.variables);
    applyRootEdit(result, source, 'capabilities', sourceRoot.capabilities, visualRoot.capabilities);
    applyRootEdit(result, source, 'dependsOn', sourceRoot.dependsOn, visualRoot.dependsOn);
    applyRootEdit(result, source, 'trigger', sourceRoot.trigger, visualRoot.trigger);
    if (!Array.isArray(result.steps)) result.steps = [];
    if (typeof result.version !== 'number' || result.version <= 0) result.version = 1;
    return result as unknown as PipelineDefinition;
}

export function convertBackendToCanonical(
    definition: VisualPipelineDefinition | Record<string, unknown> | null | undefined,
    mappings: BackendFormatMappings,
): PipelineDefinition {
    if (!definition) {
        return { version: 1, steps: [] };
    }
    const candidate = definition as UnknownRecord;
    if (Array.isArray(candidate.nodes)) {
        return visualToCanonical(definition as VisualPipelineDefinition, mappings);
    }
    if (Array.isArray(candidate.steps)) {
        const canonical = cloneValue(candidate);
        if (typeof canonical.version !== 'number' || canonical.version <= 0) canonical.version = 1;
        return canonical as unknown as PipelineDefinition;
    }
    return { version: 1, steps: [], ...cloneValue(candidate) } as unknown as PipelineDefinition;
}
