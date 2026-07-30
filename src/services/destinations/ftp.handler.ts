import * as path from 'path';
import { Readable } from 'stream';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import type { ConnectionTestResult } from '../../../shared/types';
import { LOGGER_CONTEXTS, HTTP, PORTS } from '../../constants/index';
import {
    connectPinnedRemoteSocket,
    createSftpHostVerifier,
    resolveSafeRemoteAddress,
} from '../../utils/remote-host-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { DataHubLoggerFactory } from '../logger';
import {
    ResolvedSFTPDestinationConfig,
    ResolvedFTPDestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    DESTINATION_TYPE,
} from './destination.types';
import { normalizeRemotePath, createSuccessResult, createFailureResult } from './delivery-utils';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.FTP_HANDLER);

async function connectSftpDestination(
    config: ResolvedSFTPDestinationConfig,
): Promise<SftpClient> {
    const port = config.port || PORTS.SFTP;
    const timeout = config.timeout || HTTP.TIMEOUT_MS;
    const hostVerifier = createSftpHostVerifier(config.hostKeyFingerprint);
    const { socket } = await connectPinnedRemoteSocket(config.host, port, timeout);
    const client = new SftpClient();

    try {
        await client.connect({
            host: config.host,
            port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
            readyTimeout: timeout,
            sock: socket,
            hostVerifier,
            retries: 0,
        });
        return client;
    } catch (error) {
        socket.destroy();
        await client.end().catch(() => undefined);
        throw error;
    }
}

async function connectFtpDestination(
    config: ResolvedFTPDestinationConfig,
): Promise<FtpClient> {
    const remote = await resolveSafeRemoteAddress(config.host);
    const client = new FtpClient(HTTP.TIMEOUT_MS);
    client.ftp.verbose = false;

    try {
        await client.access({
            host: remote.address,
            port: config.port || PORTS.FTP,
            user: config.username,
            password: config.password,
            secure: config.secure || false,
            secureOptions: config.secure
                ? { rejectUnauthorized: true, servername: remote.hostname }
                : undefined,
        });
        return client;
    } catch (error) {
        client.close();
        throw error;
    }
}

export async function deliverToSFTP(
    config: ResolvedSFTPDestinationConfig,
    content: Buffer,
    filename: string,
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = normalizeRemotePath(config.remotePath, filename);
    const port = config.port || PORTS.SFTP;
    let sftp: SftpClient | undefined;

    try {
        sftp = await connectSftpDestination(config);
        const remoteDir = path.dirname(remotePath);
        await sftp.mkdir(remoteDir, true).catch(error => {
            logger.warn(`SFTP: Failed to create directory ${remoteDir}`, {
                error: getErrorMessage(error),
            });
        });
        await sftp.put(Readable.from(content), remotePath);

        logger.info(`SFTP: Delivered ${filename}`, { host: config.host, remotePath });
        return createSuccessResult(
            config.id,
            DESTINATION_TYPE.SFTP,
            filename,
            content.length,
            `sftp://${config.host}:${port}${remotePath}`,
        );
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error(`SFTP: Failed to deliver ${filename}`, undefined, { error: errorMessage });
        return createFailureResult(
            config.id,
            DESTINATION_TYPE.SFTP,
            filename,
            content.length,
            errorMessage,
        );
    } finally {
        await sftp?.end().catch(error => {
            logger.warn('SFTP: Failed to close connection', { error: getErrorMessage(error) });
        });
    }
}

export async function deliverToFTP(
    config: ResolvedFTPDestinationConfig,
    content: Buffer,
    filename: string,
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = normalizeRemotePath(config.remotePath, filename);
    const port = config.port || PORTS.FTP;
    let client: FtpClient | undefined;

    try {
        client = await connectFtpDestination(config);
        const remoteDir = path.dirname(remotePath);
        await client.ensureDir(remoteDir).catch(error => {
            logger.warn(`FTP: Failed to ensure directory ${remoteDir}`, {
                error: getErrorMessage(error),
            });
        });
        await client.uploadFrom(Readable.from(content), remotePath);

        logger.info(`FTP: Delivered ${filename}`, { host: config.host, remotePath });
        return createSuccessResult(
            config.id,
            DESTINATION_TYPE.FTP,
            filename,
            content.length,
            `ftp://${config.host}:${port}${remotePath}`,
        );
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error(`FTP: Failed to deliver ${filename}`, undefined, { error: errorMessage });
        return createFailureResult(
            config.id,
            DESTINATION_TYPE.FTP,
            filename,
            content.length,
            errorMessage,
        );
    } finally {
        client?.close();
    }
}

export async function testSftpDestination(
    config: ResolvedSFTPDestinationConfig,
    start: number,
): Promise<ConnectionTestResult> {
    let client: SftpClient | undefined;
    try {
        client = await connectSftpDestination(config);
        await client.list(config.remotePath);
        return {
            success: true,
            message: 'SFTP endpoint authenticated and remote path is accessible',
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
            latencyMs: Date.now() - start,
        };
    } finally {
        await client?.end().catch(() => undefined);
    }
}

export async function testFtpDestination(
    config: ResolvedFTPDestinationConfig,
    start: number,
): Promise<ConnectionTestResult> {
    let client: FtpClient | undefined;
    try {
        client = await connectFtpDestination(config);
        await client.cd(config.remotePath);
        return {
            success: true,
            message: 'FTP endpoint authenticated and remote path is accessible',
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
            latencyMs: Date.now() - start,
        };
    } finally {
        client?.close();
    }
}
