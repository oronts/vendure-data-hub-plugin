/**
 * S3 Destination Handler
 *
 * Delivery to S3 and S3-compatible storage (MinIO, etc.)
 */

import * as crypto from 'crypto';
import { S3DestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { assertUrlSafe } from '../../utils/url-security.utils';
import { getErrorMessage } from '../../utils/error.utils';
import { createSuccessResult, createFailureResult } from './delivery-utils';
import { HTTP_HEADERS, CONTENT_TYPES } from '../../constants/services';

/**
 * Deliver content to S3 or S3-compatible storage
 */
export async function deliverToS3(
    config: S3DestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    // Build S3 key
    const key = config.prefix ? `${config.prefix}/${filename}` : filename;

    // Build authorization headers using AWS Signature Version 4
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.slice(0, 8);
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const mimeType = options?.mimeType || CONTENT_TYPES.OCTET_STREAM;

    const host = config.endpoint
        ? new URL(config.endpoint).host
        : `${config.bucket}.s3.${config.region}.amazonaws.com`;

    const canonicalRequest = [
        'PUT',
        `/${key}`,
        '',
        `content-type:${mimeType}`,
        `host:${host}`,
        `x-amz-content-sha256:${contentHash}`,
        `x-amz-date:${timestamp}`,
        '',
        'content-type;host;x-amz-content-sha256;x-amz-date',
        contentHash,
    ].join('\n');

    const credentialScope = `${date}/${config.region}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        timestamp,
        credentialScope,
        crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    // Calculate signature
    const kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(config.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

    const url = config.endpoint
        ? `${config.endpoint}/${config.bucket}/${key}`
        : `https://${host}/${key}`;

    try {
        await assertUrlSafe(url);
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                [HTTP_HEADERS.CONTENT_TYPE]: mimeType,
                'Host': host,
                'x-amz-content-sha256': contentHash,
                'x-amz-date': timestamp,
                [HTTP_HEADERS.AUTHORIZATION]: authorization,
                ...(config.acl ? { 'x-amz-acl': config.acl } : {}),
            },
            body: content,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return createFailureResult(
                config.id,
                DESTINATION_TYPE.S3,
                filename,
                content.length,
                `S3 upload failed: ${response.status} ${errorText}`,
            );
        }

        return createSuccessResult(
            config.id,
            DESTINATION_TYPE.S3,
            filename,
            content.length,
            url,
            { bucket: config.bucket, key },
        );
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        return createFailureResult(
            config.id,
            DESTINATION_TYPE.S3,
            filename,
            content.length,
            errorMessage,
        );
    }
}
