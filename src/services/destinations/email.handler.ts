/**
 * Email Destination Handler
 *
 * Delivery via email attachment using nodemailer.
 */

import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { LOGGER_CONTEXTS, CONTENT_TYPES, EXTENSION_MIME_MAP } from '../../constants/index';
import { ResolvedEmailDestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { DataHubLoggerFactory } from '../logger';
import { getErrorMessage, toErrorOrUndefined } from '../../utils/error.utils';
import { resolveSafeRemoteAddress } from '../../utils/remote-host-security.utils';
import type { ConnectionTestResult } from '../../../shared/types';

const logger = DataHubLoggerFactory.create(LOGGER_CONTEXTS.EMAIL_HANDLER);

async function createTransport(config: ResolvedEmailDestinationConfig) {
    if (!config.smtp) {
        throw new Error('SMTP configuration is required for email delivery');
    }
    const remote = await resolveSafeRemoteAddress(config.smtp.host);
    return nodemailer.createTransport({
        host: remote.address,
        port: config.smtp.port,
        secure: config.smtp.secure ?? (config.smtp.port === 465),
        name: remote.hostname,
        tls: {
            servername: remote.hostname,
        },
        auth: config.smtp.auth ? {
            user: config.smtp.auth.user,
            pass: config.smtp.auth.pass,
        } : undefined,
    });
}

/**
 * Escape HTML special characters to prevent XSS attacks
 */
function escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
    };
    return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Deliver content via email attachment
 */
export async function deliverToEmail(
    config: ResolvedEmailDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    if (!config.smtp) {
        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.EMAIL,
            filename,
            size: content.length,
            error: 'SMTP configuration is required for email delivery',
        };
    }

    let transporter: Awaited<ReturnType<typeof createTransport>> | undefined;
    try {
        transporter = await createTransport(config);

        const mimeType = options?.mimeType || getMimeType(filename);

        const mailOptions: nodemailer.SendMailOptions = {
            from: config.from || config.smtp.auth?.user,
            to: config.to.join(', '),
            cc: config.cc?.join(', '),
            bcc: config.bcc?.join(', '),
            subject: config.subject,
            text: config.body || `Please find attached: ${filename}`,
            html: config.body ? `<p>${escapeHtml(config.body)}</p>` : `<p>Please find attached: <strong>${escapeHtml(filename)}</strong></p>`,
            attachments: [
                {
                    filename,
                    content,
                    contentType: mimeType,
                },
            ],
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email: Sent ${filename}`, { recipients: config.to.join(', ') });

        return {
            success: true,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.EMAIL,
            filename,
            size: content.length,
            deliveredAt: new Date(),
            location: `mailto:${config.to.join(',')}`,
            metadata: {
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
            },
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error(`Email: Failed to send ${filename}`, toErrorOrUndefined(error));

        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.EMAIL,
            filename,
            size: content.length,
            error: errorMessage,
        };
    } finally {
        transporter?.close();
    }
}

export async function testEmailDestination(
    config: ResolvedEmailDestinationConfig,
    start: number,
): Promise<ConnectionTestResult> {
    try {
        const transporter = await createTransport(config);
        try {
            await transporter.verify();
        } finally {
            transporter.close();
        }
        return {
            success: true,
            message: 'SMTP server is reachable and accepted the configured credentials',
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
            latencyMs: Date.now() - start,
        };
    }
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return EXTENSION_MIME_MAP[ext] ?? CONTENT_TYPES.OCTET_STREAM;
}
