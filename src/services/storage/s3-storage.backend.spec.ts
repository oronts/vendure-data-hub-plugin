import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createPinnedAwsRequestHandler } from '../../utils/aws-request-handler.utils';
import { S3StorageBackend } from './s3-storage.backend';

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
    return {
        S3Client: MockS3Client,
        PutObjectCommand: MockPutObjectCommand,
        GetObjectCommand: class {},
        DeleteObjectCommand: class {},
        HeadObjectCommand: class {},
        ListObjectsV2Command: class {},
    };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: vi.fn(),
}));

vi.mock('../../utils/aws-request-handler.utils', () => ({
    createPinnedAwsRequestHandler: vi.fn(async () => requestHandler),
}));

describe('S3StorageBackend lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clientOptions.length = 0;
    });

    it('creates a pinned client during init and releases it during close', async () => {
        const backend = new S3StorageBackend({
            bucket: 'uploads',
            region: 'eu-central-1',
            accessKeyId: 'access-key',
            secretAccessKey: 'secret-key',
            endpoint: 'https://objects.example.com/storage/v1',
            prefix: 'data-hub',
        });

        await expect(backend.write('file.txt', Buffer.from('before-init')))
            .rejects.toThrow('has not been initialized');
        await backend.init();
        await backend.write('file.txt', Buffer.from('content'));

        expect(createPinnedAwsRequestHandler).toHaveBeenCalledWith(
            'https://objects.example.com/storage/v1',
        );
        expect(clientOptions).toEqual([expect.objectContaining({
            endpoint: 'https://objects.example.com/storage/v1',
            forcePathStyle: true,
            requestHandler,
        })]);
        expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
        expect((send.mock.calls[0][0] as PutObjectCommand).input).toEqual({
            Bucket: 'uploads',
            Key: 'data-hub/file.txt',
            Body: Buffer.from('content'),
        });

        await backend.close();
        expect(destroy).toHaveBeenCalledOnce();
        await expect(backend.write('file.txt', Buffer.from('after-close')))
            .rejects.toThrow('has not been initialized');
    });
});
