import { ExtractorConfig } from '../../types/index';
import { FileFormat } from '../../parsers/types';
import { PORTS, HTTP } from '../../constants/index';

export type FtpProtocol = 'ftp' | 'sftp';

export interface FtpCsvOptions {
    delimiter?: ',' | ';' | '\t' | '|';
    header?: boolean;
    skipEmptyLines?: boolean;
}

export interface FtpJsonOptions {
    path?: string;
}

export interface FtpXmlOptions {
    recordPath?: string;
    attributePrefix?: string;
}

export interface FtpXlsxOptions {
    sheet?: string | number;
    range?: string;
    header?: boolean;
}

export interface FtpMoveAfterProcessConfig {
    enabled: boolean;
    destinationPath: string;
}

export interface FtpExtractorConfig extends ExtractorConfig {
    /** Protocol: ftp or sftp */
    protocol: FtpProtocol;

    /** Server host */
    host: string;

    /** Server port (defaults: FTP=21, SFTP=22) */
    port?: number;

    /** Username */
    username?: string;

    /** Password secret code (for basic auth) */
    passwordSecretCode?: string;

    /** Private key secret code (for SFTP key auth) */
    privateKeySecretCode?: string;

    /** Passphrase for private key */
    passphraseSecretCode?: string;

    /** Remote directory path */
    remotePath: string;

    /** File pattern (glob-like) */
    filePattern?: string;

    /** File format (auto-detected if not specified) */
    format?: FileFormat;

    /** CSV parsing options */
    csv?: FtpCsvOptions;

    /** JSON parsing options */
    json?: FtpJsonOptions;

    /** XML parsing options */
    xml?: FtpXmlOptions;

    /** Excel parsing options */
    xlsx?: FtpXlsxOptions;

    /** Only process files modified after this date */
    modifiedAfter?: string;

    /** Delete files after processing */
    deleteAfterProcess?: boolean;

    /** Move files after processing */
    moveAfterProcess?: FtpMoveAfterProcessConfig;

    /** Maximum files to process (safety limit) */
    maxFiles?: number;

    /** Include file metadata in records */
    includeFileMetadata?: boolean;

    /** Continue on file parse errors */
    continueOnError?: boolean;

    /** Use passive mode for FTP */
    passiveMode?: boolean;

    /** Secure FTP (FTPS) */
    secure?: boolean | 'implicit';

    /** Connection timeout in milliseconds */
    timeoutMs?: number;
}

export interface FtpFileInfo {
    name: string;
    path: string;
    size: number;
    modifiedAt: Date;
    isDirectory: boolean;
}

export interface FtpFileMetadata {
    protocol: FtpProtocol;
    host: string;
    path: string;
    size: number;
    modifiedAt: string;
}

export const FTP_DEFAULTS = {
    ftpPort: PORTS.FTP,
    sftpPort: PORTS.SFTP,
    maxFiles: 50,
    timeoutMs: HTTP.TIMEOUT_MS,
    passiveMode: true,
} as const;

export const FTP_PROTOCOLS = {
    FTP: 'ftp',
    SFTP: 'sftp',
} as const;

export const FTP_TYPE_CODE = {
    DIRECTORY: 'd',
    FILE: '-',
} as const;

export const FTP_ITEM_TYPE = {
    FILE: 0,
    DIRECTORY: 2,
} as const;

export function getDefaultPort(protocol: FtpProtocol): number {
    return protocol === FTP_PROTOCOLS.SFTP ? FTP_DEFAULTS.sftpPort : FTP_DEFAULTS.ftpPort;
}
