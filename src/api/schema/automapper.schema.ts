/**
 * AutoMapper Configuration API GraphQL schema definitions
 */
export const automapperSchema = `
    """
    AutoMapper Configuration API - Configure auto-mapping behavior
    """
    type DataHubAutoMapperScoringWeights {
        """Weight for field name similarity (0-1)"""
        nameSimilarity: Float!
        """Weight for type compatibility (0-1)"""
        typeCompatibility: Float!
        """Weight for description matching (0-1)"""
        descriptionMatch: Float!
    }

    type DataHubAutoMapperConfig {
        """Minimum confidence score to suggest a mapping (0-1)"""
        confidenceThreshold: Float!
        """Enable fuzzy/approximate string matching for field names"""
        enableFuzzyMatching: Boolean!
        """Enable automatic type inference from sample data"""
        enableTypeInference: Boolean!
        """Case-sensitive field name matching"""
        caseSensitive: Boolean!
        """User-defined field name aliases"""
        customAliases: JSON!
        """Fields to exclude from auto-mapping suggestions"""
        excludeFields: [String!]!
        """Scoring weights for field matching"""
        weights: DataHubAutoMapperScoringWeights!
    }

    type DataHubAutoMapperConfigValidation {
        valid: Boolean!
        errors: [String!]!
        warnings: [String!]!
    }

    input DataHubAutoMapperScoringWeightsInput {
        nameSimilarity: Float
        typeCompatibility: Float
        descriptionMatch: Float
    }

    input DataHubAutoMapperConfigInput {
        """Minimum confidence score to suggest a mapping (0-1)"""
        confidenceThreshold: Float
        """Enable fuzzy/approximate string matching for field names"""
        enableFuzzyMatching: Boolean
        """Enable automatic type inference from sample data"""
        enableTypeInference: Boolean
        """Case-sensitive field name matching"""
        caseSensitive: Boolean
        """User-defined field name aliases (JSON object with canonical field names as keys)"""
        customAliases: JSON
        """Fields to exclude from auto-mapping suggestions"""
        excludeFields: [String!]
        """Scoring weights for field matching"""
        weights: DataHubAutoMapperScoringWeightsInput
        """Optional: Pipeline ID to associate this config with (null for global)"""
        pipelineId: ID
    }
`;

export const automapperQueries = `
    extend type Query {
        """Get the current AutoMapper configuration (global or per-pipeline)"""
        dataHubAutoMapperConfig(pipelineId: ID): DataHubAutoMapperConfig!
        """Get the default AutoMapper configuration"""
        dataHubAutoMapperDefaultConfig: DataHubAutoMapperConfig!
    }
`;

export const automapperMutations = `
    extend type Mutation {
        """Update AutoMapper configuration (global or per-pipeline)"""
        updateDataHubAutoMapperConfig(input: DataHubAutoMapperConfigInput!): DataHubAutoMapperConfig!
        """Reset AutoMapper configuration to defaults (global or per-pipeline)"""
        resetDataHubAutoMapperConfig(pipelineId: ID): DataHubAutoMapperConfig!
        """Validate AutoMapper configuration without saving"""
        validateDataHubAutoMapperConfig(input: DataHubAutoMapperConfigInput!): DataHubAutoMapperConfigValidation!
    }
`;
