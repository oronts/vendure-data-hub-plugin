/**
 * @example
 * ```typescript
 * import { createPipeline, operators, conditions } from '@vendure/data-hub/sdk';
 *
 * const pipeline = createPipeline()
 *   .name('Product Import')
 *   .description('Import products from CSV')
 *   .trigger('start', { type: 'manual' })
 *   .extract('csv', { adapterCode: 'csv', csvPath: '/data/products.csv' })
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
    StepType,
    PipelineEdge,
    JsonObject,
    PipelineCapabilities,
    PipelineContext,
    PipelineHooks,
} from '../../types/index';
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
} from './step-configs';
import { DEFAULT_TRIGGER_TYPE } from '../constants';

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
    edge(from: string, to: string, branch?: string): this;
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

function createEdge(from: string, to: string, branch?: string): PipelineEdge {
    const e: PipelineEdge = { from, to };
    if (branch) e.branch = branch;
    return e;
}

// VALIDATION HELPERS

function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

function validateUniqueKey(steps: PipelineStepDefinition[], key: string): void {
    if (steps.some(s => s.key === key)) {
        throw new Error(`Duplicate step key: "${key}". Step keys must be unique within a pipeline.`);
    }
}

function validateVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Version must be a positive integer, got: ${version}`);
    }
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
        trigger(key: string, config: TriggerConfig = { type: DEFAULT_TRIGGER_TYPE }) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            state.steps.push(createStep(key, StepType.TRIGGER, config as unknown as JsonObject));
            return this;
        },
        extract(key: string, config: ExtractStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.EXTRACT, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        transform(key: string, config: TransformStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            if (!config.operators || !Array.isArray(config.operators)) {
                throw new Error('Transform step requires an operators array');
            }
            const { throughput, async: asyncFlag, operators, ...rest } = config;
            state.steps.push(createStep(key, StepType.TRANSFORM, { operators, ...rest } as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        validate(key: string, config: ValidateStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            const { throughput, ...rest } = config;
            state.steps.push(createStep(key, StepType.VALIDATE, rest as unknown as JsonObject, { throughput }));
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
            state.steps.push(createStep(key, StepType.ENRICH, config as unknown as JsonObject));
            return this;
        },
        route(key: string, config: RouteStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            if (!config.branches || !Array.isArray(config.branches) || config.branches.length === 0) {
                throw new Error('Route step requires at least one branch');
            }
            state.steps.push(createStep(key, StepType.ROUTE, config as unknown as JsonObject));
            return this;
        },
        load(key: string, config: LoadStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.LOAD, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        export(key: string, config: ExportStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.EXPORT, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        feed(key: string, config: FeedStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, ...rest } = config;
            state.steps.push(createStep(key, StepType.FEED, rest as unknown as JsonObject, { throughput }));
            return this;
        },
        sink(key: string, config: SinkStepConfig) {
            validateNonEmptyString(key, 'Step key');
            validateUniqueKey(state.steps, key);
            validateNonEmptyString(config.adapterCode, 'Adapter code');
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.SINK, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return this;
        },
        edge(from: string, to: string, branch?: string) {
            validateNonEmptyString(from, 'Edge "from" step');
            validateNonEmptyString(to, 'Edge "to" step');
            state.edges.push(createEdge(from, to, branch));
            return this;
        },
        build(): PipelineDefinition {
            // Validate minimum requirements
            if (state.steps.length === 0) {
                throw new Error('Pipeline must have at least one step');
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

            return {
                version: state.version,
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
        step(key, StepType.TRIGGER, config, extras),
    extract: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.EXTRACT, config, extras),
    transform: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.TRANSFORM, config, extras),
    validate: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.VALIDATE, config, extras),
    enrich: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.ENRICH, config, extras),
    route: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.ROUTE, config, extras),
    load: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.LOAD, config, extras),
    export: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.EXPORT, config, extras),
    feed: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.FEED, config, extras),
    sink: (key: string, config: JsonObject, extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>) =>
        step(key, StepType.SINK, config, extras),
};

export function edge(from: string, to: string, branch?: string): PipelineEdge {
    return createEdge(from, to, branch);
}
