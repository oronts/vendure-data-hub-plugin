import type { TransformationType } from '../../shared/types';
import type { FileType } from './ui-types';

export interface WizardStep {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    description?: string;
}

export interface ImportSourceConfig {
    type: 'FILE' | 'API' | 'DATABASE' | 'WEBHOOK' | 'CDC' | (string & {});
    fileConfig?: FileSourceConfig;
    apiConfig?: ApiSourceConfig;
    databaseConfig?: DatabaseSourceConfig;
    webhookConfig?: WebhookSourceConfig;
    cdcConfig?: CdcSourceConfig;
    /** Dynamic source types store their config under `${type.toLowerCase()}Config`. */
    [key: string]: unknown;
}

export interface CdcSourceConfig {
    connectionId: string;
    databaseType: string;
    table: string;
    trackingColumn: string;
    trackingType: 'TIMESTAMP' | 'VERSION';
    columns?: string[];
    pollIntervalMs?: number;
    batchSize?: number;
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
        type: 'OFFSET' | 'CURSOR' | 'PAGE';
        pageSize: number;
    };
}

export interface DatabaseSourceConfig {
    connectionCode: string;
    databaseType: string;
    query: string;
    host?: string;
    port?: number;
    database?: string;
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
    existingRecords: 'SKIP' | 'UPDATE' | 'REPLACE' | 'ERROR';
    lookupFields: string[];
    newRecords: 'CREATE' | 'SKIP' | 'ERROR';
    publishAfterImport: boolean;
    publishDelay?: number;
    cleanupStrategy: 'NONE' | 'UNPUBLISH_MISSING' | 'DELETE_MISSING';
    batchSize: number;
    parallelBatches: number;
    errorThreshold: number;
    continueOnError: boolean;
}

export interface ImportTriggerConfig {
    type: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'FILE';
    schedule?: string;
    webhookPath?: string;
    fileWatchPath?: string;
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
    /** Known: CSV, JSON, XML, GOOGLE_SHOPPING, META_CATALOG, AMAZON. Dynamic adapters may add more. */
    type: 'CSV' | 'JSON' | 'XML' | 'GOOGLE_SHOPPING' | 'META_CATALOG' | 'AMAZON' | (string & {});
    /** Schema-driven format options. Keys come from exporter adapter schema fields with group 'format-options'. */
    options: Record<string, unknown> & {
        /** Feed template identifier for feed-based formats */
        feedTemplate?: string;
    };
}

export interface DestinationConfig {
    type: 'FILE' | 'SFTP' | 'FTP' | 'HTTP' | 'S3' | 'WEBHOOK' | 'DOWNLOAD' | 'EMAIL' | 'LOCAL' | (string & {});
    fileConfig?: FileDestinationConfig;
    sftpConfig?: SftpDestinationConfig;
    ftpConfig?: FtpDestinationConfig;
    httpConfig?: HttpDestinationConfig;
    s3Config?: S3DestinationConfig;
    webhookConfig?: WebhookDestinationConfig;
    emailConfig?: EmailDestinationConfig;
    localConfig?: LocalDestinationConfig;
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
    passwordSecretCode?: string;
    privateKeySecretCode?: string;
    remotePath: string;
}

export interface HttpDestinationConfig {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
    authType?: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
    authSecretId?: string;
}

export interface S3DestinationConfig {
    bucket: string;
    region: string;
    key: string;
    accessKeyIdSecretCode?: string;
    secretAccessKeySecretCode?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
}

export interface FtpDestinationConfig {
    host: string;
    port: number;
    username: string;
    passwordSecretCode?: string;
    remotePath: string;
    secure?: boolean;
}

export interface WebhookDestinationConfig {
    url: string;
    includeMetadata?: boolean;
}

export interface EmailDestinationConfig {
    to: string;
    subject: string;
    body?: string;
    attachFile?: boolean;
}

export interface LocalDestinationConfig {
    directory: string;
}

export interface ExportTriggerConfig {
    type: 'MANUAL' | 'SCHEDULE' | 'EVENT' | 'WEBHOOK';
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
    compression?: 'NONE' | 'GZIP' | 'ZIP';
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
