import {
    CreateBucketCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    S3Client as AwsS3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { FileParserService } from '../../parsers/file-parser.service';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import { deliverToS3, testS3Destination } from '../../services/destinations/s3.handler';
import type { ResolvedS3DestinationConfig } from '../../services/destinations/destination.types';
import { S3StorageBackend } from '../../services/storage/s3-storage.backend';
import { S3Extractor } from './s3.extractor';

const endpoint = process.env.DATAHUB_TEST_S3_ENDPOINT?.trim();
const accessKeyId = process.env.DATAHUB_TEST_S3_ACCESS_KEY?.trim();
const secretAccessKey = process.env.DATAHUB_TEST_S3_SECRET_KEY?.trim();
const bucket = process.env.DATAHUB_TEST_S3_BUCKET?.trim();
const integrationDescribe = endpoint && accessKeyId && secretAccessKey && bucket
    ? describe
    : describe.skip;

integrationDescribe('S3 transport integration', () => {
    const prefix = `vitest-${process.pid}-${Date.now()}`;
    const credentials = {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
    };
    const setupClient = new AwsS3Client({
        endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials,
    });

    beforeAll(async () => {
        configureGlobalSsrfProtection({ allowedHostnames: ['127.0.0.1'] });
        try {
            await setupClient.send(new CreateBucketCommand({ Bucket: bucket }));
        } catch (error: unknown) {
            const name = error && typeof error === 'object'
                ? Reflect.get(error, 'name')
                : undefined;
            if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
                throw error;
            }
        }
    });

    afterAll(async () => {
        const listed = await setupClient.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
        }));
        if (listed.Contents?.length) {
            await setupClient.send(new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                    Objects: listed.Contents.flatMap(item => item.Key
                        ? [{ Key: item.Key }]
                        : []),
                },
            }));
        }
        setupClient.destroy();
        configureGlobalSsrfProtection({});
    });

    it('delivers and extracts CSV through the pinned production clients', async () => {
        const destination: ResolvedS3DestinationConfig = {
            id: 's3-integration',
            name: 'S3 integration',
            type: 'S3',
            bucket: bucket as string,
            region: 'us-east-1',
            endpoint,
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            prefix: `${prefix}/incoming`,
        };
        const content = Buffer.from('sku,name\nSKU-1,Product One\nSKU-2,Product Two\n');
        const delivered = await deliverToS3(
            destination,
            content,
            'products.csv',
            { mimeType: 'text/csv', metadata: { records: 2 } },
        );

        expect(delivered).toMatchObject({
            success: true,
            size: content.length,
            metadata: {
                key: `${prefix}/incoming/products.csv`,
            },
        });
        const stored = await setupClient.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: `${prefix}/incoming/products.csv`,
        }));
        expect(stored).toMatchObject({
            ContentLength: content.length,
            ContentType: 'text/csv',
            Metadata: { records: '2' },
        });

        const checkpoint = vi.fn();
        const context = createExtractorContext(checkpoint);
        const extractor = new S3Extractor(new FileParserService());
        const records = [];
        for await (const record of extractor.extract(context, {
            bucket: bucket as string,
            prefix: `${prefix}/incoming`,
            suffix: '.csv',
            region: 'us-east-1',
            endpoint,
            forcePathStyle: true,
            accessKeyIdSecretCode: 's3-access-key',
            secretAccessKeySecretCode: 's3-secret-key',
            format: 'CSV',
        })) {
            records.push(record.data);
        }

        expect(records).toEqual([
            { sku: 'SKU-1', name: 'Product One' },
            { sku: 'SKU-2', name: 'Product Two' },
        ]);
        expect(checkpoint).toHaveBeenCalledWith({
            processedS3Keys: [`${prefix}/incoming/products.csv`],
        });
        await expect(testS3Destination(destination, Date.now())).resolves.toMatchObject({
            success: true,
        });
    });

    it('executes the storage lifecycle against the S3-compatible endpoint', async () => {
        const backend = new S3StorageBackend({
            bucket: bucket as string,
            region: 'us-east-1',
            endpoint,
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            prefix: `${prefix}/storage`,
        });

        await backend.init();
        try {
            await backend.write('exports/catalog.json', Buffer.from('{"records":2}'));
            await expect(backend.exists('exports/catalog.json')).resolves.toBe(true);
            await expect(backend.read('exports/catalog.json'))
                .resolves.toEqual(Buffer.from('{"records":2}'));
            await expect(backend.list('exports/'))
                .resolves.toContain('exports/catalog.json');
            const signedUrl = await backend.getUrl('exports/catalog.json', 60);
            expect(signedUrl).toContain(encodeURIComponent(bucket as string));
            await expect(backend.delete('exports/catalog.json')).resolves.toBe(true);
            await expect(backend.exists('exports/catalog.json')).resolves.toBe(false);
        } finally {
            await backend.close();
        }
    });

    function createExtractorContext(setCheckpoint: ReturnType<typeof vi.fn>): ExtractorContext {
        const secrets = new Map([
            ['s3-access-key', credentials.accessKeyId],
            ['s3-secret-key', credentials.secretAccessKey],
        ]);
        return {
            checkpoint: { data: {} },
            connections: {
                get: vi.fn(),
                getRequired: vi.fn(),
            },
            secrets: {
                get: vi.fn(async code => secrets.get(code)),
                getRequired: vi.fn(async code => {
                    const value = secrets.get(code);
                    if (!value) throw new Error(`Missing secret ${code}`);
                    return value;
                }),
            },
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
            setCheckpoint,
            isCancelled: vi.fn(async () => false),
        } as unknown as ExtractorContext;
    }
});
