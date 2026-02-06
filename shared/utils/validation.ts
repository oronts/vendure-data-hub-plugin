/**
 * Shared Validation Utilities
 *
 * Canonical validation functions that can be used by both backend (src/)
 * and frontend (dashboard/) code.
 *
 * This is the SINGLE SOURCE OF TRUTH for validation logic that needs to be
 * consistent across frontend and backend.
 */

// ============================================================================
// PATTERNS - Exported for direct use when needed
// ============================================================================

/**
 * Email address pattern.
 * Simple pattern: [localpart]@[domain].[tld]
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * URL pattern (HTTP/HTTPS).
 */
export const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * UUID v4 pattern.
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Slug pattern (lowercase alphanumeric with dashes).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Code/identifier pattern (starts with letter, alphanumeric with dashes/underscores).
 */
export const CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Pipeline code pattern (lowercase alphanumeric with dashes).
 */
export const PIPELINE_CODE_PATTERN = /^[a-z0-9-]+$/;

/**
 * Secret code pattern (alphanumeric with dashes and underscores).
 */
export const SECRET_CODE_PATTERN = /^[a-zA-Z0-9-_]+$/;

// ============================================================================
// TYPE CHECKING UTILITIES
// ============================================================================

/**
 * Check if a value is null or undefined.
 */
export function isNil(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object).
 */
export function isEmpty(value: unknown): boolean {
    if (isNil(value)) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Check if a value is not empty.
 */
export function isNotEmpty(value: unknown): boolean {
    return !isEmpty(value);
}

/**
 * Check if a value can be parsed as a number.
 */
export function isNumeric(value: unknown): boolean {
    if (typeof value === 'number') return !isNaN(value) && isFinite(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return false;
        return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
    }
    return false;
}

/**
 * Check if a value can be parsed as an integer.
 */
export function isInteger(value: unknown): boolean {
    if (!isNumeric(value)) return false;
    const num = Number(value);
    return Number.isInteger(num);
}

/**
 * Check if a value is a boolean or can be interpreted as one.
 */
export function isBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return ['true', 'false', '1', '0', 'yes', 'no'].includes(lower);
    }
    return value === 1 || value === 0;
}

// ============================================================================
// FORMAT VALIDATION UTILITIES
// ============================================================================

/**
 * Validate email format.
 *
 * @param email - The email address to validate
 * @returns true if the email format is valid
 */
export function isValidEmail(email: string): boolean {
    if (isEmpty(email)) return false;
    return EMAIL_PATTERN.test(email);
}

/**
 * Validate URL format.
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns true if the URL format is valid
 */
export function isValidUrl(url: string, options?: { requireHttps?: boolean }): boolean {
    if (isEmpty(url)) return false;

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

/**
 * Validate UUID format (v1-v5).
 *
 * @param uuid - The UUID to validate
 * @returns true if the UUID format is valid
 */
export function isValidUuid(uuid: string): boolean {
    if (isEmpty(uuid)) return false;
    return UUID_PATTERN.test(uuid);
}

/**
 * Validate slug format.
 *
 * @param slug - The slug to validate
 * @returns true if the slug format is valid
 */
export function isValidSlug(slug: string): boolean {
    if (isEmpty(slug)) return false;
    return SLUG_PATTERN.test(slug);
}

/**
 * Validate pipeline code format.
 *
 * @param code - The pipeline code to validate
 * @returns true if the code format is valid
 */
export function isValidPipelineCode(code: string): boolean {
    if (isEmpty(code)) return false;
    return PIPELINE_CODE_PATTERN.test(code);
}

/**
 * Validate secret code format.
 *
 * @param code - The secret code to validate
 * @returns true if the code format is valid
 */
export function isValidSecretCode(code: string): boolean {
    if (isEmpty(code)) return false;
    return SECRET_CODE_PATTERN.test(code);
}

/**
 * Validate JSON string.
 *
 * @param str - The string to validate
 * @returns true if the string is valid JSON
 */
export function isValidJson(str: string): boolean {
    if (isEmpty(str)) return false;
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate date string or Date object.
 *
 * @param value - The date to validate
 * @returns true if the value represents a valid date
 */
export function isValidDate(value: unknown): boolean {
    if (value instanceof Date) return !isNaN(value.getTime());
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
    return false;
}

/**
 * Validate cron expression (5 fields: minute hour day month weekday).
 *
 * @param cron - The cron expression to validate
 * @returns true if the cron expression is valid
 */
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

/**
 * Validate a single cron part.
 */
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

/**
 * Validate a cron range expression (e.g., "1-5").
 */
function isValidCronRange(range: string, min: number, max: number): boolean {
    const [startStr, endStr] = range.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
}

