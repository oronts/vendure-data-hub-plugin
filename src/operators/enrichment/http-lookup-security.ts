import { createHmac, randomBytes } from 'crypto';
import { AUTH_SCHEMES, CONTENT_TYPES, HTTP_HEADERS } from '../../constants/services';
import type { ConnectionConfig, ConnectionResolver } from '../../sdk/types';
import type { SecureFetchPolicy } from '../../utils/secure-fetch.utils';
import { buildUrlWithConnection } from '../../utils/url-helpers';
import type { HttpLookupOperatorConfig } from './types';

const CACHE_KEY_HMAC_KEY = randomBytes(32);
const IMPLICIT_CACHE_NAMESPACES = new WeakMap<HttpLookupSecretResolver, string>();
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SENSITIVE_HEADER_PATTERN =
    /(?:^|[-_])(?:authorization|api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|security[-_]?token|client[-_]?secret|private[-_]?key|secret|signature|cookie)(?:$|[-_])/i;
const FORBIDDEN_REQUEST_HEADERS = new Set([
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);
const HTTP_CONNECTION_TYPES = new Set(['HTTP', 'REST', 'GRAPHQL']);
const HTTP_AUTH_TYPES = new Set(['NONE', 'BASIC', 'BEARER', 'API_KEY']);

export const HTTP_LOOKUP_LIMITS = {
    MAX_BATCH_SIZE: 500,
    MAX_CACHE_TTL_SEC: 7 * 24 * 60 * 60,
    MAX_HEADER_COUNT: 50,
    MAX_CACHE_NAMESPACE_LENGTH: 1_024,
    MAX_HEADER_NAME_LENGTH: 128,
    MAX_HEADER_VALUE_LENGTH: 8_192,
    MAX_RATE_LIMIT_PER_SECOND: 10_000,
    MAX_RETRIES: 10,
    MAX_TIMEOUT_MS: 300_000,
} as const;

export interface HttpLookupSecretResolver {
    get(code: string): Promise<string | undefined>;
    cacheNamespace?: string;
}

export interface HttpLookupRuntimeContext {
    readonly secrets?: HttpLookupSecretResolver;
    readonly connections?: ConnectionResolver;
}

export interface PreparedHttpLookupSecurity {
    cacheNamespace: string;
    fetchPolicy?: SecureFetchPolicy;
    headers: Record<string, string>;
    urlTemplate: string;
}

interface HttpLookupCacheIdentity {
    body: string | undefined;
    cacheNamespace: string;
    headers: Readonly<Record<string, string>>;
    keyFieldValue: string | undefined;
    method: 'GET' | 'POST';
    responsePath: string | undefined;
    url: string;
}

export function validateHttpLookupConfig(config: HttpLookupOperatorConfig): void {
    if (config.method !== undefined && config.method !== 'GET' && config.method !== 'POST') {
        throw new Error('HTTP lookup method must be GET or POST');
    }
    validateInteger('timeoutMs', config.timeoutMs, 1, HTTP_LOOKUP_LIMITS.MAX_TIMEOUT_MS);
    validateInteger('cacheTtlSec', config.cacheTtlSec, 0, HTTP_LOOKUP_LIMITS.MAX_CACHE_TTL_SEC);
    validateInteger('maxRetries', config.maxRetries, 0, HTTP_LOOKUP_LIMITS.MAX_RETRIES);
    validateInteger('batchSize', config.batchSize, 1, HTTP_LOOKUP_LIMITS.MAX_BATCH_SIZE);
    validateInteger(
        'rateLimitPerSecond',
        config.rateLimitPerSecond,
        1,
        HTTP_LOOKUP_LIMITS.MAX_RATE_LIMIT_PER_SECOND,
    );
    validateAuthenticationConfig(config);
    validateStaticHeaders(config.headers, config.apiKeyHeader);
}

export async function prepareHttpLookupSecurity(
    config: HttpLookupOperatorConfig,
    runtime: HttpLookupRuntimeContext = {},
): Promise<PreparedHttpLookupSecurity> {
    validateHttpLookupConfig(config);
    assertUrlHasNoCredentials(config.url, 'URL');
    const connection = await resolveHttpConnection(config.connectionCode, runtime.connections);
    const connectionHeaders = getConnectionHeaders(connection);
    const headers: Record<string, string> = {
        [HTTP_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
        ...connectionHeaders,
        ...config.headers,
    };
    const urlTemplate = connection
        ? buildUrlWithConnection(config.url, connection.config)
        : config.url;
    assertUrlHasNoCredentials(urlTemplate, 'URL');
    const baseUrl = connection ? getRequiredBaseUrl(connection) : undefined;

    if (config.bearerTokenSecretCode) {
        const token = await resolveRequiredSecret(config.bearerTokenSecretCode, runtime.secrets);
        headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
    } else if (config.apiKeySecretCode) {
        const apiKey = await resolveRequiredSecret(config.apiKeySecretCode, runtime.secrets);
        headers[config.apiKeyHeader ?? 'X-API-Key'] = apiKey;
    } else if (config.basicAuthSecretCode) {
        const credentials = await resolveRequiredSecret(config.basicAuthSecretCode, runtime.secrets);
        if (!credentials.includes(':')) {
            throw new Error('HTTP lookup Basic authentication Secret must use username:password format');
        }
        headers[HTTP_HEADERS.AUTHORIZATION] =
            `${AUTH_SCHEMES.BASIC} ${Buffer.from(credentials).toString('base64')}`;
    } else {
        const connectionAuth = getConnectionAuth(connection);
        await applyConnectionAuthentication(headers, connectionAuth, runtime.secrets);
    }

    return {
        cacheNamespace: getCacheNamespace(runtime.secrets),
        fetchPolicy: baseUrl
            ? { allowedOrigins: [new URL(baseUrl).origin] }
            : undefined,
        headers,
        urlTemplate,
    };
}

export function createHttpLookupCacheKey(identity: HttpLookupCacheIdentity): string {
    const normalizedHeaders = Object.entries(identity.headers)
        .map(([name, value]) => [name.toLowerCase(), value] as const)
        .sort(([left], [right]) => left.localeCompare(right));
    const material = JSON.stringify({
        cacheNamespace: identity.cacheNamespace,
        url: identity.url,
        method: identity.method,
        body: identity.body,
        responsePath: identity.responsePath,
        keyFieldValue: identity.keyFieldValue,
        headers: normalizedHeaders,
    });
    return createHmac('sha256', CACHE_KEY_HMAC_KEY).update(material).digest('hex');
}

function getCacheNamespace(secretResolver: HttpLookupSecretResolver | undefined): string {
    const explicitNamespace = secretResolver?.cacheNamespace;
    if (explicitNamespace !== undefined) {
        if (
            typeof explicitNamespace !== 'string' ||
            explicitNamespace.trim().length === 0 ||
            explicitNamespace.length > HTTP_LOOKUP_LIMITS.MAX_CACHE_NAMESPACE_LENGTH
        ) {
            throw new Error('HTTP lookup cache namespace is invalid');
        }
        return explicitNamespace;
    }
    if (!secretResolver) {
        return randomBytes(16).toString('hex');
    }
    const existing = IMPLICIT_CACHE_NAMESPACES.get(secretResolver);
    if (existing) return existing;
    const created = randomBytes(16).toString('hex');
    IMPLICIT_CACHE_NAMESPACES.set(secretResolver, created);
    return created;
}

function validateAuthenticationConfig(config: HttpLookupOperatorConfig): void {
    const secretCodes: unknown[] = [
        config.bearerTokenSecretCode,
        config.apiKeySecretCode,
        config.basicAuthSecretCode,
    ].filter(code => code !== undefined);
    for (const code of secretCodes) {
        if (typeof code !== 'string' || code.trim().length === 0 || code !== code.trim()) {
            throw new Error(
                'HTTP lookup Secret Codes must be non-empty strings without surrounding whitespace',
            );
        }
    }
    if (secretCodes.length > 1) {
        throw new Error('HTTP lookup supports exactly one authentication Secret Code');
    }
    if (secretCodes.length > 0 && !config.connectionCode) {
        throw new Error(
            'HTTP lookup Secret Code authentication requires a saved connection to bind credentials to an origin',
        );
    }
    if (config.apiKeyHeader !== undefined) {
        validateHeaderName(config.apiKeyHeader);
        if (!config.apiKeySecretCode) {
            throw new Error('HTTP lookup apiKeyHeader requires apiKeySecretCode');
        }
        if (FORBIDDEN_REQUEST_HEADERS.has(config.apiKeyHeader.toLowerCase())) {
            throw new Error(`HTTP lookup API key header is not allowed: ${config.apiKeyHeader}`);
        }
    }
}

async function resolveHttpConnection(
    code: string | undefined,
    connections: ConnectionResolver | undefined,
): Promise<ConnectionConfig | undefined> {
    if (code === undefined) return undefined;
    if (typeof code !== 'string' || code.trim().length === 0 || code !== code.trim()) {
        throw new Error('HTTP lookup connectionCode must be a non-empty string without surrounding whitespace');
    }
    if (!connections) {
        throw new Error('HTTP lookup connectionCode requires a Connection resolver');
    }
    const connection = await connections.getRequired(code);
    if (!HTTP_CONNECTION_TYPES.has(connection.type)) {
        throw new Error(
            `HTTP lookup connection "${code}" must use HTTP, REST, or GRAPHQL type`,
        );
    }
    getRequiredBaseUrl(connection);
    return connection;
}

function getRequiredBaseUrl(connection: ConnectionConfig): string {
    const baseUrl = connection.config.baseUrl;
    if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
        throw new Error(
            `HTTP lookup connection "${connection.code}" must define baseUrl`,
        );
    }
    assertUrlHasNoCredentials(baseUrl, `connection "${connection.code}" baseUrl`);
    return baseUrl;
}

function getConnectionHeaders(
    connection: ConnectionConfig | undefined,
): Record<string, string> {
    const value = connection?.config.headers;
    validateStaticHeaders(value);
    return value === undefined ? {} : value as Record<string, string>;
}

interface HttpConnectionAuth {
    readonly type: string;
    readonly secretCode?: string;
    readonly headerName?: string;
    readonly username?: string;
    readonly usernameSecretCode?: string;
}

function getConnectionAuth(
    connection: ConnectionConfig | undefined,
): HttpConnectionAuth | undefined {
    const value = connection?.config.auth;
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('HTTP lookup connection auth must be an object');
    }
    const auth = value as Record<string, unknown>;
    if (typeof auth.type !== 'string') {
        throw new Error('HTTP lookup connection auth requires a type');
    }
    if (!HTTP_AUTH_TYPES.has(auth.type)) {
        throw new Error(`Unsupported HTTP lookup connection authentication type: ${auth.type}`);
    }
    return auth as unknown as HttpConnectionAuth;
}

async function applyConnectionAuthentication(
    headers: Record<string, string>,
    auth: HttpConnectionAuth | undefined,
    secrets: HttpLookupSecretResolver | undefined,
): Promise<void> {
    if (!auth || auth.type === 'NONE') return;

    if (auth.type === 'BEARER') {
        const token = await resolveRequiredSecretCode(auth.secretCode, secrets, 'Bearer token');
        headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
        return;
    }
    if (auth.type === 'API_KEY') {
        const headerName = auth.headerName ?? 'X-API-Key';
        validateHeaderName(headerName);
        if (FORBIDDEN_REQUEST_HEADERS.has(headerName.toLowerCase())) {
            throw new Error(`HTTP lookup API key header is not allowed: ${headerName}`);
        }
        const apiKey = await resolveRequiredSecretCode(auth.secretCode, secrets, 'API key');
        headers[headerName] = apiKey;
        return;
    }
    if (auth.type === 'BASIC') {
        const username = auth.usernameSecretCode
            ? await resolveRequiredSecretCode(auth.usernameSecretCode, secrets, 'Basic username')
            : auth.username;
        if (!username) {
            throw new Error('HTTP lookup Basic authentication requires username credentials');
        }
        const password = await resolveRequiredSecretCode(auth.secretCode, secrets, 'Basic password');
        headers[HTTP_HEADERS.AUTHORIZATION] =
            `${AUTH_SCHEMES.BASIC} ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
}

async function resolveRequiredSecretCode(
    code: string | undefined,
    secrets: HttpLookupSecretResolver | undefined,
    label: string,
): Promise<string> {
    if (
        typeof code !== 'string' ||
        code.trim().length === 0 ||
        code !== code.trim()
    ) {
        throw new Error(`HTTP lookup connection authentication requires ${label} secretCode`);
    }
    return resolveRequiredSecret(code, secrets);
}

function assertUrlHasNoCredentials(value: string, label: string): void {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(value);
    } catch {
        return;
    }
    if (parsedUrl.username.length > 0 || parsedUrl.password.length > 0) {
        throw new Error(`HTTP lookup ${label} must not contain embedded credentials`);
    }
}

function validateStaticHeaders(headers: unknown, apiKeyHeader?: string): void {
    if (headers !== undefined && !isRecord(headers)) {
        throw new Error('HTTP lookup static headers must be a JSON object');
    }
    const entries = Object.entries(headers ?? {});
    if (entries.length > HTTP_LOOKUP_LIMITS.MAX_HEADER_COUNT) {
        throw new Error(`HTTP lookup supports at most ${HTTP_LOOKUP_LIMITS.MAX_HEADER_COUNT} static headers`);
    }
    const normalizedNames = new Set<string>();
    for (const [name, value] of entries) {
        validateHeaderName(name);
        const normalizedName = name.toLowerCase();
        if (normalizedNames.has(normalizedName)) {
            throw new Error(`HTTP lookup contains a duplicate static header: ${name}`);
        }
        normalizedNames.add(normalizedName);
        if (
            FORBIDDEN_REQUEST_HEADERS.has(normalizedName) ||
            SENSITIVE_HEADER_PATTERN.test(normalizedName) ||
            normalizedName === apiKeyHeader?.toLowerCase()
        ) {
            throw new Error(
                `HTTP lookup static header "${name}" is not allowed; configure credentials with a Secret Code`,
            );
        }
        if (typeof value !== 'string' || value.length > HTTP_LOOKUP_LIMITS.MAX_HEADER_VALUE_LENGTH) {
            throw new Error(
                `HTTP lookup static header values must be strings up to ${HTTP_LOOKUP_LIMITS.MAX_HEADER_VALUE_LENGTH} characters`,
            );
        }
        if (value.includes('\r') || value.includes('\n')) {
            throw new Error('HTTP lookup static header values cannot contain line breaks');
        }
    }
}

function validateHeaderName(name: unknown): asserts name is string {
    if (
        typeof name !== 'string' ||
        name.length === 0 ||
        name.length > HTTP_LOOKUP_LIMITS.MAX_HEADER_NAME_LENGTH ||
        !HEADER_NAME_PATTERN.test(name)
    ) {
        throw new Error('HTTP lookup header name is invalid');
    }
}

function validateInteger(
    name: string,
    value: number | undefined,
    minimum: number,
    maximum: number,
): void {
    if (value === undefined) return;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`HTTP lookup ${name} must be an integer between ${minimum} and ${maximum}`);
    }
}

async function resolveRequiredSecret(
    code: string,
    secretResolver: HttpLookupSecretResolver | undefined,
): Promise<string> {
    if (!secretResolver) {
        throw new Error('HTTP lookup authentication requires a Secret resolver');
    }
    let value: string | undefined;
    try {
        value = await secretResolver.get(code);
    } catch {
        throw new Error(`HTTP lookup Secret Code is unavailable: ${code}`);
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`HTTP lookup Secret Code is unavailable: ${code}`);
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
