import { JsonObject } from '../types';
import { getNestedValue, setNestedValue, deepClone, slugify as slugifyStr } from '../helpers';

export function applySplit(
    record: JsonObject,
    source: string,
    target: string,
    delimiter: string,
    trim = false,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);

    if (typeof value === 'string') {
        if (delimiter === '') {
            setNestedValue(result, target, [value]);
            return result;
        }
        let parts = value.split(delimiter);
        if (trim) {
            parts = parts.map(p => p.trim());
        }
        setNestedValue(result, target, parts);
    }

    return result;
}

export function applyJoin(
    record: JsonObject,
    source: string,
    target: string,
    delimiter: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);

    if (Array.isArray(value)) {
        const joined = value.map(v => String(v ?? '')).join(delimiter);
        setNestedValue(result, target, joined);
    }

    return result;
}

export function applyTrim(
    record: JsonObject,
    path: string,
    mode: 'both' | 'start' | 'end' = 'both',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, path);

    if (typeof value === 'string') {
        let trimmed: string;
        switch (mode) {
            case 'start':
                trimmed = value.trimStart();
                break;
            case 'end':
                trimmed = value.trimEnd();
                break;
            default:
                trimmed = value.trim();
        }
        setNestedValue(result, path, trimmed);
    }

    return result;
}

export function applyLowercase(record: JsonObject, path: string): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, path);

    if (typeof value === 'string') {
        setNestedValue(result, path, value.toLowerCase());
    }

    return result;
}

export function applyUppercase(record: JsonObject, path: string): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, path);

    if (typeof value === 'string') {
        setNestedValue(result, path, value.toUpperCase());
    }

    return result;
}

export function applySlugify(
    record: JsonObject,
    source: string,
    target: string,
    separator = '-',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);

    if (typeof value === 'string') {
        const slug = slugifyStr(value, separator);
        setNestedValue(result, target, slug);
    }

    return result;
}

export function applyConcat(
    record: JsonObject,
    sources: string[],
    target: string,
    separator = '',
): JsonObject {
    const result = deepClone(record);
    const values = sources.map(s => {
        const v = getNestedValue(result, s);
        return v != null ? String(v) : '';
    });

    const concatenated = values.filter(v => v !== '').join(separator);
    setNestedValue(result, target, concatenated);

    return result;
}

export function applyReplace(
    record: JsonObject,
    path: string,
    search: string,
    replacement: string,
    all = false,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, path);

    if (typeof value === 'string') {
        let replaced: string;
        if (all) {
            replaced = value.split(search).join(replacement);
        } else {
            replaced = value.replace(search, replacement);
        }
        setNestedValue(result, path, replaced);
    }

    return result;
}

/**
 * Extract a value from a string field using a regex pattern.
 * Supports capture groups for extracting specific parts of the match.
 */
export function applyExtractRegex(
    record: JsonObject,
    source: string,
    target: string,
    pattern: string,
    group = 1,
    flags = '',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);

    if (typeof value === 'string') {
        try {
            const regex = new RegExp(pattern, flags);
            const match = value.match(regex);

            if (match) {
                // Group 0 is the full match, 1+ are capture groups
                const extractedValue = group < match.length ? match[group] : match[0];
                setNestedValue(result, target, extractedValue ?? null);
            } else {
                setNestedValue(result, target, null);
            }
        } catch {
            // Invalid regex pattern - leave target unchanged
        }
    }

    return result;
}

/**
 * Replace values in a string field using a regex pattern.
 * Supports capture group references ($1, $2, etc.) in the replacement string.
 */
export function applyReplaceRegex(
    record: JsonObject,
    path: string,
    pattern: string,
    replacement: string,
    flags = 'g',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, path);

    if (typeof value === 'string') {
        try {
            const regex = new RegExp(pattern, flags);
            const replaced = value.replace(regex, replacement);
            setNestedValue(result, path, replaced);
        } catch {
            // Invalid regex pattern - leave value unchanged
        }
    }

    return result;
}

export function applyStripHtml(
    record: JsonObject,
    source: string,
    target?: string,
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);
    const targetPath = target || source;

    if (typeof value === 'string') {
        // Remove HTML tags, decode entities, and normalize whitespace
        const stripped = value
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags and content
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags and content
            .replace(/<[^>]+>/g, '') // Remove all remaining HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        setNestedValue(result, targetPath, stripped);
    }

    return result;
}

export function applyTruncate(
    record: JsonObject,
    source: string,
    target: string | undefined,
    length: number,
    suffix = '',
): JsonObject {
    const result = deepClone(record);
    const value = getNestedValue(result, source);
    const targetPath = target || source;

    if (typeof value === 'string') {
        if (value.length <= length) {
            setNestedValue(result, targetPath, value);
        } else {
            const truncated = value.slice(0, length - suffix.length) + suffix;
            setNestedValue(result, targetPath, truncated);
        }
    }

    return result;
}
