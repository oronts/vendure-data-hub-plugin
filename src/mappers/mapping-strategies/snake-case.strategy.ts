/**
 * Snake Case Strategy
 *
 * Handles conversions between snake_case naming conventions
 */

import { MappingStrategy, NameScoreResult } from '../types/index';

/**
 * Converts a string to snake_case
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
}

/**
 * Splits snake_case string into parts
 */
export function splitSnakeCase(str: string): string[] {
    return str
        .toLowerCase()
        .split(/_+/)
        .filter(Boolean);
}

export class SnakeCaseMatchStrategy implements MappingStrategy {
    match(
        sourceForComparison: string,
        _sourceNormalized: string,
        targetForComparison: string,
        _targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        // Convert both to snake_case and compare
        const sourceSnake = toSnakeCase(sourceForComparison);
        const targetSnake = toSnakeCase(targetForComparison);

        if (sourceSnake === targetSnake) {
            return { score: 90, reason: 'Snake_case normalized match' };
        }

        // Check if parts match
        const sourceParts = splitSnakeCase(sourceForComparison);
        const targetParts = splitSnakeCase(targetForComparison);

        if (sourceParts.length === targetParts.length && sourceParts.length > 0) {
            const allMatch = sourceParts.every((part, i) => part === targetParts[i]);
            if (allMatch) {
                return { score: 85, reason: 'Snake_case parts match' };
            }
        }

        return null;
    }
}
