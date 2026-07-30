import { CODE_PATTERN } from '../../../shared';
import { ConnectionAuthType } from '../../constants/enums';
import type {
    DestinationAuthConfig,
    DestinationAuthType,
    DestinationConfig,
    EmailSmtpConfig,
} from './destination.types';

type PlainRecord = Record<string, unknown>;

const BASE_KEYS = ['id', 'name', 'type', 'enabled'] as const;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SENSITIVE_KEY_PARTS = [
    'password',
    'token',
    'secret',
    'apikey',
    'accesskey',
    'privatekey',
    'authorization',
    'cookie',
] as const;
const RESTRICTED_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DESTINATION_TYPES = new Set(['S3', 'SFTP', 'FTP', 'HTTP', 'LOCAL', 'EMAIL']);
const HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const HTTP_AUTH_TYPES = new Set([
    ConnectionAuthType.NONE,
    ConnectionAuthType.BASIC,
    ConnectionAuthType.BEARER,
    ConnectionAuthType.API_KEY,
]);

function isPlainRecord(value: unknown): value is PlainRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertSafeObjectTree(value: unknown, path: string): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSafeObjectTree(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }
    if (!isPlainRecord(value)) {
        throw new Error(`Destination configuration at "${path}" must be a plain object`);
    }

    const containsSecretHeaderCodes = path.endsWith('.headerSecretCodes');
    for (const key of Object.getOwnPropertyNames(value)) {
        if (DANGEROUS_KEYS.has(key)) {
            throw new Error(`Unsafe destination configuration key "${path}.${key}"`);
        }
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSecretReference = normalizedKey.endsWith('secretcode') || normalizedKey.endsWith('secretcodes');
        if (
            !containsSecretHeaderCodes &&
            !isSecretReference &&
            SENSITIVE_KEY_PARTS.some(part => normalizedKey.includes(part))
        ) {
            throw new Error(
                `Destination field "${path}.${key}" cannot store plaintext credentials; use a Secret Code reference`,
            );
        }
        assertSafeObjectTree(value[key], `${path}.${key}`);
    }
}

function assertAllowedKeys(value: PlainRecord, allowed: readonly string[], path = 'destination'): void {
    const allowedKeys = new Set([...BASE_KEYS, ...allowed]);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Destination type "${String(value.type)}" does not support field "${path}.${key}"`);
        }
    }
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Destination field "${field}" must be a non-empty string`);
    }
    return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return requiredString(value, field);
}

function secretCode(value: unknown, field: string, required: boolean): string | undefined {
    const code = optionalString(value, field);
    if (!code) {
        if (required) {
            throw new Error(`Destination field "${field}" requires a Secret Code`);
        }
        return undefined;
    }
    if (!CODE_PATTERN.test(code)) {
        throw new Error(`Destination field "${field}" contains an invalid Secret Code`);
    }
    return code;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`Destination field "${field}" must be a boolean`);
    }
    return value;
}

function optionalInteger(
    value: unknown,
    field: string,
    min: number,
    max: number,
): number | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
        throw new Error(`Destination field "${field}" must be an integer between ${min} and ${max}`);
    }
    return value as number;
}

function assertHttpUrl(value: string, field: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`Destination field "${field}" must be a valid URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`Destination field "${field}" must use HTTP or HTTPS`);
    }
    if (url.username || url.password) {
        throw new Error(`Destination field "${field}" cannot contain embedded credentials`);
    }
    return value;
}

function stringArray(value: unknown, field: string, required: boolean): string[] | undefined {
    if (value === undefined || value === null) {
        if (required) {
            throw new Error(`Destination field "${field}" is required`);
        }
        return undefined;
    }
    if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.trim() === '')) {
        throw new Error(`Destination field "${field}" must be a non-empty string array`);
    }
    return value.map(item => (item as string).trim());
}

function headers(value: unknown): Record<string, string> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isPlainRecord(value)) {
        throw new Error('Destination field "headers" must be an object');
    }
    const result: Record<string, string> = {};
    for (const [name, headerValue] of Object.entries(value)) {
        if (!HEADER_NAME_PATTERN.test(name)) {
            throw new Error(`Invalid destination HTTP header name "${name}"`);
        }
        if (typeof headerValue !== 'string') {
            throw new Error(`Destination HTTP header "${name}" must have a string value`);
        }
        const normalizedName = name.toLowerCase();
        if (
            RESTRICTED_HEADERS.has(normalizedName) ||
            SENSITIVE_KEY_PARTS.some(part => normalizedName.replace(/[^a-z0-9]/g, '').includes(part))
        ) {
            throw new Error(`Destination HTTP header "${name}" must use secret-backed authentication`);
        }
        result[name] = headerValue;
    }
    return result;
}

function headerSecretCodes(value: unknown): Record<string, string> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isPlainRecord(value)) {
        throw new Error('Destination field "headerSecretCodes" must be an object');
    }
    const result: Record<string, string> = {};
    for (const [name, code] of Object.entries(value)) {
        if (!HEADER_NAME_PATTERN.test(name)) {
            throw new Error(`Invalid destination HTTP header name "${name}"`);
        }
        result[name] = secretCode(code, `headerSecretCodes.${name}`, true)!;
    }
    return result;
}

function assertDistinctHeaderSources(
    staticHeaders: Record<string, string> | undefined,
    secretHeaders: Record<string, string> | undefined,
    auth: DestinationAuthConfig | undefined,
): void {
    const staticNames = new Set(Object.keys(staticHeaders ?? {}).map(name => name.toLowerCase()));
    for (const name of Object.keys(secretHeaders ?? {})) {
        if (staticNames.has(name.toLowerCase())) {
            throw new Error(`Destination HTTP header "${name}" cannot be configured in both headers and headerSecretCodes`);
        }
    }

    const authHeader = auth?.type === ConnectionAuthType.API_KEY
        ? auth.headerName ?? 'x-api-key'
        : auth && auth.type !== ConnectionAuthType.NONE
            ? 'authorization'
            : undefined;
    if (authHeader && Object.keys(secretHeaders ?? {}).some(name => name.toLowerCase() === authHeader.toLowerCase())) {
        throw new Error(`Destination HTTP header "${authHeader}" cannot be configured by both auth and headerSecretCodes`);
    }
}

function destinationAuth(value: unknown): DestinationAuthConfig | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isPlainRecord(value)) {
        throw new Error('Destination field "auth" must be an object');
    }
    const allowedKeys = new Set(['type', 'secretCode', 'headerName', 'username', 'usernameSecretCode']);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Destination HTTP auth does not support field "${key}"`);
        }
    }

    const type = requiredString(value.type, 'auth.type') as DestinationAuthType;
    if (!HTTP_AUTH_TYPES.has(type)) {
        throw new Error(`Unsupported destination HTTP authentication type "${type}"`);
    }
    const credentialCode = secretCode(value.secretCode, 'auth.secretCode', type !== ConnectionAuthType.NONE);
    const username = optionalString(value.username, 'auth.username');
    const usernameSecretCode = secretCode(value.usernameSecretCode, 'auth.usernameSecretCode', false);
    const headerName = optionalString(value.headerName, 'auth.headerName');

    if (type === ConnectionAuthType.NONE) {
        if (credentialCode || username || usernameSecretCode || headerName) {
            throw new Error('NONE destination authentication cannot include credential fields');
        }
        return { type };
    }
    if (type === ConnectionAuthType.BASIC && (!username && !usernameSecretCode)) {
        throw new Error('BASIC destination authentication requires username or usernameSecretCode');
    }
    if (username && usernameSecretCode) {
        throw new Error('Destination authentication must not configure both username and usernameSecretCode');
    }
    if (type === ConnectionAuthType.API_KEY && headerName && !HEADER_NAME_PATTERN.test(headerName)) {
        throw new Error('Destination API key headerName is invalid');
    }
    if (type !== ConnectionAuthType.API_KEY && headerName) {
        throw new Error(`${type} destination authentication does not support headerName`);
    }
    if (type !== ConnectionAuthType.BASIC && (username || usernameSecretCode)) {
        throw new Error(`${type} destination authentication does not support username credentials`);
    }

    return {
        type,
        secretCode: credentialCode,
        headerName,
        username,
        usernameSecretCode,
    };
}

function smtpConfig(value: unknown): EmailSmtpConfig {
    if (!isPlainRecord(value)) {
        throw new Error('Destination field "smtp" must be an object');
    }
    const allowedKeys = new Set([
        'host',
        'port',
        'secure',
        'username',
        'usernameSecretCode',
        'passwordSecretCode',
    ]);
    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Destination SMTP configuration does not support field "${key}"`);
        }
    }
    const username = optionalString(value.username, 'smtp.username');
    const usernameSecretCode = secretCode(value.usernameSecretCode, 'smtp.usernameSecretCode', false);
    const passwordSecretCode = secretCode(value.passwordSecretCode, 'smtp.passwordSecretCode', false);
    if (username && usernameSecretCode) {
        throw new Error('Destination SMTP must not configure both username and usernameSecretCode');
    }
    if (Boolean(username || usernameSecretCode) !== Boolean(passwordSecretCode)) {
        throw new Error('Destination SMTP authentication requires both username credentials and passwordSecretCode');
    }
    return {
        host: requiredString(value.host, 'smtp.host'),
        port: optionalInteger(value.port, 'smtp.port', 1, 65_535) ?? 587,
        secure: optionalBoolean(value.secure, 'smtp.secure'),
        username,
        usernameSecretCode,
        passwordSecretCode,
    };
}

function baseConfig(value: PlainRecord) {
    return {
        id: requiredString(value.id, 'id'),
        name: requiredString(value.name, 'name'),
        enabled: optionalBoolean(value.enabled, 'enabled'),
    };
}

export function parseDestinationConfig(value: unknown): DestinationConfig {
    assertSafeObjectTree(value, 'destination');
    if (!isPlainRecord(value)) {
        throw new Error('Destination configuration must be an object');
    }
    const type = requiredString(value.type, 'type');
    if (!DESTINATION_TYPES.has(type)) {
        throw new Error(`Unsupported export destination type "${type}"`);
    }
    const base = baseConfig(value);

    switch (type) {
        case 'S3':
            assertAllowedKeys(value, [
                'bucket', 'region', 'accessKeyIdSecretCode', 'secretAccessKeySecretCode',
                'prefix', 'acl', 'endpoint',
            ]);
            if (value.acl !== undefined && value.acl !== 'private' && value.acl !== 'public-read') {
                throw new Error('Destination field "acl" must be private or public-read');
            }
            return {
                ...base,
                type,
                bucket: requiredString(value.bucket, 'bucket'),
                region: requiredString(value.region, 'region'),
                accessKeyIdSecretCode: secretCode(value.accessKeyIdSecretCode, 'accessKeyIdSecretCode', true)!,
                secretAccessKeySecretCode: secretCode(value.secretAccessKeySecretCode, 'secretAccessKeySecretCode', true)!,
                prefix: optionalString(value.prefix, 'prefix'),
                acl: value.acl as 'private' | 'public-read' | undefined,
                endpoint: value.endpoint === undefined
                    ? undefined
                    : assertHttpUrl(requiredString(value.endpoint, 'endpoint'), 'endpoint'),
            };
        case 'SFTP': {
            assertAllowedKeys(value, [
                'host', 'port', 'username', 'passwordSecretCode', 'privateKeySecretCode',
                'passphraseSecretCode', 'hostKeyFingerprintSecretCode', 'remotePath', 'timeout',
            ]);
            const passwordSecretCode = secretCode(value.passwordSecretCode, 'passwordSecretCode', false);
            const privateKeySecretCode = secretCode(value.privateKeySecretCode, 'privateKeySecretCode', false);
            const passphraseSecretCode = secretCode(value.passphraseSecretCode, 'passphraseSecretCode', false);
            const hostKeyFingerprintSecretCode = secretCode(value.hostKeyFingerprintSecretCode, 'hostKeyFingerprintSecretCode', false);
            if (!passwordSecretCode && !privateKeySecretCode) {
                throw new Error('SFTP destination requires passwordSecretCode or privateKeySecretCode');
            }
            if (passphraseSecretCode && !privateKeySecretCode) {
                throw new Error('SFTP passphraseSecretCode requires privateKeySecretCode');
            }
            return {
                ...base,
                type,
                host: requiredString(value.host, 'host'),
                port: optionalInteger(value.port, 'port', 1, 65_535),
                username: requiredString(value.username, 'username'),
                passwordSecretCode,
                privateKeySecretCode,
                passphraseSecretCode,
                hostKeyFingerprintSecretCode,
                remotePath: requiredString(value.remotePath, 'remotePath'),
                timeout: optionalInteger(value.timeout, 'timeout', 1, 300_000),
            };
        }
        case 'FTP':
            assertAllowedKeys(value, ['host', 'port', 'username', 'passwordSecretCode', 'remotePath', 'secure']);
            return {
                ...base,
                type,
                host: requiredString(value.host, 'host'),
                port: optionalInteger(value.port, 'port', 1, 65_535),
                username: requiredString(value.username, 'username'),
                passwordSecretCode: secretCode(value.passwordSecretCode, 'passwordSecretCode', true)!,
                remotePath: requiredString(value.remotePath, 'remotePath'),
                secure: optionalBoolean(value.secure, 'secure'),
            };
        case 'HTTP': {
            assertAllowedKeys(value, ['url', 'method', 'headers', 'headerSecretCodes', 'auth']);
            const method = optionalString(value.method, 'method');
            if (method && !HTTP_METHODS.has(method)) {
                throw new Error(`Unsupported destination HTTP method "${method}"`);
            }
            const staticHeaders = headers(value.headers);
            const secretHeaders = headerSecretCodes(value.headerSecretCodes);
            const auth = destinationAuth(value.auth);
            assertDistinctHeaderSources(staticHeaders, secretHeaders, auth);
            return {
                ...base,
                type,
                url: assertHttpUrl(requiredString(value.url, 'url'), 'url'),
                method: method as 'POST' | 'PUT' | 'PATCH' | undefined,
                headers: staticHeaders,
                headerSecretCodes: secretHeaders,
                auth,
            };
        }
        case 'LOCAL':
            assertAllowedKeys(value, ['directory']);
            return {
                ...base,
                type,
                directory: requiredString(value.directory, 'directory'),
            };
        case 'EMAIL':
            assertAllowedKeys(value, ['to', 'cc', 'bcc', 'from', 'subject', 'body', 'smtp']);
            return {
                ...base,
                type,
                to: stringArray(value.to, 'to', true)!,
                cc: stringArray(value.cc, 'cc', false),
                bcc: stringArray(value.bcc, 'bcc', false),
                from: optionalString(value.from, 'from'),
                subject: requiredString(value.subject, 'subject'),
                body: optionalString(value.body, 'body'),
                smtp: smtpConfig(value.smtp),
            };
        default:
            throw new Error(`Unsupported export destination type "${type}"`);
    }
}


export function getDestinationSecretCodes(config: DestinationConfig): string[] {
    switch (config.type) {
        case 'S3':
            return [config.accessKeyIdSecretCode, config.secretAccessKeySecretCode];
        case 'SFTP':
            return [
                config.passwordSecretCode,
                config.privateKeySecretCode,
                config.passphraseSecretCode,
                config.hostKeyFingerprintSecretCode,
            ]
                .filter((code): code is string => Boolean(code));
        case 'FTP':
            return [config.passwordSecretCode];
        case 'HTTP':
            return [
                config.auth?.secretCode,
                config.auth?.usernameSecretCode,
                ...Object.values(config.headerSecretCodes ?? {}),
            ]
                .filter((code): code is string => Boolean(code));
        case 'EMAIL':
            return [config.smtp.passwordSecretCode, config.smtp.usernameSecretCode]
                .filter((code): code is string => Boolean(code));
        case 'LOCAL':
            return [];
    }
}
