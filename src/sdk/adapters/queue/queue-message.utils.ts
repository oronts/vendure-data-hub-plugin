import type { JsonObject } from '../../../types';

export function requirePositiveInteger(
    value: number,
    name: string,
    maximum?: number,
): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    if (maximum !== undefined && value > maximum) {
        throw new Error(`${name} must not exceed ${maximum}`);
    }
    return value;
}

export function requireNonNegativeInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return value;
}

export function parseJsonObject(rawValue: string | undefined): JsonObject {
    const source = rawValue ?? '{}';
    try {
        const parsed: unknown = JSON.parse(source);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as JsonObject;
        }
    } catch {
        // Preserve malformed external payloads for downstream error handling.
    }
    return { rawPayload: rawValue ?? '' };
}

export function parseStringRecord(rawValue: string | undefined): Record<string, string> | undefined {
    if (rawValue === undefined) return undefined;
    try {
        const parsed: unknown = JSON.parse(rawValue);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }
        const entries = Object.entries(parsed);
        if (!entries.every(([, value]) => typeof value === 'string')) {
            return undefined;
        }
        return Object.fromEntries(entries) as Record<string, string>;
    } catch {
        return undefined;
    }
}
