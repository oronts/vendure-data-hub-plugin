import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { FileParserService } from '../../parsers/file-parser.service';
import { createClient } from '../ftp/connection';
import { FtpExtractor } from '../ftp/ftp.extractor';
import type { FtpFileInfo, FtpExtractorConfig } from '../ftp/types';
import { createS3Client } from '../s3/client';
import { S3Extractor } from '../s3/s3.extractor';
import type { S3ExtractorConfig } from '../s3/types';
import { readRemoteSourceAcknowledgements } from './remote-source-acknowledgement';

vi.mock('../ftp/connection', async importOriginal => ({
    ...await importOriginal<typeof import('../ftp/connection')>(),
    createClient: vi.fn(),
}));

vi.mock('../s3/client', async importOriginal => ({
    ...await importOriginal<typeof import('../s3/client')>(),
    createS3Client: vi.fn(),
}));

function createContext(isCancelled = vi.fn(async () => false)) {
    return {
        pipelineId: 7,
        runId: 11,
        stepKey: 'extract',
        checkpoint: { data: {} },
        connections: { get: vi.fn(), getRequired: vi.fn() },
        secrets: { get: vi.fn(), getRequired: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        setCheckpoint: vi.fn(),
        isCancelled,
    } as unknown as ExtractorContext;
}

function ftpFile(path: string, modifiedAt: string): FtpFileInfo {
    return {
        path,
        name: path.split('/').pop() ?? path,
        size: 24,
        modifiedAt: new Date(modifiedAt),
        isDirectory: false,
    };
}

function ftpClient(files: FtpFileInfo[]) {
    return {
        list: vi.fn(async () => files),
        download: vi.fn(async (_remotePath: string) => Buffer.from('sku,name\nSKU-1,Product')),
        delete: vi.fn(async () => undefined),
        rename: vi.fn(async () => undefined),
        mkdir: vi.fn(),
        close: vi.fn(async () => undefined),
    };
}

function s3Client() {
    return {
        listObjects: vi.fn(async () => ({
            objects: [{
                key: 'incoming/products.json',
                size: 24,
                lastModified: new Date('2026-07-20T10:00:00.000Z'),
            }],
            isTruncated: false,
        })),
        getObject: vi.fn(async () => Buffer.from('[{"sku":"SKU-1"}]')),
        deleteObject: vi.fn(async () => undefined),
        copyObject: vi.fn(async () => undefined),
        headBucket: vi.fn(),
        close: vi.fn(async () => undefined),
    };
}

describe('remote extractor acknowledgement staging', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stages FTP deletion without mutating the source during extraction', async () => {
        const client = ftpClient([
            ftpFile('/incoming/products.csv', '2026-07-20T10:00:00.000Z'),
        ]);
        vi.mocked(createClient).mockResolvedValue(client);
        const context = createContext();
        const extractor = new FtpExtractor(new FileParserService());

        for await (const _record of extractor.extract(context, {
            protocol: 'sftp',
            host: 'files.example.com',
            remotePath: '/incoming',
            format: 'CSV',
            deleteAfterProcess: true,
        } as FtpExtractorConfig)) {
            // Fully consume the source.
        }

        expect(client.delete).not.toHaveBeenCalled();
        const checkpoint = vi.mocked(context.setCheckpoint).mock.calls[0]?.[0];
        expect(readRemoteSourceAcknowledgements(checkpoint)).toMatchObject([{
            runId: '11',
            adapterCode: 'ftp',
            action: 'DELETE',
            sourcePath: '/incoming/products.csv',
        }]);
    });

    it('stages S3 movement without copying or deleting during extraction', async () => {
        const client = s3Client();
        vi.mocked(createS3Client).mockResolvedValue(client);
        const context = createContext();
        const extractor = new S3Extractor(new FileParserService());

        for await (const _record of extractor.extract(context, {
            bucket: 'catalog-imports',
            prefix: 'incoming/',
            format: 'JSON',
            moveAfterProcess: {
                enabled: true,
                destinationPrefix: 'processed/',
            },
        } as S3ExtractorConfig)) {
            // Fully consume the source.
        }

        expect(client.copyObject).not.toHaveBeenCalled();
        expect(client.deleteObject).not.toHaveBeenCalled();
        const checkpoint = vi.mocked(context.setCheckpoint).mock.calls[0]?.[0];
        expect(readRemoteSourceAcknowledgements(checkpoint)).toMatchObject([{
            runId: '11',
            adapterCode: 's3',
            action: 'MOVE',
            sourcePath: 'incoming/products.json',
            destinationPath: 'processed/products.json',
        }]);
    });

    it('advances the FTP watermark only through the contiguous successful prefix', async () => {
        const files = [
            ftpFile('/incoming/a.csv', '2026-07-20T10:00:00.000Z'),
            ftpFile('/incoming/b.csv', '2026-07-20T11:00:00.000Z'),
            ftpFile('/incoming/c.csv', '2026-07-20T12:00:00.000Z'),
        ];
        const client = ftpClient(files);
        client.download.mockImplementation(async remotePath => {
            if (remotePath === '/incoming/b.csv') throw new Error('parse source unavailable');
            return Buffer.from('sku,name\nSKU-1,Product');
        });
        vi.mocked(createClient).mockResolvedValue(client);
        const context = createContext();
        const extractor = new FtpExtractor(new FileParserService());

        for await (const _record of extractor.extract(context, {
            protocol: 'sftp',
            host: 'files.example.com',
            remotePath: '/incoming',
            format: 'CSV',
            continueOnError: true,
        } as FtpExtractorConfig)) {
            // Fully consume all successful files.
        }

        expect(context.setCheckpoint).toHaveBeenCalledWith({
            lastProcessedFile: '/incoming/a.csv',
            lastModifiedAt: '2026-07-20T10:00:00.000Z',
        });
    });

    it('does not advance the FTP checkpoint after cancellation', async () => {
        const client = ftpClient([
            ftpFile('/incoming/a.csv', '2026-07-20T10:00:00.000Z'),
            ftpFile('/incoming/b.csv', '2026-07-20T11:00:00.000Z'),
        ]);
        vi.mocked(createClient).mockResolvedValue(client);
        const isCancelled = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const context = createContext(isCancelled);
        const extractor = new FtpExtractor(new FileParserService());

        for await (const _record of extractor.extract(context, {
            protocol: 'sftp',
            host: 'files.example.com',
            remotePath: '/incoming',
            format: 'CSV',
        } as FtpExtractorConfig)) {
            // The cancellation check stops before the second file.
        }

        expect(context.setCheckpoint).not.toHaveBeenCalled();
    });

    it('does not advance the FTP checkpoint when the consumer stops within a file', async () => {
        const client = ftpClient([
            ftpFile('/incoming/products.csv', '2026-07-20T10:00:00.000Z'),
        ]);
        client.download.mockResolvedValue(Buffer.from(
            'sku,name\nSKU-1,First\nSKU-2,Second',
        ));
        vi.mocked(createClient).mockResolvedValue(client);
        const context = createContext();
        const extractor = new FtpExtractor(new FileParserService());
        const iterator = extractor.extract(context, {
            protocol: 'sftp',
            host: 'files.example.com',
            remotePath: '/incoming',
            format: 'CSV',
        } as FtpExtractorConfig);

        await iterator.next();
        await iterator.return();

        expect(context.setCheckpoint).not.toHaveBeenCalled();
    });
});
