/**
 * Pipeline-Level Validators
 *
 * Provides validation functions for complete pipeline definitions.
 * Validates pipeline structure, graph topology, and cross-step dependencies.
 */

import { StepType, HookStage } from '../../constants/enums';
import { PipelineErrorCode } from '../../constants/error-codes';
import { JsonObject } from '../../types/index';
import { validateSteps, validateRouteConfig } from './step-validators';
import {
    StepDefinition,
    PipelineEdge,
    PipelineDefinitionInput,
    PipelineValidationResult,
    PipelineValidationError,
    PipelineValidationWarning,
    TopologyInfo,
} from './types';
import {
    createPipelineError as createError,
    createPipelineWarning as createWarning,
} from './helpers';

export type {
    PipelineEdge,
    PipelineDefinitionInput,
    PipelineValidationResult,
    PipelineValidationError,
    PipelineValidationWarning,
    TopologyInfo,
};

// VERSION VALIDATORS

/**
 * Validates pipeline version
 */
export function validatePipelineVersion(version: number | string): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    let numVersion = version;
    if (typeof version === 'string') {
        numVersion = parseInt(version, 10);
        if (isNaN(numVersion)) {
            errors.push(createError('version', 'Pipeline version must be a number', PipelineErrorCode.INVALID_DEFINITION));
            return { valid: false, errors, warnings };
        }
        warnings.push(createWarning('version', 'Version should be a number, not a string'));
    }

    if (typeof numVersion !== 'number' || numVersion < 1) {
        errors.push(createError('version', 'Pipeline version must be a positive number', PipelineErrorCode.INVALID_DEFINITION));
    }

    return { valid: errors.length === 0, errors, warnings };
}

// EDGE VALIDATORS

/**
 * Validates pipeline edges for referential integrity
 */
export function validateEdges(
    edges: PipelineEdge[],
    stepKeys: Set<string>,
    stepsByKey: Map<string, StepDefinition>,
): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    if (!Array.isArray(edges)) {
        return { valid: true, errors, warnings };
    }

    edges.forEach((edge, index) => {
        if (!edge || typeof edge !== 'object') {
            errors.push(createError(`edges[${index}]`, 'Invalid edge entry', PipelineErrorCode.INVALID_DEFINITION));
            return;
        }

        if (!edge.from || !edge.to) {
            errors.push(createError(`edges[${index}]`, 'Edge missing from/to', PipelineErrorCode.INVALID_DEFINITION));
            return;
        }

        if (!stepKeys.has(edge.from)) {
            errors.push(createError(`edges[${index}].from`, `Edge from unknown step "${edge.from}"`, PipelineErrorCode.MISSING_STEP));
        }

        if (!stepKeys.has(edge.to)) {
            errors.push(createError(`edges[${index}].to`, `Edge to unknown step "${edge.to}"`, PipelineErrorCode.MISSING_STEP));
        }

        if (edge.from === edge.to) {
            errors.push(createError(`edges[${index}]`, `Edge cannot point to itself: "${edge.from}"`, PipelineErrorCode.INVALID_DEFINITION));
        }

        if (edge.branch) {
            const fromStep = stepsByKey.get(edge.from);
            if (fromStep && fromStep.type !== StepType.ROUTE) {
                errors.push(createError(
                    `edges[${index}].branch`,
                    `Edge from "${edge.from}" specifies branch but source is not a ROUTE step`,
                    PipelineErrorCode.INVALID_DEFINITION,
                ));
            } else if (fromStep && fromStep.type === StepType.ROUTE) {
                const stepConfig = fromStep.config as { branches?: Array<{ name?: string }> } | undefined;
                const branches = stepConfig?.branches ?? [];
                const branchNames = new Set(branches.map(b => String(b?.name ?? '')));
                if (!branchNames.has(edge.branch)) {
                    errors.push(createError(
                        `edges[${index}].branch`,
                        `Edge from "${edge.from}" references unknown branch "${edge.branch}"`,
                        PipelineErrorCode.INVALID_DEFINITION,
                    ));
                }
            }
        }
    });

    return { valid: errors.length === 0, errors, warnings };
}

// TOPOLOGY VALIDATORS

/**
 * Validates pipeline graph topology (acyclic, connected, valid roots)
 */
export function validateTopology(
    steps: StepDefinition[],
    edges: PipelineEdge[],
): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    if (steps.length === 0) {
        errors.push(createError('steps', 'Pipeline must have at least one step', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    const stepsByKey = new Map<string, StepDefinition>();
    for (const step of steps) {
        stepsByKey.set(step.key, step);
    }

    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const step of steps) {
        indeg.set(step.key, 0);
        adj.set(step.key, []);
    }

    for (const edge of edges) {
        indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
        adj.get(edge.from)?.push(edge.to);
    }

    // Find root nodes (in-degree = 0)
    const roots = Array.from(indeg.entries())
        .filter(([_, v]) => v === 0)
        .map(([k]) => k);

    // For DAG pipelines (with edges), validate topology
    if (edges.length > 0) {
        // Must have exactly one root for DAG
        if (roots.length !== 1) {
            errors.push(createError(
                'topology',
                `Graph must have exactly one root; found ${roots.length}`,
                PipelineErrorCode.INVALID_DEFINITION,
            ));
        } else {
            const root = stepsByKey.get(roots[0]);
            // Root must be TRIGGER or EXTRACT (for visual editor)
            if (root && root.type !== StepType.TRIGGER && root.type !== StepType.EXTRACT) {
                errors.push(createError(
                    'topology',
                    'Root step must be a TRIGGER or EXTRACT (data source)',
                    PipelineErrorCode.INVALID_DEFINITION,
                ));
            }
        }

        // Kahn's algorithm for cycle detection
        const queue: string[] = [...roots];
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
            errors.push(createError(
                'topology',
                'Graph contains a cycle or disconnected component',
                PipelineErrorCode.CIRCULAR_DEPENDENCY,
            ));
        }

        // Check reachability: at least one terminal step (LOAD/EXPORT/SINK/FEED) reachable
        const terminalTypes = [StepType.LOAD, StepType.EXPORT, StepType.SINK, StepType.FEED];
        const hasTerminal = steps.some(s => terminalTypes.includes(s.type as StepType));

        if (hasTerminal && roots.length === 1) {
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

            const terminalReachable = steps.some(
                s => terminalTypes.includes(s.type as StepType) && reachable.has(s.key),
            );
            if (!terminalReachable) {
                warnings.push(createWarning(
                    'topology',
                    'No terminal step (LOAD/EXPORT/SINK/FEED) is reachable from the root',
                ));
            }
        }

        // Compute topology info
        const leafSteps = steps
            .filter(s => (adj.get(s.key)?.length ?? 0) === 0)
            .map(s => s.key);

        const hasParallelPaths = steps.some(s => (adj.get(s.key)?.length ?? 0) > 1);

        // Calculate max depth using BFS
        let maxDepth = 0;
        if (roots.length === 1) {
            const depths = new Map<string, number>();
            const bfsQueue: Array<{ key: string; depth: number }> = [{ key: roots[0], depth: 0 }];

            while (bfsQueue.length > 0) {
                const { key, depth } = bfsQueue.shift()!;
                if (depths.has(key) && depths.get(key)! >= depth) continue;
                depths.set(key, depth);
                maxDepth = Math.max(maxDepth, depth);
                for (const v of adj.get(key) ?? []) {
                    bfsQueue.push({ key: v, depth: depth + 1 });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            topology: {
                rootSteps: roots,
                leafSteps,
                executionOrder: visited,
                hasParallelPaths,
                maxDepth,
            },
        };
    }

    // For linear pipelines (no edges), validate order
    const firstStep = steps[0];
    if (firstStep.type !== StepType.TRIGGER && firstStep.type !== StepType.EXTRACT) {
        errors.push(createError(
            'steps[0]',
            'First step should be a TRIGGER or EXTRACT (data source)',
            PipelineErrorCode.INVALID_DEFINITION,
        ));
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        topology: {
            rootSteps: [steps[0]?.key].filter(Boolean),
            leafSteps: [steps[steps.length - 1]?.key].filter(Boolean),
            executionOrder: steps.map(s => s.key),
            hasParallelPaths: false,
            maxDepth: steps.length - 1,
        },
    };
}

// ROUTE STEP VALIDATORS

/**
 * Validates ROUTE step configurations for consistency at the pipeline level.
 * Delegates to validateRouteConfig from step-validators to avoid duplication.
 */
export function validateRouteSteps(steps: StepDefinition[]): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    steps
        .filter(s => s.type === StepType.ROUTE)
        .forEach((step) => {
            const result = validateRouteConfig(step.config);

            // Convert step errors to pipeline errors with step context
            result.errors.forEach(e => {
                errors.push(createError(
                    `step "${step.key}".${e.field}`,
                    e.message,
                    e.errorCode,
                ));
            });

            result.warnings.forEach(w => {
                warnings.push(createWarning(
                    `step "${step.key}".${w.field}`,
                    w.message,
                ));
            });
        });

    return { valid: errors.length === 0, errors, warnings };
}

// DEPENDENCY VALIDATORS

/**
 * Validates pipeline dependencies
 */
export function validateDependencies(dependsOn?: string[]): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    if (!dependsOn || !Array.isArray(dependsOn)) {
        return { valid: true, errors, warnings };
    }

    const seen = new Set<string>();
    dependsOn.forEach((dep, index) => {
        if (typeof dep !== 'string' || !dep.trim()) {
            errors.push(createError(
                `dependsOn[${index}]`,
                'Dependency must be a non-empty string',
                PipelineErrorCode.INVALID_DEFINITION,
            ));
            return;
        }

        if (seen.has(dep)) {
            warnings.push(createWarning(
                `dependsOn[${index}]`,
                `Duplicate dependency: ${dep}`,
            ));
        }
        seen.add(dep);
    });

    return { valid: errors.length === 0, errors, warnings };
}

// HOOKS VALIDATORS

/**
 * Validates pipeline hooks configuration
 */
export function validateHooks(hooks?: JsonObject): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    if (!hooks) {
        return { valid: true, errors, warnings };
    }

    const validHookStages = Object.values(HookStage) as string[];

    for (const [stage, config] of Object.entries(hooks)) {
        if (!validHookStages.includes(stage)) {
            warnings.push(createWarning(`hooks.${stage}`, `Unknown hook stage: ${stage}`));
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// MAIN PIPELINE VALIDATOR

/**
 * Validates a complete pipeline definition
 */
export function validatePipelineDefinition(definition: PipelineDefinitionInput): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    // Basic structure validation
    if (!definition || typeof definition !== 'object') {
        return {
            valid: false,
            errors: [createError('definition', 'Invalid pipeline definition', PipelineErrorCode.INVALID_DEFINITION)],
            warnings: [],
        };
    }

    const versionResult = validatePipelineVersion(definition.version);
    errors.push(...versionResult.errors);
    warnings.push(...versionResult.warnings);

    if (!Array.isArray(definition.steps)) {
        errors.push(createError('steps', 'Pipeline steps must be an array', PipelineErrorCode.INVALID_DEFINITION));
        return { valid: false, errors, warnings };
    }

    const stepKeys = new Set<string>();
    const stepsByKey = new Map<string, StepDefinition>();
    for (const step of definition.steps) {
        stepKeys.add(step.key);
        stepsByKey.set(step.key, step);
    }

    const stepsResult = validateSteps(definition.steps);
    errors.push(...stepsResult.errors.map(e => ({
        field: e.field,
        message: e.message,
        errorCode: e.errorCode,
    })));
    warnings.push(...stepsResult.warnings.map(w => ({
        field: w.field,
        message: w.message,
    })));

    const edges: PipelineEdge[] = Array.isArray(definition.edges) ? definition.edges : [];
    const edgesResult = validateEdges(edges, stepKeys, stepsByKey);
    errors.push(...edgesResult.errors);
    warnings.push(...edgesResult.warnings);

    const topologyResult = validateTopology(definition.steps, edges);
    errors.push(...topologyResult.errors);
    warnings.push(...topologyResult.warnings);

    const routeResult = validateRouteSteps(definition.steps);
    errors.push(...routeResult.errors);
    warnings.push(...routeResult.warnings);

    const depsResult = validateDependencies(definition.dependsOn);
    errors.push(...depsResult.errors);
    warnings.push(...depsResult.warnings);

    const hooksResult = validateHooks(definition.hooks);
    errors.push(...hooksResult.errors);
    warnings.push(...hooksResult.warnings);

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        topology: topologyResult.topology,
    };
}

/**
 * Validates and throws if invalid (for convenience)
 */
export function assertValidPipelineDefinition(definition: PipelineDefinitionInput): void {
    const result = validatePipelineDefinition(definition);
    if (!result.valid) {
        const errorMessages = result.errors.map(e => e.message);
        throw new Error(errorMessages.join('\n'));
    }
}
