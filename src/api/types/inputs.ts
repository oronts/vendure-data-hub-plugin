/**
 * DataHub GraphQL Input Types
 *
 * Common input types used across DataHub resolvers.
 * These types define the structure of mutation inputs.
 */

import { ID } from '@vendure/core';

// PIPELINE INPUTS

/**
 * Input for creating a new pipeline
 */
export interface CreatePipelineInput {
    code: string;
    name: string;
    description?: string;
    enabled?: boolean;
    definition: any;
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
    definition?: any;
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
    fields: Record<string, SchemaFieldDefinition>;
}

/**
 * Input for updating an existing schema
 */
export interface UpdateSchemaInput {
    id: ID;
    code?: string;
    name?: string;
    version?: number;
    fields?: Record<string, SchemaFieldDefinition>;
}

/**
 * Schema field definition
 */
export interface SchemaFieldDefinition {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: any[];
}

// SECRET INPUTS

/**
 * Input for creating a new secret
 */
export interface CreateSecretInput {
    code: string;
    provider?: string;
    value?: string;
    metadata?: any;
}

/**
 * Input for updating an existing secret
 */
export interface UpdateSecretInput {
    id: ID;
    code?: string;
    provider?: string;
    value?: string;
    metadata?: any;
}

// CONNECTION INPUTS

/**
 * Input for creating a new connection
 */
export interface CreateConnectionInput {
    code: string;
    type?: string;
    config?: any;
}

/**
 * Input for updating an existing connection
 */
export interface UpdateConnectionInput {
    id: ID;
    code?: string;
    type?: string;
    config?: any;
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
    config?: any;
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
