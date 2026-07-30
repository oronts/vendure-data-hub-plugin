/**
 * S3 Destination Handler
 *
 * Delivery to AWS S3 and S3-compatible storage through the official AWS SDK.
 */

import {
    HeadBucketCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import type { ConnectionTestResult } from '../../../shared/types';
import { CONTENT_TYPES } from '../../constants/services';
import { getErrorMessage } from '../../utils/error.utils';
import { createPinnedS3RequestHandler } from '../../utils/s3-request-handler.utils';
import { createFailureResult, createSuccessResult } from './delivery-utils';
import {
    DeliveryOptions,
    DeliveryResult,
    DESTINATION_TYPE,
    ResolvedS3DestinationConfig,
} from './destination.types';

async function createS3Client(config: ResolvedS3DestinationConfig): Promise<S3Client> {
    const requestHandler = await createPinnedS3RequestHandler(config.endpoint);
    return new S3Client({
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        ...(config.endpoint
            ? {
                endpoint: config.endpoint,
                forcePathStyle: true,
            }
            : {}),
        requestHandler,
    });
}

function getObjectLocation(
    config: ResolvedS3DestinationConfig,
    key: string,
): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    if (!config.endpoint) {
        return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodedKey}`;
    }
    return `${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
}

export async function deliverToS3(
    config: ResolvedS3DestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const key = config.prefix ? `${config.prefix.replace(/\/+$/, '')}/${filename}` : filename;
    const client = await createS3Client(config);

    try {
        const response = await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: content,
            ContentType: options?.mimeType ?? CONTENT_TYPES.OCTET_STREAM,
            ACL: config.acl,
            Metadata: options?.metadata
                ? Object.fromEntries(
                    Object.entries(options.metadata).map(([name, value]) => [name, String(value)]),
                )
                : undefined,
        }));

        return createSuccessResult(
            config.id,
            DESTINATION_TYPE.S3,
            filename,
            content.length,
            getObjectLocation(config, key),
            {
                bucket: config.bucket,
                key,
                eTag: response.ETag,
                versionId: response.VersionId,
            },
        );
    } catch (error) {
        return createFailureResult(
            config.id,
            DESTINATION_TYPE.S3,
            filename,
            content.length,
            getErrorMessage(error),
        );
    } finally {
        client.destroy();
    }
}

export async function testS3Destination(
    config: ResolvedS3DestinationConfig,
    start: number,
): Promise<ConnectionTestResult> {
    const client = await createS3Client(config);
    try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return {
            success: true,
            message: `S3 bucket "${config.bucket}" is reachable`,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            success: false,
            message: getErrorMessage(error),
            latencyMs: Date.now() - start,
        };
    } finally {
        client.destroy();
    }
}
