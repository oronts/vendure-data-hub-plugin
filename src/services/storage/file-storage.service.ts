import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import * as crypto from 'crypto';
import * as path from 'path';
import { FILE_STORAGE, LOGGER_CONTEXTS, SCHEDULER } from '../../constants/index';
import { ensureError, getErrorMessage } from '../../utils/error.utils';
import { generateTimestampedId } from '../../utils/id-generation.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import {
    cloneStoredFile,
    createStoragePath,
    createMetadataPrefix,
    getMetadataPath,
    isStoredFileId,
    MAX_METADATA_SIZE_BYTES,
    METADATA_SUFFIX,
    normalizeMimeType,
    parsePersistedMetadata,
    resolveFileExpiry,
    StoredFile,
    toPersistedMetadata,
    validateFileDescriptor,
    validateFileSignature,
} from './file-storage-metadata';
import { createStorageBackendFromEnv } from './storage-backend.factory';
import { StorageBackend } from './storage-backend.interface';

export type { StoredFile } from './file-storage-metadata';
export { isStoredFileId } from './file-storage-metadata';

interface UploadResult {
    success: boolean;
    file?: StoredFile;
    error?: string;
}

interface StorageOptions {
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    expiresInMinutes?: number;
    metadata?: Record<string, unknown>;
}

const STRICT_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

@Injectable()
export class FileStorageService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly backend: StorageBackend;
    private readonly fileIndex = new Map<string, StoredFile>();
    private cleanupHandle: ReturnType<typeof setInterval> | null = null;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_STORAGE_SERVICE);
        this.backend = createStorageBackendFromEnv();
    }

    async onModuleInit(): Promise<void> {
        await this.backend.init();
        await this.rebuildIndex();
        await this.cleanupExpiredFiles();
        this.startCleanupJob();

        this.logger.info('FileStorageService initialized', {
            backendType: this.backend.type,
            cleanupIntervalMs: SCHEDULER.FILE_CLEANUP_INTERVAL_MS,
            recoveredFiles: this.fileIndex.size,
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = null;
            this.logger.debug('File storage cleanup job stopped');
        }
        await this.backend.close?.();
    }

    async storeFile(
        ctx: RequestContext,
        buffer: Buffer,
        originalName: string,
        mimeType: string,
        options: StorageOptions = {},
    ): Promise<UploadResult> {
        let storagePath: string | null = null;
        let metadataPath: string | null = null;
        try {
            const channelId = this.getChannelId(ctx);
            const maxSize = Math.min(
                options.maxFileSize ?? FILE_STORAGE.MAX_FILE_SIZE_BYTES,
                FILE_STORAGE.MAX_FILE_SIZE_BYTES,
            );
            if (!Number.isFinite(maxSize) || maxSize <= 0) {
                throw new Error('Maximum file size must be a positive number');
            }
            if (buffer.length > maxSize) {
                return {
                    success: false,
                    error: 'File size ' + buffer.length + ' exceeds maximum ' + maxSize + ' bytes',
                };
            }
            if (this.countFilesForChannel(channelId) >= FILE_STORAGE.MAX_FILE_INDEX_SIZE) {
                return { success: false, error: 'File limit reached for channel ' + channelId };
            }

            const safeName = validateFileDescriptor(originalName, mimeType, options.allowedMimeTypes);
            validateFileSignature(buffer, safeName);
            const normalizedMimeType = normalizeMimeType(mimeType);
            const fileId = generateTimestampedId('file', 16);
            const extension = path.posix.extname(safeName).toLowerCase();
            storagePath = createStoragePath(channelId, fileId, extension);
            metadataPath = getMetadataPath(channelId, fileId);
            if (await this.backend.exists(storagePath) || await this.backend.exists(metadataPath)) {
                throw new Error('Generated file ID already exists');
            }

            const storedFile: StoredFile = {
                id: fileId,
                originalName: safeName,
                storagePath,
                mimeType: normalizedMimeType,
                size: buffer.length,
                hash: crypto.createHash('sha256').update(buffer).digest('hex'),
                channelId,
                uploadedByUserId: ctx.activeUserId?.toString(),
                uploadedAt: new Date(),
                expiresAt: resolveFileExpiry(options.expiresInMinutes),
                metadata: options.metadata,
            };

            await this.backend.write(storagePath, buffer);
            const metadataBuffer = Buffer.from(JSON.stringify(toPersistedMetadata(storedFile)), 'utf-8');
            if (metadataBuffer.length > MAX_METADATA_SIZE_BYTES) {
                throw new Error('File metadata exceeds the maximum allowed size');
            }
            await this.backend.write(metadataPath, metadataBuffer);
            this.fileIndex.set(fileId, storedFile);

            this.logger.info('Stored file successfully', {
                fileId,
                channelId,
                size: buffer.length,
                mimeType: normalizedMimeType,
                backendType: this.backend.type,
                expiresAt: storedFile.expiresAt?.toISOString(),
            });
            return { success: true, file: cloneStoredFile(storedFile) };
        } catch (error) {
            if (storagePath && metadataPath) {
                await this.cleanupFailedStore(storagePath, metadataPath);
            }
            this.logger.error('Failed to store file', ensureError(error), {
                originalName,
                mimeType,
                size: buffer.length,
            });
            return { success: false, error: getErrorMessage(error) };
        }
    }

    async storeBase64(
        ctx: RequestContext,
        base64Data: string,
        originalName: string,
        mimeType: string,
        options: StorageOptions = {},
    ): Promise<UploadResult> {
        try {
            const dataUri = base64Data.match(/^data:([^;,]+);base64,(.*)$/s);
            if (dataUri && normalizeMimeType(dataUri[1]) !== normalizeMimeType(mimeType)) {
                throw new Error('Data URI MIME type does not match the declared MIME type');
            }
            const payload = (dataUri?.[2] ?? base64Data).replace(/\s/g, '');
            if (!STRICT_BASE64_PATTERN.test(payload)) {
                throw new Error('Content is not valid base64');
            }
            return this.storeFile(ctx, Buffer.from(payload, 'base64'), originalName, mimeType, options);
        } catch (error) {
            return { success: false, error: getErrorMessage(error) };
        }
    }

    async getFile(ctx: RequestContext, fileId: string): Promise<StoredFile | null> {
        const file = await this.getAccessibleFile(ctx, fileId);
        return file ? cloneStoredFile(file) : null;
    }

    async readFile(ctx: RequestContext, fileId: string): Promise<Buffer | null> {
        const file = await this.getAccessibleFile(ctx, fileId);
        if (!file) return null;

        const buffer = await this.backend.read(file.storagePath);
        if (!buffer) return null;
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (buffer.length !== file.size || hash !== file.hash) {
            this.logger.error('Stored file failed its integrity check', undefined, {
                fileId,
                channelId: file.channelId,
                expectedSize: file.size,
                actualSize: buffer.length,
            });
            return null;
        }
        return buffer;
    }

    async readFileAsString(
        ctx: RequestContext,
        fileId: string,
        encoding: BufferEncoding = 'utf-8',
    ): Promise<string | null> {
        const buffer = await this.readFile(ctx, fileId);
        return buffer?.toString(encoding) ?? null;
    }

    async deleteFile(ctx: RequestContext, fileId: string): Promise<boolean> {
        const file = await this.getAccessibleFile(ctx, fileId);
        return file ? this.deleteStoredFile(file) : false;
    }

    async getFileUrl(
        ctx: RequestContext,
        fileId: string,
        expiresInSeconds?: number,
    ): Promise<string | null> {
        const file = await this.getAccessibleFile(ctx, fileId);
        if (!file || !this.backend.getUrl) return null;
        return this.backend.getUrl(file.storagePath, expiresInSeconds);
    }

    async listFiles(
        ctx: RequestContext,
        options?: {
            limit?: number;
            offset?: number;
            filter?: {
                mimeType?: string;
                uploadedAfter?: Date;
                uploadedBefore?: Date;
            };
        },
    ): Promise<{ files: StoredFile[]; totalItems: number }> {
        const channelId = this.getChannelId(ctx);
        await this.refreshChannelIndex(channelId);
        await this.cleanupExpiredFiles();
        let files = Array.from(this.fileIndex.values()).filter(file => file.channelId === channelId);

        if (options?.filter?.mimeType) {
            const mimeType = normalizeMimeType(options.filter.mimeType);
            files = files.filter(file => file.mimeType === mimeType);
        }
        if (options?.filter?.uploadedAfter) {
            const uploadedAfter = options.filter.uploadedAfter;
            files = files.filter(file => file.uploadedAt >= uploadedAfter);
        }
        if (options?.filter?.uploadedBefore) {
            const uploadedBefore = options.filter.uploadedBefore;
            files = files.filter(file => file.uploadedAt <= uploadedBefore);
        }

        files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
        const totalItems = files.length;
        const offset = Math.max(0, options?.offset ?? 0);
        const limit = options?.limit === undefined ? files.length : Math.max(0, options.limit);
        return {
            files: files.slice(offset, offset + limit).map(file => cloneStoredFile(file)),
            totalItems,
        };
    }

    async getStorageStats(ctx: RequestContext): Promise<{
        totalFiles: number;
        totalSize: number;
        backendType: string;
        byMimeType: Record<string, { count: number; size: number }>;
    }> {
        const channelId = this.getChannelId(ctx);
        await this.refreshChannelIndex(channelId);
        await this.cleanupExpiredFiles();
        const files = Array.from(this.fileIndex.values()).filter(file => file.channelId === channelId);
        const byMimeType: Record<string, { count: number; size: number }> = {};
        let totalSize = 0;

        for (const file of files) {
            totalSize += file.size;
            const current = byMimeType[file.mimeType] ?? { count: 0, size: 0 };
            current.count++;
            current.size += file.size;
            byMimeType[file.mimeType] = current;
        }

        return {
            totalFiles: files.length,
            totalSize,
            backendType: this.backend.type,
            byMimeType,
        };
    }

    private async rebuildIndex(): Promise<void> {
        try {
            const metadataFiles = (await this.backend.list(''))
                .filter(storagePath => storagePath.endsWith(METADATA_SUFFIX));
            for (const metadataPath of metadataFiles) {
                const storedFile = await this.loadMetadataFile(metadataPath);
                if (storedFile) this.fileIndex.set(storedFile.id, storedFile);
            }
        } catch (error) {
            this.logger.warn('Failed to rebuild file index from storage backend', {
                error: getErrorMessage(error),
            });
        }
    }

    private async refreshChannelIndex(channelId: string): Promise<void> {
        const metadataFiles = (await this.backend.list(createMetadataPrefix(channelId)))
            .filter(storagePath => storagePath.endsWith(METADATA_SUFFIX));
        const recoveredIds = new Set<string>();

        for (const metadataPath of metadataFiles) {
            const storedFile = await this.loadMetadataFile(metadataPath);
            if (!storedFile || storedFile.channelId !== channelId) continue;
            recoveredIds.add(storedFile.id);
            this.fileIndex.set(storedFile.id, storedFile);
        }

        for (const [fileId, file] of this.fileIndex) {
            if (file.channelId === channelId && !recoveredIds.has(fileId)) {
                this.fileIndex.delete(fileId);
            }
        }
    }

    private async loadMetadataFile(metadataPath: string): Promise<StoredFile | null> {
        try {
            const metadataBuffer = await this.backend.read(metadataPath);
            if (!metadataBuffer || metadataBuffer.length > MAX_METADATA_SIZE_BYTES) return null;
            const parsed: unknown = JSON.parse(metadataBuffer.toString('utf-8'));
            const storedFile = parsePersistedMetadata(parsed);
            if (!storedFile ||
                getMetadataPath(storedFile.channelId, storedFile.id) !== metadataPath ||
                !(await this.backend.exists(storedFile.storagePath))) {
                return null;
            }
            return storedFile;
        } catch (error) {
            this.logger.warn('Skipped invalid file metadata during storage recovery', {
                metadataPath,
                error: getErrorMessage(error),
            });
            return null;
        }
    }

    private async getAccessibleFile(ctx: RequestContext, fileId: string): Promise<StoredFile | null> {
        if (!isStoredFileId(fileId)) return null;
        const channelId = this.getChannelId(ctx);
        const metadataPath = getMetadataPath(channelId, fileId);
        const file = await this.loadMetadataFile(metadataPath);
        if (!file || file.channelId !== channelId) {
            this.fileIndex.delete(fileId);
            return null;
        }
        this.fileIndex.set(fileId, file);
        if (file.expiresAt && file.expiresAt <= new Date()) {
            await this.deleteStoredFile(file);
            return null;
        }
        return file;
    }

    private async cleanupExpiredFiles(): Promise<void> {
        const now = new Date();
        const expired = Array.from(this.fileIndex.values())
            .filter(file => file.expiresAt && file.expiresAt <= now);

        let deleted = 0;
        for (const file of expired) {
            if (await this.deleteStoredFile(file)) deleted++;
        }
        if (deleted > 0) {
            this.logger.info('Cleaned up expired files', { filesDeleted: deleted });
        }
    }

    private async deleteStoredFile(file: StoredFile): Promise<boolean> {
        try {
            const dataDeleted = await this.deleteStorageObject(file.storagePath);
            const metadataDeleted = await this.deleteStorageObject(
                getMetadataPath(file.channelId, file.id),
            );
            if (!dataDeleted || !metadataDeleted) return false;
            this.fileIndex.delete(file.id);
            this.logger.debug('Deleted file', {
                fileId: file.id,
                channelId: file.channelId,
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to delete file', ensureError(error), { fileId: file.id });
            return false;
        }
    }

    private async deleteStorageObject(storagePath: string): Promise<boolean> {
        if (!(await this.backend.exists(storagePath))) return true;
        return this.backend.delete(storagePath);
    }


    private async cleanupFailedStore(storagePath: string, metadataPath: string): Promise<void> {
        for (const candidate of [storagePath, metadataPath]) {
            try {
                await this.deleteStorageObject(candidate);
            } catch (error) {
                this.logger.warn('Failed to clean up a partial file upload', {
                    storagePath: candidate,
                    error: getErrorMessage(error),
                });
            }
        }
    }

    private startCleanupJob(): void {
        this.cleanupHandle = setInterval(() => {
            void this.cleanupExpiredFiles();
        }, SCHEDULER.FILE_CLEANUP_INTERVAL_MS);
        this.cleanupHandle.unref();
    }

    private getChannelId(ctx: RequestContext): string {
        const channelId = ctx.channelId?.toString();
        if (!channelId) throw new Error('An active channel is required for file storage');
        return channelId;
    }

    private countFilesForChannel(channelId: string): number {
        return Array.from(this.fileIndex.values()).filter(file => file.channelId === channelId).length;
    }
}
