/**
 * FTP/SFTP Destination Handlers
 *
 * Handles delivery to FTP and SFTP servers.
 */

import * as path from 'path';
import { Readable } from 'stream';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { DEFAULTS, LOGGER_CONTEXTS, HTTP } from '../../constants/index';
import {
    SFTPDestinationConfig,
    FTPDestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    DESTINATION_TYPE,
} from './destination.types';
import { DataHubLogger } from '../logger';

const logger = new DataHubLogger(LOGGER_CONTEXTS.FTP_HANDLER);

/**
 * Deliver content to SFTP server
 */
export async function deliverToSFTP(
    config: SFTPDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = `${config.remotePath}/${filename}`.replace(/\/+/g, '/');
    const port = config.port || DEFAULTS.DEFAULT_SFTP_PORT;
    const sftp = new SftpClient();

    try {
        await sftp.connect({
            host: config.host,
            port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
            readyTimeout: config.timeout || HTTP.TIMEOUT_MS,
        });

        const remoteDir = path.dirname(remotePath);
        await sftp.mkdir(remoteDir, true).catch((err) => {
            logger.warn(`SFTP: Failed to create directory ${remoteDir}`, { error: err?.message ?? err });
        });

        // Upload file
        const stream = Readable.from(content);
        await sftp.put(stream, remotePath);

        logger.info(`SFTP: Delivered ${filename}`, { host: config.host, remotePath });

        return {
            success: true,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.SFTP,
            filename,
            size: content.length,
            deliveredAt: new Date(),
            location: `sftp://${config.host}:${port}${remotePath}`,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'SFTP delivery failed';
        logger.error(`SFTP: Failed to deliver ${filename}`, undefined, { error: errorMessage });

        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.SFTP,
            filename,
            size: content.length,
            error: errorMessage,
        };
    } finally {
        await sftp.end().catch((err) => {
            logger.warn('SFTP: Failed to close connection', { error: err?.message ?? err });
        });
    }
}

/**
 * Deliver content to FTP server
 */
export async function deliverToFTP(
    config: FTPDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = `${config.remotePath}/${filename}`.replace(/\/+/g, '/');
    const port = config.port || DEFAULTS.DEFAULT_FTP_PORT;
    const client = new FtpClient();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: config.host,
            port,
            user: config.username,
            password: config.password,
            secure: config.secure || false,
            secureOptions: config.secure ? { rejectUnauthorized: false } : undefined,
        });

        const remoteDir = path.dirname(remotePath);
        await client.ensureDir(remoteDir).catch((err) => {
            logger.warn(`FTP: Failed to ensure directory ${remoteDir}`, { error: err?.message ?? err });
        });

        // Upload file
        const stream = Readable.from(content);
        await client.uploadFrom(stream, remotePath);

        logger.info(`FTP: Delivered ${filename}`, { host: config.host, remotePath });

        return {
            success: true,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.FTP,
            filename,
            size: content.length,
            deliveredAt: new Date(),
            location: `ftp://${config.host}:${port}${remotePath}`,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'FTP delivery failed';
        logger.error(`FTP: Failed to deliver ${filename}`, undefined, { error: errorMessage });

        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.FTP,
            filename,
            size: content.length,
            error: errorMessage,
        };
    } finally {
        client.close();
    }
}

/**
 * Test SFTP connection
 */
export async function testSFTPConnection(config: SFTPDestinationConfig): Promise<{
    success: boolean;
    message?: string;
    latencyMs?: number;
}> {
    const start = Date.now();
    const sftp = new SftpClient();

    try {
        await sftp.connect({
            host: config.host,
            port: config.port || DEFAULTS.DEFAULT_SFTP_PORT,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            readyTimeout: HTTP.CONNECTION_TEST_TIMEOUT_MS,
        });

        await sftp.list(config.remotePath || '/');

        return {
            success: true,
            message: `Connected to ${config.host}`,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed',
            latencyMs: Date.now() - start,
        };
    } finally {
        await sftp.end().catch((err) => {
            logger.warn('SFTP: Failed to close test connection', { error: err?.message ?? err });
        });
    }
}

/**
 * Test FTP connection
 */
export async function testFTPConnection(config: FTPDestinationConfig): Promise<{
    success: boolean;
    message?: string;
    latencyMs?: number;
}> {
    const start = Date.now();
    const client = new FtpClient();

    try {
        await client.access({
            host: config.host,
            port: config.port || DEFAULTS.DEFAULT_FTP_PORT,
            user: config.username,
            password: config.password,
            secure: config.secure || false,
        });

        await client.list(config.remotePath || '/');

        return {
            success: true,
            message: `Connected to ${config.host}`,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connection failed',
            latencyMs: Date.now() - start,
        };
    } finally {
        client.close();
    }
}
