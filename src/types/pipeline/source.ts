/**
 * Source Configuration Types
 */

import { JsonObject } from '../common';
import { SourceType, FileFormat, VendureEntityType } from './definition';
import { FilterCondition } from './filter';

export interface SourceConfig {
    type: SourceType;

    /** Connection reference (for FTP, S3, HTTP, DATABASE) */
    connectionCode?: string;

    /** File format configuration */
    format?: FileFormatConfig;

    /** Type-specific configuration */
    config: SourceTypeConfig;
}

export interface FileFormatConfig {
    format: FileFormat;

    /** CSV-specific options */
    csv?: {
        delimiter?: ',' | ';' | '\t' | '|';
        quote?: '"' | "'";
        escape?: '\\' | '"';
        encoding?: 'utf-8' | 'iso-8859-1' | 'windows-1252';
        headerRow?: boolean;
        skipRows?: number;
        trimWhitespace?: boolean;
    };

    /** JSON-specific options */
    json?: {
        recordsPath?: string;  // JSONPath to array of records
        flatten?: boolean;
    };

    /** XML-specific options */
    xml?: {
        recordPath?: string;   // XPath to records
        attributePrefix?: string;
    };

    /** Excel-specific options */
    xlsx?: {
        sheet?: string | number;
        range?: string;
        headerRow?: boolean;
    };
}

export type SourceTypeConfig =
    | FileUploadSourceConfig
    | WebhookSourceConfig
    | HttpApiSourceConfig
    | FtpSourceConfig
    | S3SourceConfig
    | DatabaseSourceConfig
    | VendureQuerySourceConfig
    | EventSourceConfig;

export interface FileUploadSourceConfig {
    type: 'FILE_UPLOAD';
    maxSize?: number;
    allowedExtensions?: string[];
}

export interface WebhookSourceConfig {
    type: 'WEBHOOK';
    authentication?: 'NONE' | 'API_KEY' | 'HMAC' | 'JWT' | 'BASIC';
    secretCode?: string;
    idempotencyKeyField?: string;
    responseMode?: 'SYNC' | 'ASYNC';
}

export interface HttpApiSourceConfig {
    type: 'HTTP_API';
    method?: 'GET' | 'POST';
    path?: string;
    headers?: Record<string, string>;
    body?: JsonObject;
    pagination?: {
        type: 'OFFSET' | 'CURSOR' | 'PAGE' | 'LINK';
        pageParam?: string;
        limitParam?: string;
        limit?: number;
        cursorPath?: string;
        hasMorePath?: string;
        dataPath?: string;
    };
    rateLimit?: {
        requestsPerSecond?: number;
        maxConcurrent?: number;
    };
}

export interface FtpSourceConfig {
    type: 'FTP';
    remotePath: string;
    filePattern?: string;
    deleteAfterProcess?: boolean;
    archivePath?: string;
}

export interface S3SourceConfig {
    type: 'S3';
    bucket?: string;
    key?: string;
    pattern?: string;
    deleteAfterProcess?: boolean;
}

export interface DatabaseSourceConfig {
    type: 'DATABASE';
    query: string;
    incrementalColumn?: string;
    batchSize?: number;
}

export interface VendureQuerySourceConfig {
    type: 'VENDURE_QUERY';
    entity: VendureEntityType;
    filters?: FilterCondition[];
    includeFields?: string[];
    excludeFields?: string[];
    channelCodes?: string[];
    languageCode?: string;
    relations?: string[];
}

export interface EventSourceConfig {
    type: 'EVENT';
    eventType: string;
    filter?: string;
}
