import { describe, expect, it } from 'vitest';
import {
    applyValidationRulePreset,
    formatValidationEnum,
    getUnsupportedValidationRuleFields,
    isValidationValueType,
    parseValidationEnum,
    setValidationRuleConstraint,
    type ValidationRuleSpec,
} from './validation-rule-contract';

const compositeSpec: ValidationRuleSpec = {
    field: 'price',
    required: true,
    type: 'number',
    min: 0,
    max: 100,
    error: 'Enter a valid price',
    extensionField: 'preserve-me',
};

describe('validation rule contract', () => {
    it('updates one constraint without losing combined or extension fields', () => {
        expect(setValidationRuleConstraint(compositeSpec, 'max', 250)).toEqual({
            ...compositeSpec,
            max: 250,
        });
        expect(setValidationRuleConstraint(compositeSpec, 'max', undefined)).toEqual({
            field: 'price',
            required: true,
            type: 'number',
            min: 0,
            error: 'Enter a valid price',
            extensionField: 'preserve-me',
        });
    });

    it('applies a preset without deleting active constraints or error text', () => {
        expect(applyValidationRulePreset(compositeSpec, { pattern: '^SKU-' })).toEqual({
            ...compositeSpec,
            pattern: '^SKU-',
        });
    });

    it('accepts only runtime value types', () => {
        expect(isValidationValueType('string')).toBe(true);
        expect(isValidationValueType('number')).toBe(true);
        expect(isValidationValueType('boolean')).toBe(true);
        expect(isValidationValueType('object')).toBe(false);
    });

    it('parses only JSON arrays for enum constraints', () => {
        expect(parseValidationEnum('["draft", 2, false, null]')).toEqual({
            value: ['draft', 2, false, null],
        });
        expect(parseValidationEnum('{"status":"draft"}')).toEqual({
            error: 'Enter a JSON array of allowed values.',
        });
        expect(parseValidationEnum('[invalid]')).toEqual({
            error: 'Enter valid JSON.',
        });
        expect(parseValidationEnum('')).toEqual({});
    });

    it('formats enum values and identifies unsupported fields', () => {
        expect(formatValidationEnum(['draft', 'published'])).toBe(
            '[\n  "draft",\n  "published"\n]',
        );
        expect(formatValidationEnum(undefined)).toBe('');
        expect(getUnsupportedValidationRuleFields(compositeSpec)).toEqual([
            'extensionField',
        ]);
    });
});
