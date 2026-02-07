import { Writable } from 'stream';
import { Client as BasicFtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { ExtractorContext } from '../../types/index';
import { getErrorMessage } from '../../utils/error.utils';
import { FtpExtractorConfig, FtpFileInfo, FtpProtocol, FTP_DEFAULTS, FTP_PROTOCOLS, FTP_TYPE_CODE, FTP_ITEM_TYPE } from './types';
import { isBlockedHostname } from '../../utils/url-security.utils';

function validateFtpHost(host: string): void {
    if (!host || typeof host !== 'string') {
        throw new Error('FTP host is required');
    }
    if (isBlockedHostname(host)) {
        throw new Error(`SSRF protection: hostname '${host}' is blocked for security reasons`);
    }
}

export interface FtpClient {
    list(remotePath: string): Promise<FtpFileInfo[]>;
    download(remotePath: string): Promise<Buffer>;
    delete(remotePath: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    mkdir(remotePath: string, recursive?: boolean): Promise<void>;
    close(): Promise<void>;
}

export interface FtpConnectionOptions {
    host: string;
    port: number;
    user?: string;
    password?: string;
    secure?: boolean | 'implicit';
    passiveMode?: boolean;
    timeout?: number;
}

export interface SftpConnectionOptions {
    host: string;
    port: number;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    timeout?: number;
}

export async function buildFtpConnectionOptions(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<FtpConnectionOptions> {
    validateFtpHost(config.host);
    const options: FtpConnectionOptions = {
        host: config.host,
        port: config.port || FTP_DEFAULTS.ftpPort,
        user: config.username,
        secure: config.secure,
        passiveMode: config.passiveMode ?? FTP_DEFAULTS.passiveMode,
        timeout: config.timeoutMs || FTP_DEFAULTS.timeoutMs,
    };

    if (config.passwordSecretCode) {
        options.password = await context.secrets.get(config.passwordSecretCode);
    }

    return options;
}

export async function buildSftpConnectionOptions(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<SftpConnectionOptions> {
    validateFtpHost(config.host);
    const options: SftpConnectionOptions = {
        host: config.host,
        port: config.port || FTP_DEFAULTS.sftpPort,
        username: config.username,
        timeout: config.timeoutMs || FTP_DEFAULTS.timeoutMs,
    };

    if (config.passwordSecretCode) {
        options.password = await context.secrets.get(config.passwordSecretCode);
    }

    if (config.privateKeySecretCode) {
        options.privateKey = await context.secrets.get(config.privateKeySecretCode);
    }

    if (config.passphraseSecretCode) {
        options.passphrase = await context.secrets.get(config.passphraseSecretCode);
    }

    return options;
}

export async function createFtpClient(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<FtpClient> {
    const client = new BasicFtpClient();
    client.ftp.verbose = false;

    const options = await buildFtpConnectionOptions(context, config);

    await client.access({
        host: options.host,
        port: options.port,
        user: options.user,
        password: options.password,
        secure: options.secure,
    });

    return {
        async list(remotePath: string): Promise<FtpFileInfo[]> {
            const list = await client.list(remotePath);
            return list
                .filter((item: { type: number; name: string; size: number; modifiedAt?: Date }) => item.type !== FTP_ITEM_TYPE.DIRECTORY) // Filter out directories
                .map((item: { type: number; name: string; size: number; modifiedAt?: Date }) => ({
                    name: item.name,
                    path: remotePath.endsWith('/')
                        ? `${remotePath}${item.name}`
                        : `${remotePath}/${item.name}`,
                    size: item.size,
                    modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : new Date(),
                    isDirectory: item.type === FTP_ITEM_TYPE.DIRECTORY,
                }));
        },

        async download(remotePath: string): Promise<Buffer> {
            const chunks: Buffer[] = [];
            const writable = new Writable({
                write(chunk, _encoding, callback) {
                    chunks.push(Buffer.from(chunk));
                    callback();
                },
            });

            await client.downloadTo(writable, remotePath);
            return Buffer.concat(chunks);
        },

        async delete(remotePath: string): Promise<void> {
            await client.remove(remotePath);
        },

        async rename(oldPath: string, newPath: string): Promise<void> {
            await client.rename(oldPath, newPath);
        },

        async mkdir(remotePath: string, recursive?: boolean): Promise<void> {
            if (recursive) {
                await client.ensureDir(remotePath);
            } else {
                await client.send(`MKD ${remotePath}`);
            }
        },

        async close(): Promise<void> {
            client.close();
        },
    };
}

export async function createSftpClient(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<FtpClient> {
    const client = new SftpClient();
    const options = await buildSftpConnectionOptions(context, config);

    await client.connect({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        privateKey: options.privateKey,
        passphrase: options.passphrase,
        readyTimeout: options.timeout,
    });

    return {
        async list(remotePath: string): Promise<FtpFileInfo[]> {
            const list = await client.list(remotePath);
            return list
                .filter((item: { type: string; name: string; size: number; modifyTime: number }) => item.type !== FTP_TYPE_CODE.DIRECTORY)
                .map((item: { type: string; name: string; size: number; modifyTime: number }) => ({
                    name: item.name,
                    path: remotePath.endsWith('/')
                        ? `${remotePath}${item.name}`
                        : `${remotePath}/${item.name}`,
                    size: item.size,
                    modifiedAt: new Date(item.modifyTime),
                    isDirectory: item.type === FTP_TYPE_CODE.DIRECTORY,
                }));
        },

        async download(remotePath: string): Promise<Buffer> {
            const result = await client.get(remotePath);
            if (Buffer.isBuffer(result)) {
                return result;
            }
            if (typeof result === 'string') {
                return Buffer.from(result);
            }
            throw new Error('Unexpected SFTP download result type');
        },

        async delete(remotePath: string): Promise<void> {
            await client.delete(remotePath);
        },

        async rename(oldPath: string, newPath: string): Promise<void> {
            await client.rename(oldPath, newPath);
        },

        async mkdir(remotePath: string, recursive?: boolean): Promise<void> {
            await client.mkdir(remotePath, recursive);
        },

        async close(): Promise<void> {
            await client.end();
        },
    };
}

export async function createClient(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<FtpClient> {
    if (config.protocol === FTP_PROTOCOLS.SFTP) {
        return createSftpClient(context, config);
    }
    return createFtpClient(context, config);
}

export async function testConnection(
    context: ExtractorContext,
    config: FtpExtractorConfig,
): Promise<{ success: boolean; error?: string; latencyMs?: number; filesFound?: number }> {
    const startTime = Date.now();

    try {
        const client = await createClient(context, config);
        const files = await client.list(config.remotePath);
        await client.close();

        return {
            success: true,
            latencyMs: Date.now() - startTime,
            filesFound: files.length,
        };
    } catch (error) {
        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
}

export function buildFtpSourceId(
    protocol: FtpProtocol,
    host: string,
    path: string,
): string {
    return `${protocol}://${host}${path}`;
}
