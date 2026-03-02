/**
 * @example
 * ```typescript
 * import { createPipeline, operators, conditions } from '@oronts/vendure-data-hub-plugin/sdk';
 *
 * const pipeline = createPipeline()
 *   .name('Product Import')
 *   .description('Import products from CSV')
 *   .trigger('start', { type: 'MANUAL' })
 *   .extract('csv', { adapterCode: 'file', path: '/data/products.csv', format: 'CSV' })
 *   .transform('map', {
 *     operators: [
 *       operators.map({ 'SKU': 'sku', 'Name': 'name' }),
 *       operators.set('imported', true),
 *     ],
 *   })
 *   .load('products', { adapterCode: 'productUpsert', strategy: 'UPSERT' })
 *   .edge('start', 'csv')
 *   .edge('csv', 'map')
 *   .edge('map', 'products')
 *   .build();
 * ```
 */

import {
    PipelineDefinition,
    PipelineStepDefinition,
    PipelineEdge,
    JsonObject,
    PipelineCapabilities,
    PipelineContext,
    PipelineHooks,
} from '../../types/index';
import type { StepType } from '../../../shared/types';
import { STEP_TYPE } from '../../../shared/constants/enums';
import {
    TriggerConfig,
    ExtractStepConfig,
    TransformStepConfig,
    ValidateStepConfig,
    EnrichStepConfig,
    LoadStepConfig,
    ExportStepConfig,
    FeedStepConfig,
    SinkStepConfig,
    RouteStepConfig,
    GateStepConfig,
} from './step-configs';
import { DEFAULT_TRIGGER_TYPE } from '../constants';
import { validateNonEmptyString, validateUniqueKey, validateVersion } from './validation-helpers';

// PIPELINE BUILDER INTERFACE

/**
 * Fluent interface for building pipeline definitions.
 * All methods return `this` to enable method chaining.
 */
export interface PipelineBuilder {
    name(name: string): this;
    description(description: string): this;
    version(version: number): this;
    context(context: PipelineContext): this;
    capabilities(capabilities: PipelineCapabilities): this;
    dependsOn(...codes: string[]): this;
    hooks(hooks: PipelineHooks): this;
    parallel(config?: { maxConcurrentSteps?: number; errorPolicy?: 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT' }): this;
    trigger(key: string, config?: TriggerConfig): this;
    extract(key: string, config: ExtractStepConfig): this;
    transform(key: string, config: TransformStepConfig): this;
    validate(key: string, config: ValidateStepConfig): this;
    enrich(key: string, config: EnrichStepConfig): this;
    route(key: string, config: RouteStepConfig): this;
    load(key: string, config: LoadStepConfig): this;
    export(key: string, config: ExportStepConfig): this;
    feed(key: string, config: FeedStepConfig): this;
    sink(key: string, config: SinkStepConfig): this;
    gate(key: string, config: GateStepConfig): this;
    edge(from: string, to: string, options?: string | { branch?: string; dependencyOnly?: boolean }): this;
    build(): PipelineDefinition;
}

// HELPER FUNCTIONS

function createStep(
    key: string,
    type: StepType,
    config: JsonObject,
    extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>,
): PipelineStepDefinition {
    return { key, type, config, ...(extras ?? {}) } as PipelineStepDefinition;
}

function createEdge(from: string, to: string, options?: { branch?: string; dependencyOnly?: boolean }): PipelineEdge {
    const e: PipelineEdge = { from, to };
    if (options?.branch) e.branch = options.branch;
    if (options?.dependencyOnly) e.dependencyOnly = true;
    return e;
}

// CYCLE DETECTION

/**
 * Detect cycles in a directed graph defined by edges.
 * Uses DFS with an in-stack set to find back edges.
 * Returns the cycle path if found, or null if no cycle exists.
 */
function detectCycle(edges: Array<{ from: string; to: string }>): string[] | null {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)!.push(e.to);
    }
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): boolean {
        visited.add(node);
        inStack.add(node);
        path.push(node);
        for (const next of (adj.get(node) ?? [])) {
            if (inStack.has(next)) {
                path.push(next);
                return true;
            }
            if (!visited.has(next) && dfs(next)) return true;
        }
        path.pop();
        inStack.delete(node);
        return false;
    }

    for (const node of adj.keys()) {
        if (!visited.has(node) && dfs(node)) return path;
    }
    return null;
}

// CREATE PIPELINE FUNCTION

export function createPipeline(): PipelineBuilder {
    const state: {
        name?: string;
        description?: string;
        version: number;
        context?: PipelineContext;
        capabilities?: PipelineCapabilities;
        dependsOn?: string[];
        hooks?: PipelineHooks;
        steps: PipelineStepDefinition[];
        edges: PipelineEdge[];
    } = {
        version: 1,
        steps: [],
        edges: [],
    };

    const builder: PipelineBuilder = {
        name(name: string) {
            validateNonEmptyString(name, 'Pipeline name');
            state.name = name;
            return this;
        },
        description(description: string) {
            validateNonEmptyString(description, 'Pipeline description');
            state.description = description;
            return this;
        },
        version(version: number) {
            validateVersion(version);
            state.version = version;
            return this;
        },
        context(context: PipelineContext) {
            state.context = context;
            return this;
        },
        capabilities(capabilities: PipelineCapabilities) {
            state.capabilities = capabilities;
            return this;
        },
        dependsOn(...codes: string[]) {
            codes.forEach(code => validateNonEmptyString(code, 'Dependency code'));
            state.dependsOn = codes;
            return this;
        },
        hooks(hooks: PipelineHooks) {
            state.hooks = hooks;
            return this;
        },
        parallel(config?: { maxConcurrentSteps?: number; errorPolicy?: 'FAIL_FAST' | 'CONTINUE' | 'BEST_EFFORT' }) {
            if (config?.maxConcurrentSteps !== undefined && (typeof config.maxConcurrentSteps !== 'number' || config.maxConcurrentSteps < 1)) {
                throw new Error('maxConcurrentSteps must be a positive number');
            }
            const validPolicies = ['FAIL_FAST', 'CONTINUE', 'BEST_EFFORT'];
            if (config?.errorPolicy !== undefined && !validPolicies.includes(config.errorPolicy)) {
                throw new Error(`errorPolicy must be one of: ${validPolicies.join(', ')}`);
            }
            if (!state.context) {
                state.context = {};
            }
            state.context.parallelExecution = {
                enabled: true,
                maxConcurrentSteps: config?.maxConcurrentSteps,
                errorPolicy: config?.errorPolicy,
            };
            return this;
        },
        trigger(key: string, config: TriggerConfig = { type: DEFAULT_TRIGGER_TYPE }) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            state.steps.push(createStep(key, STEP_TYPE.TRIGGER, config as unknown as JsonObject));
            return this;
        },
        extract(key: string, config: ExtractStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.EXTRACT, rest as unknown as JsonObject, { throughput, async: asyncFlag, adapterCode }));
            return this;
        },
        transform(key: string, config: TransformStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            if (!config.operators || !Array.isArray(config.operators)) {
                throw new Error('Transform step requires an operators array');
            }
            const { throughput, async: asyncFlag, operators, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.TRANSFORM, { operators, ...rest } as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        validate(key: string, config: ValidateStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            const { throughput, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.VALIDATE, rest as unknown as JsonObject, { throughput }));
            return this;
        },
        enrich(key: string, config: EnrichStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            // adapterCode is optional - enrichment can use built-in config (defaults, set, computed, sourceType)
            const hasBuiltInConfig = config.defaults || config.set || config.computed || config.sourceType;
            if (!config.adapterCode && !hasBuiltInConfig) {
                throw new Error('Enrich step requires either adapterCode or built-in config (defaults, set, computed, or sourceType)');
            }
            const { adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.ENRICH, rest as unknown as JsonObject, adapterCode ? { adapterCode } : undefined));
            return this;
        },
        route(key: string, config: RouteStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            if (!config.branches || !Array.isArray(config.branches) || config.branches.length === 0) {
                throw new Error('Route step requires at least one branch');
            }
            state.steps.push(createStep(key, STEP_TYPE.ROUTE, config as unknown as JsonObject, { adapterCode: 'condition' }));
            return this;
        },
        load(key: string, config: LoadStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.LOAD, rest as unknown as JsonObject, { throughput, async: asyncFlag, adapterCode }));
            return this;
        },
        export(key: string, config: ExportStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.EXPORT, rest as unknown as JsonObject, { throughput, async: asyncFlag, adapterCode }));
            return this;
        },
        feed(key: string, config: FeedStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.FEED, rest as unknown as JsonObject, { throughput, adapterCode }));
            return this;
        },
        sink(key: string, config: SinkStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, adapterCode, ...rest } = config;
            state.steps.push(createStep(key, STEP_TYPE.SINK, rest as unknown as JsonObject, { throughput, async: asyncFlag, adapterCode }));
            return this;
        },
        gate(key: string, config: GateStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            state.steps.push(createStep(key, STEP_TYPE.GATE, config as unknown as JsonObject));
            return this;
        },
        edge(from: string, to: string, options?: string | { branch?: string; dependencyOnly?: boolean }) {
            validateNonEmptyString(from, 'Edge "from" step');
            validateNonEmptyString(to, 'Edge "to" step');
            // Support legacy string shorthand for branch name
            const opts = typeof options === 'string' ? { branch: options } : options;
            state.edges.push(createEdge(from, to, opts));
            return this;
        },
        build(): PipelineDefinition {
            // Validate name is set
            if (!state.name || state.name.trim().length === 0) {
                throw new Error('Pipeline name is required. Call .name() before .build()');
            }

            // Validate minimum requirements
            if (state.steps.length === 0) {
                throw new Error('Pipeline must have at least one step');
            }

            // Warn if no trigger is defined (MANUAL trigger is the implicit default)
            const hasTrigger = state.steps.some(s => s.type === STEP_TYPE.TRIGGER);
            if (!hasTrigger) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[DataHub] Pipeline "${state.name}" has no trigger step defined. It will only be runnable manually.`,
                );
            }

            // Validate edge references
            const stepKeys = new Set(state.steps.map(s => s.key));
            for (const e of state.edges) {
                if (!stepKeys.has(e.from)) {
                    throw new Error(`Edge references non-existent step: "${e.from}"`);
                }
                if (!stepKeys.has(e.to)) {
                    throw new Error(`Edge references non-existent step: "${e.to}"`);
                }
            }

            // Detect cycles in graph pipelines
            if (state.edges.length > 0) {
                const cycle = detectCycle(state.edges);
                if (cycle) {
                    throw new Error(`Pipeline "${state.name}" contains a cycle: ${cycle.join(' -> ')}`);
                }
            }

            // Warn about unreachable steps in graph mode
            const warnings: string[] = [];
            if (state.edges.length > 0) {
                const reachable = new Set<string>();
                const triggerKeys = state.steps.filter(s => s.type === STEP_TYPE.TRIGGER).map(s => s.key);
                const queue = [...triggerKeys];
                // Also add steps with no incoming edges as entry points
                const hasIncoming = new Set(state.edges.map(e => e.to));
                state.steps.forEach(s => {
                    if (!hasIncoming.has(s.key) && s.type !== STEP_TYPE.TRIGGER) {
                        queue.push(s.key);
                    }
                });
                while (queue.length) {
                    const key = queue.shift()!;
                    if (reachable.has(key)) continue;
                    reachable.add(key);
                    state.edges.filter(e => e.from === key).forEach(e => {
                        if (!reachable.has(e.to)) queue.push(e.to);
                    });
                }
                const unreachable = state.steps.filter(s => !reachable.has(s.key));
                if (unreachable.length > 0) {
                    warnings.push(`Unreachable steps in graph: ${unreachable.map(s => s.key).join(', ')}. These steps will never execute.`);
                }
            }

            if (warnings.length > 0) {
                // eslint-disable-next-line no-console
                console.warn(`[DataHub] Pipeline "${state.name}": ${warnings.join('; ')}`);
            }

            return {
                version: state.version,
                name: state.name,
                description: state.description,
                steps: state.steps,
                edges: state.edges.length > 0 ? state.edges : undefined,
                dependsOn: state.dependsOn,
                capabilities: state.capabilities,
                context: state.context,
                hooks: state.hooks,
            };
        },
    };

    return builder;
}

export function definePipeline<T extends PipelineDefinition>(definition: T): T {
    return definition;
}

export function step(
    key: string,
    type: StepType,
    config: JsonObject,
    extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>,
): PipelineStepDefinition {
    validateNonEmptyString(key, 'Step key');
    return createStep(key, type, config, extras);
}

export const steps = {
    trigger: (key: string, config: JsonObject = {}, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.TRIGGER, config, extras),
    extract: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.EXTRACT, config, extras),
    transform: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.TRANSFORM, config, extras),
    validate: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.VALIDATE, config, extras),
    enrich: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.ENRICH, config, extras),
    route: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.ROUTE, config, extras),
    load: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.LOAD, config, extras),
    export: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.EXPORT, config, extras),
    feed: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.FEED, config, extras),
    sink: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.SINK, config, extras),
    gate: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, STEP_TYPE.GATE, config, extras),
};

export function edge(from: string, to: string, options?: string | { branch?: string; dependencyOnly?: boolean }): PipelineEdge {
    const opts = typeof options === 'string' ? { branch: options } : options;
    return createEdge(from, to, opts);
}
