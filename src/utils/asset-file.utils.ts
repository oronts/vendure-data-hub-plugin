import * as path from 'node:path';
import { Readable } from 'node:stream';
import { CONTENT_TYPES, EXTENSION_MIME_MAP } from '../constants/services';

export function extractFilenameFromUrl(url: string): string {
    try {
        const filename = path.basename(new URL(url).pathname);
        return filename || `asset-${Date.now()}`;
    } catch {
        return `asset-${Date.now()}`;
    }
}

export function getAssetMimeType(url: string): string {
    try {
        const extension = path.extname(new URL(url).pathname).toLowerCase();
        return EXTENSION_MIME_MAP[extension] ?? CONTENT_TYPES.OCTET_STREAM;
    } catch {
        return CONTENT_TYPES.OCTET_STREAM;
    }
}

export function createReadStreamFromBuffer(data: Buffer): NodeJS.ReadableStream {
    return Readable.from(data);
}
