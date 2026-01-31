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

export class S3StorageBackend implements StorageBackend {
    readonly type = 's3' as const;
    private client: S3Client;
    private bucket: string;
    private prefix: string;
    private signedUrlExpiry: number;

    constructor(private options: S3StorageOptions) {
        this.bucket = options.bucket;
        this.prefix = options.prefix || '';
        this.signedUrlExpiry = options.signedUrlExpiry || 3600;

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

        this.client = new S3Client(clientConfig);
    }

    async init(): Promise<void> {
        // S3 doesn't need initialization - bucket should already exist
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

        await this.client.send(command);
    }

    async read(path: string): Promise<Buffer | null> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            const response: GetObjectCommandOutput = await this.client.send(command);

            if (!response.Body) {
                return null;
            }

            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (error: unknown) {
            if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
                return null;
            }
            throw error;
        }
    }

    async delete(path: string): Promise<boolean> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            await this.client.send(command);
            return true;
        } catch {
            // S3 delete failed - return false to indicate failure
            return false;
        }
    }

    async exists(path: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            await this.client.send(command);
            return true;
        } catch {
            // S3 HeadObject failed - object does not exist or access denied
            return false;
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

            const response = await this.client.send(command);

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
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: this.getFullKey(path),
            });

            const url = await getSignedUrl(this.client, command, {
                expiresIn: expiresInSeconds || this.signedUrlExpiry,
            });

            return url;
        } catch {
            // Signed URL generation failed - return null as fallback
            return null;
        }
    }
}
