/**
 * Shared HTTP Request Utilities for Extractors
 *
 * Provides common URL-building and header-building logic used by both
 * the HTTP API extractor and GraphQL extractor, eliminating duplication.
 */

import type { ExtractorContext } from '../../types/index';
import { ConnectionAuthType } from '../../constants/enums';
import { HTTP_HEADERS, CONTENT_TYPES } from '../../constants/services';
import { assertUrlSafe, UrlSecurityConfig } from '../../utils/url-security.utils';
import type { SecureFetchPolicy } from '../../utils/secure-fetch.utils';
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

type HttpRequestContext = Pick<ExtractorContext, 'connections' | 'secrets'>;
type RuntimeConnection = Awaited<
    ReturnType<HttpRequestContext['connections']['getRequired']>
>;

export interface PrepareExtractorRequestOptions extends BuildHeadersOptions {
    readonly supportedConnectionTypes?: readonly RuntimeConnection['type'][];
    readonly urlSecurity?: UrlSecurityConfig;
}

export interface PreparedExtractorRequest {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly fetchPolicy: SecureFetchPolicy;
}

export interface BuildHeadersOptions {
    /** Default headers to include (e.g., Content-Type, Accept) */
    defaultHeaders?: Record<string, string>;
}

const DEFAULT_HEADERS: Record<string, string> = {
    [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
};

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const RESTRICTED_STATIC_HEADER_PATTERN =
    /authorization|cookie|api[-_]?key|token|secret|signature/i;
const RESTRICTED_STATIC_HEADERS = new Set([
    'host',
    'content-length',
    'transfer-encoding',
    'connection',
    'upgrade',
    'proxy-authorization',
    'proxy-authenticate',
    '__proto__',
    'constructor',
    'prototype',
]);

function getStaticHeaders(value: unknown, source: string): Record<string, string> {
    if (value === undefined) return {};
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${source} headers must be a string map`);
    }
    const entries = Object.entries(value);
    if (entries.some(([, headerValue]) => typeof headerValue !== 'string')) {
        throw new Error(`${source} headers must contain only string values`);
    }
    for (const [name] of entries) {
        const normalizedName = name.toLowerCase();
        if (!HEADER_NAME_PATTERN.test(name)) {
            throw new Error(`${source} header "${name}" is invalid`);
        }
        if (
            RESTRICTED_STATIC_HEADERS.has(normalizedName) ||
            RESTRICTED_STATIC_HEADER_PATTERN.test(normalizedName)
        ) {
            throw new Error(
                `${source} header "${name}" cannot contain credentials or control request routing; use auth with a Secret Code`,
            );
        }
    }
    return Object.fromEntries(entries) as Record<string, string>;
}

function getConnectionAuth(value: unknown): AuthConfig | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('HTTP connection auth must be an object');
    }
    const auth = value as Record<string, unknown>;
    if (typeof auth.type !== 'string') {
        throw new Error('HTTP connection auth requires a type');
    }
    return auth as AuthConfig;
}

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
    context: HttpRequestContext,
    config: UrlBuildConfig,
    ssrfConfig?: UrlSecurityConfig,
): Promise<string> {
    let url = config.url;

    if (config.connectionCode) {
        const connection = await context.connections.getRequired(config.connectionCode);
        url = buildUrlWithConnection(config.url, connection.config);
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
    context: HttpRequestContext,
    config: HeaderBuildConfig,
    options?: BuildHeadersOptions,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        ...(options?.defaultHeaders ?? DEFAULT_HEADERS),
    };

    const secretResolver = createSecretResolver(context.secrets);
    const configAuth = getConnectionAuth(config.auth);
    let connectionConfig: Record<string, unknown> | undefined;
    let connectionAuth: AuthConfig | undefined;

    if (config.connectionCode) {
        const connection = await context.connections.getRequired(config.connectionCode);
        connectionConfig = connection.config;
        connectionAuth = getConnectionAuth(connectionConfig.auth);
        Object.assign(headers, getStaticHeaders(connectionConfig.headers, 'HTTP connection'));
    }

    if (config.headers) {
        Object.assign(headers, getStaticHeaders(config.headers, 'Extractor'));
    }

    const effectiveAuth = configAuth ?? connectionAuth;
    if (effectiveAuth && effectiveAuth.type !== ConnectionAuthType.NONE) {
        if (!config.connectionCode) {
            throw new Error(
                'Extractor Secret Code authentication requires a saved connection to bind credentials to an origin',
            );
        }
        if (
            typeof connectionConfig?.baseUrl !== 'string'
            || connectionConfig.baseUrl.trim() === ''
        ) {
            throw new Error(
                `Connection "${config.connectionCode}" must define baseUrl before its authentication can be used`,
            );
        }
    }
    await applyAuthentication(headers, effectiveAuth, secretResolver);

    return headers;
}

export async function prepareConnectionBackedExtractorRequest(
    context: HttpRequestContext,
    config: UrlBuildConfig & HeaderBuildConfig,
    options: PrepareExtractorRequestOptions = {},
): Promise<PreparedExtractorRequest> {
    const connectionCode = config.connectionCode?.trim();
    if (!connectionCode || connectionCode !== config.connectionCode) {
        throw new Error(
            'Connection-backed extractor connectionCode must be a non-empty string without surrounding whitespace',
        );
    }

    const connection = await context.connections.getRequired(connectionCode);
    const supportedTypes = options.supportedConnectionTypes;
    if (supportedTypes?.length && !supportedTypes.includes(connection.type)) {
        throw new Error(
            `Connection "${connectionCode}" has type ${connection.type}; expected ${supportedTypes.join(' or ')}`,
        );
    }

    const baseUrl = connection.config.baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
        throw new Error(`Connection "${connectionCode}" must define baseUrl`);
    }

    const url = buildUrlWithConnection(config.url, connection.config);
    await assertUrlSafe(url, options.urlSecurity);
    const headers = await buildHeadersWithConnection(context, config, options, connection);

    return {
        url,
        headers,
        fetchPolicy: { allowedOrigins: [new URL(url).origin] },
    };
}

export function createExtractorFetchPolicy(
    url: string,
    config: HeaderBuildConfig,
): SecureFetchPolicy | undefined {
    return config.connectionCode
        ? { allowedOrigins: [new URL(url).origin] }
        : undefined;
}

async function buildHeadersWithConnection(
    context: HttpRequestContext,
    config: HeaderBuildConfig,
    options: BuildHeadersOptions,
    connection: RuntimeConnection,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        ...(options.defaultHeaders ?? DEFAULT_HEADERS),
        ...getStaticHeaders(connection.config.headers, 'HTTP connection'),
        ...getStaticHeaders(config.headers, 'Extractor'),
    };
    const auth = getConnectionAuth(config.auth)
        ?? getConnectionAuth(connection.config.auth);
    await applyAuthentication(headers, auth, createSecretResolver(context.secrets));
    return headers;
}
