/**
 * HTTP Response Parser
 *
 * Parses HTTP responses and extracts records from JSON data.
 */

import { JsonObject } from '../../types/index';
import { HttpResponse } from './types';

/**
 * Extract records from response data using a data path
 */
export function extractRecords(data: unknown, dataPath?: string): JsonObject[] {
    if (!dataPath) {
        if (Array.isArray(data)) return data as JsonObject[];
        if (typeof data === 'object' && data !== null) return [data as JsonObject];
        return [];
    }

    const value = getValueByPath(data, dataPath);

    if (Array.isArray(value)) return value as JsonObject[];
    if (typeof value === 'object' && value !== null) return [value as JsonObject];
    return [];
}

/**
 * Get value from object by dot-separated path
 */
export function getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current && typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }

    return current;
}

/**
 * Parse response headers into a plain object
 */
export function parseResponseHeaders(
    headers: Headers | Record<string, string>,
): Record<string, string> {
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    return headers;
}

/**
 * Build HTTP response wrapper from fetch response
 */
export async function buildHttpResponse(response: Response): Promise<HttpResponse> {
    const data = await response.json();

    return {
        status: response.status,
        statusText: response.statusText,
        headers: parseResponseHeaders(response.headers),
        data,
    };
}

/**
 * Check if response indicates success
 */
export function isSuccessResponse(response: HttpResponse): boolean {
    return response.status >= 200 && response.status < 300;
}

/**
 * Check if response indicates rate limiting
 */
export function isRateLimitResponse(response: HttpResponse): boolean {
    return response.status === 429;
}

/**
 * Get retry-after header value in milliseconds
 */
export function getRetryAfterMs(response: HttpResponse): number | undefined {
    const retryAfter = response.headers['retry-after'];
    if (!retryAfter) return undefined;

    // If it's a number, it's seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
        return seconds * 1000;
    }

    // Otherwise it might be a date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
    }

    return undefined;
}

/**
 * Extract error message from response
 */
export function extractErrorMessage(response: HttpResponse): string {
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
        const dataObj = data as Record<string, unknown>;
        // Common error response patterns
        if (typeof dataObj.message === 'string') return dataObj.message;
        if (typeof dataObj.error === 'string') return dataObj.error;
        if (typeof dataObj.error_description === 'string') return dataObj.error_description;
        if (dataObj.errors && Array.isArray(dataObj.errors) && dataObj.errors.length > 0) {
            const first = dataObj.errors[0];
            if (typeof first === 'string') return first;
            if (typeof first === 'object' && first !== null && typeof (first as Record<string, unknown>).message === 'string') {
                return (first as Record<string, unknown>).message as string;
            }
        }
    }

    return `HTTP ${response.status}: ${response.statusText}`;
}

/**
 * Extract total count from response if available
 */
export function extractTotalCount(response: HttpResponse): number | undefined {
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
        const dataObj = data as Record<string, unknown>;
        // Common total count patterns
        if (typeof dataObj.total === 'number') return dataObj.total;
        if (typeof dataObj.totalCount === 'number') return dataObj.totalCount;
        if (typeof dataObj.count === 'number') return dataObj.count;
        if (typeof dataObj.total_count === 'number') return dataObj.total_count;

        // Check nested metadata
        if (typeof dataObj.meta === 'object' && dataObj.meta !== null) {
            const meta = dataObj.meta as Record<string, unknown>;
            if (typeof meta.total === 'number') return meta.total;
            if (typeof meta.totalCount === 'number') return meta.totalCount;
        }

        if (typeof dataObj.pagination === 'object' && dataObj.pagination !== null) {
            const pagination = dataObj.pagination as Record<string, unknown>;
            if (typeof pagination.total === 'number') return pagination.total;
            if (typeof pagination.totalItems === 'number') return pagination.totalItems;
        }
    }

    // Check headers
    const totalHeader = response.headers['x-total-count'] || response.headers['x-total'];
    if (totalHeader) {
        const total = parseInt(totalHeader, 10);
        if (!isNaN(total)) return total;
    }

    return undefined;
}

/**
 * Flatten nested object for easier field access
 */
export function flattenRecord(
    record: JsonObject,
    prefix: string = '',
    separator: string = '.',
): JsonObject {
    const result: JsonObject = {};

    for (const [key, value] of Object.entries(record)) {
        const fullKey = prefix ? `${prefix}${separator}${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenRecord(value as JsonObject, fullKey, separator));
        } else {
            result[fullKey] = value;
        }
    }

    return result;
}
