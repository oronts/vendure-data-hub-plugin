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
interface ScoringWeights {
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

    for (const field of [
        'enableFuzzyMatching',
        'enableTypeInference',
        'caseSensitive',
    ] as const) {
        const value = config[field];
        if (value !== undefined && typeof value !== 'boolean') {
            errors.push(`${field} must be a boolean`);
        }
    }

    if (config.confidenceThreshold !== undefined) {
        if (!Number.isFinite(config.confidenceThreshold)
            || config.confidenceThreshold < 0
            || config.confidenceThreshold > 1) {
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

        if (Number.isFinite(total) && (total < 0.9 || total > 1.1)) {
            warnings.push(`Scoring weights sum to ${total.toFixed(2)}, should be approximately 1.0`);
        }

        if (!Number.isFinite(nameWeight) || nameWeight < 0 || nameWeight > 1) {
            errors.push('weightNameSimilarity must be between 0 and 1');
        }
        if (!Number.isFinite(typeWeight) || typeWeight < 0 || typeWeight > 1) {
            errors.push('weightTypeCompatibility must be between 0 and 1');
        }
        if (!Number.isFinite(descWeight) || descWeight < 0 || descWeight > 1) {
            errors.push('weightDescriptionMatch must be between 0 and 1');
        }
    }

    if (config.customAliases !== undefined) {
        if (!isRecord(config.customAliases)) {
            errors.push('customAliases must be an object');
        } else {
            if (Object.keys(config.customAliases).length > TRUNCATION.MAX_CUSTOM_ALIASES) {
                errors.push(`customAliases cannot exceed ${TRUNCATION.MAX_CUSTOM_ALIASES} entries`);
            }
            for (const [key, values] of Object.entries(config.customAliases)) {
                if (!isValidFieldName(key)) {
                    errors.push(`customAliases contains an invalid canonical field name: ${key}`);
                }
                if (!Array.isArray(values)) {
                    errors.push(`customAliases[${key}] must be an array of strings`);
                    continue;
                }
                if (values.length > TRUNCATION.MAX_ALIASES_PER_FIELD) {
                    errors.push(
                        `customAliases[${key}] cannot exceed ${TRUNCATION.MAX_ALIASES_PER_FIELD} aliases`,
                    );
                }
                if (!values.every(value => typeof value === 'string' && isValidFieldName(value))) {
                    errors.push(`customAliases[${key}] must contain valid field-name strings`);
                }
            }
        }
    }

    if (config.excludeFields !== undefined) {
        if (!Array.isArray(config.excludeFields)) {
            errors.push('excludeFields must be an array of strings');
        } else {
            if (config.excludeFields.length > TRUNCATION.MAX_AUTOMAPPER_EXCLUDED_FIELDS) {
                errors.push(
                    `excludeFields cannot exceed ${TRUNCATION.MAX_AUTOMAPPER_EXCLUDED_FIELDS} entries`,
                );
            }
            if (!config.excludeFields.every(
                value => typeof value === 'string' && isValidFieldName(value),
            )) {
                errors.push('excludeFields must contain valid field-name strings');
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidFieldName(value: string): boolean {
    const length = value.trim().length;
    return value === value.trim()
        && length > 0
        && length <= TRUNCATION.MAX_AUTOMAPPER_FIELD_NAME_LENGTH;
}
