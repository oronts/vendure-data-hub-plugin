import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

export type TriggerConfigRecord = Record<string, unknown>;

export function asConfigRecord(value: unknown): TriggerConfigRecord | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as TriggerConfigRecord
        : null;
}

export function addTriggerIssue(
    issues: PipelineDefinitionIssue[],
    stepKey: string,
    message: string,
    errorCode: string,
    field?: string,
): void {
    issues.push({
        message: `Step "${stepKey}": ${message}`,
        stepKey,
        field,
        errorCode,
    });
}

export function rejectUnsupportedTriggerFields(
    config: TriggerConfigRecord,
    fields: readonly string[],
    stepKey: string,
    triggerType: string,
    issues: PipelineDefinitionIssue[],
): void {
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(config, field)) continue;
        addTriggerIssue(
            issues,
            stepKey,
            `${triggerType} trigger field "${field}" is not supported`,
            `unsupported-${triggerType}-trigger-field`,
            field,
        );
    }
}
