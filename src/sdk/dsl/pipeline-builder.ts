/**
 * Pipeline Builder
 */

import {
    PipelineDefinition,
    PipelineStepDefinition,
    StepType,
    PipelineEdge,
    JsonObject,
    Throughput,
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
} from './step-configs';
import { RouteStepConfig } from './step-configs';

// PIPELINE BUILDER INTERFACE

export interface PipelineBuilder {
    name(name: string): PipelineBuilder;
    description(description: string): PipelineBuilder;
    version(version: number): PipelineBuilder;
    context(context: PipelineContext): PipelineBuilder;
    capabilities(capabilities: PipelineCapabilities): PipelineBuilder;
    dependsOn(...codes: string[]): PipelineBuilder;
    hooks(hooks: PipelineHooks): PipelineBuilder;
    trigger(key: string, config?: TriggerConfig): PipelineBuilder;
    extract(key: string, config: ExtractStepConfig): PipelineBuilder;
    transform(key: string, config: TransformStepConfig): PipelineBuilder;
    validate(key: string, config: ValidateStepConfig): PipelineBuilder;
    enrich(key: string, config: EnrichStepConfig): PipelineBuilder;
    route(key: string, config: RouteStepConfig): PipelineBuilder;
    load(key: string, config: LoadStepConfig): PipelineBuilder;
    export(key: string, config: ExportStepConfig): PipelineBuilder;
    feed(key: string, config: FeedStepConfig): PipelineBuilder;
    sink(key: string, config: SinkStepConfig): PipelineBuilder;
    edge(from: string, to: string, branch?: string): PipelineBuilder;
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
            state.name = name;
            return builder;
        },
        description(description: string) {
            state.description = description;
            return builder;
        },
        version(version: number) {
            state.version = version;
            return builder;
        },
        context(context: PipelineContext) {
            state.context = context;
            return builder;
        },
        capabilities(capabilities: PipelineCapabilities) {
            state.capabilities = capabilities;
            return builder;
        },
        dependsOn(...codes: string[]) {
            state.dependsOn = codes;
            return builder;
        },
        hooks(hooks: PipelineHooks) {
            state.hooks = hooks;
            return builder;
        },
        trigger(key: string, config: TriggerConfig = { type: 'manual' }) {
            state.steps.push(createStep(key, StepType.TRIGGER, config as unknown as JsonObject));
            return builder;
        },
        extract(key: string, config: ExtractStepConfig) {
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.EXTRACT, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return builder;
        },
        transform(key: string, config: TransformStepConfig) {
            const { throughput, async: asyncFlag, operators, ...rest } = config;
            state.steps.push(createStep(key, StepType.TRANSFORM, { operators, ...rest } as unknown as JsonObject, { throughput, async: asyncFlag }));
            return builder;
        },
        validate(key: string, config: ValidateStepConfig) {
            const { throughput, ...rest } = config;
            state.steps.push(createStep(key, StepType.VALIDATE, rest as unknown as JsonObject, { throughput }));
            return builder;
        },
        enrich(key: string, config: EnrichStepConfig) {
            state.steps.push(createStep(key, StepType.ENRICH, config as unknown as JsonObject));
            return builder;
        },
        route(key: string, config: RouteStepConfig) {
            state.steps.push(createStep(key, StepType.ROUTE, config as unknown as JsonObject));
            return builder;
        },
        load(key: string, config: LoadStepConfig) {
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.LOAD, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return builder;
        },
        export(key: string, config: ExportStepConfig) {
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.EXPORT, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return builder;
        },
        feed(key: string, config: FeedStepConfig) {
            const { throughput, ...rest } = config;
            state.steps.push(createStep(key, StepType.FEED, rest as unknown as JsonObject, { throughput }));
            return builder;
        },
        sink(key: string, config: SinkStepConfig) {
            const { throughput, async: asyncFlag, ...rest } = config;
            state.steps.push(createStep(key, StepType.SINK, rest as unknown as JsonObject, { throughput, async: asyncFlag }));
            return builder;
        },
        edge(from: string, to: string, branch?: string) {
            state.edges.push(createEdge(from, to, branch));
            return builder;
        },
        build(): PipelineDefinition {
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

// LEGACY API (backward compatible)

export function definePipeline<T extends PipelineDefinition>(definition: T): T {
    return definition;
}

export function step(
    key: string,
    type: StepType,
    config: JsonObject,
    extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>,
): PipelineStepDefinition {
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
