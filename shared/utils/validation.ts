// Shared validation utilities - single source of truth for frontend and backend
// Cron validation, email/URL patterns, confidence scoring, etc.

import { CONFIDENCE_THRESHOLDS } from '../constants';

/**
 * Match confidence level for field mapping suggestions.
 */
export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * Convert numeric score to confidence level.
 * Replaces ternary chains: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
 */
export function scoreToConfidence(score: number): MatchConfidence {
    if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
    if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
    return 'low';
}

/**
 * Get minimum score for a confidence level option.
 * Replaces: minConfidence === 'high' ? 70 : minConfidence === 'medium' ? 40 : 0
 */
export function confidenceToMinScore(confidence: MatchConfidence | undefined): number {
    switch (confidence) {
        case 'high': return CONFIDENCE_THRESHOLDS.HIGH;
        case 'medium': return CONFIDENCE_THRESHOLDS.MEDIUM;
        default: return 0;
    }
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
export const CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const PIPELINE_CODE_PATTERN = /^[a-z0-9-]+$/;

function isNil(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function isEmpty(value: unknown): boolean {
    if (isNil(value)) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

export function isValidEmail(email: string): boolean {
    if (isEmpty(email)) return false;
    return EMAIL_PATTERN.test(email);
}

export function isValidUrl(url: string, options?: { requireHttps?: boolean; allowRelative?: boolean }): boolean {
    if (isEmpty(url)) return false;

    if (options?.allowRelative && url.startsWith('/')) {
        return true;
    }

    try {
        const parsed = new URL(url);
        if (options?.requireHttps && parsed.protocol !== 'https:') {
            return false;
        }
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

export function isValidPipelineCode(code: string): boolean {
    if (isEmpty(code)) return false;
    return PIPELINE_CODE_PATTERN.test(code);
}

// ─── Cron validation (single source of truth) ──────────────────────

const WEEKDAY_NAMES: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
};

const MONTH_NAMES: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};

function normalizeFieldValue(value: string, fieldType: 'weekday' | 'month'): string {
    const lower = value.toLowerCase().trim();
    const mapping = fieldType === 'weekday' ? WEEKDAY_NAMES : MONTH_NAMES;

    if (mapping[lower] !== undefined) {
        return String(mapping[lower]);
    }
    return value;
}

export function normalizeCronField(field: string, fieldType: 'weekday' | 'month'): string {
    // Handle comma-separated lists
    if (field.includes(',')) {
        return field.split(',').map(part => normalizeCronField(part.trim(), fieldType)).join(',');
    }

    // Handle ranges (e.g., MON-FRI, JAN-MAR)
    if (field.includes('-') && !field.startsWith('*/')) {
        const [rangeAndStep] = field.split('/');
        const parts = rangeAndStep.split('-');
        if (parts.length === 2) {
            const normalizedStart = normalizeFieldValue(parts[0], fieldType);
            const normalizedEnd = normalizeFieldValue(parts[1], fieldType);
            const step = field.includes('/') ? '/' + field.split('/')[1] : '';
            return `${normalizedStart}-${normalizedEnd}${step}`;
        }
    }

    // Handle single values
    return normalizeFieldValue(field, fieldType);
}

/**
 * Validate a cron expression (5 fields: minute hour day month weekday).
 * Supports named months (jan-dec) and weekdays (sun-sat).
 * Weekday range is 0-7 where both 0 and 7 represent Sunday (POSIX standard).
 *
 * Returns `{ valid: true }` on success, or `{ valid: false, error: '...' }` with
 * a human-readable message on failure.
 */
export function validateCronExpression(expr: string): {
    valid: boolean;
    error?: string;
} {
    if (!expr || typeof expr !== 'string') {
        return { valid: false, error: 'Cron expression is required' };
    }

    const fields = expr.trim().split(/\s+/);
    if (fields.length < 5) {
        return {
            valid: false,
            error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}`,
        };
    }

    const fieldNames = ['minute', 'hour', 'day', 'month', 'weekday'];
    const ranges: [number, number][] = [
        [0, 59],
        [0, 23],
        [1, 31],
        [1, 12],
        [0, 7],  // 0-7: both 0 and 7 are Sunday (POSIX standard)
    ];

    for (let i = 0; i < 5; i++) {
        let field = fields[i];
        const [min, max] = ranges[i];

        // Normalize month and weekday fields to handle named values
        if (i === 3) { // month
            field = normalizeCronField(field, 'month');
        } else if (i === 4) { // weekday
            field = normalizeCronField(field, 'weekday');
        }

        const validationError = validateCronField(field, min, max);

        if (validationError) {
            return {
                valid: false,
                error: `Invalid ${fieldNames[i]} field "${fields[i]}": ${validationError}`,
            };
        }
    }

    return { valid: true };
}

function validateCronField(
    field: string,
    min: number,
    max: number,
): string | undefined {
    field = field.trim();

    if (field === '*') {
        return undefined;
    }

    // Step values
    if (field.startsWith('*/')) {
        const step = Number(field.slice(2));
        if (isNaN(step) || step <= 0) {
            return 'Step value must be a positive number';
        }
        return undefined;
    }

    // Range with step
    if (field.includes('-') && field.includes('/')) {
        const [range, stepStr] = field.split('/');
        const [startStr, endStr] = range.split('-');
        const start = Number(startStr);
        const end = Number(endStr);
        const step = Number(stepStr);

        if (isNaN(start) || isNaN(end)) {
            return 'Range values must be numbers';
        }
        if (start < min || start > max || end < min || end > max) {
            return `Range values must be between ${min} and ${max}`;
        }
        if (start > end) {
            return 'Start of range must be less than or equal to end';
        }
        if (isNaN(step) || step <= 0) {
            return 'Step value must be a positive number';
        }
        return undefined;
    }

    // Range
    if (field.includes('-')) {
        const [startStr, endStr] = field.split('-');
        const start = Number(startStr);
        const end = Number(endStr);

        if (isNaN(start) || isNaN(end)) {
            return 'Range values must be numbers';
        }
        if (start < min || start > max || end < min || end > max) {
            return `Range values must be between ${min} and ${max}`;
        }
        if (start > end) {
            return 'Start of range must be less than or equal to end';
        }
        return undefined;
    }

    // Comma-separated list
    if (field.includes(',')) {
        const parts = field.split(',');
        for (const part of parts) {
            const error = validateCronField(part.trim(), min, max);
            if (error) {
                return error;
            }
        }
        return undefined;
    }

    // Single value
    const num = Number(field);
    if (isNaN(num)) {
        return 'Value must be a number';
    }
    if (num < min || num > max) {
        return `Value must be between ${min} and ${max}`;
    }

    return undefined;
}

/** Validate cron expression (5 fields: minute hour day month weekday). Delegates to `validateCronExpression`. */
export function isValidCron(cron: string): boolean {
    return validateCronExpression(cron).valid;
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports `*` (any characters) and `?` (single character).
 * All other special regex characters are escaped.
 */
export function globToRegex(pattern: string, flags?: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, flags);
}

