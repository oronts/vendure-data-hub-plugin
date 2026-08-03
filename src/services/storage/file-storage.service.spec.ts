import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RequestContext } from '@vendure/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_STORAGE, PAGINATION } from '../../constants';
import { DataHubLoggerFactory } from '../logger';
import { getMetadataPath } from './file-storage-metadata';
import { FileStorageService } from './file-storage.service';
import type { StorageBackend } from './storage-backend.interface';

interface FileStorageInternals {
    readonly backend: StorageBackend;
    cleanupExpiredFiles(): Promise<void>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createContext(channelId: string, activeUserId?: string): RequestContext {
    return { channelId, activeUserId } as unknown as RequestContext;
}

describe('FileStorageService security boundaries', () => {
    let root: string;
    let previousStoragePath: string | undefined;
    let previousStorageType: string | undefined;
    const services: FileStorageService[] = [];
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    const loggerFactory = {
        createLogger: vi.fn(() => logger),
    } as unknown as DataHubLoggerFactory;

    beforeEach(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'data-hub-service-'));
        previousStoragePath = process.env.DATA_HUB_STORAGE_PATH;
        previousStorageType = process.env.DATA_HUB_STORAGE_TYPE;
        process.env.DATA_HUB_STORAGE_PATH = root;
        process.env.DATA_HUB_STORAGE_TYPE = 'local';
        vi.clearAllMocks();
    });

    afterEach(async () => {
        for (const service of services.splice(0)) {
            await service.onModuleDestroy();
        }
        vi.useRealTimers();
        if (previousStoragePath === undefined) delete process.env.DATA_HUB_STORAGE_PATH;
        else process.env.DATA_HUB_STORAGE_PATH = previousStoragePath;
        if (previousStorageType === undefined) delete process.env.DATA_HUB_STORAGE_TYPE;
        else process.env.DATA_HUB_STORAGE_TYPE = previousStorageType;
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    async function createService(): Promise<FileStorageService> {
        const service = new FileStorageService(loggerFactory);
        services.push(service);
        await service.onModuleInit();
        return service;
    }

    it('records ownership and prevents cross-channel metadata, content, stats, and deletion access', async () => {
        const service = await createService();
        const ownerContext = createContext('channel-a', 'user-17');
        const otherChannelContext = createContext('channel-b', 'user-17');
        const result = await service.storeFile(
            ownerContext,
            Buffer.from('sku\nA-1'),
            'products.csv',
            'text/csv',
            { expiresInMinutes: 60 },
        );

        expect(result.success).toBe(true);
        expect(result.file).toMatchObject({
            channelId: 'channel-a',
            uploadedByUserId: 'user-17',
        });
        const fileId = result.file!.id;
        await expect(service.getFile(otherChannelContext, fileId)).resolves.toBeNull();
        await expect(service.readFile(otherChannelContext, fileId)).resolves.toBeNull();
        await expect(service.listFiles(otherChannelContext)).resolves.toMatchObject({ totalItems: 0 });
        await expect(service.getStorageStats(otherChannelContext)).resolves.toMatchObject({ totalFiles: 0 });
        await expect(service.deleteFile(otherChannelContext, fileId)).resolves.toBe(false);

        await expect(service.readFile(ownerContext, fileId)).resolves.toEqual(Buffer.from('sku\nA-1'));
        await expect(service.deleteFile(ownerContext, fileId)).resolves.toBe(true);
    });

    it('recovers channel, owner, expiry, and custom metadata after restart', async () => {
        const context = createContext('channel-a', 'user-17');
        const firstService = await createService();
        const result = await firstService.storeFile(
            context,
            Buffer.from('{"sku":"A-1"}'),
            'product.json',
            'application/json',
            { expiresInMinutes: 60, metadata: { source: 'import' } },
        );
        const original = result.file!;
        await firstService.onModuleDestroy();

        const recoveredService = await createService();
        const recovered = await recoveredService.getFile(context, original.id);

        expect(recovered).toMatchObject({
            id: original.id,
            channelId: 'channel-a',
            uploadedByUserId: 'user-17',
            metadata: { source: 'import' },
        });
        expect(recovered?.uploadedAt.toISOString()).toBe(original.uploadedAt.toISOString());
        expect(recovered?.expiresAt?.toISOString()).toBe(original.expiresAt?.toISOString());
        await expect(recoveredService.getFile(createContext('channel-b'), original.id)).resolves.toBeNull();
    });

    it('removes expired data and metadata immediately during restart recovery', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'));
        const context = createContext('channel-a', 'user-17');
        const firstService = await createService();
        const result = await firstService.storeFile(
            context,
            Buffer.from('temporary'),
            'temporary.txt',
            'text/plain',
            { expiresInMinutes: 1 },
        );
        await firstService.onModuleDestroy();

        vi.setSystemTime(new Date('2026-07-15T10:02:00.000Z'));
        const recoveredService = await createService();

        await expect(recoveredService.getFile(context, result.file!.id)).resolves.toBeNull();
        await expect(recoveredService.listFiles(context)).resolves.toMatchObject({ totalItems: 0 });
        const remainingEntries = await fs.promises.readdir(root, { recursive: true });
        expect(remainingEntries.some(entry => String(entry).includes(result.file!.id))).toBe(false);
    });

    it('drains one active expiry cleanup before closing the backend', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'));
        const service = await createService();
        const result = await service.storeFile(
            createContext('channel-a'),
            Buffer.from('temporary'),
            'temporary.txt',
            'text/plain',
            { expiresInMinutes: 1 },
        );
        expect(result.success).toBe(true);
        vi.setSystemTime(new Date('2026-07-15T10:02:00.000Z'));

        const internals = service as unknown as FileStorageInternals;
        const deletionStarted = deferred<void>();
        const deletionResult = deferred<boolean>();
        const originalDelete = internals.backend.delete.bind(internals.backend);
        const deleteSpy = vi.spyOn(internals.backend, 'delete')
            .mockImplementationOnce(async () => {
                deletionStarted.resolve();
                return deletionResult.promise;
            })
            .mockImplementation(originalDelete);
        const close = vi.fn(async () => undefined);
        internals.backend.close = close;

        const firstCleanup = internals.cleanupExpiredFiles();
        await deletionStarted.promise;
        const secondCleanup = internals.cleanupExpiredFiles();
        expect(secondCleanup).toBe(firstCleanup);

        const shutdown = service.onModuleDestroy();
        await Promise.resolve();
        expect(close).not.toHaveBeenCalled();
        deletionResult.resolve(true);
        await Promise.all([firstCleanup, secondCleanup, shutdown]);

        expect(deleteSpy).toHaveBeenCalledTimes(2);
        expect(close).toHaveBeenCalledOnce();
    });

    it('fails initialization and closes the backend when index recovery is unavailable', async () => {
        const service = new FileStorageService(loggerFactory);
        const internals = service as unknown as FileStorageInternals;
        const recoveryError = new Error('Storage unavailable');
        const close = vi.fn(async () => undefined);
        internals.backend.close = close;
        vi.spyOn(internals.backend, 'list').mockRejectedValue(recoveryError);

        await expect(service.onModuleInit()).rejects.toBe(recoveryError);
        expect(close).toHaveBeenCalledOnce();
    });

    it('propagates backend metadata failures without losing a valid file', async () => {
        const service = await createService();
        const context = createContext('channel-a', 'user-17');
        const result = await service.storeFile(
            context,
            Buffer.from('sku\nA-1'),
            'products.csv',
            'text/csv',
        );
        const internals = service as unknown as FileStorageInternals;
        const storageError = new Error('Storage authorization failed');
        vi.spyOn(internals.backend, 'read').mockRejectedValueOnce(storageError);

        await expect(service.getFile(context, result.file!.id)).rejects.toBe(storageError);
        await expect(service.getFile(context, result.file!.id)).resolves.toMatchObject({
            id: result.file!.id,
            channelId: 'channel-a',
        });
    });

    it('skips corrupt persisted metadata without failing initialization', async () => {
        const context = createContext('channel-a', 'user-17');
        const firstService = await createService();
        const result = await firstService.storeFile(
            context,
            Buffer.from('sku\nA-1'),
            'products.csv',
            'text/csv',
        );
        await firstService.onModuleDestroy();
        const metadataPath = getMetadataPath('channel-a', result.file!.id);
        await fs.promises.writeFile(path.join(root, metadataPath), '{invalid');

        const recoveredService = await createService();

        await expect(recoveredService.getFile(context, result.file!.id)).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
            'Skipped invalid file metadata during storage recovery',
            expect.objectContaining({ metadataPath }),
        );
    });

    it('removes dangling metadata after a partial deletion failure', async () => {
        const context = createContext('channel-a', 'user-17');
        const firstService = await createService();
        const result = await firstService.storeFile(
            context,
            Buffer.from('sku\nA-1'),
            'products.csv',
            'text/csv',
        );
        const internals = firstService as unknown as FileStorageInternals;
        const originalDelete = internals.backend.delete.bind(internals.backend);
        vi.spyOn(internals.backend, 'delete')
            .mockImplementationOnce(originalDelete)
            .mockRejectedValueOnce(new Error('Metadata deletion failed'));

        await expect(firstService.deleteFile(context, result.file!.id)).resolves.toBe(false);
        await firstService.onModuleDestroy();
        const metadataPath = getMetadataPath('channel-a', result.file!.id);
        await expect(fs.promises.access(path.join(root, metadataPath))).resolves.toBeUndefined();

        const recoveredService = await createService();

        await expect(recoveredService.getFile(context, result.file!.id)).resolves.toBeNull();
        await expect(fs.promises.access(path.join(root, metadataPath))).rejects.toThrow();
        expect(logger.warn).toHaveBeenCalledWith(
            'Removed file metadata whose content is missing',
            expect.objectContaining({ fileId: result.file!.id, metadataPath }),
        );
    });

    it('fails closed when stored content no longer matches its persisted hash', async () => {
        const service = await createService();
        const context = createContext('channel-a', 'user-17');
        const result = await service.storeFile(
            context,
            Buffer.from('sku\nA-1'),
            'products.csv',
            'text/csv',
        );
        await fs.promises.writeFile(path.join(root, result.file!.storagePath), 'tampered');

        await expect(service.readFile(context, result.file!.id)).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
            'Stored file failed its integrity check',
            undefined,
            expect.objectContaining({ fileId: result.file!.id }),
        );
    });

    it('rejects path-bearing filenames, MIME mismatches, and malformed base64', async () => {
        const service = await createService();
        const context = createContext('channel-a', 'user-17');

        await expect(service.storeFile(
            context,
            Buffer.from('unsafe'),
            '../products.csv',
            'text/csv',
        )).resolves.toMatchObject({ success: false, error: expect.stringContaining('path components') });
        await expect(service.storeFile(
            context,
            Buffer.from('{}'),
            'products.csv',
            'application/json',
        )).resolves.toMatchObject({ success: false, error: expect.stringContaining('does not match') });
        await expect(service.storeFile(
            context,
            Buffer.from('not-a-workbook'),
            'products.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('valid ZIP signature'),
        });
        await expect(service.storeBase64(
            context,
            'not-valid-%%%',
            'products.csv',
            'text/csv',
        )).resolves.toMatchObject({ success: false, error: 'Content is not valid base64' });
        await expect(service.storeBase64(
            context,
            'data:application/json;base64,e30=',
            'products.json',
            'text/plain',
        )).resolves.toMatchObject({
            success: false,
            error: 'Data URI MIME type does not match the declared MIME type',
        });
    });

    it('rejects invalid direct storage limits instead of normalizing them', async () => {
        const service = await createService();
        const context = createContext('channel-a', 'user-17');
        const content = Buffer.from('sku\nA-1');

        await expect(service.storeFile(
            context,
            content,
            'products.csv',
            'text/csv',
            { maxFileSize: FILE_STORAGE.MAX_FILE_SIZE_BYTES + 1 },
        )).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('Maximum file size must be an integer'),
        });
        await expect(service.storeFile(
            context,
            content,
            'products.csv',
            'text/csv',
            { expiresInMinutes: 1.5 },
        )).resolves.toMatchObject({
            success: false,
            error: expect.stringContaining('File expiry must be an integer'),
        });
        await expect(service.listFiles(context, { limit: PAGINATION.MAX_QUERY_LIMIT + 1 }))
            .rejects.toThrow('File list limit must be an integer');
        await expect(service.listFiles(context, { offset: -1 }))
            .rejects.toThrow('File list offset must be an integer');
    });
});
