/**
 * Sensitive data sanitization utilities for logging.
 * Prevents PII and credentials from being logged.
 */

import { EMAIL_REGEX } from '../../utils/input-validation.utils';

/**
 * Fields that should be completely redacted (case-insensitive matching)
 */
const SENSITIVE_FIELDS = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'authorization',
    'bearer',
    'credential',
    'accesskey',
    'access_key',
    'secretkey',
    'secret_key',
    'privatekey',
    'private_key',
    'auth',
    'key',
    'apitoken',
    'api_token',
    'refresh_token',
    'refreshtoken',
    'access_token',
    'accesstoken',
    'client_secret',
    'clientsecret',
    'signing_key',
    'signingkey',
    'encryption_key',
    'encryptionkey',
    'ssn',
    'social_security',
    'credit_card',
    'creditcard',
    'cvv',
    'pin',
];

/**
 * Redaction placeholder for sensitive fields
 */
const REDACTED = '[REDACTED]';

/**
 * Phone number regex patterns (various formats)
 */
const PHONE_PATTERNS = [
    /^\+?[1-9]\d{1,14}$/, // E.164 format
    /^\+?[\d\s\-().]{7,20}$/, // Common phone formats
    /^\(\d{3}\)\s?\d{3}[-.]?\d{4}$/, // US format (123) 456-7890
    /^\d{3}[-.]?\d{3}[-.]?\d{4}$/, // US format without parens
];

/**
 * Configuration options for sanitization
 */
export interface SanitizeOptions {
    /** Maximum recursion depth (default: 10) */
    maxDepth?: number;
    /** Custom fields to redact (in addition to defaults) */
    additionalSensitiveFields?: string[];
    /** Whether to mask emails (default: true) */
    maskEmails?: boolean;
    /** Whether to mask phone numbers (default: true) */
    maskPhones?: boolean;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
    maxDepth: 10,
    additionalSensitiveFields: [],
    maskEmails: true,
    maskPhones: true,
};

/**
 * Check if a field name contains a sensitive keyword
 */
function isSensitiveField(fieldName: string, additionalFields: string[]): boolean {
    const lowerField = fieldName.toLowerCase();
    const allSensitiveFields = [...SENSITIVE_FIELDS, ...additionalFields.map(f => f.toLowerCase())];
    return allSensitiveFields.some(sensitive => lowerField.includes(sensitive));
}

/**
 * Mask an email address: show first 2 chars + *** + domain
 * Example: john.doe@example.com -> jo***@example.com
 */
export function maskEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return REDACTED;

    const localPart = email.substring(0, atIndex);
    const domain = email.substring(atIndex);

    if (localPart.length <= 2) {
        return localPart.charAt(0) + '***' + domain;
    }
    return localPart.substring(0, 2) + '***' + domain;
}

/**
 * Mask a phone number: show last 4 digits only
 * Example: +1-555-123-4567 -> ***4567
 */
export function maskPhone(phone: string): string {
    // Extract only digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return REDACTED;
    return '***' + digits.slice(-4);
}

/**
 * Check if a string looks like an email
 */
function isEmail(value: string): boolean {
    return EMAIL_REGEX.test(value);
}

/**
 * Check if a string looks like a phone number
 */
function isPhone(value: string): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    // Must have at least 7 digits to be a phone number
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    return PHONE_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Sanitize a single value based on its content
 */
function sanitizeValue(
    value: unknown,
    options: Required<SanitizeOptions>,
): unknown {
    if (typeof value !== 'string') return value;

    if (options.maskEmails && isEmail(value)) {
        return maskEmail(value);
    }

    if (options.maskPhones && isPhone(value)) {
        return maskPhone(value);
    }

    return value;
}

/**
 * Recursively sanitize an object for safe logging.
 *
 * - Redacts fields with sensitive names (password, token, apiKey, etc.)
 * - Masks email addresses (shows first 2 chars + *** + domain)
 * - Masks phone numbers (shows last 4 digits only)
 * - Handles nested objects and arrays
 * - Prevents infinite recursion with depth limit
 *
 * @param obj - Object to sanitize
 * @param options - Sanitization options
 * @returns Sanitized copy of the object
 */
export function sanitizeForLog(
    obj: unknown,
    options: SanitizeOptions = {},
): unknown {
    const mergedOptions: Required<SanitizeOptions> = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    return sanitizeRecursive(obj, 0, mergedOptions, new WeakSet());
}

/**
 * Internal recursive sanitization function
 */
function sanitizeRecursive(
    obj: unknown,
    depth: number,
    options: Required<SanitizeOptions>,
    seen: WeakSet<object>,
): unknown {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (depth > options.maxDepth) {
        return '[MAX_DEPTH_EXCEEDED]';
    }

    if (typeof obj !== 'object') {
        return sanitizeValue(obj, options);
    }

    if (seen.has(obj as object)) {
        return '[CIRCULAR_REFERENCE]';
    }
    seen.add(obj as object);

    if (obj instanceof Date) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeRecursive(item, depth + 1, options, seen));
    }

    if (obj instanceof Map) {
        const result = new Map();
        obj.forEach((value, key) => {
            const keyStr = String(key);
            if (isSensitiveField(keyStr, options.additionalSensitiveFields)) {
                result.set(key, REDACTED);
            } else {
                result.set(key, sanitizeRecursive(value, depth + 1, options, seen));
            }
        });
        return result;
    }

    if (obj instanceof Set) {
        return new Set(Array.from(obj).map(item => sanitizeRecursive(item, depth + 1, options, seen)));
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        const value = (obj as Record<string, unknown>)[key];

        if (isSensitiveField(key, options.additionalSensitiveFields)) {
            result[key] = REDACTED;
        } else if (typeof value === 'object' && value !== null) {
            result[key] = sanitizeRecursive(value, depth + 1, options, seen);
        } else {
            result[key] = sanitizeValue(value, options);
        }
    }

    return result;
}

/**
 * Sanitize a record specifically (convenience wrapper)
 */
export function sanitizeRecord(
    record: Record<string, unknown>,
    options: SanitizeOptions = {},
): Record<string, unknown> {
    return sanitizeForLog(record, options) as Record<string, unknown>;
}

/**
 * Create a sanitizer with pre-configured options
 */
export function createSanitizer(defaultOptions: SanitizeOptions = {}) {
    return {
        sanitize: <T>(obj: T): T => sanitizeForLog(obj, defaultOptions) as T,
        sanitizeRecord: (record: Record<string, unknown>) => sanitizeRecord(record, defaultOptions),
    };
}

/**
 * Default sanitizer instance
 */
export const defaultSanitizer = createSanitizer();
