import type { TransformationType, FilterCondition } from '../../shared/types';
import type { FileType } from './ui.types';

export interface WizardStep {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    description?: string;
}

export interface WizardProgress {
    currentStep: number;
    totalSteps: number;
    completedSteps: number[];
    canProceed: boolean;
}

export interface ImportConfig {
    name: string;
    description?: string;
    source: ImportSourceConfig;
    targetEntity: string;
    mappings: ImportFieldMapping[];
    strategies: ImportStrategies;
    trigger: ImportTriggerConfig;
    transformations?: WizardTransformationStep[];
}

export interface ImportSourceConfig {
    type: 'file' | 'api' | 'database' | 'webhook';
    fileConfig?: FileSourceConfig;
    apiConfig?: ApiSourceConfig;
    databaseConfig?: DatabaseSourceConfig;
    webhookConfig?: WebhookSourceConfig;
}

export interface FileSourceConfig {
    format: NonNullable<FileType>;
    hasHeaders: boolean;
    delimiter?: string;
    encoding?: string;
    sheetName?: string;
}

export interface ApiSourceConfig {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    pagination?: {
        type: 'offset' | 'cursor' | 'page';
        pageSize: number;
    };
}

export interface DatabaseSourceConfig {
    connectionId: string;
    query: string;
}

export interface WebhookSourceConfig {
    path: string;
    secret?: string;
}

export interface ImportFieldMapping {
    sourceField: string;
    targetField: string;
    transformation?: string;
    defaultValue?: unknown;
    required: boolean;
    preview?: unknown[];
}

export interface ImportStrategies {
    existingRecords: 'skip' | 'update' | 'replace' | 'error';
    lookupFields: string[];
    newRecords: 'create' | 'skip' | 'error';
    publishAfterImport: boolean;
    publishDelay?: number;
    cleanupStrategy: 'none' | 'unpublish-missing' | 'delete-missing';
    batchSize: number;
    parallelBatches: number;
    errorThreshold: number;
    continueOnError: boolean;
}

export interface ImportTriggerConfig {
    type: 'manual' | 'scheduled' | 'webhook' | 'file-watch';
    schedule?: string;
    webhookPath?: string;
    fileWatchPath?: string;
}

export interface ExportConfig {
    name: string;
    description?: string;
    sourceEntity: string;
    sourceQuery?: QueryConfig;
    filters?: FilterCondition[];
    fields: ExportField[];
    format: ExportFormatConfig;
    destination: DestinationConfig;
    trigger: ExportTriggerConfig;
    caching?: CacheConfig;
    options: ExportOptions;
}

export interface QueryConfig {
    type: 'all' | 'query' | 'graphql';
    limit?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
    customQuery?: string;
}

export interface ExportField {
    sourceField: string;
    outputName: string;
    transformation?: string;
    format?: string;
    include: boolean;
}

export interface ExportFormatConfig {
    type: 'csv' | 'json' | 'xml' | 'google-merchant' | 'meta-catalog' | 'custom';
    options: {
        delimiter?: string;
        includeHeaders?: boolean;
        quoteAll?: boolean;
        encoding?: string;
        pretty?: boolean;
        rootElement?: string;
        xmlRoot?: string;
        xmlItem?: string;
        feedTemplate?: string;
    };
}

export interface DestinationConfig {
    type: 'file' | 'sftp' | 'http' | 's3' | 'asset' | 'webhook';
    fileConfig?: FileDestinationConfig;
    sftpConfig?: SftpDestinationConfig;
    httpConfig?: HttpDestinationConfig;
    s3Config?: S3DestinationConfig;
    webhookConfig?: WebhookDestinationConfig;
}

export interface FileDestinationConfig {
    directory: string;
    filename: string;
    filenamePattern?: string;
}

export interface SftpDestinationConfig {
    host: string;
    port: number;
    username: string;
    passwordSecretId?: string;
    keySecretId?: string;
    remotePath: string;
}

export interface HttpDestinationConfig {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
    authType?: 'none' | 'basic' | 'bearer' | 'api-key';
    authSecretId?: string;
}

export interface S3DestinationConfig {
    bucket: string;
    region: string;
    key: string;
    accessKeyId?: string;
    secretAccessKeySecretId?: string;
}

export interface WebhookDestinationConfig {
    url: string;
    includeMetadata?: boolean;
}

export interface ExportTriggerConfig {
    type: 'manual' | 'scheduled' | 'event' | 'webhook';
    schedule?: string;
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

export interface WizardTransformationStep {
    id: string;
    type: TransformationType;
    config: Record<string, unknown>;
    enabled?: boolean;
}

export interface ParsedData {
    headers: string[];
    rows: Record<string, unknown>[];
    totalRows: number;
    sampleRows: number;
}

export interface FeedTemplate {
    id: string;
    name: string;
    icon: React.FC<{ className?: string }>;
    description: string;
    format: string;
    requiredFields: string[];
    optionalFields?: string[];
}
