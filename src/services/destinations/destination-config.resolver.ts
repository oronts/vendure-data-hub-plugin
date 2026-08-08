import type { RequestContext } from '@vendure/core';
import { ConnectionAuthType } from '../../../shared/types/extractor-config.types';
import type { SecretService } from '../config/secret.service';
import type {
    DestinationConfig,
    EmailDestinationConfig,
    HTTPDestinationConfig,
    ResolvedDestinationConfig,
} from './destination.types';

export async function resolveDestinationConfig(
    secretService: SecretService,
    ctx: RequestContext,
    config: DestinationConfig,
): Promise<ResolvedDestinationConfig> {
    const resolveSecret = (
        code: string,
        credential: string,
    ) => resolveRequiredSecret(secretService, ctx, code, credential);

    switch (config.type) {
        case 'S3': {
            const {
                accessKeyIdSecretCode,
                secretAccessKeySecretCode,
                ...safeConfig
            } = config;
            return {
                ...safeConfig,
                accessKeyId: await resolveSecret(
                    accessKeyIdSecretCode,
                    'access key ID',
                ),
                secretAccessKey: await resolveSecret(
                    secretAccessKeySecretCode,
                    'secret access key',
                ),
            };
        }
        case 'SFTP': {
            const {
                passwordSecretCode,
                privateKeySecretCode,
                passphraseSecretCode,
                hostKeyFingerprintSecretCode,
                ...safeConfig
            } = config;
            return {
                ...safeConfig,
                password: passwordSecretCode
                    ? await resolveSecret(passwordSecretCode, 'SFTP password')
                    : undefined,
                privateKey: privateKeySecretCode
                    ? await resolveSecret(privateKeySecretCode, 'SFTP private key')
                    : undefined,
                passphrase: passphraseSecretCode
                    ? await resolveSecret(
                        passphraseSecretCode,
                        'SFTP private-key passphrase',
                    )
                    : undefined,
                hostKeyFingerprint: hostKeyFingerprintSecretCode
                    ? await resolveSecret(
                        hostKeyFingerprintSecretCode,
                        'SFTP host-key fingerprint',
                    )
                    : undefined,
            };
        }
        case 'FTP': {
            const { passwordSecretCode, ...safeConfig } = config;
            return {
                ...safeConfig,
                password: await resolveSecret(passwordSecretCode, 'FTP password'),
            };
        }
        case 'HTTP':
            return resolveHttpDestination(resolveSecret, config);
        case 'EMAIL':
            return resolveEmailDestination(resolveSecret, config);
        case 'LOCAL':
            return { ...config };
    }
}

type SecretResolver = (code: string, credential: string) => Promise<string>;

async function resolveHttpDestination(
    resolveSecret: SecretResolver,
    config: HTTPDestinationConfig,
): Promise<ResolvedDestinationConfig> {
    const { auth, headerSecretCodes, ...safeConfig } = config;
    const resolvedSecretHeaders: Record<string, string> = {};
    for (const [name, code] of Object.entries(headerSecretCodes ?? {})) {
        resolvedSecretHeaders[name] = await resolveSecret(
            code,
            `HTTP header ${name}`,
        );
    }
    const headers = {
        ...safeConfig.headers,
        ...resolvedSecretHeaders,
    };
    if (!auth || auth.type === ConnectionAuthType.NONE) {
        return {
            ...safeConfig,
            headers,
            authType: ConnectionAuthType.NONE,
        };
    }

    if (!auth.secretCode) {
        throw new Error(`${auth.type} destination authentication requires a Secret Code`);
    }
    const credential = await resolveSecret(auth.secretCode, 'HTTP authentication');
    switch (auth.type) {
        case ConnectionAuthType.BASIC: {
            const username = auth.usernameSecretCode
                ? await resolveSecret(
                    auth.usernameSecretCode,
                    'HTTP Basic username',
                )
                : auth.username;
            if (!username) {
                throw new Error('BASIC destination authentication requires a username');
            }
            return {
                ...safeConfig,
                headers,
                authType: auth.type,
                authConfig: { username, password: credential },
            };
        }
        case ConnectionAuthType.BEARER:
            return {
                ...safeConfig,
                headers,
                authType: auth.type,
                authConfig: { token: credential },
            };
        case ConnectionAuthType.API_KEY:
            return {
                ...safeConfig,
                headers,
                authType: auth.type,
                authConfig: {
                    apiKey: credential,
                    apiKeyHeader: auth.headerName,
                },
            };
        default:
            throw new Error(
                `Unsupported destination HTTP authentication type: ${String(auth.type)}`,
            );
    }
}

async function resolveEmailDestination(
    resolveSecret: SecretResolver,
    config: EmailDestinationConfig,
): Promise<ResolvedDestinationConfig> {
    const { smtp, ...safeConfig } = config;
    const username = smtp.usernameSecretCode
        ? await resolveSecret(smtp.usernameSecretCode, 'SMTP username')
        : smtp.username;
    const password = smtp.passwordSecretCode
        ? await resolveSecret(smtp.passwordSecretCode, 'SMTP password')
        : undefined;

    return {
        ...safeConfig,
        smtp: {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: username && password
                ? { user: username, pass: password }
                : undefined,
        },
    };
}

async function resolveRequiredSecret(
    secretService: SecretService,
    ctx: RequestContext,
    code: string,
    credential: string,
): Promise<string> {
    const value = await secretService.resolve(ctx, code);
    if (!value) {
        throw new Error(
            `Destination ${credential} Secret Code "${code}" is empty or unavailable`,
        );
    }
    return value;
}
