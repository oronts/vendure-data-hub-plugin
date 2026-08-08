import {
    AUTH_SCHEMES,
    ConnectionAuthType,
    CONTENT_TYPES,
    HTTP,
    HTTP_HEADERS,
} from '../../constants';
import type { UrlSecurityConfig } from '../../utils/url-security.utils';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { getErrorMessage } from '../../utils/error.utils';
import {
    DeliveryOptions,
    DeliveryResult,
    DESTINATION_TYPE,
    ResolvedHTTPDestinationConfig,
} from './destination.types';
import { createFailureResult, createSuccessResult } from './delivery-utils';

export function getHttpDestinationAuthHeaders(
    config: ResolvedHTTPDestinationConfig,
): Record<string, string> {
    switch (config.authType) {
        case undefined:
        case ConnectionAuthType.NONE:
            return {};
        case ConnectionAuthType.BASIC: {
            const username = config.authConfig?.username;
            const password = config.authConfig?.password;
            if (!username || !password) {
                throw new Error('Resolved HTTP Basic credentials are incomplete');
            }
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            return {
                [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BASIC} ${credentials}`,
            };
        }
        case ConnectionAuthType.BEARER: {
            const token = config.authConfig?.token;
            if (!token) {
                throw new Error('Resolved HTTP Bearer token is unavailable');
            }
            return {
                [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${token}`,
            };
        }
        case ConnectionAuthType.API_KEY: {
            const apiKey = config.authConfig?.apiKey;
            if (!apiKey) {
                throw new Error('Resolved HTTP API key is unavailable');
            }
            return {
                [config.authConfig?.apiKeyHeader || HTTP_HEADERS.X_API_KEY]: apiKey,
            };
        }
        default:
            throw new Error(
                `Unsupported resolved HTTP authentication type: ${String(config.authType)}`,
            );
    }
}

export async function deliverToHTTP(
    config: ResolvedHTTPDestinationConfig,
    content: Buffer,
    filename: string,
    options?: DeliveryOptions,
    ssrfConfig?: UrlSecurityConfig,
): Promise<DeliveryResult> {
    // eslint-disable-next-line no-control-regex
    const unsafeFilenameCharacters = /[\x00-\x1f\x7f"\\]/g;
    const sanitizedFilename = filename
        .replace(unsafeFilenameCharacters, '')
        .replace(/[^\x20-\x7e]/g, '_');
    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]:
            options?.mimeType || CONTENT_TYPES.OCTET_STREAM,
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        ...config.headers,
        ...getHttpDestinationAuthHeaders(config),
    };

    try {
        const response = await secureFetch(
            config.url,
            {
                method: config.method || 'POST',
                headers,
                body: content,
                signal: AbortSignal.timeout(HTTP.TIMEOUT_MS),
            },
            ssrfConfig,
        );
        await response.body?.cancel().catch(() => undefined);

        if (!response.ok) {
            return createFailureResult(
                config.id,
                DESTINATION_TYPE.HTTP,
                filename,
                content.length,
                `HTTP delivery failed with status ${response.status}`,
            );
        }

        return createSuccessResult(
            config.id,
            DESTINATION_TYPE.HTTP,
            filename,
            content.length,
            config.url,
            { responseStatus: response.status },
        );
    } catch (error) {
        return createFailureResult(
            config.id,
            DESTINATION_TYPE.HTTP,
            filename,
            content.length,
            getErrorMessage(error),
        );
    }
}
