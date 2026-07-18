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
    };
}

export function buildUrlWithConnection(
    url: string,
    connection?: UrlConnectionConfig,
): string {
    if (!connection?.baseUrl) {
        return url;
    }

    const baseUrl = connection.baseUrl.trim();
    let parsedBaseUrl: URL;
    try {
        parsedBaseUrl = new URL(baseUrl);
    } catch {
        throw new Error(`Connection baseUrl is invalid: ${connection.baseUrl}`);
    }
    if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
        throw new Error('Connection baseUrl must use http or https');
    }

    if (url.startsWith('/')) {
        return `${baseUrl.replace(/\/$/, '')}${url}`;
    }

    if (!url) {
        return baseUrl;
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return url;
    }
    if (parsedUrl.origin !== parsedBaseUrl.origin) {
        throw new Error(
            `Connection URL origin ${parsedBaseUrl.origin} cannot authorize request origin ${parsedUrl.origin}`,
        );
    }
    return url;
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
