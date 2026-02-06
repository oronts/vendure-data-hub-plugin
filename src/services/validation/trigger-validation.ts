/**
 * Trigger-specific validation for pipeline definitions.
 * Handles validation of message triggers, queue configurations, and connection settings.
 */

import { StepType as StepTypeEnum, QueueType } from '../../constants/enums';
import {
    PipelineDefinition,
    TriggerConfig,
    MessageTriggerConfig,
    QueueTypeValue,
} from '../../types/index';
import { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Trigger step configuration structure
 */
interface TriggerStepConfig extends TriggerConfig {
    message?: MessageTriggerConfig & {
        queue?: string;
    };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if config is a trigger step config.
 * Validates that config is an object with optional trigger-specific properties.
 */
function isTriggerStepConfig(config: unknown): config is TriggerStepConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const cfg = config as Record<string, unknown>;
    // Must have a type property if it's a trigger config
    if (cfg.type !== undefined && typeof cfg.type !== 'string') {
        return false;
    }
    // message property, if present, must be an object
    if (cfg.message !== undefined && (typeof cfg.message !== 'object' || cfg.message === null)) {
        return false;
    }
    return true;
}

/**
 * Type guard to check if value is a message trigger config.
 * Validates structure has expected message trigger properties.
 */
function isMessageTriggerConfig(
    value: unknown,
): value is MessageTriggerConfig & { queue?: string } {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const cfg = value as Record<string, unknown>;
    // queueType, if present, must be a string
    if (cfg.queueType !== undefined && typeof cfg.queueType !== 'string') {
        return false;
    }
    // connectionCode, if present, must be a string
    if (cfg.connectionCode !== undefined && typeof cfg.connectionCode !== 'string') {
        return false;
    }
    // queueName, if present, must be a string
    if (cfg.queueName !== undefined && typeof cfg.queueName !== 'string') {
        return false;
    }
    // queue, if present, must be a string
    if (cfg.queue !== undefined && typeof cfg.queue !== 'string') {
        return false;
    }
    return true;
}

/**
 * Safely get trigger type from config
 */
function getTriggerType(config: TriggerStepConfig): string | undefined {
    return typeof config.type === 'string' ? config.type : undefined;
}

/**
 * Safely get queue type from message config
 */
function getQueueType(
    msgConfig: MessageTriggerConfig & { queue?: string } | undefined,
): QueueTypeValue | undefined {
    if (!msgConfig) return undefined;
    const qt = msgConfig.queueType;
    return typeof qt === 'string' ? (qt as QueueTypeValue) : undefined;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates the trigger step configuration in a pipeline definition.
 * Checks message trigger settings including queue type, connection code, and queue name.
 */
export function validateTrigger(
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
    _warnings: PipelineDefinitionIssue[],
): void {
    const triggerStep = definition.steps.find(s => s.type === StepTypeEnum.TRIGGER);
    if (!triggerStep) {
        return;
    }

    const rawConfig = triggerStep.config ?? {};
    if (!isTriggerStepConfig(rawConfig)) {
        return;
    }

    const cfg = rawConfig as TriggerStepConfig;
    const triggerType = getTriggerType(cfg);

    if (triggerType === 'message') {
        validateMessageTrigger(triggerStep.key, cfg, issues);
    }
}

/**
 * Validates message trigger configuration including queue type and required fields.
 */
function validateMessageTrigger(
    stepKey: string,
    cfg: TriggerStepConfig,
    issues: PipelineDefinitionIssue[],
): void {
    const messageConfig = isMessageTriggerConfig(cfg.message) ? cfg.message : undefined;
    const queueType = getQueueType(messageConfig);
    const queueTypeLower = queueType?.toLowerCase();

    // All supported queue types
    const supportedQueueTypes = new Set([
        QueueType.RABBITMQ,
        QueueType.RABBITMQ_AMQP,
        QueueType.SQS,
        QueueType.REDIS,
        QueueType.INTERNAL,
    ]);

    if (!queueType) {
        issues.push({
            message: `Step "${stepKey}": message trigger requires queueType (${Array.from(supportedQueueTypes).join(', ')})`,
            stepKey,
            errorCode: 'missing-queue-type',
        });
        return;
    }

    if (!supportedQueueTypes.has(queueTypeLower as QueueType)) {
        issues.push({
            message: `Step "${stepKey}": unsupported queueType "${queueType}". Supported types: ${Array.from(supportedQueueTypes).join(', ')}`,
            stepKey,
            errorCode: 'unsupported-queue-type',
        });
        return;
    }

    // Validate required fields based on queue type
    if (!messageConfig?.connectionCode && queueTypeLower !== QueueType.INTERNAL) {
        issues.push({
            message: `Step "${stepKey}": ${queueType} message trigger requires connectionCode`,
            stepKey,
            errorCode: 'missing-connection-code',
        });
    }

    // Check for queueName or queue
    const queueName = messageConfig?.queueName ?? messageConfig?.queue;
    if (!queueName) {
        issues.push({
            message: `Step "${stepKey}": ${queueType} message trigger requires queue name`,
            stepKey,
            errorCode: 'missing-queue',
        });
    }
}
