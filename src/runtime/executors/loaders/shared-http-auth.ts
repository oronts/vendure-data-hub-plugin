/**
 * Shared HTTP authentication resolution for loader handlers.
 *
 * Both RestPostHandler and GraphqlMutationHandler resolve bearer-token and
 * basic-auth credentials in exactly the same way.  This module extracts that
 * logic so changes only need to be made once.
 */
import { RequestContext } from '@vendure/core';
import { SecretService } from '../../../services/config/secret.service';
import { ConnectionAuthType, HTTP_HEADERS, AUTH_SCHEMES } from '../../../constants/index';

export interface AuthConfig {
    auth?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
}

/**
 * Resolve bearer / basic auth headers from secret codes.
 *
 * Returns a new headers object with the Authorization header added (if
 * applicable), merged on top of the supplied `baseHeaders`.
 *
 * The caller is responsible for catching errors thrown by SecretService and
 * logging them appropriately.
 */
export async function resolveAuthHeaders(
    ctx: RequestContext,
    secretService: SecretService,
    cfg: AuthConfig,
    baseHeaders: Record<string, string>,
): Promise<Record<string, string>> {
    let headers = baseHeaders;
    const auth = String(cfg.auth ?? ConnectionAuthType.NONE);

    if (auth === ConnectionAuthType.BEARER && cfg.bearerTokenSecretCode) {
        const token = await secretService.resolve(ctx, String(cfg.bearerTokenSecretCode));
        if (token) {
            headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${token}` };
        }
    } else if (auth === ConnectionAuthType.BASIC && cfg.basicSecretCode) {
        const credentials = await secretService.resolve(ctx, String(cfg.basicSecretCode));
        if (credentials && credentials.includes(':')) {
            const token = Buffer.from(credentials).toString('base64');
            headers = { ...headers, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BASIC} ${token}` };
        }
    }

    return headers;
}
