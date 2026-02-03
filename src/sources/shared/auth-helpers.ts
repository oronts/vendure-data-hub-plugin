/**
 * Authentication Helpers for Data Sources
 *
 * Shared utilities for building authenticated HTTP request headers.
 */

import { AuthConfig } from '../types';
import { AuthType, HTTP_HEADERS, AUTH_SCHEMES, CONTENT_TYPES } from '../../constants/index';

/**
 * Build HTTP headers with authentication
 *
 * @param customHeaders - Additional custom headers
 * @param auth - Authentication configuration
 * @param defaultHeaders - Default headers to include
 * @returns Complete headers object
 */
export function buildAuthHeaders(
    customHeaders?: Record<string, string>,
    auth?: AuthConfig,
    defaultHeaders: Record<string, string> = {
        [HTTP_HEADERS.ACCEPT]: CONTENT_TYPES.JSON,
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
    },
): Record<string, string> {
    const headers: Record<string, string> = {
        ...defaultHeaders,
        ...customHeaders,
    };

    if (auth) {
        switch (auth.type) {
            case AuthType.BASIC:
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
                break;
            case AuthType.BEARER:
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${auth.token}`;
                break;
            case AuthType.API_KEY:
                if (auth.in === 'header') {
                    headers[auth.key] = auth.value;
                }
                break;
        }
    }

    return headers;
}
