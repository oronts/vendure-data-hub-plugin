import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { CONTENT_TYPES, EXTENSION_MIME_MAP } from '../constants/services';

const ASSET_FALLBACK_HASH_LENGTH = 16;

function fallbackAssetFilename(url: string): string {
    const identity = createHash('sha256')
        .update(url)
        .digest('hex')
        .slice(0, ASSET_FALLBACK_HASH_LENGTH);
    return `asset-${identity}`;
}

export function extractFilenameFromUrl(url: string): string {
    try {
        const filename = path.basename(new URL(url).pathname);
        return filename || fallbackAssetFilename(url);
    } catch {
        return fallbackAssetFilename(url);
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
