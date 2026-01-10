/**
 * HTTP Request Builder
 *
 * Builds HTTP requests with proper headers, authentication, and URL construction.
 */

import { ExtractorContext } from '../../types/index';
import { HttpApiExtractorConfig, PaginationState, HTTP_DEFAULTS } from './types';
import { HttpMethod, PaginationType } from '../../constants/index';

/**
 * Build full URL from config, resolving connection base URL if needed
 */
export async function buildUrl(
    context: ExtractorContext,
    config: HttpApiExtractorConfig,
): Promise<string> {
    let url = config.url;

    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.baseUrl && url.startsWith('/')) {
            url = connection.baseUrl.replace(/\/$/, '') + url;
        }
    }

    return url;
}

/**
 * Build request headers with authentication
 */
export async function buildHeaders(
    context: ExtractorContext,
    config: HttpApiExtractorConfig,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
    };

    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.headers) {
            Object.assign(headers, connection.headers);
        }

        if (connection?.auth) {
            await applyAuthentication(context, headers, connection.auth);
        }
    }

    return headers;
}

/**
 * Apply authentication to headers
 */
async function applyAuthentication(
    context: ExtractorContext,
    headers: Record<string, string>,
    auth: {
        type: string;
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
    },
): Promise<void> {
    switch (auth.type) {
        case 'bearer':
            if (auth.secretCode) {
                const token = await context.secrets.get(auth.secretCode);
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }
            break;

        case 'api-key':
            if (auth.secretCode) {
                const apiKey = await context.secrets.get(auth.secretCode);
                if (apiKey) {
                    const headerName = auth.headerName || 'X-API-Key';
                    headers[headerName] = apiKey;
                }
            }
            break;

        case 'basic':
            if (auth.secretCode) {
                const password = await context.secrets.get(auth.secretCode);
                const username = auth.username ||
                    (auth.usernameSecretCode ? await context.secrets.get(auth.usernameSecretCode) : undefined);

                if (username && password) {
                    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
                    headers['Authorization'] = `Basic ${credentials}`;
                }
            }
            break;
    }
}

/**
 * Build paginated request by adding pagination parameters to URL
 */
export function buildPaginatedRequest(
    config: HttpApiExtractorConfig,
    paginationType: PaginationType | string,
    state: PaginationState,
): HttpApiExtractorConfig {
    const paginatedConfig = { ...config };
    const pagination = config.pagination;

    if (!pagination) return paginatedConfig;

    // Handle URL parsing - might fail for relative URLs
    let url: URL;
    try {
        url = new URL(config.url);
    } catch {
        // For relative URLs or paths, just return as-is
        return paginatedConfig;
    }

    switch (paginationType) {
        case PaginationType.OFFSET:
        case 'offset':
            url.searchParams.set(
                pagination.offsetParam || 'offset',
                String(state.offset),
            );
            url.searchParams.set(
                pagination.limitParam || 'limit',
                String(pagination.limit || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.CURSOR:
        case 'cursor':
            if (state.cursor) {
                url.searchParams.set(
                    pagination.cursorParam || 'cursor',
                    state.cursor,
                );
            }
            url.searchParams.set(
                pagination.limitParam || 'limit',
                String(pagination.limit || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.PAGE:
        case 'page':
            url.searchParams.set(
                pagination.pageParam || 'page',
                String(state.page),
            );
            url.searchParams.set(
                pagination.pageSizeParam || 'pageSize',
                String(pagination.pageSize || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.LINK_HEADER:
        case 'link-header':
            // Link header pagination doesn't modify the initial URL
            break;
    }

    paginatedConfig.url = url.toString();
    return paginatedConfig;
}

/**
 * Build GraphQL request body
 */
export function buildGraphqlBody(
    query: string,
    variables?: Record<string, unknown>,
): { query: string; variables?: Record<string, unknown> } {
    return {
        query,
        variables,
    };
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string, allowRelative: boolean = false): boolean {
    if (allowRelative && url.startsWith('/')) {
        return true;
    }

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get HTTP method or default
 */
export function getMethod(config: HttpApiExtractorConfig): HttpMethod {
    return config.method || HTTP_DEFAULTS.method;
}

/**
 * Prepare request body
 */
export function prepareRequestBody(config: HttpApiExtractorConfig): string | undefined {
    if (config.graphqlQuery) {
        const body = buildGraphqlBody(config.graphqlQuery, config.graphqlVariables);
        return JSON.stringify(body);
    }

    if (config.body) {
        return JSON.stringify(config.body);
    }

    return undefined;
}

/**
 * Check if method supports request body
 */
export function methodSupportsBody(method: HttpMethod): boolean {
    return method !== HttpMethod.GET;
}
