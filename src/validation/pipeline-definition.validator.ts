import { PipelineDefinition, PipelineStepDefinition, PipelineEdge, StepType, JsonObject } from '../types/index';
import { PipelineDefinitionError, PipelineDefinitionIssue } from './pipeline-definition-error';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';

function createIssue(
    message: string,
    errorCode: string,
    stepKey?: string,
    field?: string,
): PipelineDefinitionIssue {
    return { message, errorCode, stepKey, field };
}

/**
 * Type guard for StepType enum
 */
function isStepType(value: string): value is StepType {
    return Object.values(StepType).includes(value as StepType);
}

// MAIN VALIDATOR

/**
 * Validates a pipeline definition and throws on error.
 *
 * Performs the following validations:
 * 1. Basic structure validation (object, version, steps array)
 * 2. Step validation (keys, types, config, concurrency)
 * 3. Edge validation (referential integrity, branch semantics)
 * 4. Topology validation (single root, acyclic, reachability)
 *
 * @param definition - The pipeline definition to validate
 * @throws Error if validation fails with detailed error messages
 */
export function validatePipelineDefinition(definition: PipelineDefinition): void {
    if (!definition || typeof definition !== 'object') {
        throw new PipelineDefinitionError([
            createIssue('Invalid pipeline definition', PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION),
        ]);
    }

    // Coerce version to number if string
    let version = definition.version;
    if (typeof version === 'string') {
        version = parseInt(version, 10);
    }
    if (typeof version !== 'number' || isNaN(version) || version < 1) {
        throw new PipelineDefinitionError([
            createIssue('PipelineDefinition.version must be a positive number', PIPELINE_VALIDATION_ERROR.INVALID_VERSION, undefined, 'version'),
        ]);
    }
    // Update the definition with coerced version (mutable operation for validation normalization)
    (definition as { version: number }).version = version;

    if (!Array.isArray(definition.steps)) {
        throw new PipelineDefinitionError([
            createIssue('PipelineDefinition.steps must be an array', PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION, undefined, 'steps'),
        ]);
    }

    // Validate individual steps
    const keys = new Set<string>();
    const firstStep = definition.steps[0];

    definition.steps.forEach((step: PipelineStepDefinition, index: number) => {
        validateStep(step, index, keys);
    });

    // Extract edges from definition
    const edges: PipelineEdge[] = definition.edges ?? [];

    // Linear validations (no edges): first step should be TRIGGER or EXTRACT
    // EXTRACT is allowed for visual editor pipelines that start with a data source
    if (edges.length === 0) {
        if (firstStep && firstStep.type !== StepType.TRIGGER && firstStep.type !== StepType.EXTRACT) {
            throw new PipelineDefinitionError([
                createIssue('First step should be a TRIGGER or EXTRACT (data source)', PIPELINE_VALIDATION_ERROR.INVALID_ROOT_TYPE, firstStep?.key, 'steps[0].type'),
            ]);
        }
        return;
    }

    // DAG validations when edges are present
    validateDagTopology(definition.steps, edges);
}

// STEP VALIDATION

/**
 * Validates a single pipeline step
 */
function validateStep(
    step: PipelineStepDefinition,
    index: number,
    keys: Set<string>,
): void {
    if (!step || typeof step !== 'object') {
        throw new PipelineDefinitionError([
            createIssue(`Step at index ${index} is invalid`, PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION, undefined, `steps[${index}]`),
        ]);
    }

    if (typeof step.key !== 'string' || step.key.length === 0) {
        throw new PipelineDefinitionError([
            createIssue(`Step at index ${index} must have a non-empty key`, PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION, undefined, `steps[${index}].key`),
        ]);
    }

    if (keys.has(step.key)) {
        throw new PipelineDefinitionError([
            createIssue(`Duplicate step key: ${step.key}`, PIPELINE_VALIDATION_ERROR.DUPLICATE_STEP_KEY, step.key, `steps[${index}].key`),
        ]);
    }
    keys.add(step.key);

    if (!isStepType(step.type as string)) {
        throw new PipelineDefinitionError([
            createIssue(`Step ${step.key} has invalid type ${String(step.type)}`, PIPELINE_VALIDATION_ERROR.INVALID_STEP_TYPE, step.key, `steps[${index}].type`),
        ]);
    }

    if (!step.config || typeof step.config !== 'object') {
        throw new PipelineDefinitionError([
            createIssue(`Step ${step.key} must have a config object`, PIPELINE_VALIDATION_ERROR.MISSING_CONFIG, step.key, `steps[${index}].config`),
        ]);
    }

    if (step.concurrency !== undefined && step.concurrency < 1) {
        throw new PipelineDefinitionError([
            createIssue(`Step ${step.key} has invalid concurrency`, PIPELINE_VALIDATION_ERROR.INVALID_CONCURRENCY, step.key, `steps[${index}].concurrency`),
        ]);
    }
}

// DAG TOPOLOGY VALIDATION

/**
 * Validates DAG topology when edges are present
 */
function validateDagTopology(
    steps: PipelineStepDefinition[],
    edges: PipelineEdge[],
): void {
    const stepByKey = new Map<string, PipelineStepDefinition>();
    for (const s of steps) {
        stepByKey.set(s.key, s);
    }

    const errors: PipelineDefinitionIssue[] = [];

    // Validate edges referential integrity and branch semantics
    validateEdges(edges, stepByKey, errors);

    // Validate ROUTE step configurations
    validateRouteSteps(steps, errors);

    // Validate topology: single root, acyclic, reachability
    validateTopology(steps, edges, stepByKey, errors);

    if (errors.length > 0) {
        throw new PipelineDefinitionError(errors);
    }
}

/**
 * Validates edge referential integrity and branch semantics
 */
function validateEdges(
    edges: PipelineEdge[],
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (!e || typeof e !== 'object') {
            errors.push(createIssue('Invalid edge entry', PIPELINE_VALIDATION_ERROR.INVALID_EDGE, undefined, `edges[${i}]`));
            continue;
        }

        if (!e.from || !e.to) {
            errors.push(createIssue('Edge missing from/to', PIPELINE_VALIDATION_ERROR.EDGE_MISSING_NODES, undefined, `edges[${i}]`));
            continue;
        }

        if (!stepByKey.has(e.from)) {
            errors.push(createIssue(`Edge from unknown step "${e.from}"`, PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_SOURCE, e.from, `edges[${i}].from`));
        }

        if (!stepByKey.has(e.to)) {
            errors.push(createIssue(`Edge to unknown step "${e.to}"`, PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_TARGET, e.to, `edges[${i}].to`));
        }

        if (e.from === e.to) {
            errors.push(createIssue(`Edge cannot point to itself: "${e.from}"`, PIPELINE_VALIDATION_ERROR.EDGE_SELF_LOOP, e.from, `edges[${i}]`));
        }

        // Validate branch references
        if (e.branch) {
            const fromStep = stepByKey.get(e.from);
            if (!fromStep || fromStep.type !== StepType.ROUTE) {
                errors.push(createIssue(
                    `Edge from "${e.from}" specifies branch but source is not a ROUTE step`,
                    PIPELINE_VALIDATION_ERROR.EDGE_BRANCH_NON_ROUTE,
                    e.from,
                    `edges[${i}].branch`,
                ));
            } else {
                const branches = ((fromStep.config as JsonObject)?.branches ?? []) as Array<{ name: string }>;
                const names = new Set<string>(branches.map(b => String(b?.name ?? '')));
                if (!names.has(e.branch)) {
                    errors.push(createIssue(
                        `Edge from "${e.from}" references unknown branch "${e.branch}"`,
                        PIPELINE_VALIDATION_ERROR.EDGE_UNKNOWN_BRANCH,
                        e.from,
                        `edges[${i}].branch`,
                    ));
                }
            }
        }
    }
}

/**
 * Validates ROUTE step configurations
 */
function validateRouteSteps(
    steps: PipelineStepDefinition[],
    errors: PipelineDefinitionIssue[],
): void {
    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.type === StepType.ROUTE) {
            const branches = ((s.config as JsonObject)?.branches ?? []) as Array<{ name: string }>;

            if (!Array.isArray(branches) || branches.length === 0) {
                errors.push(createIssue(
                    `Step "${s.key}": ROUTE requires non-empty branches[]`,
                    PIPELINE_VALIDATION_ERROR.ROUTE_MISSING_BRANCHES,
                    s.key,
                    `steps[${i}].config.branches`,
                ));
            } else {
                const seen = new Set<string>();
                for (let j = 0; j < branches.length; j++) {
                    const b = branches[j] as { name?: string } | undefined;
                    const name = String(b?.name ?? '');
                    if (!name) {
                        errors.push(createIssue(
                            `Step "${s.key}": ROUTE branch missing name`,
                            PIPELINE_VALIDATION_ERROR.ROUTE_BRANCH_MISSING_NAME,
                            s.key,
                            `steps[${i}].config.branches[${j}].name`,
                        ));
                    } else if (seen.has(name)) {
                        errors.push(createIssue(
                            `Step "${s.key}": duplicate branch name "${name}"`,
                            PIPELINE_VALIDATION_ERROR.ROUTE_BRANCH_DUPLICATE,
                            s.key,
                            `steps[${i}].config.branches[${j}].name`,
                        ));
                    }
                    seen.add(name);
                }
            }
        }
    }
}

/**
 * Validates graph topology: single root, acyclic, reachability
 */
function validateTopology(
    steps: PipelineStepDefinition[],
    edges: PipelineEdge[],
    stepByKey: Map<string, PipelineStepDefinition>,
    errors: PipelineDefinitionIssue[],
): void {
    // Build adjacency list and in-degree map
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const s of steps) {
        indeg.set(s.key, 0);
        adj.set(s.key, []);
    }

    for (const e of edges) {
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
        adj.get(e.from)?.push(e.to);
    }

    // Find root nodes (in-degree = 0)
    const roots = Array.from(indeg.entries())
        .filter(([_, v]) => (v ?? 0) === 0)
        .map(([k]) => k);

    // Separate trigger roots from execution roots
    // Multiple triggers are allowed (parallel entry points: manual, schedule, webhook, etc.)
    const triggerRoots = roots.filter(k => stepByKey.get(k)?.type === StepType.TRIGGER);
    const executionRoots = roots.filter(k => stepByKey.get(k)?.type !== StepType.TRIGGER);

    // Validate roots:
    // - Any number of TRIGGER roots is valid (they're parallel entry points)
    // - Exactly one execution root (EXTRACT) if there are no triggers
    // - Zero execution roots if there are triggers (triggers connect to the first step)
    if (roots.length === 0) {
        errors.push(createIssue(
            'Graph must have at least one root (entry point)',
            PIPELINE_VALIDATION_ERROR.INVALID_ROOT_COUNT,
            undefined,
            'topology',
        ));
    } else if (executionRoots.length > 1) {
        // Multiple execution roots (non-trigger) means disconnected execution paths
        errors.push(createIssue(
            `Graph has ${executionRoots.length} disconnected execution paths; all triggers should connect to the same first step`,
            PIPELINE_VALIDATION_ERROR.INVALID_ROOT_COUNT,
            undefined,
            'topology',
        ));
    } else if (executionRoots.length === 1 && triggerRoots.length > 0) {
        // Has both triggers and an unconnected execution root - triggers should connect to execution
        const executionRoot = stepByKey.get(executionRoots[0]);
        if (executionRoot?.type === StepType.EXTRACT) {
            // This is valid - triggers connect to the extract step which is also a root
            // Actually check if all triggers connect to the same step
        }
    } else if (executionRoots.length === 1 && triggerRoots.length === 0) {
        // Single execution root with no triggers - must be EXTRACT
        const root = stepByKey.get(executionRoots[0]);
        if (!root || root.type !== StepType.EXTRACT) {
            errors.push(createIssue(
                'Root step must be a TRIGGER or EXTRACT (data source)',
                PIPELINE_VALIDATION_ERROR.INVALID_ROOT_TYPE,
                root?.key,
                'topology',
            ));
        }
    }
    // If only trigger roots exist (triggerRoots.length > 0 && executionRoots.length === 0),
    // this is valid - multiple parallel triggers feeding into the pipeline

    // Kahn's algorithm for cycle detection
    const queue: string[] = roots.slice();
    const visited: string[] = [];
    const indegCopy = new Map(indeg);

    while (queue.length > 0) {
        const u = queue.shift()!;
        visited.push(u);
        for (const v of adj.get(u) ?? []) {
            indegCopy.set(v, (indegCopy.get(v) ?? 0) - 1);
            if ((indegCopy.get(v) ?? 0) === 0) {
                queue.push(v);
            }
        }
    }

    if (visited.length !== steps.length) {
        errors.push(createIssue(
            'Graph contains a cycle or disconnected component',
            PIPELINE_VALIDATION_ERROR.GRAPH_CYCLE,
            undefined,
            'topology',
        ));
    }

    // Reachability: at least one LOAD reachable from root
    const hasLoad = steps.some(s => s.type === StepType.LOAD);
    if (roots.length === 1 && hasLoad) {
        const reachable = new Set<string>();
        const stack = [roots[0]];

        while (stack.length > 0) {
            const u = stack.pop()!;
            if (reachable.has(u)) continue;
            reachable.add(u);
            for (const v of adj.get(u) ?? []) {
                stack.push(v);
            }
        }

        const loadReachable = steps.some(
            s => s.type === StepType.LOAD && reachable.has(s.key),
        );
        if (!loadReachable) {
            errors.push(createIssue(
                'No LOAD step is reachable from the TRIGGER',
                PIPELINE_VALIDATION_ERROR.NO_LOAD_REACHABLE,
                undefined,
                'topology',
            ));
        }
    }
}
