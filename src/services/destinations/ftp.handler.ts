/**
 * FTP/SFTP Destination Handlers
 *
 * Delivery to FTP and SFTP servers.
 */

import * as path from 'path';
import { Readable } from 'stream';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { LOGGER_CONTEXTS, HTTP, PORTS } from '../../constants/index';
import {
    SFTPDestinationConfig,
    FTPDestinationConfig,
    DeliveryResult,
    DeliveryOptions,
    DESTINATION_TYPE,
} from './destination.types';
import { DataHubLogger } from '../logger';
import { isBlockedHostname } from '../../utils/url-security.utils';
import { getErrorMessage } from '../../utils/error.utils';

const logger = new DataHubLogger(LOGGER_CONTEXTS.FTP_HANDLER);

/**
 * Deliver content to SFTP server
 */
export async function deliverToSFTP(
    config: SFTPDestinationConfig,
    content: Buffer,
    filename: string,
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = `${config.remotePath}/${filename}`.replace(/\/+/g, '/');
    const port = config.port || PORTS.SFTP;
    const sftp = new SftpClient();

    try {
        if (isBlockedHostname(config.host)) {
            throw new Error(`SSRF protection: hostname '${config.host}' is blocked`);
        }

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
        const errorMessage = getErrorMessage(error);
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
    _options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const remotePath = `${config.remotePath}/${filename}`.replace(/\/+/g, '/');
    const port = config.port || PORTS.FTP;
    const client = new FtpClient();
    client.ftp.verbose = false;

    try {
        if (isBlockedHostname(config.host)) {
            throw new Error(`SSRF protection: hostname '${config.host}' is blocked`);
        }

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
        const errorMessage = getErrorMessage(error);
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

