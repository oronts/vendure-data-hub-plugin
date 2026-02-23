/**
 * Fuzzy Match Strategy
 *
 * Uses Levenshtein distance to find similar field names
 */

import { MappingStrategy, NameScoreResult } from '../types/mapping-types';
import { calculateSimilarity } from '../helpers';

export class FuzzyMatchStrategy implements MappingStrategy {
    private enabled: boolean;
    private threshold: number;

    constructor(enabled: boolean = true, threshold: number = 0.6) {
        this.enabled = enabled;
        this.threshold = threshold;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    match(
        _sourceForComparison: string,
        sourceNormalized: string,
        _targetForComparison: string,
        targetNormalized: string,
        _targetKey: string,
    ): NameScoreResult | null {
        if (!this.enabled) {
            return null;
        }

        const similarity = calculateSimilarity(sourceNormalized, targetNormalized);
        if (similarity > this.threshold) {
            return { score: Math.round(similarity * 50), reason: 'Similar names (fuzzy)' };
        }
        return null;
    }
}
