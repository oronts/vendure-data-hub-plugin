/**
 * DataHub GraphQL Input Types
 *
 * Common input types used across DataHub resolvers.
 * These types define the structure of mutation inputs.
 */

import { ID } from '@vendure/core';
import { JsonObject, JsonValue, PipelineDefinition } from '../../types/index';
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

// SCHEMA INPUTS

/**
 * Input for creating a new schema
 */
export interface CreateSchemaInput {
    code: string;
    name: string;
    version?: number;
    fields: Record<string, SchemaFieldInput>;
}

/**
 * Input for updating an existing schema
 */
export interface UpdateSchemaInput {
    id: ID;
    code?: string;
    name?: string;
    version?: number;
    fields?: Record<string, SchemaFieldInput>;
}

/**
 * Schema field input for GraphQL mutations
 */
export interface SchemaFieldInput {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: JsonValue[];
}

// SECRET INPUTS

/**
 * Input for creating a new secret
 */
export interface CreateSecretInput {
    code: string;
    provider?: string;
    value?: string;
    metadata?: JsonObject;
}

/**
 * Input for updating an existing secret
 */
export interface UpdateSecretInput {
    id: ID;
    code?: string;
    provider?: string;
    value?: string;
    metadata?: JsonObject;
}

// CONNECTION INPUTS

/**
 * Input for creating a new connection
 */
export interface CreateConnectionInput {
    code: string;
    type?: string;
    config?: JsonObject;
}

/**
 * Input for updating an existing connection
 */
export interface UpdateConnectionInput {
    id: ID;
    code?: string;
    type?: string;
    config?: JsonObject;
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

// FEED INPUTS

/**
 * Input for registering a new feed
 */
export interface RegisterFeedInput {
    code: string;
    name: string;
    format: 'google_shopping' | 'facebook_catalog' | 'csv' | 'json' | 'xml';
    config?: JsonObject;
}

// EXPORT DESTINATION INPUTS

/**
 * Input for registering an export destination
 */
export interface RegisterExportDestinationInput {
    id: string;
    type: 's3' | 'sftp' | 'ftp' | 'local' | 'http';
    name?: string;
    // S3 options
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    // SFTP/FTP options
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
    remotePath?: string;
    // HTTP options
    url?: string;
    headers?: Record<string, string>;
    // Local options
    path?: string;
}
