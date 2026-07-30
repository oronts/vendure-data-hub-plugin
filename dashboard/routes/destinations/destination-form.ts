import {
    DataHubDestinationType,
    type DataHubExportDestinationInput,
} from '../../gql/graphql';
import type { DestinationSchema } from '../../hooks/api/use-config-options';
import type { DestinationConfig } from '../../types/wizard';
import { CODE_PATTERN, isEmpty, getNestedValue, setNestedValue } from '../../../shared';
import {
    DESTINATION_TRANSLATION_IDS,
    type DestinationTranslationId,
} from '../../constants/destination-labels';

export type ManagedDestinationType = DestinationConfig['type'];

export interface ManagedDestinationDraft {
    id: string;
    name: string;
    enabled: boolean;
    destination: DestinationConfig;
}

export interface ManagedDestinationValidation {
    isValid: boolean;
    errors: Record<string, string>;
}

export type DestinationMessageFormatter = (
    id: DestinationTranslationId,
    values?: Readonly<Record<string, string | number>>,
) => string;

const DESTINATION_TYPES = new Set<ManagedDestinationType>([
    'SFTP',
    'FTP',
    'HTTP',
    'S3',
    'EMAIL',
    'LOCAL',
]);

const GRAPHQL_DESTINATION_TYPES: Readonly<Record<ManagedDestinationType, DataHubDestinationType>> = {
    SFTP: DataHubDestinationType.SFTP,
    FTP: DataHubDestinationType.FTP,
    HTTP: DataHubDestinationType.HTTP,
    S3: DataHubDestinationType.S3,
    EMAIL: DataHubDestinationType.EMAIL,
    LOCAL: DataHubDestinationType.LOCAL,
};

export function isManagedDestinationType(value: string): value is ManagedDestinationType {
    return DESTINATION_TYPES.has(value as ManagedDestinationType);
}

function schemaDefaults(schema: DestinationSchema | undefined): Record<string, unknown> {
    let result: Record<string, unknown> = {};
    for (const field of schema?.fields ?? []) {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            result = setNestedValue(result, field.key, field.defaultValue);
        }
    }
    return result;
}

export function createDestinationConfig(
    type: ManagedDestinationType,
    schema: DestinationSchema | undefined,
): DestinationConfig {
    return {
        type,
        ...(schema?.configKey ? { [schema.configKey]: schemaDefaults(schema) } : {}),
    } as DestinationConfig;
}

export function createManagedDestinationDraft(
    type: ManagedDestinationType,
    schema: DestinationSchema | undefined,
): ManagedDestinationDraft {
    return {
        id: '',
        name: '',
        enabled: true,
        destination: createDestinationConfig(type, schema),
    };
}

function getDestinationValues(
    destination: DestinationConfig,
    schema: DestinationSchema | undefined,
): Record<string, unknown> {
    if (!schema?.configKey) return {};
    const destinationRecord: Record<string, unknown> = { ...destination };
    const values = destinationRecord[schema.configKey];
    return values && typeof values === 'object'
        ? values as Record<string, unknown>
        : {};
}

function requiredFieldErrors(
    destination: DestinationConfig,
    schema: DestinationSchema | undefined,
    formatMessage: DestinationMessageFormatter,
): Record<string, string> {
    if (!schema) {
        return {
            type: formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_SCHEMA_UNAVAILABLE,
                { type: destination.type },
            ),
        };
    }
    const values = getDestinationValues(destination, schema);
    const errors: Record<string, string> = {};

    for (const field of schema.fields) {
        const value = getNestedValue(values, field.key) ?? field.defaultValue;
        if (field.required && isEmpty(value)) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_FIELD_REQUIRED,
                { field: field.label },
            );
            continue;
        }
        if (isEmpty(value)) continue;
        if (
            field.type === 'secret'
            && (typeof value !== 'string' || !CODE_PATTERN.test(value.trim()))
        ) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_SECRET_CODE,
                { field: field.label },
            );
        }
        if (
            field.type === 'number'
            && (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value))
        ) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_INTEGER,
                { field: field.label },
            );
        }
        if (
            (field.key === 'port' || field.key.endsWith('.port'))
            && typeof value === 'number'
            && (value < 1 || value > 65_535)
        ) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_PORT_RANGE,
                { field: field.label },
            );
        }
        if (
            field.key === 'timeout'
            && typeof value === 'number'
            && (value < 1 || value > 300_000)
        ) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_TIMEOUT_RANGE,
                { field: field.label },
            );
        }
        if (
            (field.key === 'url' || field.key === 'endpoint')
            && typeof value === 'string'
            && !isHttpUrl(value)
        ) {
            errors[field.key] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_HTTP_URL,
                { field: field.label },
            );
        }
    }
    return errors;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && !url.username
            && !url.password;
    } catch {
        return false;
    }
}

export function validateManagedDestinationDraft(
    draft: ManagedDestinationDraft,
    schema: DestinationSchema | undefined,
    formatMessage: DestinationMessageFormatter,
): ManagedDestinationValidation {
    const errors = requiredFieldErrors(draft.destination, schema, formatMessage);
    const id = draft.id.trim();
    const name = draft.name.trim();

    if (!id) {
        errors.id = formatMessage(DESTINATION_TRANSLATION_IDS.VALIDATION_ID_REQUIRED);
    } else if (!CODE_PATTERN.test(id)) {
        errors.id = formatMessage(DESTINATION_TRANSLATION_IDS.VALIDATION_ID_PATTERN);
    }
    if (!name) {
        errors.name = formatMessage(DESTINATION_TRANSLATION_IDS.VALIDATION_NAME_REQUIRED);
    }

    const values = getDestinationValues(draft.destination, schema);
    if (
        draft.destination.type === 'SFTP'
        && !values.passwordSecretCode
        && !values.privateKeySecretCode
    ) {
        errors.passwordSecretCode = formatMessage(
            DESTINATION_TRANSLATION_IDS.VALIDATION_SFTP_CREDENTIAL,
        );
    }
    if (
        draft.destination.type === 'SFTP'
        && values.passphraseSecretCode
        && !values.privateKeySecretCode
    ) {
        errors.passphraseSecretCode = formatMessage(
            DESTINATION_TRANSLATION_IDS.VALIDATION_SFTP_PASSPHRASE,
        );
    }

    const auth = values.auth;
    if (draft.destination.type === 'HTTP' && auth && typeof auth === 'object') {
        const authRecord = auth as Record<string, unknown>;
        const authType = authRecord.type;
        if (typeof authType === 'string' && authType !== 'NONE' && !authRecord.secretCode) {
            errors['auth.secretCode'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_AUTH_SECRET,
            );
        }
        if (
            authType === 'BASIC'
            && !authRecord.username
            && !authRecord.usernameSecretCode
        ) {
            errors['auth.username'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_BASIC_USERNAME,
            );
        }
        if (authRecord.username && authRecord.usernameSecretCode) {
            errors['auth.username'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_USERNAME_CHOICE,
            );
        }
        if (
            authType === 'NONE'
            && (authRecord.secretCode || authRecord.username || authRecord.usernameSecretCode || authRecord.headerName)
        ) {
            errors['auth.type'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_NO_AUTH_CREDENTIALS,
            );
        }
        if (
            typeof authType === 'string'
            && authType !== 'BASIC'
            && (authRecord.username || authRecord.usernameSecretCode)
        ) {
            errors['auth.username'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_AUTH_USERNAME_UNSUPPORTED,
                { type: authType },
            );
        }
        if (
            typeof authType === 'string'
            && authType !== 'API_KEY'
            && authRecord.headerName
        ) {
            errors['auth.headerName'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_AUTH_HEADER_UNSUPPORTED,
                { type: authType },
            );
        }
    }

    const smtp = values.smtp;
    if (draft.destination.type === 'EMAIL' && smtp && typeof smtp === 'object') {
        const smtpRecord = smtp as Record<string, unknown>;
        if (smtpRecord.username && smtpRecord.usernameSecretCode) {
            errors['smtp.username'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_SMTP_USERNAME_CHOICE,
            );
        }
        const hasUsername = Boolean(smtpRecord.username || smtpRecord.usernameSecretCode);
        const hasPassword = Boolean(smtpRecord.passwordSecretCode);
        if (hasUsername !== hasPassword) {
            errors['smtp.passwordSecretCode'] = formatMessage(
                DESTINATION_TRANSLATION_IDS.VALIDATION_SMTP_CREDENTIAL_PAIR,
            );
        }
    }

    return { isValid: Object.keys(errors).length === 0, errors };
}

function normalizeInputValue(value: unknown): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
        const normalized = value
            .map(normalizeInputValue)
            .filter(item => item !== undefined);
        return normalized.length > 0 ? normalized : undefined;
    }
    if (value && typeof value === 'object') {
        const normalized = Object.fromEntries(
            Object.entries(value)
                .map(([key, child]) => [key, normalizeInputValue(child)] as const)
                .filter(entry => entry[1] !== undefined),
        );
        return Object.keys(normalized).length > 0 ? normalized : undefined;
    }
    return value;
}

export function prepareManagedDestinationInput(
    draft: ManagedDestinationDraft,
    schema: DestinationSchema,
): DataHubExportDestinationInput {
    const values = normalizeInputValue(getDestinationValues(draft.destination, schema));
    const configuration = values && typeof values === 'object'
        ? values as Record<string, unknown>
        : {};

    return {
        id: draft.id.trim(),
        name: draft.name.trim(),
        enabled: draft.enabled,
        type: GRAPHQL_DESTINATION_TYPES[draft.destination.type],
        ...configuration,
    } as DataHubExportDestinationInput;
}
