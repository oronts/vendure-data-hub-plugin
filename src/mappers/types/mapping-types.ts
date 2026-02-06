/**
 * Type definitions for auto-mapping functionality
 */

import { JsonValue } from '../../types/index';
import { MapperTransformConfig } from './transform-config.types';
import { MatchConfidence } from '../../constants/validation';

export type { MatchConfidence };

/**
 * Auto-mapping suggestion
 */
export interface MappingSuggestion {
    source: string;
    target: string;
    confidence: MatchConfidence;
    score: number;  // 0-100
    reason: string;
    suggestedTransforms?: MapperTransformConfig[];
}

/**
 * Source field analysis
 */
export interface SourceFieldAnalysis {
    name: string;
    detectedType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'mixed';
    sampleValues: JsonValue[];
    nullRatio: number;
    uniqueRatio: number;
    avgLength?: number;  // For strings
    minValue?: number;   // For numbers
    maxValue?: number;   // For numbers
    description?: string; // Optional field description for matching
}

/**
 * Options for suggesting mappings
 */
export interface SuggestMappingsOptions {
    minConfidence?: MatchConfidence;
    includeCustomFields?: boolean;
}

/**
 * Name score result from matching strategies
 */
export interface NameScoreResult {
    score: number;
    reason: string;
}

/**
 * Mapping strategy interface
 */
export interface MappingStrategy {
    /**
     * Try to match source and target field names
     * @param sourceForComparison - Source field name prepared for comparison
     * @param sourceNormalized - Normalized source field name
     * @param targetForComparison - Target field name prepared for comparison
     * @param targetNormalized - Normalized target field name
     * @param targetKey - Original target field key
     * @returns Score result or null if no match
     */
    match(
        sourceForComparison: string,
        sourceNormalized: string,
        targetForComparison: string,
        targetNormalized: string,
        targetKey: string,
    ): NameScoreResult | null;
}
