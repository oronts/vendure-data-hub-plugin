/**
 * Pipeline Builder
 *
 * Fluent API for constructing pipeline definitions programmatically.
 * The builder pattern ensures type-safe pipeline construction with proper
 * chaining support.
 *
 * @module sdk/dsl/pipeline-builder
 *
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
 *   .load('products', { adapterCode: 'productUpsert', strategy: 'upsert' })
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
    /**
     * Set the pipeline name (for display purposes).
     * @param name - Human-readable pipeline name
     * @returns this - For method chaining
     */
    name(name: string): this;

    /**
     * Set the pipeline description.
     * @param description - Detailed description of the pipeline
     * @returns this - For method chaining
     */
    description(description: string): this;

    /**
     * Set the pipeline version number.
     * @param version - Version number (default: 1)
     * @returns this - For method chaining
     */
    version(version: number): this;

    /**
     * Set the pipeline execution context.
     * @param context - Context settings (channel, language, throughput)
     * @returns this - For method chaining
     */
    context(context: PipelineContext): this;

    /**
     * Set the pipeline capabilities (what it can read/write).
     * @param capabilities - Capability configuration
     * @returns this - For method chaining
     */
    capabilities(capabilities: PipelineCapabilities): this;

    /**
     * Declare pipeline dependencies.
     * @param codes - Pipeline codes this depends on
     * @returns this - For method chaining
     */
    dependsOn(...codes: string[]): this;

    /**
     * Configure pipeline lifecycle hooks.
     * @param hooks - Hook configuration
     * @returns this - For method chaining
     */
    hooks(hooks: PipelineHooks): this;

    /**
     * Add a trigger step.
     * @param key - Unique step key
     * @param config - Trigger configuration (default: manual trigger)
     * @returns this - For method chaining
     */
    trigger(key: string, config?: TriggerConfig): this;

    /**
     * Add an extract step.
     * @param key - Unique step key
     * @param config - Extractor configuration
     * @returns this - For method chaining
     */
    extract(key: string, config: ExtractStepConfig): this;

    /**
     * Add a transform step.
     * @param key - Unique step key
     * @param config - Transform configuration with operators
     * @returns this - For method chaining
     */
    transform(key: string, config: TransformStepConfig): this;

    /**
     * Add a validate step.
     * @param key - Unique step key
     * @param config - Validation configuration
     * @returns this - For method chaining
     */
    validate(key: string, config: ValidateStepConfig): this;

    /**
     * Add an enrich step.
     * @param key - Unique step key
     * @param config - Enrichment configuration
     * @returns this - For method chaining
     */
    enrich(key: string, config: EnrichStepConfig): this;

    /**
     * Add a route step for conditional branching.
     * @param key - Unique step key
     * @param config - Route configuration with branches
     * @returns this - For method chaining
     */
    route(key: string, config: RouteStepConfig): this;

    /**
     * Add a load step to write to Vendure.
     * @param key - Unique step key
     * @param config - Loader configuration
     * @returns this - For method chaining
     */
    load(key: string, config: LoadStepConfig): this;

    /**
     * Add an export step to write to external systems.
     * @param key - Unique step key
     * @param config - Export configuration
     * @returns this - For method chaining
     */
    export(key: string, config: ExportStepConfig): this;

    /**
     * Add a feed step for product feed generation.
     * @param key - Unique step key
     * @param config - Feed configuration
     * @returns this - For method chaining
     */
    feed(key: string, config: FeedStepConfig): this;

    /**
     * Add a sink step for search engine indexing.
     * @param key - Unique step key
     * @param config - Sink configuration
     * @returns this - For method chaining
     */
    sink(key: string, config: SinkStepConfig): this;

    /**
     * Connect two steps with an edge.
     * @param from - Source step key
     * @param to - Target step key
     * @param branch - Optional branch name (for route steps)
     * @returns this - For method chaining
     */
    edge(from: string, to: string, branch?: string): this;

    /**
     * Build and return the final pipeline definition.
     * @returns Complete pipeline definition
     */
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

/**
 * Validates that a string is non-empty.
 * @throws Error if the string is empty or whitespace-only
 */
function validateNonEmptyString(value: string, fieldName: string): void {
    if (!value || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`);
    }
}

/**
 * Validates that a step key is unique.
 * @throws Error if the key already exists
 */
function validateUniqueKey(steps: PipelineStepDefinition[], key: string): void {
    if (steps.some(s => s.key === key)) {
        throw new Error(`Duplicate step key: "${key}". Step keys must be unique within a pipeline.`);
    }
}

/**
 * Validates that a version is a positive integer.
 * @throws Error if version is invalid
 */
function validateVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Version must be a positive integer, got: ${version}`);
    }
}

// CREATE PIPELINE FUNCTION

/**
 * Creates a new pipeline builder instance.
 *
 * @returns A new PipelineBuilder for fluent pipeline construction
 *
 * @example
 * ```typescript
 * const pipeline = createPipeline()
 *   .name('Product Import')
 *   .trigger('start')
 *   .extract('fetch', { adapterCode: 'httpApi', url: 'https://api.example.com/products' })
 *   .load('save', { adapterCode: 'productUpsert', strategy: 'upsert' })
 *   .edge('start', 'fetch')
 *   .edge('fetch', 'save')
 *   .build();
 * ```
 */
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

/**
 * Type-safe helper for defining pipeline definitions as plain objects.
 * Useful when you want to define pipelines without using the builder pattern.
 *
 * @param definition - The pipeline definition object
 * @returns Same definition with proper typing
 *
 * @example
 * ```typescript
 * const pipeline = definePipeline({
 *   version: 1,
 *   steps: [
 *     { key: 'start', type: StepType.TRIGGER, config: { type: 'manual' } },
 *   ],
 * });
 * ```
 */
export function definePipeline<T extends PipelineDefinition>(definition: T): T {
    return definition;
}

/**
 * Creates a single step definition.
 * Lower-level helper for creating steps without the builder.
 *
 * @param key - Unique step identifier
 * @param type - Step type (trigger, extract, transform, etc.)
 * @param config - Step configuration object
 * @param extras - Optional additional step properties (throughput, async)
 * @returns A complete step definition
 *
 * @example
 * ```typescript
 * const extractStep = step('fetch', StepType.EXTRACT, {
 *   adapterCode: 'httpApi',
 *   url: 'https://api.example.com/products',
 * });
 * ```
 */
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
