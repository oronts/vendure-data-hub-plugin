import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { FileParserService } from '../../parsers/file-parser.service';
import { createRemoteFileSourceRecord } from '../shared/remote-file-source';
import { createS3Client } from './client';
import { S3Extractor } from './s3.extractor';
import type { S3ExtractorConfig } from './types';

vi.mock('./client', async importOriginal => ({
    ...await importOriginal<typeof import('./client')>(),
    createS3Client: vi.fn(),
}));

function createContext(): ExtractorContext {
    return {
        connections: {
            get: vi.fn(),
            getRequired: vi.fn(async () => ({
                code: 'incoming-s3',
                type: 'S3',
                config: {
                    bucket: 'catalog-imports',
                    region: 'eu-central-1',
                    accessKeyIdSecretCode: 's3-access-key',
                    secretAccessKeySecretCode: 's3-secret-key',
                },
            })),
        },
        sourceRecords: [createRemoteFileSourceRecord({
            connectionCode: 'incoming-s3',
            path: 'incoming/products.json',
            name: 'products.json',
            modifiedAt: '2026-07-15T10:00:00.000Z',
            size: 32,
        })],
        checkpoint: { data: { processedS3Keys: ['incoming/products.json'] } },
        secrets: { get: vi.fn(), getRequired: vi.fn() },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
        setCheckpoint: vi.fn(),
        isCancelled: vi.fn(async () => false),
    } as unknown as ExtractorContext;
}

describe('S3Extractor file-watch execution', () => {
    it('rejects the unimplemented S3 Select configuration', async () => {
        const extractor = new S3Extractor(new FileParserService());

        const result = await extractor.validate(createContext(), {
            connectionCode: 'incoming-s3',
            s3Select: {
                enabled: true,
                expression: 'SELECT * FROM s3object',
            },
        } as never);

        expect(result.errors).toContainEqual({
            field: 's3Select',
            message: 'S3 Select is not supported by this extractor',
        });
    });

    it('gets and parses only the referenced object using the saved connection', async () => {
        const client = {
            listObjects: vi.fn(),
            getObject: vi.fn(async () => Buffer.from('[{"sku":"SKU-1","name":"Product"}]')),
            deleteObject: vi.fn(),
            copyObject: vi.fn(),
            headBucket: vi.fn(),
            close: vi.fn(),
        };
        vi.mocked(createS3Client).mockResolvedValue(client);
        const extractor = new S3Extractor(new FileParserService());
        const records = [];

        for await (const record of extractor.extract(createContext(), {
            connectionCode: 'incoming-s3',
            prefix: 'incoming/',
            format: 'JSON',
            continueOnError: false,
        } as S3ExtractorConfig)) {
            records.push(record.data);
        }

        expect(client.listObjects).not.toHaveBeenCalled();
        expect(client.getObject).toHaveBeenCalledWith('incoming/products.json');
        expect(records).toEqual([{ sku: 'SKU-1', name: 'Product' }]);
        expect(vi.mocked(createS3Client).mock.calls[0]?.[1]).toMatchObject({
            bucket: 'catalog-imports',
            region: 'eu-central-1',
        });
    });
});
