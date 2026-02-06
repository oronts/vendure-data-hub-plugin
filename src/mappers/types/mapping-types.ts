import { JsonValue } from '../../types/index';
import { MapperTransformConfig } from './transform-config.types';
import { MatchConfidence } from '../../constants/validation';

export type { MatchConfidence };

export interface MappingSuggestion {
    source: string;
    target: string;
    confidence: MatchConfidence;
    score: number;
    reason: string;
    suggestedTransforms?: MapperTransformConfig[];
}

export interface SourceFieldAnalysis {
    name: string;
    detectedType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'mixed';
    sampleValues: JsonValue[];
    nullRatio: number;
    uniqueRatio: number;
    avgLength?: number;
    minValue?: number;
    maxValue?: number;
    description?: string;
}

export interface SuggestMappingsOptions {
    minConfidence?: MatchConfidence;
    includeCustomFields?: boolean;
}

export interface NameScoreResult {
    score: number;
    reason: string;
}

export interface MappingStrategy {
    match(
        sourceForComparison: string,
        sourceNormalized: string,
        targetForComparison: string,
        targetNormalized: string,
        targetKey: string,
    ): NameScoreResult | null;
}
