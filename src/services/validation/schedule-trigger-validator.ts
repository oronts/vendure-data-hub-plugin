import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { isValidCron } from '../../../shared/utils/validation';
import {
    addTriggerIssue,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';

const REMOVED_SCHEDULE_FIELDS = ['schedule', 'startTime', 'endTime', 'maxConcurrent'] as const;

export function validateScheduleTrigger(
    stepKey: string,
    config: TriggerConfigRecord,
    issues: PipelineDefinitionIssue[],
): void {
    rejectUnsupportedTriggerFields(
        config,
        REMOVED_SCHEDULE_FIELDS,
        stepKey,
        'schedule',
        issues,
    );
    const hasCron = config.cron !== undefined;
    const hasInterval = config.intervalSec !== undefined;
    if (hasCron === hasInterval) {
        addTriggerIssue(
            issues,
            stepKey,
            'schedule trigger requires exactly one of cron or intervalSec',
            'invalid-schedule-mode',
        );
        return;
    }

    if (hasCron) {
        const cron = config.cron;
        if (typeof cron !== 'string' || !cron.trim() || !isValidCron(cron)) {
            addTriggerIssue(
                issues,
                stepKey,
                'cron must be a valid 5-field expression',
                'invalid-cron-expression',
                'cron',
            );
        }
    } else {
        const intervalSec = config.intervalSec;
        if (!Number.isSafeInteger(intervalSec) || Number(intervalSec) < 1) {
            addTriggerIssue(
                issues,
                stepKey,
                'intervalSec must be a positive integer',
                'invalid-schedule-interval',
                'intervalSec',
            );
        }
    }

    validateTimezone(config.timezone, stepKey, issues);
}

function validateTimezone(
    value: unknown,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    if (value === undefined) return;
    try {
        if (typeof value !== 'string' || !value.trim()) throw new Error();
        Intl.DateTimeFormat(undefined, { timeZone: value });
    } catch {
        addTriggerIssue(
            issues,
            stepKey,
            'timezone must be a valid IANA timezone',
            'invalid-schedule-timezone',
            'timezone',
        );
    }
}
