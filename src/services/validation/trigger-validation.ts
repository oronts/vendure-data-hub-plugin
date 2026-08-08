import { TriggerType, StepType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateEventTrigger } from './event-trigger-validator';
import { validateFileTrigger } from './file-trigger-validator';
import { validateMessageTrigger } from './message-trigger-validator';
import { validateScheduleTrigger } from './schedule-trigger-validator';
import {
    addTriggerIssue,
    asConfigRecord,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';
import { validateWebhookTrigger } from './webhook-trigger-validator';

type TriggerValidator = (
    stepKey: string,
    config: TriggerConfigRecord,
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
) => void;

const TRIGGER_VALIDATORS: Partial<Record<TriggerType, TriggerValidator>> = {
    [TriggerType.SCHEDULE]: (stepKey, config, _definition, issues) => {
        validateScheduleTrigger(stepKey, config, issues);
    },
    [TriggerType.WEBHOOK]: (stepKey, config, _definition, issues, warnings) => {
        validateWebhookTrigger(stepKey, config, issues, warnings);
    },
    [TriggerType.EVENT]: (stepKey, config, _definition, issues) => {
        validateEventTrigger(stepKey, config, issues);
    },
    [TriggerType.FILE]: (stepKey, config, definition, issues) => {
        validateFileTrigger(stepKey, config, definition, issues);
    },
    [TriggerType.MESSAGE]: (stepKey, config, _definition, issues) => {
        validateMessageTrigger(stepKey, config, issues);
    },
};

const SUPPORTED_TRIGGER_TYPES = new Set<string>(Object.values(TriggerType));
const REMOVED_GENERIC_TRIGGER_FIELDS = [
    'conditions',
    'maxRetries',
    'retryDelayMs',
    'timeoutMs',
] as const;

export function validateTrigger(
    definition: PipelineDefinition,
    issues: PipelineDefinitionIssue[],
    warnings: PipelineDefinitionIssue[],
): void {
    for (const step of definition.steps) {
        if (step.type !== StepType.TRIGGER) continue;

        const config = asConfigRecord(step.config);
        if (!config) {
            addTriggerIssue(
                issues,
                step.key,
                'trigger configuration must be an object',
                'invalid-trigger-config',
            );
            continue;
        }

        const triggerType = config.type;
        if (typeof triggerType !== 'string' || triggerType.length === 0) {
            addTriggerIssue(
                issues,
                step.key,
                'trigger type is required',
                'missing-trigger-type',
            );
            continue;
        }
        if (!SUPPORTED_TRIGGER_TYPES.has(triggerType)) {
            addTriggerIssue(
                issues,
                step.key,
                `unsupported trigger type "${triggerType}"`,
                'unsupported-trigger-type',
            );
            continue;
        }

        rejectUnsupportedTriggerFields(
            config,
            REMOVED_GENERIC_TRIGGER_FIELDS,
            step.key,
            triggerType.toLowerCase(),
            issues,
        );

        const validator = TRIGGER_VALIDATORS[triggerType as TriggerType];
        validator?.(step.key, config, definition, issues, warnings);
    }
}
