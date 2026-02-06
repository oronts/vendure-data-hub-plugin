/**
 * DataHub GraphQL Input Types
 *
 * Common input types used across DataHub resolvers.
 * These types define the structure of mutation inputs.
 */

import { ID } from '@vendure/core';
import { JsonValue, PipelineDefinition } from '../../types/index';
import { VisualPipelineDefinition } from '../../services/pipeline/pipeline-format.service';

// CHECKPOINT TYPES

/**
 * Checkpoint data for pipeline state persistence
 * Maps step keys to their checkpoint state
 */
export interface CheckpointData {
    [stepKey: string]: Record<string, JsonValue>;
}

// VALIDATION TYPES

/**
 * Input for pipeline definition validation
 * Accepts either canonical or visual format definitions
 */
export interface ValidationInput {
    /** Pipeline definition in canonical (steps) or visual (nodes/edges) format */
    definition: PipelineDefinition | VisualPipelineDefinition;
    /** Validation level: 'syntax', 'semantic', or 'full' */
    level?: string;
}

// PIPELINE FORMAT TYPES

/**
 * Union type for pipeline definition formats
 * Used in resolvers that accept either format
 */
export type PipelineDefinitionInput = PipelineDefinition | VisualPipelineDefinition;

// PIPELINE INPUTS

/**
 * Input for creating a new pipeline
 */
export interface CreatePipelineInput {
    code: string;
    name: string;
    description?: string;
    enabled?: boolean;
    definition: PipelineDefinition;
    tags?: string[];
}

/**
 * Input for updating an existing pipeline
 */
export interface UpdatePipelineInput {
    id: ID;
    code?: string;
    name?: string;
    description?: string;
    enabled?: boolean;
    definition?: PipelineDefinition;
    tags?: string[];
}

// SETTINGS INPUTS

/**
 * Input for DataHub settings
 */
export interface DataHubSettingsInput {
    retentionDaysRuns?: number | null;
    retentionDaysErrors?: number | null;
}

/**
 * Input for AutoMapper configuration
 */
export interface AutoMapperConfigInput {
    confidenceThreshold?: number;
    enableFuzzyMatching?: boolean;
    enableTypeInference?: boolean;
    caseSensitive?: boolean;
    customAliases?: Record<string, string[]>;
    excludeFields?: string[];
    weights?: {
        nameSimilarity?: number;
        typeCompatibility?: number;
        descriptionMatch?: number;
    };
    pipelineId?: ID;
}

