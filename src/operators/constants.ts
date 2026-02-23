import { HTTP_METHOD_GET_POST_OPTIONS } from '../constants/adapter-schema-options';

/**
 * Validation rule types for operator validation errors.
 * Used as the `rule` field in ValidationError objects.
 */
export const VALIDATION_RULE = {
    REQUIRED: 'required',
    FORMAT: 'format',
    TYPE: 'type',
    RANGE: 'range',
    PATTERN: 'pattern',
    CUSTOM: 'custom',
} as const;

export const ROUNDING_MODES = [
    { value: 'round', label: 'Round (nearest)' },
    { value: 'floor', label: 'Floor (down)' },
    { value: 'ceil', label: 'Ceil (up)' },
] as const;

export const TRIM_MODES = [
    { value: 'both', label: 'Both' },
    { value: 'start', label: 'Start' },
    { value: 'end', label: 'End' },
] as const;

export const HTTP_METHOD_OPTIONS = HTTP_METHOD_GET_POST_OPTIONS;

export const UNIT_OPTIONS = [
    { value: 'g', label: 'g (grams)' },
    { value: 'kg', label: 'kg (kilograms)' },
    { value: 'lb', label: 'lb (pounds)' },
    { value: 'oz', label: 'oz (ounces)' },
    { value: 'cm', label: 'cm (centimeters)' },
    { value: 'm', label: 'm (meters)' },
    { value: 'mm', label: 'mm (millimeters)' },
    { value: 'in', label: 'in (inches)' },
    { value: 'ft', label: 'ft (feet)' },
    { value: 'ml', label: 'ml (milliliters)' },
    { value: 'l', label: 'l (liters)' },
    { value: 'gal', label: 'gal (gallons)' },
] as const;

export const DATE_UNIT_OPTIONS = [
    { value: 'seconds', label: 'Seconds' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months' },
    { value: 'years', label: 'Years' },
] as const;

export const DATE_DIFF_UNIT_OPTIONS = [
    { value: 'seconds', label: 'Seconds' },
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months (approximate)' },
    { value: 'years', label: 'Years (approximate)' },
] as const;
