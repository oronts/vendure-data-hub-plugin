/**
 * S3 Storage Backend
 * Supports AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
 */

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageBackend, S3StorageOptions } from './storage-backend.interface';
import { createPinnedAwsRequestHandler } from '../../utils/aws-request-handler.utils';
import { resolveS3SignedUrlExpiry } from './s3-storage-expiry';

function isS3NotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const name = Reflect.get(error, 'name');
    if (name === 'NoSuchKey' || name === 'NotFound') return true;

    const metadata = Reflect.get(error, '$metadata');
    return metadata !== null
        && typeof metadata === 'object'
        && Reflect.get(metadata, 'httpStatusCode') === 404;
}

export class S3StorageBackend implements StorageBackend {
    readonly type = 's3' as const;
    private client: S3Client | undefined;
    private bucket: string;
    private prefix: string;
    private signedUrlExpiry: number;

    constructor(private options: S3StorageOptions) {
        if (typeof options.bucket !== 'string' || options.bucket.trim().length === 0) {
            throw new Error('S3 storage bucket is required');
        }
        if (typeof options.region !== 'string' || options.region.trim().length === 0) {
            throw new Error('S3 storage region is required');
        }
        const hasAccessKey = typeof options.accessKeyId === 'string'
            && options.accessKeyId.trim().length > 0;
        const hasSecretKey = typeof options.secretAccessKey === 'string'
            && options.secretAccessKey.trim().length > 0;
        if (hasAccessKey !== hasSecretKey) {
            throw new Error('S3 storage accessKeyId and secretAccessKey must be configured together');
        }

        this.bucket = options.bucket;
        this.prefix = options.prefix ?? '';
        this.signedUrlExpiry = resolveS3SignedUrlExpiry(options.signedUrlExpiry);

        const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
            region: options.region,
        };

        if (options.accessKeyId && options.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: options.accessKeyId,
                secretAccessKey: options.secretAccessKey,
            };
        }

        if (options.endpoint) {
            clientConfig.endpoint = options.endpoint;
            clientConfig.forcePathStyle = true;
        }

        this.clientConfig = clientConfig;
    }

    private readonly clientConfig: ConstructorParameters<typeof S3Client>[0];

    async init(): Promise<void> {
        const requestHandler = await createPinnedAwsRequestHandler(this.options.endpoint);
        this.client = new S3Client({
            ...this.clientConfig,
            requestHandler,
        });
    }

    async close(): Promise<void> {
        this.client?.destroy();
        this.client = undefined;
    }

    private getClient(): S3Client {
        if (!this.client) {
            throw new Error('S3 storage backend has not been initialized');
        }
        return this.client;
    }

    private getFullKey(path: string): string {
        return this.prefix ? `${this.prefix}/${path}` : path;
    }

    async write(path: string, data: Buffer): Promise<void> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.getFullKey(path),
            Body: data,
        });

        await this.getClient().send(command);
    }

    async read(path: string): Promise<Buffer | null> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            const response: GetObjectCommandOutput = await this.getClient().send(command);

            if (!response.Body) {
                return null;
            }

            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (error: unknown) {
            if (isS3NotFoundError(error)) return null;
            throw error;
        }
    }

    async delete(path: string): Promise<boolean> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: this.getFullKey(path),
        });

        await this.getClient().send(command);
        return true;
    }

    async exists(path: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            await this.getClient().send(command);
            return true;
        } catch (error: unknown) {
            if (isS3NotFoundError(error)) return false;
            throw error;
        }
    }

    async list(prefix: string): Promise<string[]> {
        const fullPrefix = this.getFullKey(prefix);
        const files: string[] = [];
        let continuationToken: string | undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: fullPrefix,
                ContinuationToken: continuationToken,
            });

            const response = await this.getClient().send(command);

            if (response.Contents) {
                for (const obj of response.Contents) {
                    if (obj.Key) {
                        const key = this.prefix
                            ? obj.Key.substring(this.prefix.length + 1)
                            : obj.Key;
                        files.push(key);
                    }
                }
            }

            continuationToken = response.IsTruncated
                ? response.NextContinuationToken
                : undefined;
        } while (continuationToken);

        return files;
    }

    async getUrl(path: string, expiresInSeconds?: number): Promise<string | null> {
        const expiresIn = expiresInSeconds === undefined
            ? this.signedUrlExpiry
            : resolveS3SignedUrlExpiry(expiresInSeconds);
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: this.getFullKey(path),
        });

        return getSignedUrl(this.getClient(), command, { expiresIn });
    }
}
