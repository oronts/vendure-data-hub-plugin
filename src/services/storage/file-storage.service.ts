import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
    RequestContext,
    ConfigService,
} from '@vendure/core';
import * as crypto from 'crypto';
import * as path from 'path';
import { LOGGER_CONTEXTS, FILE_STORAGE, SCHEDULER, CONTENT_TYPES, EXTENSION_MIME_MAP } from '../../constants/index';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { StorageBackend } from './storage-backend.interface';
import { createStorageBackendFromEnv } from './storage-backend.factory';
import { getErrorMessage, ensureError } from '../../utils/error.utils';
import { generateTimestampedId } from '../../utils/id-generation.utils';

export interface StoredFile {
    id: string;
    originalName: string;
    storagePath: string;
    mimeType: string;
    size: number;
    hash: string;
    uploadedAt: Date;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
}

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

const DEFAULT_MAX_FILE_SIZE = FILE_STORAGE.MAX_FILE_SIZE_BYTES;
const DEFAULT_ALLOWED_TYPES = [
    CONTENT_TYPES.CSV,
    CONTENT_TYPES.PLAIN,
    CONTENT_TYPES.JSON,
    CONTENT_TYPES.XML,
    'text/xml',
    EXTENSION_MIME_MAP['.xls'],
    EXTENSION_MIME_MAP['.xlsx'],
];

@Injectable()
export class FileStorageService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private backend: StorageBackend;
    private fileIndex: Map<string, StoredFile> = new Map();
    private cleanupHandle: ReturnType<typeof setInterval> | null = null;

    constructor(
        private configService: ConfigService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_STORAGE_SERVICE);
        this.backend = createStorageBackendFromEnv();
    }

    async onModuleDestroy(): Promise<void> {
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = null;
            this.logger.debug('File storage cleanup job stopped');
        }
    }

    async onModuleInit() {
        await this.backend.init();
        await this.rebuildIndex();
        this.startCleanupJob();

        this.logger.info('FileStorageService initialized', {
            backendType: this.backend.type,
            cleanupIntervalMs: SCHEDULER.FILE_CLEANUP_INTERVAL_MS,
            recoveredFiles: this.fileIndex.size,
        });
    }

    async storeFile(
        ctx: RequestContext,
        buffer: Buffer,
        originalName: string,
        mimeType: string,
        options: StorageOptions = {},
    ): Promise<UploadResult> {
        try {
            const maxSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
            if (buffer.length > maxSize) {
                return {
                    success: false,
                    error: `File size ${buffer.length} exceeds maximum ${maxSize} bytes`,
                };
            }

            const allowedTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_TYPES;
            if (!this.isAllowedMimeType(mimeType, allowedTypes)) {
                return {
                    success: false,
                    error: `File type ${mimeType} is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
                };
            }

            const fileId = this.generateFileId();
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');

            const datePath = this.getDatePath();
            const storagePath = path.join(datePath, `${fileId}${path.extname(originalName)}`);

            await this.backend.write(storagePath, buffer);

            const expiresAt = options.expiresInMinutes
                ? new Date(Date.now() + options.expiresInMinutes * 60 * 1000)
                : undefined;

            const storedFile: StoredFile = {
                id: fileId,
                originalName,
                storagePath,
                mimeType,
                size: buffer.length,
                hash,
                uploadedAt: new Date(),
                expiresAt,
                metadata: options.metadata,
            };

            this.evictOldestFromIndex();
            this.fileIndex.set(fileId, storedFile);

            this.logger.info('Stored file successfully', {
                fileId,
                originalName,
                size: buffer.length,
                mimeType,
                backendType: this.backend.type,
                expiresAt: expiresAt?.toISOString(),
            });

            return { success: true, file: storedFile };
        } catch (error) {
            this.logger.error('Failed to store file', ensureError(error), {
                originalName,
                mimeType,
                size: buffer.length,
            });
            return {
                success: false,
                error: getErrorMessage(error),
            };
        }
    }

    async storeBase64(
        ctx: RequestContext,
        base64Data: string,
        originalName: string,
        mimeType: string,
        options: StorageOptions = {},
    ): Promise<UploadResult> {
        const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        return this.storeFile(ctx, buffer, originalName, mimeType, options);
    }

    async getFile(fileId: string): Promise<StoredFile | null> {
        return this.fileIndex.get(fileId) ?? null;
    }

    async readFile(fileId: string): Promise<Buffer | null> {
        const file = this.fileIndex.get(fileId);
        if (!file) return null;
        return this.backend.read(file.storagePath);
    }

    async readFileAsString(fileId: string, encoding: BufferEncoding = 'utf-8'): Promise<string | null> {
        const buffer = await this.readFile(fileId);
        if (!buffer) return null;
        return buffer.toString(encoding);
    }

    async deleteFile(fileId: string): Promise<boolean> {
        const file = this.fileIndex.get(fileId);
        if (!file) return false;

        try {
            await this.backend.delete(file.storagePath);
            this.fileIndex.delete(fileId);
            this.logger.debug('Deleted file', { fileId, originalName: file.originalName });
            return true;
        } catch (error) {
            this.logger.error('Failed to delete file', ensureError(error), { fileId });
            return false;
        }
    }

    async getFileUrl(fileId: string, expiresInSeconds?: number): Promise<string | null> {
        const file = this.fileIndex.get(fileId);
        if (!file) return null;

        if (this.backend.getUrl) {
            return this.backend.getUrl(file.storagePath, expiresInSeconds);
        }

        return null;
    }

    async listFiles(options?: {
        limit?: number;
        offset?: number;
        filter?: {
            mimeType?: string;
            uploadedAfter?: Date;
            uploadedBefore?: Date;
        };
    }): Promise<{ files: StoredFile[]; totalItems: number }> {
        let files = Array.from(this.fileIndex.values());

        if (options?.filter) {
            const { mimeType, uploadedAfter, uploadedBefore } = options.filter;
            if (mimeType) {
                files = files.filter(f => f.mimeType === mimeType);
            }
            if (uploadedAfter) {
                files = files.filter(f => f.uploadedAt >= uploadedAfter);
            }
            if (uploadedBefore) {
                files = files.filter(f => f.uploadedAt <= uploadedBefore);
            }
        }

        files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

        const totalItems = files.length;

        if (options?.offset) {
            files = files.slice(options.offset);
        }
        if (options?.limit) {
            files = files.slice(0, options.limit);
        }

        return { files, totalItems };
    }

    async getStorageStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        backendType: string;
        byMimeType: Record<string, { count: number; size: number }>;
    }> {
        const files = Array.from(this.fileIndex.values());
        const byMimeType: Record<string, { count: number; size: number }> = {};

        let totalSize = 0;
        for (const file of files) {
            totalSize += file.size;
            if (!byMimeType[file.mimeType]) {
                byMimeType[file.mimeType] = { count: 0, size: 0 };
            }
            byMimeType[file.mimeType].count++;
            byMimeType[file.mimeType].size += file.size;
        }

        return {
            totalFiles: files.length,
            totalSize,
            backendType: this.backend.type,
            byMimeType,
        };
    }

    /**
     * Rebuild the in-memory file index by scanning existing files from the storage backend.
     * This ensures the index is recovered after a service restart.
     * Only basic metadata (path, name, size) can be recovered; original upload metadata
     * (hash, mimeType, expiresAt, custom metadata) are not available from the storage backend.
     */
    private async rebuildIndex(): Promise<void> {
        try {
            const files = await this.backend.list('');
            let recovered = 0;
            for (const storagePath of files) {
                // Extract file ID from path: paths are like "2026/01/15/file_12345_abc.csv"
                const fileName = path.basename(storagePath);
                const fileIdMatch = fileName.match(/^(file_[a-z0-9]+_[a-f0-9]+)/);
                if (!fileIdMatch) continue;

                const fileId = fileIdMatch[1];
                // Skip if already in the index (e.g. from a previous call)
                if (this.fileIndex.has(fileId)) continue;

                // Read file to compute size; skip files that can't be read
                const buffer = await this.backend.read(storagePath);
                if (!buffer) continue;

                const ext = path.extname(fileName).toLowerCase();
                const mimeType = this.inferMimeType(ext);

                const storedFile: StoredFile = {
                    id: fileId,
                    originalName: fileName,
                    storagePath,
                    mimeType,
                    size: buffer.length,
                    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
                    uploadedAt: new Date(),
                };

                this.fileIndex.set(fileId, storedFile);
                recovered++;
            }

            if (recovered > 0) {
                this.logger.info('Rebuilt file index from storage backend', {
                    recoveredFiles: recovered,
                });
            }
        } catch (error) {
            this.logger.warn(
                'Failed to rebuild file index from storage backend',
                {
                    error: getErrorMessage(error),
                },
            );
        }
    }

    /**
     * Infer MIME type from file extension for index recovery.
     * Only covers types relevant to DataHub file storage.
     */
    private inferMimeType(ext: string): string {
        return EXTENSION_MIME_MAP[ext] ?? CONTENT_TYPES.OCTET_STREAM;
    }

    private startCleanupJob() {
        this.cleanupHandle = setInterval(() => {
            this.cleanupExpiredFiles();
        }, SCHEDULER.FILE_CLEANUP_INTERVAL_MS);
        this.cleanupHandle.unref();
    }

    private async cleanupExpiredFiles() {
        const now = new Date();
        const expiredFiles: string[] = [];

        for (const [id, file] of this.fileIndex.entries()) {
            if (file.expiresAt && file.expiresAt <= now) {
                expiredFiles.push(id);
            }
        }

        for (const fileId of expiredFiles) {
            await this.deleteFile(fileId);
        }

        if (expiredFiles.length > 0) {
            this.logger.info('Cleaned up expired files', { filesDeleted: expiredFiles.length });
        }
    }

    /**
     * Evict oldest files from the in-memory index when it exceeds MAX_FILE_INDEX_SIZE.
     * Sorts by uploadedAt (oldest first) and removes FILE_INDEX_EVICTION_RATIO of entries.
     * Only removes from the index; does not delete the underlying storage files.
     */
    private evictOldestFromIndex(): void {
        const maxSize = FILE_STORAGE.MAX_FILE_INDEX_SIZE;
        if (this.fileIndex.size < maxSize) return;

        const evictCount = Math.ceil(maxSize * FILE_STORAGE.FILE_INDEX_EVICTION_RATIO);
        const sorted = Array.from(this.fileIndex.entries())
            .sort((a, b) => a[1].uploadedAt.getTime() - b[1].uploadedAt.getTime());

        const toEvict = sorted.slice(0, evictCount);
        for (const [id] of toEvict) {
            this.fileIndex.delete(id);
        }

        this.logger.info('Evicted oldest entries from file index', {
            evictedCount: toEvict.length,
            remainingCount: this.fileIndex.size,
            maxSize,
        });
    }

    private generateFileId(): string {
        return generateTimestampedId('file', 16);
    }

    private getDatePath(): string {
        const now = new Date();
        return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    }

    private isAllowedMimeType(mimeType: string, allowedTypes: string[]): boolean {
        const normalizedType = mimeType.toLowerCase().split(';')[0].trim();

        return allowedTypes.some(allowed => {
            if (allowed === '*/*') return true;
            if (allowed.endsWith('/*')) {
                const prefix = allowed.slice(0, -2);
                return normalizedType.startsWith(prefix);
            }
            return normalizedType === allowed.toLowerCase();
        });
    }
}
