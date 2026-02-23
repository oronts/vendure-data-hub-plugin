/**
 * Shared HTTP Request Utilities for Extractors
 *
 * Provides common URL-building and header-building logic used by both
 * the HTTP API extractor and GraphQL extractor, eliminating duplication.
 */

import { ExtractorContext } from '../../types/index';
import { HTTP_HEADERS, CONTENT_TYPES } from '../../constants/index';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import { applyAuthentication, AuthConfig, createSecretResolver } from '../../utils/auth-helpers';
import { buildUrlWithConnection } from '../../utils/url-helpers';

/**
 * Minimal config interface for URL building.
 * Both HttpApiExtractorConfig and GraphQLExtractorConfig satisfy this.
 */
interface UrlBuildConfig {
    url: string;
    connectionCode?: string;
}

/**
 * Minimal config interface for header building.
 * Both HttpApiExtractorConfig and GraphQLExtractorConfig satisfy this.
 *
 * The `auth` field is typed as `unknown` because extractor configs reference
 * the shared AuthConfig (string-literal union), while applyAuthentication
 * expects the internal AuthConfig (ConnectionAuthType enum). The cast is
 * applied internally, keeping consumers type-safe without explicit casts.
 */
interface HeaderBuildConfig {
    connectionCode?: string;
    headers?: Record<string, string>;
    auth?: unknown;
}

export interface BuildHeadersOptions {
    /** Default headers to include (e.g., Content-Type, Accept) */
    defaultHeaders?: Record<string, string>;
}

const DEFAULT_HEADERS: Record<string, string> = {
    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
};

/**
 * Build full URL from extractor config, resolving connection base URL if needed.
 * Validates URL against SSRF attacks before returning.
 *
 * Used by both HTTP API and GraphQL extractors.
 *
 * @param context - Extractor context with connection resolver
 * @param config - Config with `url` and optional `connectionCode`
 * @param ssrfConfig - Optional SSRF security configuration
 * @throws Error if URL fails SSRF validation
 */
export async function buildExtractorUrl(
    context: ExtractorContext,
    config: UrlBuildConfig,
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
 * Build request headers with connection headers and authentication.
 * Supports config-level header and auth overrides (config overrides connection).
 *
 * Used by both HTTP API and GraphQL extractors.
 *
 * Header application order (later overrides earlier):
 * 1. Default headers (Content-Type: application/json)
 * 2. Connection headers
 * 3. Connection auth
 * 4. Config headers
 * 5. Config auth (if provided)
 *
 * @param context - Extractor context with connection and secret resolvers
 * @param config - Config with optional `connectionCode`, `headers`, and `auth`
 * @param options - Optional settings like default headers override
 */
export async function buildExtractorHeaders(
    context: ExtractorContext,
    config: HeaderBuildConfig,
    options?: BuildHeadersOptions,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        ...(options?.defaultHeaders ?? DEFAULT_HEADERS),
    };

    const secretResolver = createSecretResolver(context.secrets);

    // Apply connection headers and auth
    if (config.connectionCode) {
        const connection = await context.connections.get(config.connectionCode);
        if (connection?.headers) {
            Object.assign(headers, connection.headers);
        }
        if (connection?.auth) {
            await applyAuthentication(headers, connection.auth as unknown as AuthConfig, secretResolver);
        }
    }

    // Config headers override connection headers
    if (config.headers) {
        Object.assign(headers, config.headers);
    }

    // Config auth overrides connection auth
    if (config.auth) {
        await applyAuthentication(headers, config.auth as unknown as AuthConfig, secretResolver);
    }

    return headers;
}
