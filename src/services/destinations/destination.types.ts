import { ConnectionAuthType, DESTINATION_TYPE } from '../../constants/index';
import type { DestinationType as SharedDestinationType } from '../../../shared/types';

export { DESTINATION_TYPE };

export type DestinationType = Extract<
    SharedDestinationType,
    'S3' | 'SFTP' | 'FTP' | 'HTTP' | 'LOCAL' | 'EMAIL'
>;

interface BaseDestinationConfig {
    type: DestinationType;
    id: string;
    name: string;
    enabled?: boolean;
}

export interface S3DestinationConfig extends BaseDestinationConfig {
    type: 'S3';
    bucket: string;
    region: string;
    accessKeyIdSecretCode: string;
    secretAccessKeySecretCode: string;
    prefix?: string;
    acl?: 'private' | 'public-read';
    endpoint?: string;
}

export interface SFTPDestinationConfig extends BaseDestinationConfig {
    type: 'SFTP';
    host: string;
    port?: number;
    username: string;
    passwordSecretCode?: string;
    privateKeySecretCode?: string;
    passphraseSecretCode?: string;
    hostKeyFingerprintSecretCode?: string;
    remotePath: string;
    timeout?: number;
}

export interface FTPDestinationConfig extends BaseDestinationConfig {
    type: 'FTP';
    host: string;
    port?: number;
    username: string;
    passwordSecretCode: string;
    remotePath: string;
    secure?: boolean;
}

export type DestinationAuthType =
    | ConnectionAuthType.NONE
    | ConnectionAuthType.BASIC
    | ConnectionAuthType.BEARER
    | ConnectionAuthType.API_KEY;

export interface DestinationAuthConfig {
    type: DestinationAuthType;
    secretCode?: string;
    headerName?: string;
    username?: string;
    usernameSecretCode?: string;
}

export interface HTTPDestinationConfig extends BaseDestinationConfig {
    type: 'HTTP';
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    headerSecretCodes?: Record<string, string>;
    auth?: DestinationAuthConfig;
}

export interface LocalDestinationConfig extends BaseDestinationConfig {
    type: 'LOCAL';
    directory: string;
}

export interface EmailSmtpConfig {
    host: string;
    port: number;
    secure?: boolean;
    username?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
}

export interface EmailDestinationConfig extends BaseDestinationConfig {
    type: 'EMAIL';
    to: string[];
    cc?: string[];
    bcc?: string[];
    from?: string;
    subject: string;
    body?: string;
    smtp: EmailSmtpConfig;
}

export type DestinationConfig =
    | S3DestinationConfig
    | SFTPDestinationConfig
    | FTPDestinationConfig
    | HTTPDestinationConfig
    | LocalDestinationConfig
    | EmailDestinationConfig;

export interface ResolvedS3DestinationConfig extends Omit<
    S3DestinationConfig,
    'accessKeyIdSecretCode' | 'secretAccessKeySecretCode'
> {
    accessKeyId: string;
    secretAccessKey: string;
}

export interface ResolvedSFTPDestinationConfig extends Omit<
    SFTPDestinationConfig,
    'passwordSecretCode' | 'privateKeySecretCode' | 'passphraseSecretCode' | 'hostKeyFingerprintSecretCode'
> {
    password?: string;
    privateKey?: string;
    hostKeyFingerprint?: string;
    passphrase?: string;
}

export interface ResolvedFTPDestinationConfig extends Omit<FTPDestinationConfig, 'passwordSecretCode'> {
    password: string;
}

export interface ResolvedHTTPDestinationConfig extends Omit<HTTPDestinationConfig, 'auth' | 'headerSecretCodes'> {
    authType?: DestinationAuthType;
    authConfig?: {
        username?: string;
        password?: string;
        token?: string;
        apiKey?: string;
        apiKeyHeader?: string;
    };
}

export interface ResolvedEmailDestinationConfig extends Omit<EmailDestinationConfig, 'smtp'> {
    smtp: {
        host: string;
        port: number;
        secure?: boolean;
        auth?: {
            user: string;
            pass: string;
        };
    };
}

export type ResolvedDestinationConfig =
    | ResolvedS3DestinationConfig
    | ResolvedSFTPDestinationConfig
    | ResolvedFTPDestinationConfig
    | ResolvedHTTPDestinationConfig
    | LocalDestinationConfig
    | ResolvedEmailDestinationConfig;

export interface DeliveryResult {
    success: boolean;
    destinationId: string;
    destinationType: DestinationType;
    filename: string;
    size: number;
    deliveredAt?: Date;
    location?: string;
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface DeliveryOptions {
    mimeType?: string;
    metadata?: Record<string, unknown>;
}
