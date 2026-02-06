// Shared validation utilities - single source of truth for frontend and backend

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CODE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const PIPELINE_CODE_PATTERN = /^[a-z0-9-]+$/;
export const SECRET_CODE_PATTERN = /^[a-zA-Z0-9-_]+$/;

export function isNil(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function isEmpty(value: unknown): boolean {
    if (isNil(value)) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

export function isNotEmpty(value: unknown): boolean {
    return !isEmpty(value);
}

export function isNumeric(value: unknown): boolean {
    if (typeof value === 'number') return !isNaN(value) && isFinite(value);
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return false;
        return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
    }
    return false;
}

export function isInteger(value: unknown): boolean {
    if (!isNumeric(value)) return false;
    const num = Number(value);
    return Number.isInteger(num);
}

export function isBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return ['true', 'false', '1', '0', 'yes', 'no'].includes(lower);
    }
    return value === 1 || value === 0;
}

export function isValidEmail(email: string): boolean {
    if (isEmpty(email)) return false;
    return EMAIL_PATTERN.test(email);
}

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

export function isValidUuid(uuid: string): boolean {
    if (isEmpty(uuid)) return false;
    return UUID_PATTERN.test(uuid);
}

export function isValidSlug(slug: string): boolean {
    if (isEmpty(slug)) return false;
    return SLUG_PATTERN.test(slug);
}

export function isValidPipelineCode(code: string): boolean {
    if (isEmpty(code)) return false;
    return PIPELINE_CODE_PATTERN.test(code);
}

export function isValidSecretCode(code: string): boolean {
    if (isEmpty(code)) return false;
    return SECRET_CODE_PATTERN.test(code);
}

export function isValidJson(str: string): boolean {
    if (isEmpty(str)) return false;
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

export function isValidDate(value: unknown): boolean {
    if (value instanceof Date) return !isNaN(value.getTime());
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
    return false;
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

