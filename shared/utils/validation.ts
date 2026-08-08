// Shared validation utilities for frontend and backend

import { CronPattern } from 'croner';
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
export const ENV_VARIABLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

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

// ─── Cron validation ────────────────────────────────────────────────

/** Validate a standard five-field cron expression with the same parser Vendure uses. */
export function validateCronExpression(expr: string): {
    valid: boolean;
    error?: string;
} {
    if (!expr || typeof expr !== 'string') {
        return { valid: false, error: 'Cron expression is required' };
    }

    const normalized = expr.trim();
    const fields = normalized.split(/\s+/);
    if (fields.length !== 5) {
        return {
            valid: false,
            error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}`,
        };
    }

    try {
        new CronPattern(normalized);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Invalid cron expression',
        };
    }
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

