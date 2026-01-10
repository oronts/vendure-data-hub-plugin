import { ExtractorConfig } from '../../types/index';
import { FileFormat } from '../../parsers/types';

export interface S3CsvOptions {
    delimiter?: ',' | ';' | '\t' | '|';
    header?: boolean;
    skipEmptyLines?: boolean;
}

export interface S3JsonOptions {
    path?: string;
}

export interface S3XmlOptions {
    recordPath?: string;
    attributePrefix?: string;
}

export interface S3XlsxOptions {
    sheet?: string | number;
    range?: string;
    header?: boolean;
}

export interface S3SelectConfig {
    enabled: boolean;
    expression: string;
    inputSerialization?: 'csv' | 'json';
}

export interface S3MoveAfterProcessConfig {
    enabled: boolean;
    destinationPrefix: string;
}

export interface S3ExtractorConfig extends ExtractorConfig {
    /** S3 bucket name */
    bucket: string;

    /** Object key prefix (folder path) */
    prefix?: string;

    /** Object key suffix (file extension filter) */
    suffix?: string;

    /** AWS region */
    region?: string;

    /** Custom endpoint URL (for S3-compatible services) */
    endpoint?: string;

    /** Access key ID secret code */
    accessKeyIdSecretCode?: string;

    /** Secret access key secret code */
    secretAccessKeySecretCode?: string;

    /** Use path-style addressing (required for some S3-compatible services) */
    forcePathStyle?: boolean;

    /** File format (auto-detected if not specified) */
    format?: FileFormat;

    /** CSV parsing options */
    csv?: S3CsvOptions;

    /** JSON parsing options */
    json?: S3JsonOptions;

    /** XML parsing options */
    xml?: S3XmlOptions;

    /** Excel parsing options */
    xlsx?: S3XlsxOptions;

    /** Only process objects modified after this date */
    modifiedAfter?: string;

    /** Delete objects after processing */
    deleteAfterProcess?: boolean;

    /** Move objects after processing */
    moveAfterProcess?: S3MoveAfterProcessConfig;

    /** Maximum objects to process (safety limit) */
    maxObjects?: number;

    /** Include S3 metadata in records */
    includeObjectMetadata?: boolean;

    /** Continue on parse errors */
    continueOnError?: boolean;

    /** Use S3 Select for server-side filtering (CSV/JSON only) */
    s3Select?: S3SelectConfig;
}

export interface S3ObjectInfo {
    key: string;
    size: number;
    lastModified: Date;
    etag?: string;
    storageClass?: string;
}

export interface S3ObjectMetadata {
    bucket: string;
    key: string;
    size: number;
    etag?: string;
    lastModified?: string;
}

export const S3_DEFAULTS = {
    region: 'us-east-1',
    maxObjects: 100,
    forcePathStyle: false,
} as const;

export const S3_BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
