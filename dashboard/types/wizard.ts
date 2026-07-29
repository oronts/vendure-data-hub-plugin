import type { TransformationType, VendureEventType } from '../../shared/types';
import type { FileType } from './ui-types';

type ExtensibleString<T extends string> = T | (string & Record<never, never>);

export interface WizardStep {
    id: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    description?: string;
}

export interface ImportSourceConfig {
    type: ExtensibleString<'FILE' | 'API' | 'DATABASE' | 'WEBHOOK' | 'CDC'>;
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
    fileId?: string;
    hasHeaders: boolean;
    delimiter?: string;
    encoding?: string;
    sheetName?: string;
    itemsPath?: string;
    recordPath?: string;
    attributePrefix?: string;
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

export const IMPORT_EXISTING_RECORD_STRATEGIES = [
    'SKIP',
    'UPDATE',
    'REPLACE',
    'ERROR',
] as const;

export type ImportExistingRecordStrategy =
    typeof IMPORT_EXISTING_RECORD_STRATEGIES[number];

export interface WizardStrategyMapping {
    wizardValue: ImportExistingRecordStrategy;
    label: string;
    loadStrategy: string;
    conflictStrategy: string;
}

export interface ImportStrategies {
    existingRecords: ImportExistingRecordStrategy;
    lookupFields: string[];
    batchSize: number;
    parallelBatches: number;
    continueOnError: boolean;
}

export interface ImportTriggerConfig {
    type: 'MANUAL' | 'SCHEDULE' | 'WEBHOOK' | 'FILE';
    schedule?: string;
    connectionCode?: string;
    path?: string;
}

export interface QueryConfig {
    type: 'all' | 'query';
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
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
    type: ExtensibleString<'CSV' | 'JSON' | 'XML' | 'GOOGLE_SHOPPING' | 'META_CATALOG' | 'AMAZON'>;
    /** Schema-driven format options. Keys come from exporter adapter schema fields with group 'format-options'. */
    options: Record<string, unknown> & {
        /** Feed template identifier for feed-based formats */
        feedTemplate?: string;
    };
}

export interface DestinationConfig {
    type: 'SFTP' | 'FTP' | 'HTTP' | 'S3' | 'EMAIL' | 'LOCAL';
    sftpConfig?: SftpDestinationConfig;
    ftpConfig?: FtpDestinationConfig;
    httpConfig?: HttpDestinationConfig;
    s3Config?: S3DestinationConfig;
    emailConfig?: EmailDestinationConfig;
    localConfig?: LocalDestinationConfig;
}

export interface SftpDestinationConfig {
    host: string;
    port: number;
    username: string;
    passwordSecretCode?: string;
    privateKeySecretCode?: string;
    passphraseSecretCode?: string;
    hostKeyFingerprintSecretCode?: string;
    remotePath: string;
    timeout?: number;
}

export interface HttpDestinationConfig {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    headerSecretCodes?: Record<string, string>;
    auth?: {
        type: 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY';
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
    };
}

export interface S3DestinationConfig {
    bucket: string;
    region: string;
    accessKeyIdSecretCode: string;
    secretAccessKeySecretCode: string;
    prefix?: string;
    acl?: 'private' | 'public-read';
    endpoint?: string;
}

export interface FtpDestinationConfig {
    host: string;
    port: number;
    username: string;
    passwordSecretCode: string;
    remotePath: string;
    secure?: boolean;
}

export interface EmailDestinationConfig {
    to: string[];
    cc?: string[];
    bcc?: string[];
    from?: string;
    subject: string;
    body?: string;
    smtp: {
        host: string;
        port: number;
        secure?: boolean;
        username?: string;
        usernameSecretCode?: string;
        passwordSecretCode?: string;
    };
}

export interface LocalDestinationConfig {
    directory: string;
}

export interface ExportTriggerConfig {
    type: 'MANUAL' | 'SCHEDULE' | 'EVENT' | 'WEBHOOK';
    schedule?: string;
    event?: VendureEventType;
}

export interface ExportOptions {
    batchSize: number;
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
