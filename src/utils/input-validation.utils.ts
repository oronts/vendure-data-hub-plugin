import * as path from 'path';
import {
    EMAIL_PATTERN,
    isValidEmail as isValidEmailFromShared,
    isValidUrl as isValidUrlFromShared,
    isValidPipelineCode as isValidPipelineCodeFromShared,
    isValidSecretCode as isValidSecretCodeFromShared,
    isValidJson as isValidJsonFromShared,
    isValidCron as isValidCronFromShared,
} from '../../shared/utils/validation';

export const EMAIL_REGEX = EMAIL_PATTERN;
export const isValidEmail = isValidEmailFromShared;
export function isValidUrl(url: string, requireHttps: boolean = false): boolean {
    return isValidUrlFromShared(url, { requireHttps });
}

export function isValidBase64(str: string): boolean {
    if (typeof str !== 'string') {
        return false;
    }

    try {
        return btoa(atob(str)) === str;
    } catch {
        // Base64 decode/encode failed - invalid base64 string
        return false;
    }
}

export function escapeHtmlEntities(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

export { escapeHtmlEntities as sanitizeString };

/**
 * Validates pipeline code format.
 * Uses canonical implementation from shared/utils/validation.ts.
 */
export const isValidPipelineCode = isValidPipelineCodeFromShared;

/**
 * Validates secret code format.
 * Uses canonical implementation from shared/utils/validation.ts.
 */
export const isValidSecretCode = isValidSecretCodeFromShared;

export function isValidPath(filePath: string): boolean {
    if (filePath.includes('\0')) {
        return false;
    }

    const normalized = path.normalize(filePath);

    if (normalized.startsWith('..') || normalized.startsWith('/..') || normalized.includes('/../')) {
        return false;
    }

    if (path.isAbsolute(normalized) && !path.isAbsolute(filePath)) {
        return false;
    }

    return true;
}

/**
 * Securely resolve a path within a base directory, preventing path traversal attacks.
 * Throws an error if the resulting path would escape the base directory.
 *
 * @param basePath - The base directory that the path must stay within
 * @param relativePath - The relative path to resolve
 * @returns The resolved absolute path
 * @throws Error if the path contains traversal attempts or escapes the base directory
 */
export function securePath(basePath: string, relativePath: string): string {
    // Check for null bytes
    if (relativePath.includes('\0') || basePath.includes('\0')) {
        throw new Error('Path contains null bytes');
    }

    // Check for obvious traversal patterns before resolution
    if (relativePath.includes('..')) {
        throw new Error('Path contains directory traversal sequences');
    }

    // Resolve the base path to absolute
    const resolvedBase = path.resolve(basePath);

    // Join and resolve the full path
    const fullPath = path.resolve(resolvedBase, relativePath);

    // Verify the resolved path is within the base directory
    // Use path.sep to ensure we check the full directory boundary
    const normalizedBase = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;

    if (!fullPath.startsWith(normalizedBase) && fullPath !== resolvedBase) {
        throw new Error('Path escapes base directory');
    }

    return fullPath;
}

/**
 * Validates a cron expression.
 * Uses canonical implementation from shared/utils/validation.ts.
 */
export const isValidCron = isValidCronFromShared;

/**
 * Validates a JSON string.
 * Uses canonical implementation from shared/utils/validation.ts.
 */
export const isValidJson = isValidJsonFromShared;
