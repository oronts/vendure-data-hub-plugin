/**
 * Trigger Sync Utilities
 *
 * Syncs trigger configuration between UI representations:
 * - Trigger STEPS in pipeline editor (visual nodes)
 * - Triggers Tab in pipeline editor (form-based)
 */

import type { PipelineDefinition, PipelineStepDefinition, PipelineTrigger, StepType } from '../types';

const TRIGGER_STEP_TYPE = 'TRIGGER' as StepType;

/**
 * Get all trigger steps from pipeline definition
 */
export function getTriggerSteps(definition: PipelineDefinition): PipelineStepDefinition[] {
    return (definition.steps ?? []).filter(step => step.type === TRIGGER_STEP_TYPE);
}

/**
 * Get the first trigger step from pipeline definition
 */
export function getTriggerStep(definition: PipelineDefinition): PipelineStepDefinition | null {
    const triggers = getTriggerSteps(definition);
    return triggers[0] ?? null;
}

/**
 * Convert trigger step to PipelineTrigger (for TriggersPanel)
 */
export function stepToTrigger(step: PipelineStepDefinition): PipelineTrigger {
    return {
        ...(step.config as PipelineTrigger),
        stepKey: step.key,
    };
}

/**
 * Convert trigger steps to PipelineTrigger array
 */
export function stepsToTriggers(steps: PipelineStepDefinition[]): PipelineTrigger[] {
    return steps
        .filter(step => step.type === TRIGGER_STEP_TYPE)
        .map(stepToTrigger);
}

/**
 * Convert a trigger config to a step
 */
export function triggerToStep(
    trigger: PipelineTrigger,
    existingKey?: string
): PipelineStepDefinition {
    const { stepKey, ...triggerConfig } = trigger as PipelineTrigger & { stepKey?: string };

    return {
        key: existingKey ?? stepKey ?? `trigger-${Date.now()}`,
        type: TRIGGER_STEP_TYPE,
        config: triggerConfig,
    };
}

/**
 * Convert triggers from TriggersPanel back to steps
 */
export function triggersToSteps(
    triggers: PipelineTrigger[],
    existingSteps: PipelineStepDefinition[]
): PipelineStepDefinition[] {
    const existingTriggerSteps = existingSteps.filter(s => s.type === TRIGGER_STEP_TYPE);
    const nonTriggerSteps = existingSteps.filter(s => s.type !== TRIGGER_STEP_TYPE);

    const newTriggerSteps: PipelineStepDefinition[] = triggers.map((trigger, index) => {
        const triggerStepKey = (trigger as PipelineTrigger & { stepKey?: string }).stepKey;
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
 * Update definition with new triggers
 * Also updates edges so all triggers connect to the first execution step
 */
export function updateDefinitionWithTriggers(
    definition: PipelineDefinition,
    triggers: PipelineTrigger[]
): PipelineDefinition {
    const newSteps = triggersToSteps(triggers, definition.steps ?? []);

    // Find the first non-trigger step (the execution entry point)
    const firstExecutionStep = newSteps.find(s => s.type !== TRIGGER_STEP_TYPE);

    // Get all trigger step keys
    const triggerStepKeys = newSteps
        .filter(s => s.type === TRIGGER_STEP_TYPE)
        .map(s => s.key);

    // Build new edges:
    // 1. Remove all edges FROM trigger steps (we'll recreate them)
    // 2. Keep all non-trigger edges
    // 3. Add edges from each trigger to the first execution step
    const existingEdges = definition.edges ?? [];
    const nonTriggerEdges = existingEdges.filter(
        e => !triggerStepKeys.includes(e.from)
    );

    // Create edges from triggers to first execution step
    const triggerEdges: Array<{ from: string; to: string }> = [];
    if (firstExecutionStep) {
        for (const triggerKey of triggerStepKeys) {
            // Check if this edge already exists
            const edgeExists = nonTriggerEdges.some(
                e => e.from === triggerKey && e.to === firstExecutionStep.key
            );
            if (!edgeExists) {
                triggerEdges.push({ from: triggerKey, to: firstExecutionStep.key });
            }
        }
    }

    return {
        ...definition,
        steps: newSteps,
        edges: [...nonTriggerEdges, ...triggerEdges],
    };
}

/**
 * Check if a pipeline has any trigger configured
 */
export function hasTrigger(definition: PipelineDefinition): boolean {
    return getTriggerSteps(definition).length > 0;
}

/**
 * Get the primary trigger (first trigger step)
 */
export function getPrimaryTrigger(definition: PipelineDefinition): PipelineTrigger | null {
    const triggers = getCombinedTriggers(definition);
    return triggers[0] ?? null;
}

/**
 * Find triggers by their config type (e.g., 'schedule', 'webhook')
 */
export function findTriggersByConfigType(
    definition: PipelineDefinition,
    configType: string
): PipelineTrigger[] {
    return getCombinedTriggers(definition).filter(trigger => trigger.type === configType);
}
