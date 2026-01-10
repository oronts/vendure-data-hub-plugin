/**
 * Export Wizard Types
 * Type definitions for the export wizard components
 */

import type { EnhancedSchemaDefinition } from '../../../types/index';

export interface ExportWizardProps {
    onComplete: (config: ExportConfiguration) => void;
    onCancel: () => void;
    initialConfig?: Partial<ExportConfiguration>;
}

export interface ExportConfiguration {
    name: string;
    description?: string;

    // Source Configuration
    sourceEntity: string;
    sourceQuery?: QueryConfig;
    filters?: FilterCondition[];

    // Field Selection
    fields: ExportField[];

    // Output Format
    format: FormatConfig;

    // Destination
    destination: DestinationConfig;

    // Trigger Configuration
    trigger: ExportTriggerConfig;

    // Caching
    caching?: CacheConfig;

    // Options
    options: ExportOptions;
}

export interface QueryConfig {
    type: 'all' | 'query' | 'graphql';
    limit?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    customQuery?: string;
}

export interface FilterCondition {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'notIn' | 'isNull' | 'isNotNull';
    value?: unknown;
}

export interface ExportField {
    sourceField: string;
    outputName: string;
    transformation?: string;
    format?: string;
    include: boolean;
}

export interface FormatConfig {
    type: 'csv' | 'json' | 'xml' | 'google-merchant' | 'meta-catalog' | 'custom';
    options: {
        // CSV options
        delimiter?: string;
        includeHeaders?: boolean;
        quoteAll?: boolean;
        encoding?: string;

        // JSON options
        pretty?: boolean;
        rootElement?: string;

        // XML options
        xmlRoot?: string;
        xmlItem?: string;

        // Feed options
        feedTemplate?: string;
    };
}

export interface DestinationConfig {
    type: 'file' | 'sftp' | 'http' | 's3' | 'asset' | 'webhook';
    fileConfig?: {
        directory: string;
        filename: string;
        filenamePattern?: string;
    };
    sftpConfig?: {
        host: string;
        port: number;
        username: string;
        passwordSecretId?: string;
        keySecretId?: string;
        remotePath: string;
    };
    httpConfig?: {
        url: string;
        method: 'POST' | 'PUT';
        headers?: Record<string, string>;
        authType?: 'none' | 'basic' | 'bearer' | 'api-key';
        authSecretId?: string;
    };
    s3Config?: {
        bucket: string;
        region: string;
        key: string;
        accessKeyId?: string;
        secretAccessKeySecretId?: string;
    };
    webhookConfig?: {
        url: string;
        includeMetadata?: boolean;
    };
}

export interface ExportTriggerConfig {
    type: 'manual' | 'schedule' | 'event' | 'webhook';
    cron?: string;
    events?: string[];
    webhookPath?: string;
}

export interface CacheConfig {
    enabled: boolean;
    ttl: number;
    invalidateOn?: string[];
}

export interface ExportOptions {
    batchSize: number;
    includeMetadata: boolean;
    compression?: 'none' | 'gzip' | 'zip';
    notifyOnComplete?: boolean;
    retryOnFailure?: boolean;
    maxRetries?: number;
}

export interface WizardStep {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
}

export interface FeedTemplate {
    id: string;
    name: string;
    icon: React.FC<{ className?: string }>;
    description: string;
    format: string;
    requiredFields: string[];
}

// =============================================================================
// TYPE HELPERS (for avoiding `as any` in components)
// =============================================================================

/** Query type union */
export type QueryType = QueryConfig['type'];

/** Filter operator type */
export type FilterOperator = FilterCondition['operator'];

/** Destination type */
export type DestinationType = DestinationConfig['type'];

/** HTTP method for destination */
export type HttpMethod = NonNullable<DestinationConfig['httpConfig']>['method'];

/** HTTP auth type for destination */
export type HttpAuthType = NonNullable<NonNullable<DestinationConfig['httpConfig']>['authType']>;

/** Format type */
export type FormatType = FormatConfig['type'];

/** Trigger type for export */
export type ExportTriggerType = ExportTriggerConfig['type'];

/** Compression option */
export type CompressionType = NonNullable<ExportOptions['compression']>;
