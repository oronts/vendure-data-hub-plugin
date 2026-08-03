import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3_STORAGE } from '../../constants/defaults';
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

    it.each([
        [{ bucket: '', region: 'eu-central-1' }, 'bucket is required'],
        [{ bucket: 'uploads', region: '' }, 'region is required'],
        [{ bucket: 'uploads', region: 'eu-central-1', accessKeyId: 'key' }, 'configured together'],
        [{ bucket: 'uploads', region: 'eu-central-1', signedUrlExpiry: 0 }, 'integer from 1 to 604800'],
        [{ bucket: 'uploads', region: 'eu-central-1', signedUrlExpiry: null }, 'integer from 1 to 604800'],
        [{ bucket: 'uploads', region: 'eu-central-1', signedUrlExpiry: 604_801 }, 'integer from 1 to 604800'],
    ])('rejects invalid direct options %j', (options, message) => {
        expect(() => new S3StorageBackend(options as never)).toThrow(message);
    });

    it('uses bounded default and per-call signed URL expiry values', async () => {
        vi.mocked(getSignedUrl).mockResolvedValue('https://objects.example.com/signed');
        const backend = new S3StorageBackend({
            bucket: 'uploads',
            region: 'eu-central-1',
        });
        await backend.init();

        await expect(backend.getUrl('default.txt')).resolves.toBe(
            'https://objects.example.com/signed',
        );
        expect(getSignedUrl).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.anything(),
            { expiresIn: S3_STORAGE.SIGNED_URL_EXPIRY_SEC },
        );

        await backend.getUrl('maximum.txt', S3_STORAGE.MAX_SIGNED_URL_EXPIRY_SEC);
        expect(getSignedUrl).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.anything(),
            { expiresIn: S3_STORAGE.MAX_SIGNED_URL_EXPIRY_SEC },
        );
        await expect(backend.getUrl('invalid.txt', 0)).rejects.toThrow(
            'integer from 1 to 604800 seconds',
        );
        await expect(backend.getUrl('invalid.txt', null as never)).rejects.toThrow(
            'integer from 1 to 604800 seconds',
        );
    });

    it.each([
        { name: 'NoSuchKey' },
        { name: 'NotFound' },
        { $metadata: { httpStatusCode: 404 } },
    ])('returns absence only for S3 not-found responses %#', async error => {
        const backend = new S3StorageBackend({
            bucket: 'uploads',
            region: 'eu-central-1',
        });
        await backend.init();

        send.mockRejectedValueOnce(error);
        await expect(backend.read('missing.txt')).resolves.toBeNull();
        send.mockRejectedValueOnce(error);
        await expect(backend.exists('missing.txt')).resolves.toBe(false);
    });

    it('preserves S3 authorization, deletion, and signing failures', async () => {
        const backend = new S3StorageBackend({
            bucket: 'uploads',
            region: 'eu-central-1',
        });
        await backend.init();
        const accessDenied = Object.assign(new Error('Access denied'), {
            name: 'AccessDenied',
            $metadata: { httpStatusCode: 403 },
        });

        send.mockRejectedValueOnce(accessDenied);
        await expect(backend.read('protected.txt')).rejects.toBe(accessDenied);
        send.mockRejectedValueOnce(accessDenied);
        await expect(backend.exists('protected.txt')).rejects.toBe(accessDenied);
        send.mockRejectedValueOnce(accessDenied);
        await expect(backend.delete('protected.txt')).rejects.toBe(accessDenied);

        vi.mocked(getSignedUrl).mockRejectedValueOnce(accessDenied);
        await expect(backend.getUrl('protected.txt')).rejects.toBe(accessDenied);
    });
});
