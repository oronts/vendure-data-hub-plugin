import * as crypto from 'crypto';
import * as path from 'path';
import {
    CONTENT_TYPES,
    EXTENSION_MIME_MAP,
    FILE_STORAGE,
    TIME_UNITS,
} from '../../constants/index';

export interface StoredFile {
    id: string;
    originalName: string;
    storagePath: string;
    mimeType: string;
    size: number;
    hash: string;
    channelId: string;
    uploadedByUserId?: string;
    uploadedAt: Date;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
}

export interface PersistedFileMetadata {
    version: 1;
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    hash: string;
    channelId: string;
    storagePath: string;
    uploadedByUserId?: string;
    uploadedAt: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
}

export const METADATA_SUFFIX = '.metadata.json';
export const MAX_METADATA_SIZE_BYTES = 64 * 1024;

const MAX_ORIGINAL_NAME_LENGTH = 255;
const FILE_ID_PATTERN = /^file_[a-z0-9]+_[a-f0-9]{16}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const XLS_MIME = EXTENSION_MIME_MAP['.xls'];
const XLSX_MIME = EXTENSION_MIME_MAP['.xlsx'];

const FILE_TYPE_RULES: Readonly<Record<string, readonly string[]>> = {
    '.csv': [CONTENT_TYPES.CSV, CONTENT_TYPES.PLAIN, XLS_MIME, CONTENT_TYPES.OCTET_STREAM],
    '.json': [CONTENT_TYPES.JSON, CONTENT_TYPES.PLAIN, CONTENT_TYPES.OCTET_STREAM],
    '.xml': [CONTENT_TYPES.XML, 'text/xml', CONTENT_TYPES.PLAIN, CONTENT_TYPES.OCTET_STREAM],
    '.txt': [CONTENT_TYPES.PLAIN, CONTENT_TYPES.OCTET_STREAM],
    '.xls': [XLS_MIME, CONTENT_TYPES.OCTET_STREAM],
    '.xlsx': [XLSX_MIME, CONTENT_TYPES.OCTET_STREAM],
};

export const DEFAULT_ALLOWED_FILE_TYPES = Array.from(new Set(Object.values(FILE_TYPE_RULES).flat()));

export function isStoredFileId(value: string): boolean {
    return FILE_ID_PATTERN.test(value);
}

export function normalizeMimeType(mimeType: string): string {
    return mimeType.toLowerCase().split(';')[0].trim();
}

export function validateFileDescriptor(
    originalName: string,
    mimeType: string,
    allowedMimeTypes: readonly string[] = DEFAULT_ALLOWED_FILE_TYPES,
): string {
    if (typeof originalName !== 'string' || !originalName || originalName.length > MAX_ORIGINAL_NAME_LENGTH) {
        throw new Error('Filename must contain between 1 and 255 characters');
    }
    if (hasControlCharacter(originalName)) {
        throw new Error('Filename contains control characters');
    }
    const portableName = originalName.replace(/\\/g, '/');
    if (path.posix.basename(portableName) !== originalName || originalName === '.' || originalName === '..') {
        throw new Error('Filename must not contain path components');
    }

    const extension = path.posix.extname(originalName).toLowerCase();
    const allowedForExtension = FILE_TYPE_RULES[extension];
    if (!allowedForExtension) {
        throw new Error('Filename must use a supported data-file extension');
    }
    const normalizedMimeType = normalizeMimeType(mimeType);
    if (!isAllowedMimeType(normalizedMimeType, allowedMimeTypes) ||
        !allowedForExtension.includes(normalizedMimeType)) {
        throw new Error(`File type ${mimeType} does not match the ${extension} extension`);
    }
    return originalName;
}

export function validateFileSignature(content: Buffer, originalName: string): void {
    const extension = path.posix.extname(originalName).toLowerCase();
    if (extension === '.xlsx') {
        const isZip = content.length >= 4 &&
            content[0] === 0x50 && content[1] === 0x4b &&
            content[2] === 0x03 && content[3] === 0x04;
        if (!isZip) throw new Error('XLSX content does not have a valid ZIP signature');
    }
    if (extension === '.xls') {
        const isCompoundDocument = content.length >= 4 &&
            content[0] === 0xd0 && content[1] === 0xcf &&
            content[2] === 0x11 && content[3] === 0xe0;
        if (!isCompoundDocument) throw new Error('XLS content does not have a valid compound-file signature');
    }
}

export function resolveFileExpiry(expiresInMinutes?: number): Date | undefined {
    if (expiresInMinutes === undefined) return undefined;
    if (!Number.isSafeInteger(expiresInMinutes) || expiresInMinutes < 1 ||
        expiresInMinutes > FILE_STORAGE.MAX_EXPIRY_MINUTES) {
        throw new Error(`File expiry must be an integer from 1 to ${FILE_STORAGE.MAX_EXPIRY_MINUTES} minutes`);
    }
    return new Date(Date.now() + expiresInMinutes * TIME_UNITS.MINUTE);
}

export function createChannelStoragePrefix(channelId: string): string {
    const channelKey = crypto.createHash('sha256').update(channelId).digest('hex').slice(0, 24);
    return path.posix.join('channels', channelKey);
}

export function createStoragePath(
    channelId: string,
    fileId: string,
    extension: string,
    now = new Date(),
): string {
    const datePath = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('/');
    return path.posix.join(createChannelStoragePrefix(channelId), datePath, `${fileId}${extension}`);
}

export function createMetadataPrefix(channelId: string): string {
    return path.posix.join(createChannelStoragePrefix(channelId), 'metadata');
}

export function getMetadataPath(channelId: string, fileId: string): string {
    return path.posix.join(createMetadataPrefix(channelId), fileId + METADATA_SUFFIX);
}

export function toPersistedMetadata(file: StoredFile): PersistedFileMetadata {
    return {
        version: 1,
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        hash: file.hash,
        channelId: file.channelId,
        storagePath: file.storagePath,
        uploadedByUserId: file.uploadedByUserId,
        uploadedAt: file.uploadedAt.toISOString(),
        expiresAt: file.expiresAt?.toISOString(),
        metadata: file.metadata,
    };
}

export function parsePersistedMetadata(value: unknown): StoredFile | null {
    if (!isRecord(value) || value.version !== 1) return null;
    const requiredStrings = [
        value.id,
        value.originalName,
        value.mimeType,
        value.hash,
        value.channelId,
        value.uploadedAt,
        value.storagePath,
    ];
    if (requiredStrings.some(item => typeof item !== 'string')) return null;
    if (!isStoredFileId(value.id as string) || !SHA256_PATTERN.test(value.hash as string)) return null;
    if (!Number.isSafeInteger(value.size) || (value.size as number) < 0 ||
        (value.size as number) > FILE_STORAGE.MAX_FILE_SIZE_BYTES) {
        return null;
    }

    const uploadedAt = new Date(value.uploadedAt as string);
    const expiresAt = typeof value.expiresAt === 'string' ? new Date(value.expiresAt) : undefined;
    if (Number.isNaN(uploadedAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) return null;
    if (value.uploadedByUserId !== undefined && typeof value.uploadedByUserId !== 'string') return null;
    if (value.metadata !== undefined && !isRecord(value.metadata)) return null;

    const originalName = validateFileDescriptor(value.originalName as string, value.mimeType as string);
    const storagePath = value.storagePath as string;
    const extension = path.posix.extname(originalName).toLowerCase();
    const expectedPrefix = createChannelStoragePrefix(value.channelId as string);
    if (!storagePath.startsWith(`${expectedPrefix}/`)) return null;
    if (path.posix.basename(storagePath) !== `${value.id}${extension}`) return null;

    return {
        id: value.id as string,
        originalName,
        storagePath,
        mimeType: normalizeMimeType(value.mimeType as string),
        size: value.size as number,
        hash: value.hash as string,
        channelId: value.channelId as string,
        uploadedByUserId: value.uploadedByUserId as string | undefined,
        uploadedAt,
        expiresAt,
        metadata: value.metadata as Record<string, unknown> | undefined,
    };
}

export function cloneStoredFile(file: StoredFile): StoredFile {
    return {
        ...file,
        uploadedAt: new Date(file.uploadedAt),
        expiresAt: file.expiresAt ? new Date(file.expiresAt) : undefined,
        metadata: file.metadata ? { ...file.metadata } : undefined,
    };
}

function isAllowedMimeType(mimeType: string, allowedTypes: readonly string[]): boolean {
    return allowedTypes.some(allowed => {
        const normalizedAllowed = normalizeMimeType(allowed);
        if (normalizedAllowed === '*/*') return true;
        if (normalizedAllowed.endsWith('/*')) {
            return mimeType.startsWith(normalizedAllowed.slice(0, -1));
        }
        return mimeType === normalizedAllowed;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControlCharacter(value: string): boolean {
    return Array.from(value).some(character => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
    });
}
