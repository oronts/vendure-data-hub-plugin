/**
 * Email Destination Handler
 *
 * Handles delivery via email attachment using nodemailer.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { LOGGER_CONTEXTS } from '../../constants/index';
import { EmailDestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { DataHubLogger } from '../logger';

const logger = new DataHubLogger(LOGGER_CONTEXTS.EMAIL_HANDLER);

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
 * Default SMTP configuration for common providers
 */
const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
    gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
    outlook: { host: 'smtp.office365.com', port: 587, secure: false },
    sendgrid: { host: 'smtp.sendgrid.net', port: 587, secure: false },
};

/**
 * Deliver content via email attachment
 */
export async function deliverToEmail(
    config: EmailDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    if (!config.smtp) {
        logger.warn('Email: SMTP not configured, saving attachment locally');
        return await saveEmailLocally(config, content, filename);
    }

    try {
        const transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure ?? (config.smtp.port === 465),
            auth: config.smtp.auth ? {
                user: config.smtp.auth.user,
                pass: config.smtp.auth.pass,
            } : undefined,
        });

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
        const errorMessage = error instanceof Error ? error.message : 'Email delivery failed';
        logger.error(`Email: Failed to send ${filename}`, error instanceof Error ? error : undefined);

        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.EMAIL,
            filename,
            size: content.length,
            error: errorMessage,
        };
    }
}

/**
 * Test email configuration
 */
export async function testEmailConnection(config: EmailDestinationConfig): Promise<{
    success: boolean;
    message?: string;
    latencyMs?: number;
}> {
    if (!config.smtp) {
        return { success: false, message: 'SMTP configuration not provided' };
    }

    const start = Date.now();

    try {
        const transporter = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure ?? (config.smtp.port === 465),
            auth: config.smtp.auth ? {
                user: config.smtp.auth.user,
                pass: config.smtp.auth.pass,
            } : undefined,
        });

        await transporter.verify();

        return {
            success: true,
            message: `SMTP connection verified (${config.smtp.host}:${config.smtp.port})`,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Connection verification failed',
            latencyMs: Date.now() - start,
        };
    }
}

/**
 * Get SMTP preset configuration
 */
export function getSMTPPreset(provider: keyof typeof SMTP_PRESETS): typeof SMTP_PRESETS[string] | undefined {
    return SMTP_PRESETS[provider];
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.txt': 'text/plain',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Save email attachment locally when SMTP not configured
 */
async function saveEmailLocally(
    config: EmailDestinationConfig,
    content: Buffer,
    filename: string,
): Promise<DeliveryResult> {
    const localDir = path.join(process.cwd(), 'exports', 'email-staging', config.id);
    const localPath = path.join(localDir, filename);

    // Create directory if it doesn't exist (recursive: true handles both cases)
    await fs.mkdir(localDir, { recursive: true });

    await fs.writeFile(localPath, content);

    // Save email metadata
    const metadataPath = path.join(localDir, `${filename}.meta.json`);
    await fs.writeFile(metadataPath, JSON.stringify({
        to: config.to,
        cc: config.cc,
        bcc: config.bcc,
        subject: config.subject,
        body: config.body,
        attachment: filename,
        createdAt: new Date().toISOString(),
    }, null, 2));

    return {
        success: true,
        destinationId: config.id,
        destinationType: DESTINATION_TYPE.EMAIL,
        filename,
        size: content.length,
        deliveredAt: new Date(),
        location: `mailto:${config.to.join(',')}`,
        metadata: {
            localStaging: true,
            localPath,
            metadataPath,
            message: 'SMTP not configured - attachment saved locally for manual sending',
            recipients: config.to,
            subject: config.subject,
        },
    };
}
