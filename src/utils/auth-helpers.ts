import { AuthType, HTTP_HEADERS, AUTH_SCHEMES } from '../constants/index';
import { SecretResolver as SharedSecretResolver } from '../../shared/types';

export interface AuthConfig {
    type: AuthType;
    /** Secret code for looking up the token/password via secret resolver */
    secretCode?: string;
    /** Header name for api-key auth (defaults to 'X-API-Key') */
    headerName?: string;
    /** Username for basic auth */
    username?: string;
    /** Secret code for looking up username (for basic auth) */
    usernameSecretCode?: string;
    /** Direct token value (if not using secret resolver) */
    token?: string;
    /** Direct password value for basic auth (if not using secret resolver) */
    password?: string;
}

export type SecretResolverFn = (secretCode: string) => Promise<string | undefined>;
export type { SharedSecretResolver };

/** Supports: Bearer, API key, and Basic auth. */
export async function applyAuthentication(
    headers: Record<string, string>,
    auth: AuthConfig | undefined,
    secretResolver?: SecretResolverFn,
): Promise<void> {
    if (!auth || auth.type === AuthType.NONE) {
        return;
    }

    switch (auth.type) {
        case AuthType.BEARER: {
            const token = auth.secretCode && secretResolver
                ? await secretResolver(auth.secretCode)
                : auth.token;
            if (token) {
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
            }
            break;
        }

        case AuthType.API_KEY: {
            const apiKey = auth.secretCode && secretResolver
                ? await secretResolver(auth.secretCode)
                : auth.token;
            if (apiKey) {
                const headerName = auth.headerName || HTTP_HEADERS.X_API_KEY;
                headers[headerName] = apiKey;
            }
            break;
        }

        case AuthType.BASIC: {
            const password = auth.secretCode && secretResolver
                ? await secretResolver(auth.secretCode)
                : auth.password || '';

            let username = auth.username || '';
            if (!username && auth.usernameSecretCode && secretResolver) {
                username = await secretResolver(auth.usernameSecretCode) || '';
            }

            if (username || password) {
                const credentials = Buffer.from(`${username}:${password}`).toString('base64');
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${credentials}`;
            }
            break;
        }
    }
}

export function createSecretResolver(
    secrets: SharedSecretResolver,
): SecretResolverFn {
    return (secretCode: string) => secrets.get(secretCode);
}
