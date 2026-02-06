/**
 * Trigger Utilities
 *
 * Shared utilities for finding and working with trigger steps in pipeline definitions.
 * Triggers are identified by TYPE (step.type === 'TRIGGER'), not by position.
 *
 * IMPORTANT: Pipelines support MULTIPLE triggers. For example:
 * - Manual trigger for on-demand runs
 * - Schedule trigger for automated runs
 * - Webhook trigger for external API calls
 *
 * Each trigger type is handled by its respective service:
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

/**
 * Type guard to check if a step is a TRIGGER step
 */
export function isTriggerStep(step: PipelineStepDefinition | undefined | null): step is PipelineStepDefinition {
    return step?.type === StepType.TRIGGER;
}

/**
 * Find ALL trigger steps in a pipeline definition
 * Triggers are identified by step.type === 'TRIGGER', not by position
 *
 * @param definition - Pipeline definition to search
 * @returns Array of trigger steps (may be empty)
 */
export function findTriggerSteps(definition: PipelineDefinition | undefined | null): PipelineStepDefinition[] {
    if (!definition?.steps || !Array.isArray(definition.steps)) {
        return [];
    }
    return definition.steps.filter(isTriggerStep);
}

/**
 * Find trigger steps of a specific type (e.g., 'schedule', 'webhook')
 *
 * @param definition - Pipeline definition to search
 * @param triggerType - Type of trigger to find (e.g., 'schedule', 'webhook')
 * @returns Array of matching trigger steps
 */
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

/**
 * Find the first trigger step of a specific type
 *
 * @param definition - Pipeline definition to search
 * @param triggerType - Type of trigger to find
 * @returns First matching trigger step or null
 */
export function findTriggerByType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): PipelineStepDefinition | null {
    const triggers = findTriggerStepsByType(definition, triggerType);
    return triggers[0] ?? null;
}

/**
 * Check if a pipeline has any trigger configured
 *
 * @param definition - Pipeline definition to check
 * @returns true if pipeline has at least one trigger step
 */
export function hasTrigger(definition: PipelineDefinition | undefined | null): boolean {
    return findTriggerSteps(definition).length > 0;
}

/**
 * Check if a pipeline has a specific trigger type configured
 *
 * @param definition - Pipeline definition to check
 * @param triggerType - Type of trigger to check for
 * @returns true if pipeline has the specified trigger type
 */
export function hasTriggerType(
    definition: PipelineDefinition | undefined | null,
    triggerType: TriggerType
): boolean {
    return findTriggerStepsByType(definition, triggerType).length > 0;
}

/**
 * Get parsed trigger config from a trigger step
 *
 * @param step - Trigger step to parse
 * @returns Parsed config or null if invalid
 */
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

/**
 * Get all enabled triggers of a specific type
 *
 * @param definition - Pipeline definition to search
 * @param triggerType - Type of trigger to find
 * @returns Array of enabled trigger steps
 */
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
