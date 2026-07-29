import type { JsonObject, JsonValue } from '../../types';
import { sanitizeForLog, sanitizeLogMessage } from './sanitizer';

const MAX_LOG_DEPTH = 8;
const MAX_LOG_FIELDS = 50;
const MAX_LOG_ARRAY_ITEMS = 50;
const MAX_LOG_STRING_LENGTH = 1000;
const MAX_LOG_PAYLOAD_BYTES = 32 * 1024;
const MAX_LOG_PREVIEW_LENGTH = 4000;
const SANITIZATION_FAILED = '[SANITIZATION_FAILED]';

function boundString(value: string): string {
    const sanitized = sanitizeLogMessage(value);
    return sanitized.length > MAX_LOG_STRING_LENGTH
        ? `${sanitized.slice(0, MAX_LOG_STRING_LENGTH)}...`
        : sanitized;
}

function boundValue(value: unknown, depth = 0): JsonValue {
    if (depth > MAX_LOG_DEPTH) {
        return '[MAX_DEPTH_EXCEEDED]';
    }
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        return boundString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.slice(0, MAX_LOG_ARRAY_ITEMS).map(item => boundValue(item, depth + 1));
    }
    if (value instanceof Map) {
        const result: JsonObject = {};
        let count = 0;
        for (const [key, item] of value) {
            if (count >= MAX_LOG_FIELDS) break;
            result[String(key)] = boundValue(item, depth + 1);
            count += 1;
        }
        return result;
    }
    if (value instanceof Set) {
        const result: JsonValue[] = [];
        for (const item of value) {
            if (result.length >= MAX_LOG_ARRAY_ITEMS) break;
            result.push(boundValue(item, depth + 1));
        }
        return result;
    }
    if (typeof value === 'object') {
        const result: JsonObject = {};
        let count = 0;
        for (const key in value) {
            if (count >= MAX_LOG_FIELDS) break;
            if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
            try {
                result[key] = boundValue(
                    (value as Record<string, unknown>)[key],
                    depth + 1,
                );
            } catch {
                result[key] = SANITIZATION_FAILED;
            }
            count += 1;
        }
        return result;
    }
    return boundString(String(value));
}

export function sanitizeExecutionLogObject(
    value: Record<string, unknown> | undefined,
): JsonObject | undefined {
    if (!value) {
        return undefined;
    }
    try {
        const bounded = boundValue(value);
        const sanitized = boundValue(sanitizeForLog(bounded));
        const object = Array.isArray(sanitized) || typeof sanitized !== 'object' || sanitized === null
            ? { value: sanitized }
            : sanitized;
        const serialized = JSON.stringify(object);
        if (Buffer.byteLength(serialized, 'utf8') <= MAX_LOG_PAYLOAD_BYTES) {
            return object;
        }
        return {
            truncated: true,
            preview: boundString(serialized.slice(0, MAX_LOG_PREVIEW_LENGTH)),
        };
    } catch {
        return { sanitizationFailed: true };
    }
}

export function sanitizeExecutionLogMessage(message: string): string {
    return sanitizeLogMessage(message);
}
