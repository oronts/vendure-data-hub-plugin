/**
 * Shared HTTP authentication resolution for loader handlers.
 *
 * Both RestPostHandler and GraphqlMutationHandler resolve bearer-token and
 * basic-auth credentials in exactly the same way.  This module extracts that
 * logic so changes only need to be made once.
 */
import { RequestContext } from '@vendure/core';
import { SecretService } from '../../../services/config/secret.service';
import { ConnectionAuthType } from '../../../../shared/types/adapter-config.types';
import { HTTP_HEADERS, AUTH_SCHEMES } from '../../../constants/services';

export interface AuthConfig {
    auth?: string;
    bearerTokenSecretCode?: string;
    basicSecretCode?: string;
}

/** Resolve required bearer or basic auth headers from secret codes. */
export async function resolveAuthHeaders(
    ctx: RequestContext,
    secretService: SecretService,
    cfg: AuthConfig,
    baseHeaders: Record<string, string>,
): Promise<Record<string, string>> {
    const auth = String(cfg.auth ?? ConnectionAuthType.NONE);
    if (auth === ConnectionAuthType.NONE) {
        return baseHeaders;
    }

    if (auth === ConnectionAuthType.BEARER) {
        if (!cfg.bearerTokenSecretCode) {
            throw new Error('BEARER authentication requires bearerTokenSecretCode');
        }
        const token = await secretService.resolve(ctx, cfg.bearerTokenSecretCode);
        if (!token) {
            throw new Error(`BEARER authentication secret "${cfg.bearerTokenSecretCode}" is empty or unavailable`);
        }
        return { ...baseHeaders, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BEARER} ${token}` };
    }

    if (auth === ConnectionAuthType.BASIC) {
        if (!cfg.basicSecretCode) {
            throw new Error('BASIC authentication requires basicSecretCode');
        }
        const credentials = await secretService.resolve(ctx, cfg.basicSecretCode);
        if (!credentials) {
            throw new Error(`BASIC authentication secret "${cfg.basicSecretCode}" is empty or unavailable`);
        }
        const separator = credentials.indexOf(':');
        if (separator <= 0 || separator === credentials.length - 1) {
            throw new Error(`BASIC authentication secret "${cfg.basicSecretCode}" must contain non-empty username and password values`);
        }
        const token = Buffer.from(credentials).toString('base64');
        return { ...baseHeaders, [HTTP_HEADERS.AUTHORIZATION]: `${AUTH_SCHEMES.BASIC} ${token}` };
    }

    throw new Error(`Unsupported loader authentication type: ${auth}`);
}
