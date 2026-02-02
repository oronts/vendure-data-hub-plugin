/**
 * Camel Case Strategy
 *
 * Handles conversions between camelCase naming conventions
 */

import { MappingStrategy, NameScoreResult } from '../types/index';
import { SEPARATOR_PATTERN, CAMEL_CASE_PATTERN } from '../constants';

// Regex pattern for converting to camelCase
const TO_CAMEL_CASE_PATTERN = /[-_\s]+(.)?/g;

/**
 * Converts a string to camelCase
 */
export function toCamelCase(str: string): string {
    return str
        .replace(TO_CAMEL_CASE_PATTERN, (_, char) => (char ? char.toUpperCase() : ''))
        .replace(/^./, char => char.toLowerCase());
}

/**
 * Splits camelCase string into parts
 * Uses centralized CAMEL_CASE_PATTERN from constants
 */
export function splitCamelCase(str: string): string[] {
    return str
        .replace(CAMEL_CASE_PATTERN, '$1 $2')
        .toLowerCase()
        .split(SEPARATOR_PATTERN)
        .filter(Boolean);
}

export class CamelCaseMatchStrategy implements MappingStrategy {
    match(
        sourceForComparison: string,
        _sourceNormalized: string,
        targetForComparison: string,
        _targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        const sourceCamel = toCamelCase(sourceForComparison);
        const targetCamel = toCamelCase(targetForComparison);

        if (sourceCamel === targetCamel) {
            return { score: 90, reason: 'CamelCase normalized match' };
        }

        const sourceParts = splitCamelCase(sourceForComparison);
        const targetParts = splitCamelCase(targetForComparison);

        if (sourceParts.length === targetParts.length && sourceParts.length > 0) {
            const allMatch = sourceParts.every((part, i) => part === targetParts[i]);
            if (allMatch) {
                return { score: 85, reason: 'CamelCase parts match' };
            }
        }

        return null;
    }
}
