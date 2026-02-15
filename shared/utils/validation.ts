// Shared validation utilities - single source of truth for frontend and backend

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

function isNotEmpty(value: unknown): boolean {
    return !isEmpty(value);
}

function isNumeric(value: unknown): boolean {
    if (typeof value === 'number') return !isNaN(value) && isFinite(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return false;
        return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
    }
    return false;
}

function isInteger(value: unknown): boolean {
    if (!isNumeric(value)) return false;
    const num = Number(value);
    return Number.isInteger(num);
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

/** Validate cron expression (5 fields: minute hour day month weekday) */
export function isValidCron(cron: string): boolean {
    if (isEmpty(cron)) return false;

    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const ranges = [
        { min: 0, max: 59 },  // minute
        { min: 0, max: 23 },  // hour
        { min: 1, max: 31 },  // day of month
        { min: 1, max: 12 },  // month
        { min: 0, max: 7 },   // day of week (0 and 7 are Sunday)
    ];

    for (let i = 0; i < 5; i++) {
        if (!isValidCronPart(parts[i], ranges[i].min, ranges[i].max)) {
            return false;
        }
    }

    return true;
}

function isValidCronPart(part: string, min: number, max: number): boolean {
    if (part === '*') return true;

    // Step value (*/n or n/n)
    if (part.includes('/')) {
        const [range, stepStr] = part.split('/');
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step < 1 || step > max) return false;

        if (range === '*') return true;

        // Range with step (e.g., 1-30/5)
        if (range.includes('-')) {
            return isValidCronRange(range, min, max);
        }

        // Single value with step
        const rangeNum = parseInt(range, 10);
        return !isNaN(rangeNum) && rangeNum >= min && rangeNum <= max;
    }

    // List (n,n,n)
    if (part.includes(',')) {
        return part.split(',').every(element => {
            if (element.includes('-')) {
                return isValidCronRange(element, min, max);
            }
            const num = parseInt(element, 10);
            return !isNaN(num) && num >= min && num <= max;
        });
    }

    // Range (n-n)
    if (part.includes('-')) {
        return isValidCronRange(part, min, max);
    }

    // Single value
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= min && num <= max;
}

function isValidCronRange(range: string, min: number, max: number): boolean {
    const [startStr, endStr] = range.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
}
