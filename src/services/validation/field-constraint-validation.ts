import type { StepConfigSchemaField } from '../../sdk/types';
import type { JsonValue } from '../../types';
import { validateRegexSafety } from '../../utils/safe-regex.utils';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';

function addConstraintIssue(
    issues: PipelineDefinitionIssue[],
    stepKey: string,
    field: StepConfigSchemaField,
    errorCode: string,
    message: string,
): void {
    issues.push({ message, stepKey, field: field.key, errorCode });
}

function validateNumberConstraints(
    stepKey: string,
    field: StepConfigSchemaField,
    value: number,
    issues: PipelineDefinitionIssue[],
): void {
    const validation = field.validation;
    if (!validation) {
        return;
    }

    if (validation.min !== undefined && value < validation.min) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'field-below-minimum',
            `Step "${stepKey}": field "${field.key}" must be at least ${validation.min}`,
        );
    }
    if (validation.max !== undefined && value > validation.max) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'field-above-maximum',
            `Step "${stepKey}": field "${field.key}" must be at most ${validation.max}`,
        );
    }
}

function validateStringConstraints(
    stepKey: string,
    field: StepConfigSchemaField,
    value: string,
    issues: PipelineDefinitionIssue[],
): void {
    const validation = field.validation;
    if (!validation) {
        return;
    }

    if (validation.minLength !== undefined && value.length < validation.minLength) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'field-too-short',
            `Step "${stepKey}": field "${field.key}" must contain at least ${validation.minLength} characters`,
        );
    }
    if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'field-too-long',
            `Step "${stepKey}": field "${field.key}" must contain at most ${validation.maxLength} characters`,
        );
    }
    if (validation.pattern === undefined) {
        return;
    }

    const patternSafety = validateRegexSafety(validation.pattern);
    if (!patternSafety.safe) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'invalid-field-validation-pattern',
            `Step "${stepKey}": field "${field.key}" has an invalid validation pattern: ${patternSafety.reason}`,
        );
        return;
    }

    if (!new RegExp(validation.pattern).test(value)) {
        addConstraintIssue(
            issues,
            stepKey,
            field,
            'field-pattern-mismatch',
            validation.patternMessage ??
                `Step "${stepKey}": field "${field.key}" does not match the required pattern`,
        );
    }
}

export function validateFieldConstraints(
    stepKey: string,
    field: StepConfigSchemaField,
    value: JsonValue,
    issues: PipelineDefinitionIssue[],
): void {
    if (typeof value === 'number') {
        validateNumberConstraints(stepKey, field, value, issues);
        return;
    }
    if (typeof value === 'string') {
        validateStringConstraints(stepKey, field, value, issues);
    }
}
