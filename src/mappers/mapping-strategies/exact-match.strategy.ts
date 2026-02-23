/**
 * Exact Match Strategy
 *
 * Matches field names exactly (case-sensitive or case-insensitive)
 */

import { MappingStrategy, NameScoreResult } from '../types/mapping-types';

export class ExactMatchStrategy implements MappingStrategy {
    match(
        sourceForComparison: string,
        _sourceNormalized: string,
        targetForComparison: string,
        _targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        if (sourceForComparison === targetForComparison) {
            return { score: 100, reason: 'Exact name match' };
        }
        return null;
    }
}

/**
 * Normalized Match Strategy
 *
 * Matches field names after normalization (removing separators, lowercasing)
 */
export class NormalizedMatchStrategy implements MappingStrategy {
    match(
        _sourceForComparison: string,
        sourceNormalized: string,
        _targetForComparison: string,
        targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        if (sourceNormalized === targetNormalized) {
            return { score: 95, reason: 'Normalized name match' };
        }
        return null;
    }
}

/**
 * Partial Match Strategy
 *
 * Matches when one field name contains the other
 */
export class PartialMatchStrategy implements MappingStrategy {
    match(
        _sourceForComparison: string,
        sourceNormalized: string,
        _targetForComparison: string,
        targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        if (sourceNormalized.includes(targetNormalized) || targetNormalized.includes(sourceNormalized)) {
            return { score: 60, reason: 'Partial name match' };
        }
        return null;
    }
}
