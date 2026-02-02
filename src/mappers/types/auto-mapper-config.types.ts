/**
 * AutoMapper Configuration Types
 *
 * Defines the configuration interface for the AutoMapperService,
 * allowing users to customize field matching behavior.
 */

import { TRUNCATION } from '../../constants';

/**
 * Scoring weights for field matching
 * All weights should sum to approximately 1.0
 */
export interface ScoringWeights {
    /** Weight for field name similarity (0-1) */
    nameSimilarity: number;

    /** Weight for type compatibility (0-1) */
    typeCompatibility: number;

    /** Weight for description matching (0-1) */
    descriptionMatch: number;
}

/**
 * Complete AutoMapper configuration
 */
export interface AutoMapperConfig {
    /** Minimum confidence score to suggest a mapping (0-1) */
    confidenceThreshold: number;

    /** Enable fuzzy/approximate string matching for field names */
    enableFuzzyMatching: boolean;

    /** Enable automatic type inference from sample data */
    enableTypeInference: boolean;

    /** Case-sensitive field name matching */
    caseSensitive: boolean;

    /** User-defined field name aliases (e.g., "productName": ["item_name", "title"]) */
    customAliases: Record<string, string[]>;

    /** Fields to exclude from auto-mapping suggestions */
    excludeFields: string[];

    /** Scoring weights for field matching */
    weights: ScoringWeights;
}

/**
 * Input for updating AutoMapper configuration
 * All fields are optional for partial updates
 */
export interface AutoMapperConfigInput {
    confidenceThreshold?: number;
    enableFuzzyMatching?: boolean;
    enableTypeInference?: boolean;
    caseSensitive?: boolean;
    customAliases?: Record<string, string[]>;
    excludeFields?: string[];
    weightNameSimilarity?: number;
    weightTypeCompatibility?: number;
    weightDescriptionMatch?: number;
}

/**
 * Validation result for AutoMapper configuration
 */
export interface AutoMapperConfigValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_AUTO_MAPPER_CONFIG: AutoMapperConfig = {
    confidenceThreshold: 0.7,
    enableFuzzyMatching: true,
    enableTypeInference: true,
    caseSensitive: false,
    customAliases: {},
    excludeFields: [],
    weights: {
        nameSimilarity: 0.4,
        typeCompatibility: 0.3,
        descriptionMatch: 0.3,
    },
};

/**
 * Validate AutoMapper configuration
 */
export function validateAutoMapperConfig(config: Partial<AutoMapperConfigInput>): AutoMapperConfigValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config.confidenceThreshold !== undefined) {
        if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
            errors.push('confidenceThreshold must be between 0 and 1');
        }
    }

    // Validate weights sum to approximately 1.0
    if (config.weightNameSimilarity !== undefined ||
        config.weightTypeCompatibility !== undefined ||
        config.weightDescriptionMatch !== undefined) {
        const nameWeight = config.weightNameSimilarity ?? DEFAULT_AUTO_MAPPER_CONFIG.weights.nameSimilarity;
        const typeWeight = config.weightTypeCompatibility ?? DEFAULT_AUTO_MAPPER_CONFIG.weights.typeCompatibility;
        const descWeight = config.weightDescriptionMatch ?? DEFAULT_AUTO_MAPPER_CONFIG.weights.descriptionMatch;
        const total = nameWeight + typeWeight + descWeight;

        if (total < 0.9 || total > 1.1) {
            warnings.push(`Scoring weights sum to ${total.toFixed(2)}, should be approximately 1.0`);
        }

        if (nameWeight < 0 || nameWeight > 1) {
            errors.push('weightNameSimilarity must be between 0 and 1');
        }
        if (typeWeight < 0 || typeWeight > 1) {
            errors.push('weightTypeCompatibility must be between 0 and 1');
        }
        if (descWeight < 0 || descWeight > 1) {
            errors.push('weightDescriptionMatch must be between 0 and 1');
        }
    }

    // Validate customAliases structure
    if (config.customAliases) {
        if (Object.keys(config.customAliases).length > TRUNCATION.MAX_CUSTOM_ALIASES) {
            errors.push(`customAliases cannot exceed ${TRUNCATION.MAX_CUSTOM_ALIASES} entries`);
        }
        for (const [key, values] of Object.entries(config.customAliases)) {
            if (!Array.isArray(values)) {
                errors.push(`customAliases[${key}] must be an array of strings`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
