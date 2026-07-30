import { VENDURE_EVENT_TYPES } from '../../../shared';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    addTriggerIssue,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';

const SUPPORTED_VENDURE_EVENTS = new Set<string>(VENDURE_EVENT_TYPES);
const UNSUPPORTED_EVENT_FIELDS = [
    'entityType',
    'filter',
    'debounceMs',
    'batchSize',
    'batchTimeoutMs',
] as const;

export function validateEventTrigger(
    stepKey: string,
    config: TriggerConfigRecord,
    issues: PipelineDefinitionIssue[],
): void {
    rejectUnsupportedTriggerFields(
        config,
        UNSUPPORTED_EVENT_FIELDS,
        stepKey,
        'event',
        issues,
    );

    const event = config.event;
    if (typeof event !== 'string' || !event.trim()) {
        addTriggerIssue(
            issues,
            stepKey,
            'event trigger requires event field',
            'missing-event-type',
            'event',
        );
    } else if (!SUPPORTED_VENDURE_EVENTS.has(event)) {
        addTriggerIssue(
            issues,
            stepKey,
            `unsupported Vendure event "${event}"`,
            'unsupported-event-type',
            'event',
        );
    }
}
