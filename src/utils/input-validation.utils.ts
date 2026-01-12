/**
 * Input Validation Utilities
 *
 * Provides comprehensive validation for user inputs across the application.
 */

import * as path from 'path';

/**
 * Validate email address format
 * 
 * @param email - Email address to validate
 * @returns true if valid email format
 */
export function isValidEmail(email: string): boolean {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email);
}

/**
 * Validate URL format
 * 
 * @param url - URL to validate
 * @param requireHttps - Whether to require HTTPS (default: false)
 * @returns true if valid URL
 */
export function isValidUrl(url: string, requireHttps: boolean = false): boolean {
    try {
        const parsed = new URL(url);
        
        if (requireHttps && parsed.protocol !== 'https:') {
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate integer value with bounds
 * 
 * @param value - Value to validate
 * @param min - Minimum allowed value (default: Number.MIN_SAFE_INTEGER)
 * @param max - Maximum allowed value (default: Number.MAX_SAFE_INTEGER)
 * @returns Validated integer
 * @throws Error if invalid
 */
export function validateInt(
    value: number | string | undefined,
    min: number = Number.MIN_SAFE_INTEGER,
    max: number = Number.MAX_SAFE_INTEGER,
): number {
    if (value === undefined || value === null) {
        throw new Error(`Invalid integer value: undefined`);
    }
    
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    
    if (isNaN(num)) {
        throw new Error(`Invalid integer value: ${value}`);
    }
    
    if (num < min || num > max) {
        throw new Error(`Value ${num} must be between ${min} and ${max}`);
    }
    
    return num;
}

/**
 * Validate float value with bounds
 * 
 * @param value - Value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Validated float
 * @throws Error if invalid
 */
export function validateFloat(
    value: number | string | undefined,
    min: number = -Infinity,
    max: number = Infinity,
): number {
    if (value === undefined || value === null) {
        throw new Error(`Invalid float value: undefined`);
    }
    
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) {
        throw new Error(`Invalid float value: ${value}`);
    }
    
    if (num < min || num > max) {
        throw new Error(`Value ${num} must be between ${min} and ${max}`);
    }
    
    return num;
}

/**
 * Validate base64 string
 * 
 * @param str - String to validate
 * @returns true if valid base64
 */
export function isValidBase64(str: string): boolean {
    if (typeof str !== 'string') {
        return false;
    }
    
    try {
        return btoa(atob(str)) === str;
    } catch {
        return false;
    }
}

/**
 * Sanitize string to prevent XSS
 * 
 * @param str - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Validate pipeline code format
 * 
 * @param code - Pipeline code to validate
 * @returns true if valid
 */
export function isValidPipelineCode(code: string): boolean {
    const pattern = /^[a-z0-9-]+$/;
    return pattern.test(code);
}

/**
 * Validate secret code format
 * 
 * @param code - Secret code to validate
 * @returns true if valid
 */
export function isValidSecretCode(code: string): boolean {
    const pattern = /^[a-zA-Z0-9-_]+$/;
    return pattern.test(code);
}

/**
 * Validate file path to prevent path traversal
 * 
 * @param filePath - File path to validate
 * @returns true if path is safe
 */
export function isValidPath(filePath: string): boolean {
    // Prevent null bytes
    if (filePath.includes('\0')) {
        return false;
    }

    const normalized = path.normalize(filePath);

    // Prevent path traversal (going above current directory)
    if (normalized.startsWith('..') || normalized.startsWith('/..') || normalized.includes('/../')) {
        return false;
    }

    // Prevent absolute paths if not intended
    if (path.isAbsolute(normalized) && !path.isAbsolute(filePath)) {
        return false;
    }

    return true;
}

/**
 * Validate cron expression
 * 
 * @param cron - Cron expression to validate
 * @returns true if valid cron expression
 */
export function isValidCron(cron: string): boolean {
    // Basic cron validation (5 parts: minute hour day month weekday)
    // Minute: 0-59, Hour: 0-23, Day: 1-31, Month: 1-12, Weekday: 0-6
    const parts = cron.trim().split(/\s+/);

    if (parts.length !== 5) {
        return false;
    }

    const [minute, hour, day, month, weekday] = parts;

    const validatePart = (part: string, min: number, max: number): boolean => {
        if (part === '*') return true;

        // Handle step values like */5
        if (part.startsWith('*/')) {
            const step = parseInt(part.slice(2), 10);
            return !isNaN(step) && step >= 1 && step <= max;
        }

        // Handle ranges like 1-5
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n, 10));
            return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start <= end;
        }

        // Handle comma-separated values
        if (part.includes(',')) {
            return part.split(',').every(v => {
                const num = parseInt(v, 10);
                return !isNaN(num) && num >= min && num <= max;
            });
        }

        // Single value
        const num = parseInt(part, 10);
        return !isNaN(num) && num >= min && num <= max;
    };

    return (
        validatePart(minute, 0, 59) &&
        validatePart(hour, 0, 23) &&
        validatePart(day, 1, 31) &&
        validatePart(month, 1, 12) &&
        validatePart(weekday, 0, 6)
    );
}

/**
 * Validate JSON string
 * 
 * @param str - String to validate
 * @returns true if valid JSON
 */
export function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}
