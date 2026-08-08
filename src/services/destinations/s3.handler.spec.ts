import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    HeadBucketCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { deliverToS3, testS3Destination } from './s3.handler';
import type { ResolvedS3DestinationConfig } from './destination.types';

const send = vi.fn();
const destroy = vi.fn();
const clientOptions: unknown[] = [];
const requestHandler = { destroy: vi.fn() };

vi.mock('@aws-sdk/client-s3', () => {
    class MockS3Client {
        send = send;
        destroy = destroy;
        constructor(options: unknown) {
            clientOptions.push(options);
        }
    }
    class MockPutObjectCommand {
        constructor(readonly input: unknown) {}
    }
    class MockHeadBucketCommand {
        constructor(readonly input: unknown) {}
    }
    return {
        S3Client: MockS3Client,
        PutObjectCommand: MockPutObjectCommand,
        HeadBucketCommand: MockHeadBucketCommand,
    };
});

vi.mock('../../utils/aws-request-handler.utils', () => ({
    createPinnedAwsRequestHandler: vi.fn(async () => requestHandler),
}));

const config: ResolvedS3DestinationConfig = {
    id: 'archive',
    name: 'Archive',
    type: 'S3',
    bucket: 'catalog',
    region: 'eu-central-1',
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    endpoint: 'https://objects.example.com/storage/v1',
    prefix: 'daily',
};

describe('S3 destination', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clientOptions.length = 0;
    });

    it('uses the AWS SDK with path-style custom endpoints and preserves endpoint paths', async () => {
        send.mockResolvedValue({ ETag: 'etag-1', VersionId: 'version-1' });

        const result = await deliverToS3(
            config,
            Buffer.from('catalog'),
            'products.json',
            { mimeType: 'application/json', metadata: { records: 1 } },
        );

        expect(clientOptions).toHaveLength(1);
        expect(clientOptions[0]).toMatchObject({
            endpoint: 'https://objects.example.com/storage/v1',
            forcePathStyle: true,
            region: 'eu-central-1',
            requestHandler,
        });
        expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
        expect((send.mock.calls[0][0] as PutObjectCommand).input).toEqual({
            Bucket: 'catalog',
            Key: 'daily/products.json',
            Body: Buffer.from('catalog'),
            ContentType: 'application/json',
            ACL: undefined,
            Metadata: { records: '1' },
        });
        expect(result).toMatchObject({
            success: true,
            location: 'https://objects.example.com/storage/v1/catalog/daily/products.json',
            metadata: {
                eTag: 'etag-1',
                versionId: 'version-1',
            },
        });
        expect(destroy).toHaveBeenCalledOnce();
    });

    it('tests real bucket access instead of treating resolved credentials as success', async () => {
        send.mockRejectedValue(new Error('Access denied'));

        await expect(testS3Destination(config, Date.now())).resolves.toMatchObject({
            success: false,
            message: 'Access denied',
        });
        expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
        expect((send.mock.calls[0][0] as HeadBucketCommand).input).toEqual({ Bucket: 'catalog' });
        expect(destroy).toHaveBeenCalledOnce();
    });
});
