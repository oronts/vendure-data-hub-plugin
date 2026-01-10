/**
 * Camel Case Strategy
 *
 * Handles conversions between camelCase naming conventions
 */

import { MappingStrategy, NameScoreResult } from '../types/index';

/**
 * Converts a string to camelCase
 */
export function toCamelCase(str: string): string {
    return str
        .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
        .replace(/^./, char => char.toLowerCase());
}

/**
 * Splits camelCase string into parts
 */
export function splitCamelCase(str: string): string[] {
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[\s_-]+/)
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
        // Convert both to camelCase and compare
        const sourceCamel = toCamelCase(sourceForComparison);
        const targetCamel = toCamelCase(targetForComparison);

        if (sourceCamel === targetCamel) {
            return { score: 90, reason: 'CamelCase normalized match' };
        }

        // Check if parts match
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
