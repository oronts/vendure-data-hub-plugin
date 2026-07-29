import type { Edge } from '@xyflow/react';
import type {
    JsonObject,
    PipelineDefinition,
    PipelineEdge,
    PipelineStepDefinition,
} from '../../../../shared/types';
import { mapCategoryToStepType, mapStepTypeToCategory } from '../../../constants';
import type {
    PipelineNode,
    VisualEdgeBaseline,
    VisualNodeBaseline,
    VisualPipelineConversionMetadata,
    VisualPipelineDefinition,
} from '../../../types';
import {
    cloneValue,
    hasOwn,
    isRecord,
    mergeEditedValue,
    stableIdentity,
    valuesEqual,
    type UnknownRecord,
} from '../../../../shared/utils/lossless-conversion';

function resolvedAdapterCode(step: PipelineStepDefinition): string | undefined {
    const configCode = step.config?.adapterCode;
    if (typeof step.adapterCode === 'string') {
        return step.adapterCode;
    }
    return typeof configCode === 'string' ? configCode : undefined;
}

function nodeBaseline(node: PipelineNode, sourceIndex: number): VisualNodeBaseline {
    return {
        sourceIndex,
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        adapterCode: node.data.adapterCode,
        config: cloneValue(node.data.config),
        context: cloneValue(node.data.context),
        schemaRef: cloneValue(node.data.schemaRef),
    };
}

function edgeLabel(edge: Edge): string | undefined {
    return typeof edge.label === 'string' ? edge.label : undefined;
}

function edgeBaseline(
    edge: Edge,
    sourceIndex: number | undefined,
    inferred: boolean,
): VisualEdgeBaseline {
    return {
        sourceIndex,
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edgeLabel(edge),
        inferred,
    };
}

function nodeIdentity(nodes: PipelineNode[]): string {
    return stableIdentity(nodes
        .map(node => ({
            id: node.id,
            type: node.data.type,
            label: node.data.label,
            adapterCode: node.data.adapterCode,
            config: node.data.config,
            context: node.data.context,
            schemaRef: node.data.schemaRef,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)));
}

function edgeIdentity(edges: Edge[]): string {
    return stableIdentity(edges
        .map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            label: edgeLabel(edge),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)));
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

function createVisualNodes(steps: PipelineStepDefinition[]): PipelineNode[] {
    return steps.map((step, index) => {
        const id = String(step.key ?? `step-${index}`);
        const type = mapStepTypeToCategory(step.type);
        return {
            id,
            type,
            position: { x: 0, y: 0 },
            data: {
                label: step.name || step.label || step.key || `Step ${index + 1}`,
                type,
                adapterCode: resolvedAdapterCode(step),
                config: cloneValue(step.config ?? {}),
                context: cloneValue(step.context),
                schemaRef: cloneValue(step.schemaRef),
            },
        };
    });
}

function createVisualEdges(
    canonicalEdges: PipelineEdge[] | undefined,
    nodes: PipelineNode[],
): { edges: Edge[]; inferred: boolean } {
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

function createConversionMetadata(
    source: UnknownRecord,
    nodes: PipelineNode[],
    edges: Edge[],
    inferredEdges: boolean,
): VisualPipelineConversionMetadata {
    return {
        source: cloneValue(source),
        nodeIdentity: nodeIdentity(nodes),
        edgeIdentity: edgeIdentity(edges),
        nodes: nodes.map((node, index) => nodeBaseline(node, index)),
        edges: edges.map((edge, index) => edgeBaseline(
            edge,
            inferredEdges ? undefined : index,
            inferredEdges,
        )),
    };
}

function isVisualPipelineDefinition(
    definition: PipelineDefinition | VisualPipelineDefinition,
): definition is VisualPipelineDefinition {
    return 'nodes' in definition && Array.isArray(definition.nodes);
}

export function convertToVisualDefinition(
    definition: PipelineDefinition | VisualPipelineDefinition | undefined,
): VisualPipelineDefinition {
    if (!definition) {
        return { nodes: [], edges: [], variables: {} };
    }

    if (isVisualPipelineDefinition(definition)) {
        return definition;
    }

    const source = cloneValue(definition as unknown as UnknownRecord);
    const steps = Array.isArray(definition.steps) ? definition.steps : [];
    const nodes = createVisualNodes(steps);
    const { edges, inferred } = createVisualEdges(definition.edges, nodes);
    const visual: VisualPipelineDefinition = {
        nodes,
        edges,
        variables: cloneValue((definition.context ?? {}) as JsonObject),
        capabilities: cloneValue(definition.capabilities),
        dependsOn: cloneValue(definition.dependsOn),
        trigger: cloneValue(source.trigger),
    };
    visual.conversion = createConversionMetadata(source, nodes, edges, inferred);
    return visual;
}

function updateAdapterCode(
    step: UnknownRecord,
    sourceStep: UnknownRecord,
    adapterCode: string | undefined,
): void {
    const sourceConfig = isRecord(sourceStep.config) ? sourceStep.config : {};
    const stepConfig = isRecord(step.config) ? step.config : {};
    const hadStepCode = hasOwn(sourceStep, 'adapterCode');
    const hadConfigCode = hasOwn(sourceConfig, 'adapterCode');

    if (adapterCode) {
        if (hadStepCode || !hadConfigCode) {
            step.adapterCode = adapterCode;
        }
        if (hadConfigCode) {
            stepConfig.adapterCode = adapterCode;
        }
    } else {
        delete step.adapterCode;
        delete stepConfig.adapterCode;
    }
    step.config = stepConfig;
}

function updateStepLabel(
    step: UnknownRecord,
    sourceStep: UnknownRecord,
    label: string,
): void {
    if (hasOwn(sourceStep, 'name')) {
        step.name = label;
        return;
    }
    if (hasOwn(sourceStep, 'label')) {
        step.label = label;
        return;
    }
    step.name = label;
}

function convertNodeToStep(
    node: PipelineNode,
    index: number,
    metadata: VisualPipelineConversionMetadata | undefined,
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
            type: mapCategoryToStepType(node.data.type),
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
        result.type = mapCategoryToStepType(node.data.type);
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

function convertEdgeToCanonical(
    edge: Edge,
    index: number,
    metadata: VisualPipelineConversionMetadata | undefined,
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
        const result: PipelineEdge = {
            id: edge.id ?? `edge-${index}`,
            from: edge.source,
            to: edge.target,
        };
        if (edge.sourceHandle) {
            result.branch = edge.sourceHandle;
        }
        const label = edgeLabel(edge);
        if (label !== undefined) {
            result.label = label;
        }
        return result;
    }

    const result = cloneValue(sourceValue);
    if (edge.id !== baseline.id) {
        result.id = edge.id;
    }
    if (edge.source !== baseline.source) {
        result.from = edge.source;
    }
    if (edge.target !== baseline.target) {
        result.to = edge.target;
    }
    if (edge.sourceHandle !== baseline.sourceHandle) {
        if (edge.sourceHandle) {
            result.branch = edge.sourceHandle;
        } else {
            delete result.branch;
        }
    }
    const label = edgeLabel(edge);
    if (label !== baseline.label) {
        if (label === undefined) {
            delete result.label;
        } else {
            result.label = label;
        }
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
    if (valuesEqual(current, baseline)) {
        return;
    }
    if (current === undefined) {
        delete result[canonicalKey];
        return;
    }
    result[canonicalKey] = mergeEditedValue(source[canonicalKey], baseline, current);
}

function visualToCanonical(visual: VisualPipelineDefinition): PipelineDefinition {
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
            convertNodeToStep(node, index, metadata));
    }
    if (!metadata || !edgesUnchanged) {
        result.edges = (visual.edges ?? []).map((edge, index) =>
            convertEdgeToCanonical(edge, index, metadata));
    }

    const sourceRoot = rootViewFromSource(source);
    const visualRoot = rootViewFromVisual(visual);
    applyRootEdit(result, source, 'context', sourceRoot.variables, visualRoot.variables);
    applyRootEdit(result, source, 'capabilities', sourceRoot.capabilities, visualRoot.capabilities);
    applyRootEdit(result, source, 'dependsOn', sourceRoot.dependsOn, visualRoot.dependsOn);
    applyRootEdit(result, source, 'trigger', sourceRoot.trigger, visualRoot.trigger);

    if (!Array.isArray(result.steps)) {
        result.steps = [];
    }
    if (typeof result.version !== 'number' || result.version <= 0) {
        result.version = 1;
    }
    return result as unknown as PipelineDefinition;
}

export function convertToCanonicalDefinition(
    definition: VisualPipelineDefinition | PipelineDefinition | undefined,
): PipelineDefinition {
    if (!definition) {
        return { version: 1, steps: [] };
    }
    const candidate = definition as unknown as UnknownRecord;
    if (Array.isArray(candidate.nodes)) {
        return visualToCanonical(definition as VisualPipelineDefinition);
    }
    if (Array.isArray(candidate.steps)) {
        const canonical = cloneValue(candidate);
        if (typeof canonical.version !== 'number' || canonical.version <= 0) {
            canonical.version = 1;
        }
        return canonical as unknown as PipelineDefinition;
    }
    return { version: 1, steps: [], ...cloneValue(candidate) } as unknown as PipelineDefinition;
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
