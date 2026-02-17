/**
 * Destination Types
 *
 * Type definitions for export destination configurations and results.
 */

import { AuthType, DESTINATION_TYPE } from '../../constants/index';
import type { DestinationType as SharedDestinationType } from '../../../shared/types';

export { DESTINATION_TYPE };

/**
 * Delivery destination types - subset of the canonical DestinationType that
 * represents actual physical delivery targets. Excludes 'FILE', 'DOWNLOAD',
 * and 'WEBHOOK' which are handled at a higher level in the export pipeline.
 *
 * @see shared/types/pipeline.types.ts — canonical DestinationType (full superset)
 * @see src/constants/enums.ts — DESTINATION_TYPE runtime constant
 */
export type DestinationType = Extract<SharedDestinationType, 'S3' | 'SFTP' | 'FTP' | 'HTTP' | 'LOCAL' | 'EMAIL'>;

/**
 * Base destination configuration
 */
interface BaseDestinationConfig {
    type: DestinationType;
    id: string;
    name: string;
    enabled?: boolean;
}

/**
 * S3 destination configuration
 */
export interface S3DestinationConfig extends BaseDestinationConfig {
    type: 'S3';
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix?: string;
    acl?: 'private' | 'public-read';
    endpoint?: string; // For S3-compatible services like MinIO
}

/**
 * SFTP destination configuration
 */
export interface SFTPDestinationConfig extends BaseDestinationConfig {
    type: 'SFTP';
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    remotePath: string;
    timeout?: number;
}

/**
 * FTP destination configuration
 */
export interface FTPDestinationConfig extends BaseDestinationConfig {
    type: 'FTP';
    host: string;
    port?: number;
    username: string;
    password: string;
    remotePath: string;
    secure?: boolean;
}

/**
 * HTTP destination configuration
 */
export interface HTTPDestinationConfig extends BaseDestinationConfig {
    type: 'HTTP';
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    authType?: AuthType;
    authConfig?: {
        username?: string;
        password?: string;
        token?: string;
        apiKey?: string;
        apiKeyHeader?: string;
    };
}

/**
 * Local filesystem destination configuration
 */
export interface LocalDestinationConfig extends BaseDestinationConfig {
    type: 'LOCAL';
    directory: string;
}

/**
 * Email destination configuration
 */
export interface EmailDestinationConfig extends BaseDestinationConfig {
    type: 'EMAIL';
    to: string[];
    cc?: string[];
    bcc?: string[];
    from?: string;
    subject: string;
    body?: string;
    smtp?: {
        host: string;
        port: number;
        secure?: boolean;
        auth?: {
            user: string;
            pass: string;
        };
    };
}

/**
 * Union of all destination configurations
 */
export type DestinationConfig =
    | S3DestinationConfig
    | SFTPDestinationConfig
    | FTPDestinationConfig
    | HTTPDestinationConfig
    | LocalDestinationConfig
    | EmailDestinationConfig;

/**
 * Export delivery result
 */
export interface DeliveryResult {
    success: boolean;
    destinationId: string;
    destinationType: DestinationType;
    filename: string;
    size: number;
    deliveredAt?: Date;
    location?: string; // URL or path where file was delivered
    error?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Delivery options
 */
export interface DeliveryOptions {
    mimeType?: string;
    metadata?: Record<string, unknown>;
}

