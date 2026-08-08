import type { JsonValue } from '../../../../shared/types/json.types';

export const VALIDATION_VALUE_TYPES = [
    'string',
    'number',
    'boolean',
] as const;

export type ValidationValueType = typeof VALIDATION_VALUE_TYPES[number];

export interface ValidationRuleSpec extends Record<string, unknown> {
    field: string;
    required?: boolean;
    type?: ValidationValueType;
    enum?: JsonValue[];
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    error?: string;
}

export interface ValidationRule {
    id?: string;
    type: string;
    spec: ValidationRuleSpec;
}

export type ValidationConstraintKey =
    | 'required'
    | 'type'
    | 'enum'
    | 'min'
    | 'max'
    | 'minLength'
    | 'maxLength'
    | 'pattern'
    | 'error';

const RUNTIME_RULE_FIELDS = new Set<string>([
    'field',
    'required',
    'type',
    'enum',
    'min',
    'max',
    'minLength',
    'maxLength',
    'pattern',
    'error',
]);

export interface ValidationEnumParseResult {
    value?: JsonValue[];
    error?: string;
}

export function isValidationValueType(value: unknown): value is ValidationValueType {
    return typeof value === 'string'
        && VALIDATION_VALUE_TYPES.includes(value as ValidationValueType);
}

export function setValidationRuleConstraint(
    spec: ValidationRuleSpec,
    key: ValidationConstraintKey,
    value: unknown,
): ValidationRuleSpec {
    const updated = { ...spec };
    if (value === undefined || value === '') {
        delete updated[key];
    } else {
        Object.assign(updated, { [key]: value });
    }
    return updated;
}

export function applyValidationRulePreset(
    spec: ValidationRuleSpec,
    defaults: Readonly<Record<string, unknown>>,
): ValidationRuleSpec {
    return { ...spec, ...defaults };
}

export function parseValidationEnum(text: string): ValidationEnumParseResult {
    if (!text.trim()) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { error: 'Enter valid JSON.' };
    }

    if (!Array.isArray(parsed)) {
        return { error: 'Enter a JSON array of allowed values.' };
    }

    return { value: parsed as JsonValue[] };
}

export function formatValidationEnum(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) return '';
    return JSON.stringify(value, null, 2);
}

export function getUnsupportedValidationRuleFields(
    spec: ValidationRuleSpec,
): string[] {
    return Object.keys(spec).filter(
        key => !RUNTIME_RULE_FIELDS.has(key),
    );
}
