/** Minimal connection config for URL building (subset of full ConnectionConfig). */
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

export type ConnectionResolver = (connectionCode: string) => Promise<UrlConnectionConfig | undefined>;

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

export function normalizeUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

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
