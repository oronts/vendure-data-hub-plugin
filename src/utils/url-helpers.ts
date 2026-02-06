/**
 * URL Helpers
 *
 * Unified URL building logic for HTTP requests across the data-hub plugin.
 * Consolidates URL patterns from http-api extractor and graphql extractor.
 */

/**
 * Minimal connection configuration for URL building.
 *
 * This is a simplified interface used only by URL helper functions.
 * It accepts any connection-like object with a baseUrl, avoiding tight coupling
 * to the full ConnectionConfig types in shared/types or sdk/types.
 *
 * For full connection configuration, see:
 * - shared/types/extractor.types.ts ConnectionConfig - General extractor connections
 * - src/sdk/types/connection-types.ts ConnectionConfig - SDK connection management
 */
export interface UrlConnectionConfig {
    baseUrl?: string;
    headers?: Record<string, string>;
    auth?: {
        type: string;
        secretCode?: string;
        headerName?: string;
        username?: string;
        usernameSecretCode?: string;
        token?: string;
        password?: string;
    };
}

/**
 * Connection resolver function type - retrieves connection config by code
 */
export type ConnectionResolver = (connectionCode: string) => Promise<UrlConnectionConfig | undefined>;

/**
 * Build a full URL by combining a base URL from a connection with a path.
 *
 * Handles:
 * - Relative paths starting with '/'
 * - Full URLs (returned as-is when no connection)
 * - Empty URLs (returns connection baseUrl)
 * - Trailing slash normalization
 *
 * @param url - The URL or path to build
 * @param connection - Optional connection config with baseUrl
 * @returns Fully constructed URL
 */
export function buildUrlWithConnection(
    url: string,
    connection?: UrlConnectionConfig,
): string {
    if (!connection?.baseUrl) {
        return url;
    }

    // If URL is a relative path starting with '/', combine with baseUrl
    if (url.startsWith('/')) {
        return `${connection.baseUrl.replace(/\/$/, '')}${url}`;
    }

    // If URL is empty, use baseUrl directly
    if (!url) {
        return connection.baseUrl;
    }

    // URL is absolute, return as-is
    return url;
}

/**
 * Build URL with connection resolver (async version).
 * Fetches the connection config and builds the URL.
 *
 * @param url - The URL or path to build
 * @param connectionCode - Optional connection code to resolve
 * @param connectionResolver - Function to resolve connection codes
 * @returns Fully constructed URL
 */
export async function buildUrlWithConnectionCode(
    url: string,
    connectionCode: string | undefined,
    connectionResolver: ConnectionResolver,
): Promise<string> {
    if (!connectionCode) {
        return url;
    }

    const connection = await connectionResolver(connectionCode);
    return buildUrlWithConnection(url, connection);
}

/**
 * Validate URL format.
 *
 * @param url - URL string to validate
 * @param allowRelative - Whether to allow relative paths starting with '/'
 * @returns true if URL is valid
 */
export function isValidUrlFormat(url: string, allowRelative: boolean = false): boolean {
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
 * Validate URL for GraphQL endpoint.
 *
 * @param url - URL string to validate
 * @param hasConnection - Whether a connection is configured (allows empty/relative URLs)
 * @returns true if URL is valid for GraphQL endpoint
 */
export function isValidGraphQLUrl(url: string, hasConnection: boolean): boolean {
    if (!url) {
        return hasConnection; // Empty URL is ok if we have a connection
    }

    if (hasConnection && url.startsWith('/')) {
        return true;
    }

    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

/**
 * Normalize URL by removing trailing slashes.
 *
 * @param url - URL string to normalize
 * @returns Normalized URL without trailing slash
 */
export function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

/**
 * Join URL parts ensuring single slashes between them.
 *
 * @param parts - URL parts to join
 * @returns Joined URL
 */
export function joinUrlParts(...parts: string[]): string {
    return parts
        .map((part, index) => {
            if (index === 0) {
                return part.replace(/\/+$/, '');
            }
            return part.replace(/^\/+/, '').replace(/\/+$/, '');
        })
        .filter(Boolean)
        .join('/');
}
