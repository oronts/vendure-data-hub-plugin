/**
 * Trigger Sync Utilities
 *
 * Syncs trigger configuration between UI representations:
 * - Trigger STEPS in pipeline editor (visual nodes)
 * - Triggers Tab in pipeline editor (form-based)
 */

import type {
    JsonObject,
    JsonValue,
    PipelineDefinition,
    PipelineStepDefinition,
    PipelineTrigger,
    StepType,
    TriggerType,
} from '../types';

const TRIGGER_STEP_TYPE = 'TRIGGER' as StepType;
const TRIGGER_TYPES: ReadonlySet<string> = new Set([
    'MANUAL',
    'SCHEDULE',
    'WEBHOOK',
    'EVENT',
    'FILE',
    'MESSAGE',
]);

type SynchronizedTrigger = PipelineTrigger & { stepKey: string };

function isTriggerType(value: JsonValue | undefined): value is TriggerType {
    return typeof value === 'string' && TRIGGER_TYPES.has(value);
}

function normalizeJsonValue(value: unknown, path: string): JsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        throw new Error(`Trigger config at "${path}" must contain a finite number`);
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => normalizeJsonValue(item, `${path}[${index}]`) ?? null);
    }
    if (typeof value === 'object') {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error(`Trigger config at "${path}" must contain only JSON values`);
        }
        const normalized: JsonObject = {};
        for (const [key, child] of Object.entries(value)) {
            const normalizedChild = normalizeJsonValue(child, `${path}.${key}`);
            if (normalizedChild !== undefined) normalized[key] = normalizedChild;
        }
        return normalized;
    }
    throw new Error(`Trigger config at "${path}" must contain only JSON values`);
}

function getTriggerStepKey(trigger: PipelineTrigger): string | undefined {
    const values: Record<string, unknown> = { ...trigger };
    return typeof values.stepKey === 'string' ? values.stepKey : undefined;
}

function triggerConfig(trigger: PipelineTrigger): JsonObject {
    const config: JsonObject = {};
    for (const [key, value] of Object.entries(trigger)) {
        if (key === 'stepKey') continue;
        const normalized = normalizeJsonValue(value, key);
        if (normalized !== undefined) config[key] = normalized;
    }
    return config;
}

/**
 * Get all trigger steps from pipeline definition
 */
function getTriggerSteps(definition: PipelineDefinition): PipelineStepDefinition[] {
    return (definition.steps ?? []).filter(step => step.type === TRIGGER_STEP_TYPE);
}

/**
 * Convert trigger step to PipelineTrigger (for TriggersPanel)
 */
function stepToTrigger(step: PipelineStepDefinition): SynchronizedTrigger {
    const type = step.config.type;
    if (!isTriggerType(type)) {
        throw new Error(`Trigger step "${step.key}" has an invalid trigger type`);
    }
    return {
        ...step.config,
        type,
        stepKey: step.key,
    };
}

/**
 * Convert trigger steps to PipelineTrigger array
 */
function stepsToTriggers(steps: PipelineStepDefinition[]): PipelineTrigger[] {
    return steps
        .filter(step => step.type === TRIGGER_STEP_TYPE)
        .map(stepToTrigger);
}

/**
 * Convert a trigger config to a step
 */
function triggerToStep(
    trigger: PipelineTrigger,
    existingKey?: string
): PipelineStepDefinition {
    const stepKey = getTriggerStepKey(trigger);

    return {
        key: existingKey ?? stepKey ?? `trigger-${globalThis.crypto.randomUUID()}`,
        type: TRIGGER_STEP_TYPE,
        config: triggerConfig(trigger),
    };
}

/**
 * Convert triggers from TriggersPanel back to steps
 */
function triggersToSteps(
    triggers: PipelineTrigger[],
    existingSteps: PipelineStepDefinition[]
): PipelineStepDefinition[] {
    const existingTriggerSteps = existingSteps.filter(s => s.type === TRIGGER_STEP_TYPE);
    const nonTriggerSteps = existingSteps.filter(s => s.type !== TRIGGER_STEP_TYPE);

    const newTriggerSteps: PipelineStepDefinition[] = triggers.map((trigger, index) => {
        const triggerStepKey = getTriggerStepKey(trigger);
        const existingStep = triggerStepKey
            ? existingTriggerSteps.find(s => s.key === triggerStepKey)
            : existingTriggerSteps[index];

        return triggerToStep(trigger, existingStep?.key);
    });

    return [...newTriggerSteps, ...nonTriggerSteps];
}

/**
 * Get triggers for display in TriggersPanel
 */
export function getCombinedTriggers(definition: PipelineDefinition): PipelineTrigger[] {
    return stepsToTriggers(getTriggerSteps(definition));
}

/**
 * Synchronize trigger steps while preserving routes for retained triggers.
 */
export function updateDefinitionWithTriggers(
    definition: PipelineDefinition,
    triggers: PipelineTrigger[]
): PipelineDefinition {
    const existingSteps = definition.steps ?? [];
    const newSteps = triggersToSteps(triggers, existingSteps);
    const firstExecutionStep = newSteps.find(step => step.type !== TRIGGER_STEP_TYPE);
    const existingTriggerKeys = new Set(
        existingSteps.filter(step => step.type === TRIGGER_STEP_TYPE).map(step => step.key),
    );
    const triggerStepKeys = newSteps
        .filter(step => step.type === TRIGGER_STEP_TYPE)
        .map(step => step.key);
    const newTriggerKeys = new Set(triggerStepKeys);
    const retainedEdges = (definition.edges ?? []).filter(edge => (
        (!existingTriggerKeys.has(edge.from) || newTriggerKeys.has(edge.from)) &&
        (!existingTriggerKeys.has(edge.to) || newTriggerKeys.has(edge.to))
    ));
    const keysWithOutgoingEdges = new Set(retainedEdges.map(edge => edge.from));
    const triggerEdges: Array<{ from: string; to: string }> = [];

    if (firstExecutionStep) {
        for (const triggerKey of triggerStepKeys) {
            if (!keysWithOutgoingEdges.has(triggerKey)) {
                triggerEdges.push({ from: triggerKey, to: firstExecutionStep.key });
            }
        }
    }

    return {
        ...definition,
        steps: newSteps,
        edges: [...retainedEdges, ...triggerEdges],
    };
}
