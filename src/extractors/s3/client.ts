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
import { getErrorMessage } from '../../utils/error.utils';
import { validateUrlSafetySync } from '../../utils/url-security.utils';
import { createPinnedS3RequestHandler } from '../../utils/s3-request-handler.utils';
import { assertRemoteFileSize, collectRemoteFileBody } from '../shared/remote-file-content';
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
    // Validate custom endpoint against SSRF
    if (config.endpoint) {
        const result = validateUrlSafetySync(config.endpoint);
        if (!result.safe) {
            throw new Error(`SSRF: S3 endpoint blocked: ${result.reason}`);
        }
    }

    const clientConfig: S3ClientConfig = {
        region: config.region || S3_DEFAULTS.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle ?? S3_DEFAULTS.forcePathStyle,
    };

    const hasConfiguredCredentials = Boolean(
        config.accessKeyIdSecretCode || config.secretAccessKeySecretCode,
    );
    if (hasConfiguredCredentials) {
        if (!config.accessKeyIdSecretCode || !config.secretAccessKeySecretCode) {
            throw new Error('S3 static credentials require both Access Key ID and Secret Access Key Secret Codes');
        }

        const accessKeyId = (await context.secrets.get(config.accessKeyIdSecretCode))?.trim();
        const secretAccessKey = (await context.secrets.get(config.secretAccessKeySecretCode))?.trim();
        if (!accessKeyId || !secretAccessKey) {
            throw new Error('Configured S3 credential Secret Codes are empty or unavailable');
        }

        clientConfig.credentials = {
            accessKeyId,
            secretAccessKey,
        };
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
    const requestHandler = await createPinnedS3RequestHandler(clientConfig.endpoint);

    const s3 = new AwsS3Client({
        region: clientConfig.region,
        endpoint: clientConfig.endpoint,
        forcePathStyle: clientConfig.forcePathStyle,
        credentials: clientConfig.credentials,
        requestHandler,
    });

    const bucket = config.bucket;

    return {
        async listObjects(prefix?: string, continuationToken?: string): Promise<S3ListObjectsResult> {
            const command = new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix || config.prefix,
                ContinuationToken: continuationToken,
                MaxKeys: S3_DEFAULTS.listMaxKeys,
            });

            const response = await s3.send(command);

            return {
                objects: (response.Contents || [])
                    .filter(obj => obj.Key !== undefined)
                    .map(obj => ({
                        key: obj.Key as string,
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

            assertRemoteFileSize(response.ContentLength, buildS3SourceId(bucket, key));
            return collectRemoteFileBody(
                response.Body,
                buildS3SourceId(bucket, key),
            );
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
                CopySource: `${bucket}/${sourceKey.split('/').map(s => encodeURIComponent(s)).join('/')}`,
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
    let client: S3Client | undefined;

    try {
        client = await createS3Client(context, config);
        await client.headBucket();

        return {
            success: true,
            latencyMs: Date.now() - startTime,
        };
    } catch (error) {
        return {
            success: false,
            error: getErrorMessage(error),
        };
    } finally {
        try {
            await client?.close();
        } catch (error) {
            context.logger.warn('Failed to close S3 connection test client', {
                error: getErrorMessage(error),
            });
        }
    }
}

/**
 * Build source ID for S3 object
 */
export function buildS3SourceId(bucket: string, key: string): string {
    return `s3://${bucket}/${key}`;
}
