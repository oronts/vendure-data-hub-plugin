import type { DestinationConfig } from './destination.types';
import { parseDestinationConfig } from './destination-config.validation';

const SENSITIVE_HEADER_PARTS = [
    'authorization',
    'proxyauthorization',
    'cookie',
    'setcookie',
    'apikey',
    'password',
    'token',
    'secret',
] as const;

function safeHeaders(
    value: Record<string, string> | undefined,
): Record<string, string> | undefined {
    if (!value) {
        return undefined;
    }
    return Object.fromEntries(
        Object.entries(value).filter(([name]) => {
            const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return !SENSITIVE_HEADER_PARTS.some(part => normalized.includes(part));
        }),
    );
}

/**
 * Rebuilds a public destination from an explicit allowlist. This also prevents
 * raw fields left by an older in-memory config shape from reaching the API.
 */
export function sanitizeDestinationConfig(
    config: DestinationConfig,
): DestinationConfig {
    const base = {
        id: config.id,
        name: config.name,
        enabled: config.enabled,
    };

    switch (config.type) {
        case 'S3':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                bucket: config.bucket,
                region: config.region,
                accessKeyIdSecretCode: config.accessKeyIdSecretCode,
                secretAccessKeySecretCode: config.secretAccessKeySecretCode,
                prefix: config.prefix,
                acl: config.acl,
                endpoint: config.endpoint,
            });
        case 'SFTP':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                host: config.host,
                port: config.port,
                username: config.username,
                passwordSecretCode: config.passwordSecretCode,
                privateKeySecretCode: config.privateKeySecretCode,
                passphraseSecretCode: config.passphraseSecretCode,
                hostKeyFingerprintSecretCode: config.hostKeyFingerprintSecretCode,
                remotePath: config.remotePath,
                timeout: config.timeout,
            });
        case 'FTP':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                host: config.host,
                port: config.port,
                username: config.username,
                passwordSecretCode: config.passwordSecretCode,
                remotePath: config.remotePath,
                secure: config.secure,
            });
        case 'HTTP':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                url: config.url,
                method: config.method,
                headers: safeHeaders(config.headers),
                headerSecretCodes: config.headerSecretCodes,
                auth: config.auth
                    ? {
                        type: config.auth.type,
                        secretCode: config.auth.secretCode,
                        headerName: config.auth.headerName,
                        username: config.auth.username,
                        usernameSecretCode: config.auth.usernameSecretCode,
                    }
                    : undefined,
            });
        case 'LOCAL':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                directory: config.directory,
            });
        case 'EMAIL':
            return parseDestinationConfig({
                ...base,
                type: config.type,
                to: [...config.to],
                cc: config.cc ? [...config.cc] : undefined,
                bcc: config.bcc ? [...config.bcc] : undefined,
                from: config.from,
                subject: config.subject,
                body: config.body,
                smtp: {
                    host: config.smtp.host,
                    port: config.smtp.port,
                    secure: config.smtp.secure,
                    username: config.smtp.username,
                    usernameSecretCode: config.smtp.usernameSecretCode,
                    passwordSecretCode: config.smtp.passwordSecretCode,
                },
            });
    }
}
