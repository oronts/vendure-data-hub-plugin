/**
 * Trigger types and their handlers:
 * - schedule: ScheduleHandler (cron/interval)
 * - webhook: WebhookController (HTTP endpoints)
 * - event: EventTriggerService (Vendure events)
 * - message: MessageConsumerService (queue messages)
 * - manual: Pipeline runs started via API
 */

import { PipelineDefinition, PipelineStepDefinition, TriggerType } from '../../shared/types';
import { StepType } from '../constants/enums';

/** Parsed trigger config (type-safe subset) */
export interface ParsedTriggerConfig {
    type: TriggerType;
    enabled?: boolean;
    [key: string]: unknown;
}

export function isTriggerStep(step: PipelineStepDefinition | undefined | null): step is PipelineStepDefinition {
    return step?.type === StepType.TRIGGER;
}

export function findTriggerSteps(definition: PipelineDefinition | undefined | null): PipelineStepDefinition[] {
    if (!definition?.steps || !Array.isArray(definition.steps)) {
        return [];
    }
    return definition.steps.filter(isTriggerStep);
}

export function findTriggerStepsByType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): PipelineStepDefinition[] {
    const triggers = findTriggerSteps(definition);
    return triggers.filter(step => {
        const config = step.config as ParsedTriggerConfig | undefined;
        return config?.type === triggerType;
    });
}

export function findTriggerByType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): PipelineStepDefinition | null {
    const triggers = findTriggerStepsByType(definition, triggerType);
    return triggers[0] ?? null;
}

export function hasTrigger(definition: PipelineDefinition | undefined | null): boolean {
    return findTriggerSteps(definition).length > 0;
}

export function hasTriggerType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): boolean {
    return findTriggerStepsByType(definition, triggerType).length > 0;
}

export function parseTriggerConfig(step: PipelineStepDefinition | undefined | null): ParsedTriggerConfig | null {
    if (!isTriggerStep(step)) {
        return null;
    }
    const config = step.config as ParsedTriggerConfig | undefined;
    if (!config || typeof config.type !== 'string') {
        return null;
    }
    return config;
}

export function findEnabledTriggersByType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): PipelineStepDefinition[] {
    return findTriggerStepsByType(definition, triggerType).filter(step => {
        const config = step.config as ParsedTriggerConfig | undefined;
        // enabled defaults to true if not specified
        return config?.enabled !== false;
    });
}
