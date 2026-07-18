import { CODE_PATTERN } from '../../../shared';
import { ConnectionAuthType, ConnectionType } from '../../constants/enums';
import {
    CONNECTION_SCHEMAS,
    type ConnectionSchemaField,
} from '../../constants/connection-schemas';
import type { JsonObject, JsonValue } from '../../types';

const HTTP_CONNECTION_TYPES = new Set<ConnectionType>([
    ConnectionType.HTTP,
    ConnectionType.REST,
    ConnectionType.GRAPHQL,
]);
const HTTP_AUTH_TYPES = new Set<ConnectionAuthType>([
    ConnectionAuthType.NONE,
    ConnectionAuthType.BASIC,
    ConnectionAuthType.BEARER,
    ConnectionAuthType.API_KEY,
]);
const HTTP_CONFIG_KEYS = new Set(['baseUrl', 'timeout', 'headers', 'auth']);
const HTTP_AUTH_KEYS = new Set([
    'type',
    'secretCode',
    'headerName',
    'username',
    'usernameSecretCode',
]);
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
const RESTRICTED_HTTP_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ENV_REFERENCE_PATTERN = /^\$\{[A-Z_][A-Z0-9_]*\}$/;

function assertJsonObject(value: JsonValue | undefined, label: string): asserts value is JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
}

function assertNoPlaintextSecrets(value: JsonValue, path: string): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoPlaintextSecrets(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }

    for (const [key, item] of Object.entries(value)) {
        if (DANGEROUS_KEYS.has(key)) {
            throw new Error(`Unsafe connection configuration key "${path}.${key}"`);
        }
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSecretReference = normalizedKey.endsWith('secretcode');
        const looksSensitive = SENSITIVE_KEY_PARTS.some(part => normalizedKey.includes(part));
        if (
            looksSensitive &&
            !isSecretReference &&
            !(typeof item === 'string' && ENV_REFERENCE_PATTERN.test(item))
        ) {
            throw new Error(
                `Connection field "${path}.${key}" cannot store plaintext credentials; use a Secret Code reference`,
            );
        }
        assertNoPlaintextSecrets(item, `${path}.${key}`);
    }
}

function assertFieldType(field: ConnectionSchemaField, value: JsonValue): void {
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`Connection field "${field.key}" must be a finite number`);
    }
    if (field.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Connection field "${field.key}" must be a boolean`);
    }
    if (
        (field.type === 'text' || field.type === 'password' || field.type === 'secret' || field.type === 'select') &&
        (typeof value !== 'string' || value.trim() === '')
    ) {
        throw new Error(`Connection field "${field.key}" must be a non-empty string`);
    }
    if (field.type === 'secret' && typeof value === 'string' && !CODE_PATTERN.test(value)) {
        throw new Error(`Connection field "${field.key}" contains an invalid Secret Code`);
    }
}

function assertHttpUrl(value: JsonValue | undefined, label: string): void {
    if (value === undefined) return;
    if (typeof value !== 'string') {
        throw new Error(`${label} must be a string`);
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${label} must be a valid URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${label} must use http or https`);
    }
}

function assertSchemaConfig(type: ConnectionType, config: JsonObject): void {
    const schema = CONNECTION_SCHEMAS.find(candidate => candidate.type === type);
    if (!schema) {
        throw new Error(`No connection schema is registered for type "${type}"`);
    }
    const fields = new Map(schema.fields.map(field => [field.key, field]));
    for (const key of Object.keys(config)) {
        if (!fields.has(key)) {
            throw new Error(`Connection type "${type}" does not support field "${key}"`);
        }
    }
    for (const field of fields.values()) {
        const value = config[field.key];
        if (value === undefined || value === null || value === '') {
            if (field.required) {
                throw new Error(`Connection field "${field.key}" is required for type "${type}"`);
            }
            continue;
        }
        if (type === ConnectionType.CUSTOM && field.key === 'config') {
            assertJsonObject(value, 'Custom connection config');
            continue;
        }
        assertFieldType(field, value);
    }
    if (type === ConnectionType.SQS) {
        const hasAccountId = typeof config.accountId === 'string' && config.accountId.trim() !== '';
        const hasQueueUrl = typeof config.queueUrl === 'string' && config.queueUrl.trim() !== '';
        if (!hasAccountId && !hasQueueUrl) {
            throw new Error('SQS connections require accountId or queueUrl');
        }
        const hasAccessKey = typeof config.accessKeyIdSecretCode === 'string';
        const hasSecretKey = typeof config.secretAccessKeySecretCode === 'string';
        if (hasAccessKey !== hasSecretKey) {
            throw new Error(
                'SQS accessKeyIdSecretCode and secretAccessKeySecretCode must be configured together',
            );
        }
        assertHttpUrl(config.queueUrl, 'SQS queueUrl');
        assertHttpUrl(config.endpoint, 'SQS endpoint');
    }
}

function assertHttpConfig(config: JsonObject): void {
    for (const key of Object.keys(config)) {
        if (!HTTP_CONFIG_KEYS.has(key)) {
            throw new Error(`HTTP connections do not support field "${key}"`);
        }
    }
    if (config.baseUrl !== undefined) {
        if (typeof config.baseUrl !== 'string') {
            throw new Error('HTTP connection baseUrl must be a string');
        }
        const url = new URL(config.baseUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('HTTP connection baseUrl must use http or https');
        }
    }
    if (
        config.timeout !== undefined &&
        (typeof config.timeout !== 'number' || !Number.isFinite(config.timeout) || config.timeout < 0)
    ) {
        throw new Error('HTTP connection timeout must be a non-negative finite number');
    }
    if (config.headers !== undefined) {
        assertJsonObject(config.headers, 'HTTP connection headers');
        for (const [name, value] of Object.entries(config.headers)) {
            if (!HEADER_NAME_PATTERN.test(name)) {
                throw new Error(`Invalid HTTP header name "${name}"`);
            }
            if (typeof value !== 'string') {
                throw new Error(`HTTP header "${name}" must have a string value`);
            }
            if (RESTRICTED_HTTP_HEADERS.has(name.toLowerCase())) {
                throw new Error(
                    `HTTP header "${name}" must be configured through secret-backed authentication`,
                );
            }
        }
    }
    if (config.auth === undefined) {
        return;
    }

    assertJsonObject(config.auth, 'HTTP connection auth');
    for (const key of Object.keys(config.auth)) {
        if (!HTTP_AUTH_KEYS.has(key)) {
            throw new Error(`HTTP connection auth does not support field "${key}"`);
        }
    }
    const rawAuthType = String(config.auth.type ?? ConnectionAuthType.NONE);
    const authType = rawAuthType.toUpperCase() as ConnectionAuthType;
    if (rawAuthType !== authType) {
        throw new Error(`HTTP connection authentication type must use canonical value "${authType}"`);
    }
    if (!HTTP_AUTH_TYPES.has(authType)) {
        throw new Error(`Unsupported HTTP connection authentication type "${String(config.auth.type)}"`);
    }
    if (authType === ConnectionAuthType.NONE) {
        if (Object.keys(config.auth).some(key => key !== 'type')) {
            throw new Error('NONE authentication cannot include credential fields');
        }
        return;
    }
    if (typeof config.auth.secretCode !== 'string' || config.auth.secretCode.trim() === '') {
        throw new Error(`${authType} authentication requires secretCode`);
    }
    if (
        authType === ConnectionAuthType.BASIC &&
        typeof config.auth.username !== 'string' &&
        typeof config.auth.usernameSecretCode !== 'string'
    ) {
        throw new Error('BASIC authentication requires username or usernameSecretCode');
    }
    if (
        authType === ConnectionAuthType.API_KEY &&
        config.auth.headerName !== undefined &&
        (typeof config.auth.headerName !== 'string' || !HEADER_NAME_PATTERN.test(config.auth.headerName))
    ) {
        throw new Error('API_KEY authentication headerName is invalid');
    }
}

export function parseConnectionType(type: string): ConnectionType {
    const normalized = type.trim().toUpperCase();
    if (!Object.values(ConnectionType).includes(normalized as ConnectionType)) {
        throw new Error(
            `Invalid connection type "${type}". Valid types: ${Object.values(ConnectionType).join(', ')}`,
        );
    }
    return normalized as ConnectionType;
}

export function assertConnectionConfig(type: ConnectionType, config: JsonObject): void {
    assertJsonObject(config, 'Connection config');
    assertNoPlaintextSecrets(config, 'config');
    if (HTTP_CONNECTION_TYPES.has(type)) {
        assertHttpConfig(config);
        return;
    }
    assertSchemaConfig(type, config);
}
