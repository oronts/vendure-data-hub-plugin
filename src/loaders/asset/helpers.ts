import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { Readable } from 'stream';
import { MIME_TYPES } from './types';
import { HTTP, HTTP_STATUS } from '../../constants/index';
import { extractFileExtension } from '../../extractors/shared/file-format.utils';
import { assertUrlSafe } from '../../utils/url-security.utils';

export { shouldUpdateField, isRecoverableError } from '../shared-helpers';

const MAX_REDIRECTS = 5;

/**
 * Downloads a file from a URL.
 * Validates the URL against SSRF attacks before making the request.
 *
 * @param url - URL to download from
 * @param redirectCount - Internal counter for redirect depth limiting
 * @returns Buffer containing the file data, or null if download failed
 */
export async function downloadFile(url: string, redirectCount = 0): Promise<Buffer | null> {
    // Input validation
    if (!url || typeof url !== 'string') {
        return null;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        return null;
    }

    // SSRF protection
    try {
        await assertUrlSafe(url);
    } catch {
        return null;
    }

    // Redirect depth limit
    if (redirectCount >= MAX_REDIRECTS) {
        return null;
    }

    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;
        const request = protocol.get(url, { timeout: HTTP.TIMEOUT_MS }, (response) => {
            if (response.statusCode === HTTP_STATUS.MOVED_PERMANENTLY || response.statusCode === HTTP_STATUS.FOUND) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    response.resume();
                    request.destroy();
                    downloadFile(redirectUrl, redirectCount + 1).then(resolve).catch(() => resolve(null));
                    return;
                }
            }

            if (response.statusCode !== HTTP_STATUS.OK) {
                response.resume();
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
        // URL parsing failed - return fallback filename
        return `asset-${Date.now()}`;
    }
}

export function getMimeType(url: string): string {
    const ext = extractFileExtension(url);
    return MIME_TYPES[`.${ext}`] || 'application/octet-stream';
}

export function createReadStreamFromBuffer(data: Buffer): NodeJS.ReadableStream {
    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    return stream;
}

