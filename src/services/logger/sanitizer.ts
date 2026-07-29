/** Prevents PII and credentials from being logged. */

import { EMAIL_PATTERN } from '../../constants/patterns';

// Fields that should be completely redacted (case-insensitive matching)
const SENSITIVE_FIELDS = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'api-key',
    'x-api-key',
    'x-auth-token',
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'session',
    'sessionid',
    'phone',
    'mobile',
    'telephone',
    'bearer',
    'credential',
    'accesskey',
    'access_key',
    'secretkey',
    'secret_key',
    'privatekey',
    'private_key',
    'authtoken',
    'auth_token',
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
    'pin_code',
    'pincode',
];

const REDACTED = '[REDACTED]';
const MAX_LOG_MESSAGE_LENGTH = 4096;
const INLINE_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_PASSWORD_PATTERN = /([a-z][a-z\d+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/gi;
const INLINE_PHONE_PATTERN = /(?<!\w)(?:\+[1-9](?:[\s().-]?\d){6,14}|\(\d{2,4}\)\s?\d{3,4}[-.\s]\d{3,4}|\d{3}[-.\s]\d{3}[-.\s]\d{4})(?!\w)/g;
const INLINE_ASSIGNMENT_PATTERN = /(^|[\s,{[])(['"]?)([A-Za-z][A-Za-z0-9_.-]*)['"]?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^,;\r\n]+)/gi;
const UNREADABLE_PROPERTY = '[UNREADABLE_PROPERTY]';

const PHONE_PATTERNS = [
    /^\+[1-9](?:[\s().-]?\d){6,14}$/, // E.164 and formatted international numbers
    /^\(\d{3}\)\s?\d{3}[-.]?\d{4}$/, // US format (123) 456-7890
    /^\d{3}[-.\s]\d{3}[-.\s]\d{4}$/, // US format without parens
];

interface SanitizeOptions {
    /** Maximum recursion depth (default: 10) */
    maxDepth?: number;
    /** Custom fields to redact (besides defaults) */
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

function isSensitiveField(fieldName: string, additionalFields: string[]): boolean {
    const lowerField = fieldName.toLowerCase();
    const allSensitiveFields = [...SENSITIVE_FIELDS, ...additionalFields.map(f => f.toLowerCase())];
    return allSensitiveFields.some(sensitive => lowerField.includes(sensitive));
}

/** jo***@example.com */
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

/** ***4567 */
export function maskPhone(phone: string): string {
    // Extract only digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return REDACTED;
    return '***' + digits.slice(-4);
}

function isEmail(value: string): boolean {
    return EMAIL_PATTERN.test(value);
}

function isPhone(value: string): boolean {
    const trimmed = value.trim();
    // Must have at least 7 digits to be a phone number
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    return PHONE_PATTERNS.some(pattern => pattern.test(trimmed));
}

function sanitizeValue(
    value: unknown,
    options: Required<SanitizeOptions>,
): unknown {
    if (typeof value !== 'string') return value;

    let sanitized = redactInlineCredentials(value);
    if (options.maskEmails) {
        sanitized = isEmail(sanitized)
            ? maskEmail(sanitized)
            : sanitized.replace(INLINE_EMAIL_PATTERN, email => maskEmail(email));
    }
    if (options.maskPhones) {
        sanitized = isPhone(sanitized)
            ? maskPhone(sanitized)
            : sanitized.replace(INLINE_PHONE_PATTERN, phone => maskPhone(phone));
    }
    return sanitized;
}

export function sanitizeLogMessage(message: string): string {
    const sanitized = redactInlineCredentials(message)
        .replace(INLINE_EMAIL_PATTERN, value => maskEmail(value))
        .replace(INLINE_PHONE_PATTERN, value => maskPhone(value));

    return sanitized.length > MAX_LOG_MESSAGE_LENGTH
        ? `${sanitized.slice(0, MAX_LOG_MESSAGE_LENGTH)}...`
        : sanitized;
}

function redactInlineCredentials(value: string): string {
    return value
        .replace(URL_PASSWORD_PATTERN, `$1${REDACTED}@`)
        .replace(
            INLINE_ASSIGNMENT_PATTERN,
            (match, prefix: string, _quote: string, key: string) => (
                isSensitiveField(key, [])
                    ? `${prefix}${key}=${REDACTED}`
                    : match
            ),
        );
}

/**
 * Recursively sanitize an object for safe logging.
 * Redacts sensitive field names, masks emails/phones, handles nested objects.
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
        let value: unknown;
        try {
            value = (obj as Record<string, unknown>)[key];
        } catch {
            result[key] = UNREADABLE_PROPERTY;
            continue;
        }

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

export function sanitizeRecord(
    record: Record<string, unknown>,
    options: SanitizeOptions = {},
): Record<string, unknown> {
    return sanitizeForLog(record, options) as Record<string, unknown>;
}

export function createSanitizer(defaultOptions: SanitizeOptions = {}) {
    return {
        sanitize: <T>(obj: T): T => sanitizeForLog(obj, defaultOptions) as T,
        sanitizeRecord: (record: Record<string, unknown>) => sanitizeRecord(record, defaultOptions),
    };
}

export const defaultSanitizer = createSanitizer();
