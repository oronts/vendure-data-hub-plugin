/**
 * HTTP Destination Handler
 *
 * Handles delivery to HTTP/HTTPS endpoints.
 */

import { DEFAULTS } from '../../constants/index';
import { HTTPDestinationConfig, DeliveryResult, DeliveryOptions } from './destination.types';

/**
 * Deliver content to HTTP endpoint
 */
export async function deliverToHTTP(
    config: HTTPDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
): Promise<DeliveryResult> {
    const headers: Record<string, string> = {
        'Content-Type': options?.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...config.headers,
    };

    // Add authentication
    if (config.authType === 'basic' && config.authConfig?.username) {
        const credentials = Buffer.from(
            `${config.authConfig.username}:${config.authConfig.password || ''}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
    } else if (config.authType === 'bearer' && config.authConfig?.token) {
        headers['Authorization'] = `Bearer ${config.authConfig.token}`;
    } else if (config.authType === 'api-key' && config.authConfig?.apiKey) {
        const headerName = config.authConfig.apiKeyHeader || 'X-API-Key';
        headers[headerName] = config.authConfig.apiKey;
    }

    const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers,
        body: content,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP delivery failed: ${response.status} ${errorText}`);
    }

    const responseBody = await response.text().catch(() => '');

    return {
        success: true,
        destinationId: config.id,
        destinationType: 'http',
        filename,
        size: content.length,
        deliveredAt: new Date(),
        location: config.url,
        metadata: {
            responseStatus: response.status,
            responseBody: responseBody.slice(0, DEFAULTS.RESPONSE_BODY_MAX_LENGTH),
        },
    };
}
