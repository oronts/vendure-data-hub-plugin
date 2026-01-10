/**
 * S3 Client
 *
 * Manages S3 connections and operations using AWS SDK v3.
 */

import {
    S3Client as AwsS3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { ExtractorContext } from '../../types/index';
import { S3ExtractorConfig, S3ObjectInfo, S3_DEFAULTS } from './types';

/**
 * S3 client interface
 */
export interface S3Client {
    listObjects(prefix?: string, continuationToken?: string): Promise<S3ListObjectsResult>;
    getObject(key: string): Promise<Buffer>;
    deleteObject(key: string): Promise<void>;
    copyObject(sourceKey: string, destKey: string): Promise<void>;
    headBucket(): Promise<boolean>;
    close(): Promise<void>;
}

/**
 * List objects result
 */
export interface S3ListObjectsResult {
    objects: S3ObjectInfo[];
    continuationToken?: string;
    isTruncated: boolean;
}

/**
 * Create S3 client configuration
 */
export interface S3ClientConfig {
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
}

/**
 * Build S3 client configuration from extractor config
 */
export async function buildS3ClientConfig(
    context: ExtractorContext,
    config: S3ExtractorConfig,
): Promise<S3ClientConfig> {
    const clientConfig: S3ClientConfig = {
        region: config.region || S3_DEFAULTS.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle ?? S3_DEFAULTS.forcePathStyle,
    };

    // Resolve credentials if provided
    if (config.accessKeyIdSecretCode && config.secretAccessKeySecretCode) {
        const accessKeyId = await context.secrets.get(config.accessKeyIdSecretCode);
        const secretAccessKey = await context.secrets.get(config.secretAccessKeySecretCode);

        if (accessKeyId && secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId,
                secretAccessKey,
            };
        }
    }

    return clientConfig;
}

/**
 * Create S3 client
 */
export async function createS3Client(
    context: ExtractorContext,
    config: S3ExtractorConfig,
): Promise<S3Client> {
    const clientConfig = await buildS3ClientConfig(context, config);

    const s3 = new AwsS3Client({
        region: clientConfig.region,
        endpoint: clientConfig.endpoint,
        forcePathStyle: clientConfig.forcePathStyle,
        credentials: clientConfig.credentials,
    });

    const bucket = config.bucket;

    return {
        async listObjects(prefix?: string, continuationToken?: string): Promise<S3ListObjectsResult> {
            const command = new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix || config.prefix,
                ContinuationToken: continuationToken,
                MaxKeys: 1000,
            });

            const response = await s3.send(command);

            return {
                objects: (response.Contents || []).map(obj => ({
                    key: obj.Key!,
                    size: obj.Size || 0,
                    lastModified: obj.LastModified || new Date(),
                    etag: obj.ETag?.replace(/"/g, ''),
                    storageClass: obj.StorageClass,
                })),
                continuationToken: response.NextContinuationToken,
                isTruncated: response.IsTruncated || false,
            };
        },

        async getObject(key: string): Promise<Buffer> {
            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });

            const response = await s3.send(command);

            if (response.Body) {
                // AWS SDK v3 uses web streams
                if (typeof (response.Body as any).transformToByteArray === 'function') {
                    return Buffer.from(await (response.Body as any).transformToByteArray());
                }
                // Fallback for readable streams
                const chunks: Buffer[] = [];
                for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
                    chunks.push(Buffer.from(chunk));
                }
                return Buffer.concat(chunks);
            }

            throw new Error(`Unable to read S3 object: ${key}`);
        },

        async deleteObject(key: string): Promise<void> {
            const command = new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            });
            await s3.send(command);
        },

        async copyObject(sourceKey: string, destKey: string): Promise<void> {
            const command = new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `${bucket}/${sourceKey}`,
                Key: destKey,
            });
            await s3.send(command);
        },

        async headBucket(): Promise<boolean> {
            const command = new HeadBucketCommand({
                Bucket: bucket,
            });
            await s3.send(command);
            return true;
        },

        async close(): Promise<void> {
            s3.destroy();
        },
    };
}

/**
 * Test S3 connection by checking bucket access
 */
export async function testS3Connection(
    context: ExtractorContext,
    config: S3ExtractorConfig,
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();

    try {
        const client = await createS3Client(context, config);
        await client.headBucket();
        await client.close();

        return {
            success: true,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Build source ID for S3 object
 */
export function buildS3SourceId(bucket: string, key: string): string {
    return `s3://${bucket}/${key}`;
}
