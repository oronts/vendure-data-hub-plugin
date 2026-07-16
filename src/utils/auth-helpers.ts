import { ConnectionAuthType, HTTP_HEADERS, AUTH_SCHEMES } from '../constants/index';
import { SecretResolver as SharedSecretResolver, AuthConfig as SharedAuthConfig } from '../../shared/types';

/**
 * AuthConfig used by auth-helpers.
 */
export type AuthConfig = Omit<SharedAuthConfig, 'type'> & { type: ConnectionAuthType };

type SecretResolverFn = (secretCode: string) => Promise<string | undefined>;

async function resolveRequiredCredential(
    authType: ConnectionAuthType,
    secretCode: string | undefined,
    secretResolver: SecretResolverFn | undefined,
    credentialName: string,
): Promise<string> {
    if (!secretCode) {
        throw new Error(`${authType} authentication requires ${credentialName} secretCode`);
    }
    if (!secretResolver) {
        throw new Error(`${authType} authentication cannot resolve ${credentialName} secret "${secretCode}"`);
    }
    const value = await secretResolver(secretCode);
    if (!value) {
        throw new Error(`${authType} authentication ${credentialName} secret "${secretCode}" is empty or unavailable`);
    }
    return value;
}

/** Supports Bearer, API key, and Basic authentication and fails closed for incomplete credentials. */
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
            const token = await resolveRequiredCredential(auth.type, auth.secretCode, secretResolver, 'token');
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BEARER} ${token}`;
            return;
        }
        case ConnectionAuthType.API_KEY: {
            const apiKey = await resolveRequiredCredential(auth.type, auth.secretCode, secretResolver, 'API key');
            const headerName = auth.headerName || HTTP_HEADERS.X_API_KEY;
            headers[headerName] = apiKey;
            return;
        }
        case ConnectionAuthType.BASIC: {
            const username = auth.usernameSecretCode
                ? await resolveRequiredCredential(auth.type, auth.usernameSecretCode, secretResolver, 'username')
                : auth.username;
            if (!username) {
                throw new Error(`${auth.type} authentication requires username credentials`);
            }
            const password = await resolveRequiredCredential(auth.type, auth.secretCode, secretResolver, 'password');
            const credentials = Buffer.from(`${username}:${password}`).toString('base64');
            headers[HTTP_HEADERS.AUTHORIZATION] = `${AUTH_SCHEMES.BASIC} ${credentials}`;
            return;
        }
        default:
            throw new Error(`Unsupported connection authentication type: ${String(auth.type)}`);
    }
}

export function createSecretResolver(
    secrets: SharedSecretResolver,
): SecretResolverFn {
    return (secretCode: string) => secrets.get(secretCode);
}
