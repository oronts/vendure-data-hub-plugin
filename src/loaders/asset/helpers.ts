import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { Readable } from 'stream';
import { MIME_TYPES } from './types';
import { DEFAULTS } from '../../constants/index';

export async function downloadFile(url: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const request = protocol.get(url, { timeout: DEFAULTS.HTTP_TIMEOUT_MS }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    downloadFile(redirectUrl).then(resolve);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                resolve(null);
                return;
            }

            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', () => resolve(null));
        });

        request.on('error', () => resolve(null));
        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
    });
}

export function extractFilenameFromUrl(url: string): string {
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        const filename = path.basename(pathname);
        return filename || `asset-${Date.now()}`;
    } catch {
        return `asset-${Date.now()}`;
    }
}

export function getMimeType(url: string): string {
    const ext = path.extname(url).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

export function createReadStreamFromBuffer(data: Buffer): NodeJS.ReadableStream {
    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    return stream;
}

export function isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('connection') ||
            message.includes('temporarily') ||
            message.includes('network')
        );
    }
    return false;
}

export function shouldUpdateField(
    field: string,
    updateOnlyFields?: string[],
): boolean {
    if (!updateOnlyFields || updateOnlyFields.length === 0) {
        return true;
    }
    return updateOnlyFields.includes(field);
}
