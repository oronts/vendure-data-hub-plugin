/**
 * HTTP Destination Handler
 *
 * Delivery to HTTP/HTTPS endpoints.
 */

import { AuthType, HTTP_HEADERS, AUTH_SCHEMES, CONTENT_TYPES, TRUNCATION } from '../../constants/index';
import { HTTPDestinationConfig, DeliveryResult, DeliveryOptions, DESTINATION_TYPE } from './destination.types';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { getErrorMessage } from '../../utils/error.utils';

/**
 * Deliver content to HTTP endpoint
 * Validates URL against SSRF attacks before making the request
 *
 * @param config - HTTP destination configuration
 * @param content - Content to deliver
 * @param filename - Filename for the content
 * @param options - Optional delivery options
 * @param ssrfConfig - Optional SSRF security configuration
 * @throws Error if URL fails SSRF validation
 */
export async function deliverToHTTP(
    config: HTTPDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
    ssrfConfig?: UrlSecurityConfig,
): Promise<DeliveryResult> {
    // Validate URL against SSRF attacks before delivery
    await assertUrlSafe(config.url, ssrfConfig);

    const sanitizedFilename = filename.replace(/[\x00-\x1f\x7f"\\]/g, '').replace(/[^\x20-\x7e]/g, '_');
    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: options?.mimeType || CONTENT_TYPES.OCTET_STREAM,
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        ...config.headers,
    };

    // Add authentication
    if (config.authType === AuthType.BASIC && config.authConfig?.username) {
        const credentials = Buffer.from(
            `${config.authConfig.username}:${config.authConfig.password || ''}`
        ).toString('base64');
        headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${credentials}`;
    } else if (config.authType === AuthType.BEARER && config.authConfig?.token) {
        headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${config.authConfig.token}`;
    } else if (config.authType === AuthType.API_KEY && config.authConfig?.apiKey) {
        const headerName = config.authConfig.apiKeyHeader || HTTP_HEADERS.X_API_KEY;
        headers[headerName] = config.authConfig.apiKey;
    }

    try {
        const response = await fetch(config.url, {
            method: config.method || 'POST',
            headers,
            body: content,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return {
                success: false,
                destinationId: config.id,
                destinationType: DESTINATION_TYPE.HTTP,
                filename,
                size: content.length,
                error: `HTTP delivery failed: ${response.status} ${errorText}`,
            };
        }

        const responseBody = await response.text().catch(() => '');

        return {
            success: true,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.HTTP,
            filename,
            size: content.length,
            deliveredAt: new Date(),
            location: config.url,
            metadata: {
                responseStatus: response.status,
                responseBody: responseBody.slice(0, TRUNCATION.RESPONSE_BODY_MAX_LENGTH),
            },
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        return {
            success: false,
            destinationId: config.id,
            destinationType: DESTINATION_TYPE.HTTP,
            filename,
            size: content.length,
            error: errorMessage,
        };
    }
}
