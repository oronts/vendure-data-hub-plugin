import {
    CODE_PATTERN,
    ConnectionAuthType,
    getHttpHeaderNameError,
    getHttpUrlValidationError,
} from '../../../shared';
import { CONNECTION_TYPE } from '../../constants';
import type { ConnectionSchema } from '../../hooks/api/use-config-options';
import type { UIConnectionType } from '../../types';
import {
    isHttpLikeConnectionType,
    normalizeHttpConfig,
    resolveConnectionSchema,
} from './connection-config';

export type ConnectionConfigValidationError =
    | 'SCHEMA_UNAVAILABLE'
    | 'REQUIRED_FIELD'
    | 'INVALID_FIELD'
    | 'INVALID_URL'
    | 'INVALID_HEADERS'
    | 'INVALID_AUTHENTICATION'
    | 'INVALID_JSON'
    | 'SQS_URL_REQUIRED'
    | 'SQS_CREDENTIAL_PAIR_REQUIRED';

export function validateConnectionConfigDraft(
    type: UIConnectionType,
    config: Record<string, unknown> | null | undefined,
    schemas: readonly ConnectionSchema[],
): ConnectionConfigValidationError | null {
    const value = config ?? {};
    if (isHttpLikeConnectionType(type, schemas)) {
        return validateHttpConfig(value);
    }

    const schema = resolveConnectionSchema(type, schemas);
    if (schema.length === 0) return 'SCHEMA_UNAVAILABLE';

    for (const field of schema) {
        const fieldValue = value[field.key];
        if (isEmpty(fieldValue)) {
            if (field.required) return 'REQUIRED_FIELD';
            continue;
        }
        if (!isSchemaFieldValid(field, fieldValue)) return field.type === 'json'
            ? 'INVALID_JSON'
            : 'INVALID_FIELD';
    }

    if (type === CONNECTION_TYPE.SQS) {
        return validateSqsConfig(value);
    }
    return null;
}

function validateHttpConfig(
    config: Record<string, unknown>,
): ConnectionConfigValidationError | null {
    const normalized = normalizeHttpConfig(config);
    if (
        normalized.baseUrl.trim() !== ''
        && getHttpUrlValidationError(normalized.baseUrl) !== null
    ) {
        return 'INVALID_URL';
    }
    if (
        normalized.timeout !== undefined
        && (!Number.isFinite(normalized.timeout) || normalized.timeout < 0)
    ) {
        return 'INVALID_FIELD';
    }
    if (normalized.headers && Object.entries(normalized.headers).some(
        ([name, value]) => (
            typeof value !== 'string'
            || getHttpHeaderNameError(name, 'STATIC') !== null
        ),
    )) {
        return 'INVALID_HEADERS';
    }

    const auth = normalized.auth;
    if (!auth || auth.type === ConnectionAuthType.NONE) return null;
    if (normalized.baseUrl.trim() === '') return 'INVALID_AUTHENTICATION';
    if (!Object.values(ConnectionAuthType).includes(auth.type)) {
        return 'INVALID_AUTHENTICATION';
    }
    if (!auth.secretCode || !CODE_PATTERN.test(auth.secretCode)) {
        return 'INVALID_AUTHENTICATION';
    }
    if (auth.type === ConnectionAuthType.API_KEY && auth.headerName) {
        if (getHttpHeaderNameError(auth.headerName, 'AUTHENTICATION') !== null) {
            return 'INVALID_AUTHENTICATION';
        }
    }
    if (auth.type === ConnectionAuthType.BASIC) {
        const hasUsername = Boolean(auth.username?.trim());
        const hasUsernameSecret = Boolean(auth.usernameSecretCode);
        if (hasUsername === hasUsernameSecret) return 'INVALID_AUTHENTICATION';
        if (auth.usernameSecretCode && !CODE_PATTERN.test(auth.usernameSecretCode)) {
            return 'INVALID_AUTHENTICATION';
        }
    }
    return null;
}

function isSchemaFieldValid(
    field: ReturnType<typeof resolveConnectionSchema>[number],
    value: unknown,
): boolean {
    switch (field.type) {
        case 'number':
            return typeof value === 'number'
                && Number.isFinite(value)
                && Number.isInteger(value)
                && (field.min === undefined || value >= field.min)
                && (field.max === undefined || value <= field.max);
        case 'boolean':
            return typeof value === 'boolean';
        case 'secret':
            return typeof value === 'string' && CODE_PATTERN.test(value);
        case 'select':
            return typeof value === 'string'
                && (!field.options?.length
                    || field.options.some(option => option.value === value));
        case 'json':
            return parseJsonObject(value) !== null;
        case 'password':
        case 'string':
            return typeof value === 'string' && value.trim() !== '';
    }
}

function validateSqsConfig(
    config: Record<string, unknown>,
): ConnectionConfigValidationError | null {
    const accountId = typeof config.accountId === 'string'
        ? config.accountId.trim()
        : '';
    const queueUrl = typeof config.queueUrl === 'string'
        ? config.queueUrl.trim()
        : '';
    if (!accountId && !queueUrl) return 'SQS_URL_REQUIRED';
    if (queueUrl && getHttpUrlValidationError(queueUrl) !== null) {
        return 'INVALID_URL';
    }
    if (
        typeof config.endpoint === 'string'
        && config.endpoint.trim() !== ''
        && getHttpUrlValidationError(config.endpoint) !== null
    ) {
        return 'INVALID_URL';
    }
    const hasAccessKey = typeof config.accessKeyIdSecretCode === 'string';
    const hasSecretKey = typeof config.secretAccessKeySecretCode === 'string';
    return hasAccessKey === hasSecretKey ? null : 'SQS_CREDENTIAL_PAIR_REQUIRED';
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value) as unknown;
        } catch {
            return null;
        }
    }
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
}

function isEmpty(value: unknown): boolean {
    return value === undefined
        || value === null
        || (typeof value === 'string' && value.trim() === '');
}
