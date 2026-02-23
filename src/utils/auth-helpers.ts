import { ConnectionAuthType, HTTP_HEADERS, AUTH_SCHEMES } from '../constants/index';
import { SecretResolver as SharedSecretResolver, AuthConfig as SharedAuthConfig } from '../../shared/types';

/**
 * AuthConfig used by auth-helpers.
 */
export type AuthConfig = Omit<SharedAuthConfig, 'type'> & { type: ConnectionAuthType };

type SecretResolverFn = (secretCode: string) => Promise<string | undefined>;

/** Supports: Bearer, API key, and Basic auth. */
export async function applyAuthentication(
    headers: Record<string, string>,
    auth: AuthConfig | undefined,
    secretResolver?: SecretResolverFn,
): Promise<void> {
    if (!auth || auth.type === ConnectionAuthType.NONE) {
        return;
    }

    switch (auth.type) {
        case ConnectionAuthType.BEARER: {
            const token = auth.secretCode && secretResolver
                ? await secretResolver(auth.secretCode)
                : auth.token;
            if (token) {
                headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
            }
            break;
        }

        case ConnectionAuthType.API_KEY: {
            const apiKey = auth.secretCode && secretResolver
                ? await secretResolver(auth.secretCode)
                : auth.token;
            if (apiKey) {
                const headerName = auth.headerName || HTTP_HEADERS.X_API_KEY;
                headers[headerName] = apiKey;
            }
            break;
        }

        case ConnectionAuthType.BASIC: {
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
