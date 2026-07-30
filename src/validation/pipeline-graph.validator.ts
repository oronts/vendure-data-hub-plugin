import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import {
    JsonObject,
    PipelineEdge,
    PipelineStepDefinition,
    StepType,
} from '../types';
import {
    PipelineDefinitionError,
    PipelineDefinitionIssue,
} from './pipeline-definition-error';
import { createPipelineDefinitionIssue } from './pipeline-validation-issues';

export function validatePipelineDag(
    steps: PipelineStepDefinition[],
    edges: PipelineEdge[],
): void {
    const stepByKey = new Map<string, PipelineStepDefinition>();
    for (const step of steps) {
        stepByKey.set(step.key, step);
    }

    const errors: PipelineDefinitionIssue[] = [];
    validateEdges(edges, stepByKey, errors);
    validateRouteSteps(steps, errors);
    validateTopology(steps, edges, stepByKey, errors);

    if (errors.length > 0) {
        throw new PipelineDefinitionError(errors);
    }
}

function validateEdges(
    edges: PipelineEdge[],
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    for (let index = 0; index < edges.length; index++) {
        const edge = edges[index];
        if (!edge || typeof edge !== 'object') {
            errors.push(createPipelineDefinitionIssue(
                'Invalid edge entry',
                PIPELINE_VALIDATION_ERROR.INVALID_EDGE,
                undefined,
                `edges[${index}]`,
            ));
            continue;
        }

        if (!edge.from || !edge.to) {
            errors.push(createPipelineDefinitionIssue(
                'Edge missing from/to',
                PIPELINE_VALIDATION_ERROR.EDGE_MISSING_NODES,
                undefined,
                `edges[${index}]`,
            ));
            continue;
        }

        if (!stepByKey.has(edge.from)) {
            errors.push(createPipelineDefinitionIssue(
                `Edge from unknown step "${edge.from}"`,
                PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_SOURCE,
                edge.from,
                `edges[${index}].from`,
            ));
        }

        if (!stepByKey.has(edge.to)) {
            errors.push(createPipelineDefinitionIssue(
                `Edge to unknown step "${edge.to}"`,
                PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_TARGET,
                edge.to,
                `edges[${index}].to`,
            ));
        }

        if (edge.from === edge.to) {
            errors.push(createPipelineDefinitionIssue(
                `Edge cannot point to itself: "${edge.from}"`,
                PIPELINE_VALIDATION_ERROR.EDGE_SELF_LOOP,
                edge.from,
                `edges[${index}]`,
            ));
        }

        if (edge.branch) {
            validateEdgeBranch(edge, index, stepByKey, errors);
        }
    }
}

function validateEdgeBranch(
    edge: PipelineEdge,
    index: number,
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    const branch = edge.branch;
    if (!branch) return;

    const fromStep = stepByKey.get(edge.from);
    if (!fromStep || fromStep.type !== StepType.ROUTE) {
        errors.push(createPipelineDefinitionIssue(
            `Edge from "${edge.from}" specifies branch but source is not a ROUTE step`,
            PIPELINE_VALIDATION_ERROR.EDGE_BRANCH_NON_ROUTE,
            edge.from,
            `edges[${index}].branch`,
        ));
        return;
    }

    const rawBranches = (fromStep.config as JsonObject)?.branches;
    const branches = Array.isArray(rawBranches)
        ? rawBranches as Array<{ name: string }>
        : [];
    const names = new Set<string>(branches.map(branch => String(branch?.name ?? '')));
    if (branch !== 'default' && !names.has(branch)) {
        errors.push(createPipelineDefinitionIssue(
            `Edge from "${edge.from}" references unknown branch "${branch}"`,
            PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_BRANCH,
            edge.from,
            `edges[${index}].branch`,
        ));
    }
}

function validateRouteSteps(
    steps: PipelineStepDefinition[],
    errors: PipelineDefinitionIssue[],
): void {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
        const step = steps[stepIndex];
        if (step.type !== StepType.ROUTE) continue;

        const rawBranches = (step.config as JsonObject)?.branches;
        const branches = Array.isArray(rawBranches)
            ? rawBranches as Array<{ name: string }>
            : [];
        if (!Array.isArray(branches) || branches.length === 0) {
            errors.push(createPipelineDefinitionIssue(
                `Step "${step.key}": ROUTE requires non-empty branches[]`,
                PIPELINE_VALIDATION_ERROR.ROUTE_MISSING_BRANCHES,
                step.key,
                `steps[${stepIndex}].config.branches`,
            ));
            continue;
        }

        const seen = new Set<string>();
        for (let branchIndex = 0; branchIndex < branches.length; branchIndex++) {
            const branch = branches[branchIndex] as { name?: string } | undefined;
            const name = String(branch?.name ?? '');
            if (!name) {
                errors.push(createPipelineDefinitionIssue(
                    `Step "${step.key}": ROUTE branch missing name`,
                    PIPELINE_VALIDATION_ERROR.ROUTE_BRANCH_MISSING_NAME,
                    step.key,
                    `steps[${stepIndex}].config.branches[${branchIndex}].name`,
                ));
            } else if (seen.has(name)) {
                errors.push(createPipelineDefinitionIssue(
                    `Step "${step.key}": duplicate branch name "${name}"`,
                    PIPELINE_VALIDATION_ERROR.ROUTE_BRANCH_DUPLICATE,
                    step.key,
                    `steps[${stepIndex}].config.branches[${branchIndex}].name`,
                ));
            }
            seen.add(name);
        }
    }
}

function validateTopology(
    steps: PipelineStepDefinition[],
    edges: PipelineEdge[],
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
        inDegree.set(step.key, 0);
        adjacency.set(step.key, []);
    }

    for (const edge of edges) {
        if (!edge || typeof edge !== 'object') continue;
        inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
        adjacency.get(edge.from)?.push(edge.to);
    }

    const roots = Array.from(inDegree.entries())
        .filter(([, degree]) => (degree ?? 0) === 0)
        .map(([key]) => key);
    const triggerRoots = roots.filter(
        key => stepByKey.get(key)?.type === StepType.TRIGGER,
    );
    const executionRoots = roots.filter(
        key => stepByKey.get(key)?.type !== StepType.TRIGGER,
    );

    validateRoots(roots, triggerRoots, executionRoots, stepByKey, errors);

    const queue = roots.slice();
    const visited: string[] = [];
    const remainingInDegree = new Map(inDegree);

    while (queue.length > 0) {
        const node = queue.shift();
        if (node === undefined) break;
        visited.push(node);
        for (const adjacent of adjacency.get(node) ?? []) {
            remainingInDegree.set(
                adjacent,
                (remainingInDegree.get(adjacent) ?? 0) - 1,
            );
            if ((remainingInDegree.get(adjacent) ?? 0) === 0) {
                queue.push(adjacent);
            }
        }
    }

    if (visited.length !== steps.length) {
        errors.push(createPipelineDefinitionIssue(
            'Graph contains a cycle or disconnected component',
            PIPELINE_VALIDATION_ERROR.GRAPH_CYCLE,
            undefined,
            'topology',
        ));
    }

    validateLoadReachability(steps, roots, adjacency, errors);
}

function validateRoots(
    roots: string[],
    triggerRoots: string[],
    executionRoots: string[],
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    if (roots.length === 0) {
        errors.push(createPipelineDefinitionIssue(
            'Graph must have at least one root (entry point)',
            PIPELINE_VALIDATION_ERROR.INVALID_ROOT_COUNT,
            undefined,
            'topology',
        ));
    } else if (executionRoots.length > 1) {
        errors.push(createPipelineDefinitionIssue(
            `Graph has ${executionRoots.length} disconnected execution paths; all triggers should connect to the same first step`,
            PIPELINE_VALIDATION_ERROR.INVALID_ROOT_COUNT,
            undefined,
            'topology',
        ));
    } else if (executionRoots.length === 1 && triggerRoots.length === 0) {
        const root = stepByKey.get(executionRoots[0]);
        if (!root || root.type !== StepType.EXTRACT) {
            errors.push(createPipelineDefinitionIssue(
                'Root step must be a TRIGGER or EXTRACT (data source)',
                PIPELINE_VALIDATION_ERROR.INVALID_ROOT_TYPE,
                root?.key,
                'topology',
            ));
        }
    }
}

function validateLoadReachability(
    steps: PipelineStepDefinition[],
    roots: string[],
    adjacency: Map<string, string[]>,
    errors: PipelineDefinitionIssue[],
): void {
    const hasLoad = steps.some(step => step.type === StepType.LOAD);
    if (roots.length === 0 || !hasLoad) return;

    const reachable = new Set<string>();
    const stack = [...roots];

    while (stack.length > 0) {
        const node = stack.pop();
        if (node === undefined) break;
        if (reachable.has(node)) continue;
        reachable.add(node);
        for (const adjacent of adjacency.get(node) ?? []) {
            stack.push(adjacent);
        }
    }

    const loadReachable = steps.some(
        step => step.type === StepType.LOAD && reachable.has(step.key),
    );
    if (!loadReachable) {
        errors.push(createPipelineDefinitionIssue(
            'No LOAD step is reachable from the TRIGGER',
            PIPELINE_VALIDATION_ERROR.NO_LOAD_REACHABLE,
            undefined,
            'topology',
        ));
    }
}
