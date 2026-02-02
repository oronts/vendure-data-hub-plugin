/**
 * Snake Case Strategy
 *
 * Handles conversions between snake_case naming conventions
 */

import { MappingStrategy, NameScoreResult } from '../types/index';
import { CAMEL_CASE_PATTERN } from '../constants';

// Regex pattern for replacing dashes/spaces with underscores
const DASH_SPACE_PATTERN = /[-\s]+/g;

/**
 * Converts a string to snake_case
 * Uses centralized CAMEL_CASE_PATTERN from constants
 */
export function toSnakeCase(str: string): string {
    return str
        .replace(CAMEL_CASE_PATTERN, '$1_$2')
        .replace(DASH_SPACE_PATTERN, '_')
        .toLowerCase();
}

// Regex pattern for splitting snake_case strings
const UNDERSCORE_SPLIT_PATTERN = /_+/;

/**
 * Splits snake_case string into parts
 */
export function splitSnakeCase(str: string): string[] {
    return str
        .toLowerCase()
        .split(UNDERSCORE_SPLIT_PATTERN)
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
        const sourceSnake = toSnakeCase(sourceForComparison);
        const targetSnake = toSnakeCase(targetForComparison);

        if (sourceSnake === targetSnake) {
            return { score: 90, reason: 'Snake_case normalized match' };
        }

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
