import type {
    JsonObject,
    PipelineDefinition,
    PipelineEdge,
    PipelineStepDefinition,
} from '../../types';
import { STEP_TYPE } from '../../../shared/constants/enums';
import type { StepType } from '../../../shared/types';
import { validateNonEmptyString } from './validation-helpers';

function createStep(
    key: string,
    type: StepType,
    config: JsonObject,
    extras?: Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>,
): PipelineStepDefinition {
    const stepDefinition: Record<string, unknown> = { key, type, config };
    for (const [field, value] of Object.entries(extras ?? {})) {
        if (value !== undefined) stepDefinition[field] = value;
    }
    return stepDefinition as unknown as PipelineStepDefinition;
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

type StepExtras = Partial<Omit<PipelineStepDefinition, 'key' | 'type' | 'config'>>;

export const steps = {
    trigger: (key: string, config: JsonObject = {}, extras?: StepExtras) => step(key, STEP_TYPE.TRIGGER, config, extras),
    extract: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.EXTRACT, config, extras),
    transform: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.TRANSFORM, config, extras),
    validate: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.VALIDATE, config, extras),
    enrich: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.ENRICH, config, extras),
    route: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.ROUTE, config, extras),
    load: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.LOAD, config, extras),
    export: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.EXPORT, config, extras),
    feed: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.FEED, config, extras),
    sink: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.SINK, config, extras),
    gate: (key: string, config: JsonObject, extras?: StepExtras) => step(key, STEP_TYPE.GATE, config, extras),
} as const;

export function edge(
    from: string,
    to: string,
    options?: string | { branch?: string; dependencyOnly?: boolean },
): PipelineEdge {
    const normalized = typeof options === 'string' ? { branch: options } : options;
    const pipelineEdge: PipelineEdge = { from, to };
    if (normalized?.branch) pipelineEdge.branch = normalized.branch;
    if (normalized?.dependencyOnly) pipelineEdge.dependencyOnly = true;
    return pipelineEdge;
}
