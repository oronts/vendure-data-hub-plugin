import { JsonValue, JsonObject } from '../types';
import { validateRegexSafety } from '../utils/safe-regex.utils';
import { globToRegex } from '../../shared';
import { TRANSFORM_LIMITS } from '../constants/index';
import {
    getNestedValue as getNestedValueUtil,
    setNestedValue as setNestedValueUtil,
    removeNestedValue as removeNestedValueUtil,
    hasNestedValue as hasNestedValueUtil,
    deepClone as deepCloneUtil,
} from '../utils/object-path.utils';

/**
 * Path utilities for operators.
 */
export const getNestedValue = getNestedValueUtil;
export const setNestedValue = setNestedValueUtil;
export const removeNestedValue = removeNestedValueUtil;
export const hasNestedValue = hasNestedValueUtil;
export const deepClone = deepCloneUtil;

export function compare(
    left: JsonValue,
    operator: string,
    right: JsonValue,
): boolean {
    switch (operator) {
        case 'eq':
            return left === right;
        case 'ne':
            return left !== right;
        case 'gt':
            return typeof left === 'number' && typeof right === 'number' && left > right;
        case 'lt':
            return typeof left === 'number' && typeof right === 'number' && left < right;
        case 'gte':
            return typeof left === 'number' && typeof right === 'number' && left >= right;
        case 'lte':
            return typeof left === 'number' && typeof right === 'number' && left <= right;
        case 'in':
            return Array.isArray(right) && right.includes(left);
        case 'notIn':
            return Array.isArray(right) && !right.includes(left);
        case 'contains':
            return typeof left === 'string' && typeof right === 'string' && left.includes(right);
        case 'notContains':
            return typeof left === 'string' && typeof right === 'string' && !left.includes(right);
        case 'startsWith':
            return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
        case 'endsWith':
            return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);
        case 'matches':
            if (typeof left === 'string' && typeof right === 'string') {
                try {
                    return globToRegex(right).test(left);
                } catch {
                    return false;
                }
            }
            return false;
        case 'regex':
            if (typeof left === 'string' && typeof right === 'string') {
                const safety = validateRegexSafety(right);
                if (!safety.safe) return false;
                try {
                    return new RegExp(right).test(left);
                } catch {
                    return false;
                }
            }
            return false;
        case 'exists':
            return left !== undefined && left !== null;
        case 'isNull':
            return left === null || left === undefined;
        default:
            return false;
    }
}

export { evaluateConditions } from './logic/helpers';

export function slugify(text: string, separator = '-'): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]+/g, separator)
        .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '')
        .substring(0, TRANSFORM_LIMITS.SLUG_MAX_LENGTH);
}

export function simpleHash(value: JsonValue): string {
    const str = JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

export function flattenArray(arr: JsonValue[], depth = 1): JsonValue[] {
    if (depth < 1) return [...arr];

    return arr.reduce<JsonValue[]>((acc, item) => {
        if (Array.isArray(item)) {
            acc.push(...flattenArray(item, depth - 1));
        } else {
            acc.push(item);
        }
        return acc;
    }, []);
}

export function uniqueArray(arr: JsonValue[], byKey?: string): JsonValue[] {
    if (!byKey) {
        const seen = new Set<string>();
        return arr.filter(item => {
            const key = JSON.stringify(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const seen = new Set<JsonValue>();
    return arr.filter(item => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return true;
        }
        const keyValue = getNestedValue(item as JsonObject, byKey);
        if (seen.has(keyValue ?? null)) return false;
        seen.add(keyValue ?? null);
        return true;
    });
}
