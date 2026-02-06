/**
 * Connector Types - External System Integration
 *
 * Defines the contract for all DataHub connectors (Pimcore, SAP, Akeneo, etc.)
 */

import { PipelineDefinition } from '../src/types';
import { ExtractorAdapter, LoaderAdapter } from '../src/sdk/types';

/**
 * Base configuration that all connectors share
 */
export interface BaseConnectorConfig {
    /** Unique identifier for this connector instance */
    instanceId?: string;
    /** Whether the connector is enabled */
    enabled?: boolean;
    /** Tags for organizing pipelines */
    tags?: string[];
}

/**
 * Connection configuration for external system
 */
export interface ConnectorConnectionConfig {
    /** API endpoint URL */
    endpoint: string;
    /** API key or token */
    apiKey?: string;
    /** Secret code reference (for DataHub secrets) */
    apiKeySecretCode?: string;
    /** Additional headers */
    headers?: Record<string, string>;
    /** Request timeout in ms */
    timeoutMs?: number;
}

/**
 * Sync configuration options
 */
export interface ConnectorSyncConfig {
    /** Enable delta sync (only changed records) */
    deltaSync?: boolean;
    /** Batch size for processing */
    batchSize?: number;
    /** Max pages to fetch per run */
    maxPages?: number;
    /** Fields to include in sync (whitelist) */
    includeFields?: string[];
    /** Fields to exclude from sync */
    excludeFields?: string[];
}

/**
 * Mapping configuration for field transformations
 */
export interface ConnectorMappingConfig {
    /** Channel mapping: source -> Vendure channel */
    channels?: Record<string, string>;
    /** Language mapping: source locale -> Vendure languageCode */
    languages?: Record<string, string>;
    /** Custom field mappings: source field -> Vendure field */
    fieldMappings?: Record<string, string>;
    /** Tax category mapping: source tax code -> Vendure tax category */
    taxCategories?: Record<string, string>;
}

/**
 * Pipeline configuration for a connector
 */
export interface ConnectorPipelineConfig {
    /** Enable this pipeline */
    enabled?: boolean;
    /** Override pipeline name */
    name?: string;
    /** Schedule (cron expression) */
    schedule?: string;
    /** Custom configuration for this pipeline */
    config?: Record<string, unknown>;
}

/**
 * Complete connector definition
 */
export interface ConnectorDefinition<TConfig extends BaseConnectorConfig = BaseConnectorConfig> {
    /** Connector code (e.g., 'pimcore', 'sap', 'akeneo') */
    code: string;
    /** Human-readable name */
    name: string;
    /** Description of what this connector does */
    description: string;
    /** Version of the connector */
    version: string;
    /** Author/maintainer */
    author?: string;
    /** Documentation URL */
    docsUrl?: string;
    /** Icon for UI display */
    icon?: string;

    /** Custom extractors provided by this connector */
    extractors?: ExtractorAdapter<any>[];
    /** Custom loaders provided by this connector */
    loaders?: LoaderAdapter<any>[];

    /** Pipeline factory function */
    createPipelines: (config: TConfig) => PipelineDefinition[];

    /** Validation function for config */
    validateConfig?: (config: TConfig) => { valid: boolean; errors: string[] };

    /** Default configuration */
    defaultConfig?: Partial<TConfig>;
}

/**
 * Registered connector instance with resolved config
 */
export interface ConnectorInstance<TConfig extends BaseConnectorConfig = BaseConnectorConfig> {
    /** The connector definition */
    connector: ConnectorDefinition<TConfig>;
    /** Resolved configuration */
    config: TConfig;
    /** Generated pipelines */
    pipelines: PipelineDefinition[];
}

/**
 * Result of connector registration
 */
export interface ConnectorRegistrationResult {
    success: boolean;
    connectorCode: string;
    pipelineCount: number;
    extractorCount: number;
    loaderCount: number;
    errors?: string[];
}

