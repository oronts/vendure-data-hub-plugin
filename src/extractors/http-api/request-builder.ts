/**
 * HTTP Request Builder
 *
 * Builds HTTP requests with proper headers, authentication, and URL construction.
 */

import { ExtractorContext } from '../../types/index';
import { HttpApiExtractorConfig, PaginationState, HTTP_DEFAULTS } from './types';
import { HttpMethod, PaginationType, HTTP_HEADERS, CONTENT_TYPES, PAGINATION_PARAMS } from '../../constants/index';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { applyAuthentication, AuthConfig, createSecretResolver } from '../../utils/auth-helpers';
import { buildUrlWithConnection } from '../../utils/url-helpers';
import { isValidUrl as _isValidUrl } from '../../../shared/utils/validation';

/**
 * Build full URL from config, resolving connection base URL if needed
 * Validates URL against SSRF attacks before returning
 *
 * @param context - Extractor context
 * @param config - HTTP API extractor config
 * @param ssrfConfig - Optional SSRF security configuration
 * @throws Error if URL fails SSRF validation
 */
export async function buildUrl(
    context: ExtractorContext,
    config: HttpApiExtractorConfig,
    ssrfConfig?: UrlSecurityConfig,
): Promise<string> {
    let url = config.url;

    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        url = buildUrlWithConnection(config.url, connection);
    }

    // Validate URL against SSRF attacks
    await assertUrlSafe(url, ssrfConfig);

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
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...config.headers,
    };

    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.headers) {
            Object.assign(headers, connection.headers);
        }

        if (connection?.auth) {
            const secretResolver = createSecretResolver(context.secrets);
            await applyAuthentication(headers, connection.auth as unknown as AuthConfig, secretResolver);
        }
    }

    return headers;
}

/**
 * Build paginated request by adding pagination parameters to URL
 */
export function buildPaginatedRequest(
    config: HttpApiExtractorConfig,
    paginationType: PaginationType,
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
            url.searchParams.set(
                pagination.offsetParam || PAGINATION_PARAMS.OFFSET,
                String(state.offset),
            );
            url.searchParams.set(
                pagination.limitParam || PAGINATION_PARAMS.LIMIT,
                String(pagination.limit || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.CURSOR:
            if (state.cursor) {
                url.searchParams.set(
                    pagination.cursorParam || PAGINATION_PARAMS.CURSOR,
                    state.cursor,
                );
            }
            url.searchParams.set(
                pagination.limitParam || PAGINATION_PARAMS.LIMIT,
                String(pagination.limit || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.PAGE:
            url.searchParams.set(
                pagination.pageParam || PAGINATION_PARAMS.PAGE,
                String(state.page),
            );
            url.searchParams.set(
                pagination.pageSizeParam || PAGINATION_PARAMS.PAGE_SIZE,
                String(pagination.pageSize || HTTP_DEFAULTS.pageLimit),
            );
            break;

        case PaginationType.LINK_HEADER:
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
 * Validate URL format.
 * Delegates to the canonical isValidUrl from shared/utils/validation.
 * Note: The canonical version restricts to http/https protocols, which is
 * appropriate here since this is an HTTP API extractor.
 */
export function isValidUrl(url: string, allowRelative: boolean = false): boolean {
    return _isValidUrl(url, { allowRelative });
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
