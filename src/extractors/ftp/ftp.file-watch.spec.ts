import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { FileParserService } from '../../parsers/file-parser.service';
import { createRemoteFileSourceRecord } from '../shared/remote-file-source';
import { createClient } from './connection';
import { FtpExtractor } from './ftp.extractor';
import type { FtpExtractorConfig } from './types';

vi.mock('./connection', async importOriginal => ({
    ...await importOriginal<typeof import('./connection')>(),
    createClient: vi.fn(),
}));

function createContext(): ExtractorContext {
    return {
        connections: {
            get: vi.fn(),
            getRequired: vi.fn(async () => ({
                code: 'incoming-sftp',
                type: 'SFTP',
                config: {
                    host: 'files.example.com',
                    port: 22,
                    username: 'importer',
                    passwordSecretCode: 'sftp-password',
                },
            })),
        },
        sourceRecords: [createRemoteFileSourceRecord({
            connectionCode: 'incoming-sftp',
            path: '/incoming/products.csv',
            name: 'products.csv',
            modifiedAt: '2026-07-15T10:00:00.000Z',
            size: 32,
        })],
        checkpoint: { data: {} },
        secrets: { get: vi.fn(), getRequired: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        setCheckpoint: vi.fn(),
        isCancelled: vi.fn(async () => false),
    } as unknown as ExtractorContext;
}

describe('FtpExtractor file-watch execution', () => {
    it('downloads and parses only the referenced SFTP file using the saved connection', async () => {
        const client = {
            list: vi.fn(),
            download: vi.fn(async () => Buffer.from('sku,name\nSKU-1,Product')),
            delete: vi.fn(),
            rename: vi.fn(),
            mkdir: vi.fn(),
            close: vi.fn(),
        };
        vi.mocked(createClient).mockResolvedValue(client);
        const extractor = new FtpExtractor(new FileParserService());
        const records = [];

        for await (const record of extractor.extract(createContext(), {
            connectionCode: 'incoming-sftp',
            remotePath: '/incoming',
            format: 'CSV',
            continueOnError: false,
        } as FtpExtractorConfig)) {
            records.push(record.data);
        }

        expect(client.list).not.toHaveBeenCalled();
        expect(client.download).toHaveBeenCalledWith('/incoming/products.csv');
        expect(records).toEqual([{ sku: 'SKU-1', name: 'Product' }]);
        expect(vi.mocked(createClient).mock.calls[0]?.[1]).toMatchObject({
            host: 'files.example.com',
            protocol: 'sftp',
            username: 'importer',
        });
    });
});
