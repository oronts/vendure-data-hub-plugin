import { GATE_LIMITS } from '../constants/defaults/core-defaults';
import { PIPELINE_VALIDATION_ERROR } from '../constants/enums';
import { EMAIL_PATTERN } from '../constants/patterns';
import {
    isValidSchemaId,
    isValidSchemaVersion,
} from '../services/schema/schema-reference';
import { PipelineStepDefinition, StepType } from '../types';
import { PipelineDefinitionError } from './pipeline-definition-error';
import { createPipelineDefinitionIssue } from './pipeline-validation-issues';

const GATE_APPROVAL_TYPES = new Set(['MANUAL', 'THRESHOLD', 'TIMEOUT']);
const VALIDATION_RULE_SPEC_KEYS = new Set<string>([
    'field',
    'required',
    'type',
    'min',
    'max',
    'minLength',
    'maxLength',
    'pattern',
    'enum',
    'error',
] as const);
const VALIDATION_VALUE_TYPES = new Set(['string', 'number', 'boolean']);

export function validatePipelineStep(
    step: PipelineStepDefinition,
    index: number,
    keys: Set<string>,
): void {
    if (!step || typeof step !== 'object') {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step at index ${index} is invalid`,
                PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
                undefined,
                `steps[${index}]`,
            ),
        ]);
    }

    if (typeof step.key !== 'string' || step.key.trim().length === 0) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step at index ${index} must have a non-empty key`,
                PIPELINE_VALIDATION_ERROR.INVALID_DEFINITION,
                undefined,
                `steps[${index}].key`,
            ),
        ]);
    }

    if (keys.has(step.key)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Duplicate step key: ${step.key}`,
                PIPELINE_VALIDATION_ERROR.DUPLICATE_STEP_KEY,
                step.key,
                `steps[${index}].key`,
            ),
        ]);
    }
    keys.add(step.key);

    if (!isStepType(step.type as string)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step ${step.key} has invalid type ${String(step.type)}`,
                PIPELINE_VALIDATION_ERROR.INVALID_STEP_TYPE,
                step.key,
                `steps[${index}].type`,
            ),
        ]);
    }

    if (!step.config || typeof step.config !== 'object' || Array.isArray(step.config)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step ${step.key} must have a config object`,
                PIPELINE_VALIDATION_ERROR.MISSING_CONFIG,
                step.key,
                `steps[${index}].config`,
            ),
        ]);
    }

    validateSchemaReference(step, index);

    if (step.type === StepType.GATE) {
        validateGateConfig(step, index);
    }
    if (step.type === StepType.VALIDATE) {
        validateInlineValidationRules(step, index);
    }

    if ('concurrency' in step) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step ${step.key} must configure concurrency through throughput.concurrency`,
                PIPELINE_VALIDATION_ERROR.INVALID_CONCURRENCY,
                step.key,
                `steps[${index}].concurrency`,
            ),
        ]);
    }
}

function validateInlineValidationRules(
    step: PipelineStepDefinition,
    stepIndex: number,
): void {
    const rules = step.config?.['rules'];
    if (rules === undefined) return;
    if (!Array.isArray(rules)) {
        throwInvalidValidationRule(step, stepIndex, 'rules must be an array');
    }

    rules.forEach((rule, ruleIndex) => {
        if (!isPlainObject(rule) || rule['type'] !== 'business') {
            throwInvalidValidationRule(
                step,
                stepIndex,
                `rule ${ruleIndex} must use type "business"`,
            );
        }
        const spec = rule['spec'];
        if (!isPlainObject(spec)) {
            throwInvalidValidationRule(
                step,
                stepIndex,
                `rule ${ruleIndex} must have a spec object`,
            );
        }
        validateRuleSpec(step, stepIndex, ruleIndex, spec);
    });
}

function validateRuleSpec(
    step: PipelineStepDefinition,
    stepIndex: number,
    ruleIndex: number,
    spec: Record<string, unknown>,
): void {
    const unknownKeys = Object.keys(spec).filter(
        key => !VALIDATION_RULE_SPEC_KEYS.has(key),
    );
    const field = spec['field'];
    if (typeof field !== 'string' || field.trim() !== field || field.length === 0) {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} requires a canonical field`);
    }
    if (unknownKeys.length > 0) {
        throwInvalidValidationRule(
            step,
            stepIndex,
            `rule ${ruleIndex} has unsupported fields: ${unknownKeys.join(', ')}`,
        );
    }
    if ('required' in spec && typeof spec['required'] !== 'boolean') {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} required must be boolean`);
    }
    if (
        'type' in spec
        && (typeof spec['type'] !== 'string' || !VALIDATION_VALUE_TYPES.has(spec['type']))
    ) {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} has an invalid value type`);
    }
    validateRuleBounds(step, stepIndex, ruleIndex, spec);
    if ('pattern' in spec && typeof spec['pattern'] !== 'string') {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} pattern must be a string`);
    }
    if ('enum' in spec && (!Array.isArray(spec['enum']) || spec['enum'].length === 0)) {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} enum must be a non-empty array`);
    }
    if ('error' in spec && typeof spec['error'] !== 'string') {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} error must be a string`);
    }
}

function validateRuleBounds(
    step: PipelineStepDefinition,
    stepIndex: number,
    ruleIndex: number,
    spec: Record<string, unknown>,
): void {
    for (const key of ['min', 'max'] as const) {
        if (key in spec && (typeof spec[key] !== 'number' || !Number.isFinite(spec[key]))) {
            throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} ${key} must be finite`);
        }
    }
    for (const key of ['minLength', 'maxLength'] as const) {
        if (
            key in spec
            && (
                typeof spec[key] !== 'number'
                || !Number.isSafeInteger(spec[key])
                || spec[key] < 0
            )
        ) {
            throwInvalidValidationRule(
                step,
                stepIndex,
                `rule ${ruleIndex} ${key} must be a non-negative integer`,
            );
        }
    }
    if (
        typeof spec['min'] === 'number'
        && typeof spec['max'] === 'number'
        && spec['min'] > spec['max']
    ) {
        throwInvalidValidationRule(step, stepIndex, `rule ${ruleIndex} min must not exceed max`);
    }
    if (
        typeof spec['minLength'] === 'number'
        && typeof spec['maxLength'] === 'number'
        && spec['minLength'] > spec['maxLength']
    ) {
        throwInvalidValidationRule(
            step,
            stepIndex,
            `rule ${ruleIndex} minLength must not exceed maxLength`,
        );
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function throwInvalidValidationRule(
    step: PipelineStepDefinition,
    stepIndex: number,
    reason: string,
): never {
    throw new PipelineDefinitionError([
        createPipelineDefinitionIssue(
            `Validate step ${step.key}: ${reason}`,
            PIPELINE_VALIDATION_ERROR.INVALID_VALIDATION_RULE,
            step.key,
            `steps[${stepIndex}].config.rules`,
        ),
    ]);
}

function isStepType(value: string): value is StepType {
    return Object.values(StepType).includes(value as StepType);
}

function validateSchemaReference(
    step: PipelineStepDefinition,
    index: number,
): void {
    if (step.schemaRef === undefined) return;
    if (step.type !== StepType.EXTRACT && step.type !== StepType.VALIDATE) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Step ${step.key} can only use schemaRef with EXTRACT or VALIDATE`,
                PIPELINE_VALIDATION_ERROR.INVALID_SCHEMA_REFERENCE,
                step.key,
                `steps[${index}].schemaRef`,
            ),
        ]);
    }
    const reference: unknown = step.schemaRef;
    if (
        reference === null
        || typeof reference !== 'object'
        || Array.isArray(reference)
    ) {
        throwInvalidSchemaReference(step, index);
    }
    const schemaId = Reflect.get(reference, 'schemaId');
    const version = Reflect.get(reference, 'version');
    if (
        !isValidSchemaId(schemaId)
        || !isValidSchemaVersion(version)
    ) {
        throwInvalidSchemaReference(step, index);
    }
}

function throwInvalidSchemaReference(
    step: PipelineStepDefinition,
    index: number,
): never {
    throw new PipelineDefinitionError([
        createPipelineDefinitionIssue(
            `Step ${step.key} schemaRef requires a valid schemaId and version`,
            PIPELINE_VALIDATION_ERROR.INVALID_SCHEMA_REFERENCE,
            step.key,
            `steps[${index}].schemaRef`,
        ),
    ]);
}

function validateGateConfig(
    step: PipelineStepDefinition,
    index: number,
): void {
    const approvalType = step.config?.['approvalType'];
    if (typeof approvalType !== 'string' || !GATE_APPROVAL_TYPES.has(approvalType)) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Gate step ${step.key} must use MANUAL, THRESHOLD, or TIMEOUT approval`,
                PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                step.key,
                `steps[${index}].config.approvalType`,
            ),
        ]);
    }

    if (approvalType === 'TIMEOUT') {
        const timeoutSeconds = step.config?.['timeoutSeconds'];
        if (
            typeof timeoutSeconds !== 'number'
            || !Number.isSafeInteger(timeoutSeconds)
            || timeoutSeconds < GATE_LIMITS.MIN_TIMEOUT_SECONDS
            || timeoutSeconds > GATE_LIMITS.MAX_TIMEOUT_SECONDS
        ) {
            throw new PipelineDefinitionError([
                createPipelineDefinitionIssue(
                    `Gate step ${step.key} timeoutSeconds must be an integer between ${GATE_LIMITS.MIN_TIMEOUT_SECONDS} and ${GATE_LIMITS.MAX_TIMEOUT_SECONDS}`,
                    PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                    step.key,
                    `steps[${index}].config.timeoutSeconds`,
                ),
            ]);
        }
    }

    const threshold = step.config?.['errorThresholdPercent'];
    if (
        approvalType === 'THRESHOLD'
        && (
            typeof threshold !== 'number'
            || !Number.isFinite(threshold)
            || threshold < 0
            || threshold > 100
        )
    ) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Gate step ${step.key} errorThresholdPercent must be between 0 and 100`,
                PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                step.key,
                `steps[${index}].config.errorThresholdPercent`,
            ),
        ]);
    }

    const previewCount = step.config?.['previewCount'];
    if (
        previewCount !== undefined
        && (
            typeof previewCount !== 'number'
            || !Number.isSafeInteger(previewCount)
            || previewCount < 1
            || previewCount > GATE_LIMITS.MAX_PREVIEW_COUNT
        )
    ) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Gate step ${step.key} previewCount must be an integer between 1 and ${GATE_LIMITS.MAX_PREVIEW_COUNT}`,
                PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                step.key,
                `steps[${index}].config.previewCount`,
            ),
        ]);
    }

    validateGateNotificationFields(step, index);
}

function validateGateNotificationFields(
    step: PipelineStepDefinition,
    index: number,
): void {
    const notifyEmail = step.config?.['notifyEmail'];
    if (
        notifyEmail !== undefined
        && (
            typeof notifyEmail !== 'string'
            || notifyEmail.length > GATE_LIMITS.MAX_EMAIL_LENGTH
            || !EMAIL_PATTERN.test(notifyEmail)
        )
    ) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Gate step ${step.key} notifyEmail must be a valid email address`,
                PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                step.key,
                `steps[${index}].config.notifyEmail`,
            ),
        ]);
    }

    const notifyWebhook = step.config?.['notifyWebhook'];
    if (
        notifyWebhook !== undefined
        && (
            typeof notifyWebhook !== 'string'
            || notifyWebhook.length > GATE_LIMITS.MAX_WEBHOOK_URL_LENGTH
            || !isHttpUrl(notifyWebhook)
        )
    ) {
        throw new PipelineDefinitionError([
            createPipelineDefinitionIssue(
                `Gate step ${step.key} notifyWebhook must be an absolute HTTP or HTTPS URL`,
                PIPELINE_VALIDATION_ERROR.INVALID_GATE_CONFIG,
                step.key,
                `steps[${index}].config.notifyWebhook`,
            ),
        ]);
    }
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
