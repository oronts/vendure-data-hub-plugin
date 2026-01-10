/**
 * Pipeline Definition Validator
 *
 * Main validator for pipeline definitions. Provides a throwing interface
 * for convenience while delegating to the modular validators.
 *
 * Uses constants from ../constants for consistency:
 * - StepType enum for valid step types
 * - PipelineErrorCode for error codes
 * - FIELD_LIMITS for constraints
 */

import { PipelineDefinition, PipelineStepDefinition, StepType, JsonObject } from '../types/index';
import { PipelineDefinitionError, PipelineDefinitionIssue } from './pipeline-definition-error';

// TYPE GUARDS

/**
 * Type guard for StepType enum
 */
function isStepType(value: string): value is StepType {
    return Object.values(StepType).includes(value as StepType);
}

// EDGE TYPES

/**
 * Pipeline edge connecting steps
 */
interface PipelineEdge {
    from: string;
    to: string;
    branch?: string;
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
        throw new PipelineDefinitionError([{ message: 'Invalid pipeline definition' }]);
    }

    // Coerce version to number if string
    let version = definition.version;
    if (typeof version === 'string') {
        version = parseInt(version, 10);
    }
    if (typeof version !== 'number' || isNaN(version) || version < 1) {
        throw new PipelineDefinitionError([{ message: 'PipelineDefinition.version must be a positive number' }]);
    }
    // Update the definition with coerced version
    (definition as any).version = version;

    if (!Array.isArray(definition.steps)) {
        throw new PipelineDefinitionError([{ message: 'PipelineDefinition.steps must be an array' }]);
    }

    // Validate individual steps
    const keys = new Set<string>();
    const firstStep = definition.steps[0];

    definition.steps.forEach((step: PipelineStepDefinition, index: number) => {
        validateStep(step, index, keys);
    });

    // Extract edges from definition
    const edges: PipelineEdge[] = Array.isArray((definition as any).edges)
        ? ((definition as any).edges as PipelineEdge[])
        : [];

    // Linear validations (no edges): first step should be TRIGGER or EXTRACT
    // EXTRACT is allowed for visual editor pipelines that start with a data source
    if (edges.length === 0) {
        if (firstStep && firstStep.type !== StepType.TRIGGER && firstStep.type !== StepType.EXTRACT) {
            throw new PipelineDefinitionError([{ message: 'First step should be a TRIGGER or EXTRACT (data source)' }]);
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
        throw new PipelineDefinitionError([{ message: `Step at index ${index} is invalid` }]);
    }

    if (typeof step.key !== 'string' || step.key.length === 0) {
        throw new PipelineDefinitionError([{ message: `Step at index ${index} must have a non-empty key` }]);
    }

    if (keys.has(step.key)) {
        throw new PipelineDefinitionError([
            { message: `Duplicate step key: ${step.key}`, stepKey: step.key, reason: 'duplicate-step-key' },
        ]);
    }
    keys.add(step.key);

    if (!isStepType(step.type as string)) {
        throw new PipelineDefinitionError([
            { message: `Step ${step.key} has invalid type ${String(step.type)}`, stepKey: step.key, reason: 'invalid-step-type' },
        ]);
    }

    if (!step.config || typeof step.config !== 'object') {
        throw new PipelineDefinitionError([
            { message: `Step ${step.key} must have a config object`, stepKey: step.key, reason: 'missing-config' },
        ]);
    }

    if (step.concurrency !== undefined && step.concurrency! < 1) {
        throw new PipelineDefinitionError([
            { message: `Step ${step.key} has invalid concurrency`, stepKey: step.key, reason: 'invalid-concurrency' },
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
    for (const e of edges) {
        if (!e || typeof e !== 'object') {
            errors.push({ message: 'Invalid edge entry', reason: 'invalid-edge' });
            continue;
        }

        if (!e.from || !e.to) {
            errors.push({ message: 'Edge missing from/to', reason: 'edge-missing-nodes' });
            continue;
        }

        if (!stepByKey.has(e.from)) {
            errors.push({ message: `Edge from unknown step "${e.from}"`, stepKey: e.from, reason: 'edge-unknown-source' });
        }

        if (!stepByKey.has(e.to)) {
            errors.push({ message: `Edge to unknown step "${e.to}"`, stepKey: e.to, reason: 'edge-unknown-target' });
        }

        if (e.from === e.to) {
            errors.push({ message: `Edge cannot point to itself: "${e.from}"`, stepKey: e.from, reason: 'edge-self-loop' });
        }

        // Validate branch references
        if (e.branch) {
            const fromStep = stepByKey.get(e.from);
            if (!fromStep || fromStep.type !== StepType.ROUTE) {
                errors.push({
                    message: `Edge from "${e.from}" specifies branch but source is not a ROUTE step`,
                    stepKey: e.from,
                    reason: 'edge-branch-non-route',
                });
            } else {
                const branches = ((fromStep.config as JsonObject)?.branches ?? []) as Array<{ name: string }>;
                const names = new Set<string>(branches.map(b => String(b?.name ?? '')));
                if (!names.has(e.branch)) {
                    errors.push({
                        message: `Edge from "${e.from}" references unknown branch "${e.branch}"`,
                        stepKey: e.from,
                        reason: 'edge-unknown-branch',
                    });
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
    for (const s of steps) {
        if (s.type === StepType.ROUTE) {
            const branches = ((s.config as JsonObject)?.branches ?? []) as Array<{ name: string }>;

            if (!Array.isArray(branches) || branches.length === 0) {
                errors.push({
                    message: `Step "${s.key}": ROUTE requires non-empty branches[]`,
                    stepKey: s.key,
                    reason: 'route-missing-branches',
                });
            } else {
                const seen = new Set<string>();
                for (const b of branches) {
                    const name = String((b as any)?.name ?? '');
                    if (!name) {
                        errors.push({
                            message: `Step "${s.key}": ROUTE branch missing name`,
                            stepKey: s.key,
                            reason: 'route-branch-missing-name',
                        });
                    } else if (seen.has(name)) {
                        errors.push({
                            message: `Step "${s.key}": duplicate branch name "${name}"`,
                            stepKey: s.key,
                            reason: 'route-branch-duplicate',
                        });
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

    if (roots.length !== 1) {
        errors.push({ message: `Graph must have exactly one root; found ${roots.length}`, reason: 'invalid-root-count' });
    } else {
        const root = stepByKey.get(roots[0]);
        // Allow TRIGGER or EXTRACT as root (EXTRACT for visual editor pipelines)
        if (!root || (root.type !== StepType.TRIGGER && root.type !== StepType.EXTRACT)) {
            errors.push({ message: 'Root step must be a TRIGGER or EXTRACT (data source)', stepKey: root?.key, reason: 'invalid-root-type' });
        }
    }

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
        errors.push({ message: 'Graph contains a cycle or disconnected component', reason: 'graph-cycle' });
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
            errors.push({ message: 'No LOAD step is reachable from the TRIGGER', reason: 'no-load-reachable' });
        }
    }
}
