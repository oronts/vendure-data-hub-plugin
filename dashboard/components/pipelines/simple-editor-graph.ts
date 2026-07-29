import type {
    PipelineDefinition,
    PipelineEdge,
    PipelineStepDefinition,
} from '../../types';

const TRIGGER_STEP_TYPE = 'TRIGGER';

function edgeKey(from: string, to: string): string {
    return `${from}\u0000${to}`;
}

function expectedLinearPairs(steps: PipelineStepDefinition[]): Array<{ from: string; to: string }> {
    const triggers = steps.filter(step => step.type === TRIGGER_STEP_TYPE);
    const executable = steps.filter(step => step.type !== TRIGGER_STEP_TYPE);
    const firstExecutable = executable[0];
    const pairs: Array<{ from: string; to: string }> = [];

    if (firstExecutable) {
        for (const trigger of triggers) {
            pairs.push({ from: trigger.key, to: firstExecutable.key });
        }
    }

    for (let index = 1; index < executable.length; index++) {
        pairs.push({ from: executable[index - 1].key, to: executable[index].key });
    }

    return pairs;
}

function rebuildLinearEdges(
    steps: PipelineStepDefinition[],
    existingEdges: PipelineEdge[],
): PipelineEdge[] {
    const existingByPair = new Map(
        existingEdges.map(edge => [edgeKey(edge.from, edge.to), edge] as const),
    );

    return expectedLinearPairs(steps).map(pair => ({
        ...existingByPair.get(edgeKey(pair.from, pair.to)),
        ...pair,
    }));
}

export function isSimpleLinearGraph(definition: PipelineDefinition): boolean {
    const stepKeys = new Set(definition.steps.map(step => step.key));
    if (stepKeys.size !== definition.steps.length) {
        return false;
    }

    const expectedPairs = new Set(
        expectedLinearPairs(definition.steps).map(pair => edgeKey(pair.from, pair.to)),
    );

    return (definition.edges ?? []).every(edge => (
        stepKeys.has(edge.from) &&
        stepKeys.has(edge.to) &&
        expectedPairs.has(edgeKey(edge.from, edge.to)) &&
        edge.branch == null &&
        edge.condition == null &&
        edge.dependencyOnly !== true
    ));
}

export function appendSimpleStep(
    definition: PipelineDefinition,
    step: PipelineStepDefinition,
): PipelineDefinition {
    if (!isSimpleLinearGraph(definition)) {
        return definition;
    }

    const steps = [...definition.steps];
    const firstExecutableIndex = steps.findIndex(existingStep => (
        existingStep.type !== TRIGGER_STEP_TYPE
    ));
    const insertionIndex = step.type === TRIGGER_STEP_TYPE && firstExecutableIndex >= 0
        ? firstExecutableIndex
        : steps.length;
    steps.splice(insertionIndex, 0, step);
    return {
        ...definition,
        steps,
        edges: rebuildLinearEdges(steps, definition.edges ?? []),
    };
}

export function canMoveSimpleStep(
    definition: PipelineDefinition,
    index: number,
    targetIndex: number,
): boolean {
    if (!isSimpleLinearGraph(definition)) {
        return false;
    }
    const step = definition.steps[index];
    const target = definition.steps[targetIndex];
    if (!step || !target) {
        return false;
    }
    return (step.type === TRIGGER_STEP_TYPE) === (target.type === TRIGGER_STEP_TYPE);
}

export function moveSimpleStep(
    definition: PipelineDefinition,
    index: number,
    targetIndex: number,
): PipelineDefinition {
    if (!canMoveSimpleStep(definition, index, targetIndex)) {
        return definition;
    }

    const steps = [...definition.steps];
    [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
    return {
        ...definition,
        steps,
        edges: rebuildLinearEdges(steps, definition.edges ?? []),
    };
}

export function removeSimpleStep(
    definition: PipelineDefinition,
    index: number,
): PipelineDefinition {
    if (!isSimpleLinearGraph(definition) || !definition.steps[index]) {
        return definition;
    }

    const steps = definition.steps.filter((_, stepIndex) => stepIndex !== index);
    return {
        ...definition,
        steps,
        edges: rebuildLinearEdges(steps, definition.edges ?? []),
    };
}

export function updateSimpleStep(
    definition: PipelineDefinition,
    index: number,
    updatedStep: PipelineStepDefinition,
): PipelineDefinition {
    const currentStep = definition.steps[index];
    if (!currentStep) {
        return definition;
    }

    const steps = [...definition.steps];
    steps[index] = updatedStep;
    const edges = currentStep.key === updatedStep.key
        ? definition.edges
        : definition.edges?.map(edge => ({
            ...edge,
            from: edge.from === currentStep.key ? updatedStep.key : edge.from,
            to: edge.to === currentStep.key ? updatedStep.key : edge.to,
        }));

    return { ...definition, steps, edges };
}
