import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ftpConnection from '../../extractors/ftp/connection';
import type { FileWatcherConfig } from './file-watch-config';
import { FileWatchSourceService } from './file-watch-source.service';

const config: FileWatcherConfig = {
    pipelineId: '7',
    pipelineCode: 'catalog-import',
    revisionId: '11',
    triggerKey: 'incoming-file',
    connectionCode: 'warehouse-source',
    path: '/incoming',
    pollIntervalMs: 30_000,
    minFileAge: 0,
    recursive: true,
    autoStart: true,
};

function createService(connection: unknown) {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
    return new FileWatchSourceService(
        {
            getRuntimeByCode: vi.fn(async () => connection),
        } as never,
        {} as never,
        { createLogger: vi.fn(() => logger) } as never,
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('FileWatchSourceService', () => {
    it('filters discovered FTP files and always closes the client', async () => {
        const close = vi.fn(async () => undefined);
        const list = vi.fn(async () => [
            {
                path: '/incoming/products.csv',
                name: 'products.csv',
                size: 128,
                modifiedAt: new Date('2026-07-20T10:00:00.000Z'),
                isDirectory: false,
            },
            {
                path: '/incoming/notes.txt',
                name: 'notes.txt',
                size: 64,
                modifiedAt: new Date('2026-07-20T10:00:00.000Z'),
                isDirectory: false,
            },
        ]);
        vi.spyOn(ftpConnection, 'createFtpClient').mockResolvedValue({
            list,
            close,
        } as never);
        const service = createService({
            code: 'warehouse-source',
            type: 'FTP',
            config: {},
        });

        await expect(service.listFiles(
            {} as never,
            { ...config, pattern: '*.csv' },
            async () => false,
        )).resolves.toEqual([{
            path: '/incoming/products.csv',
            name: 'products.csv',
            size: 128,
            modifiedAt: new Date('2026-07-20T10:00:00.000Z'),
        }]);
        expect(list).toHaveBeenCalledWith('/incoming');
        expect(close).toHaveBeenCalledOnce();
    });

    it('fails clearly when the configured source no longer exists', async () => {
        const service = createService(undefined);

        await expect(service.listFiles(
            {} as never,
            config,
            async () => false,
        )).rejects.toThrow('Connection not found: warehouse-source');
    });

    it('rejects connection types that cannot provide remote files', async () => {
        const service = createService({
            code: 'warehouse-source',
            type: 'HTTP',
            config: {},
        });

        await expect(service.listFiles(
            {} as never,
            config,
            async () => false,
        )).rejects.toThrow(
            'Unsupported connection type for file watch: HTTP',
        );
    });
});
