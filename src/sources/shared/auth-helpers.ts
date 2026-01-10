/**
 * Authentication Helpers for Data Sources
 *
 * Shared utilities for building authenticated HTTP request headers.
 */

import { AuthConfig } from '../types';

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
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
): Record<string, string> {
    const headers: Record<string, string> = {
        ...defaultHeaders,
        ...customHeaders,
    };

    if (auth) {
        switch (auth.type) {
            case 'basic':
                headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
                break;
            case 'bearer':
                headers['Authorization'] = `Bearer ${auth.token}`;
                break;
            case 'api-key':
                if (auth.in === 'header') {
                    headers[auth.key] = auth.value;
                }
                break;
        }
    }

    return headers;
}
