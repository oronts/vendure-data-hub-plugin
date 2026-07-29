import { ConnectionAuthType } from '../../../shared/types';
import { CONNECTION_TYPE, HTTP_CONNECTION_DEFAULTS } from '../../constants';
import type {
    ConnectionSchema,
    ConnectionSchemaField,
} from '../../hooks/api/use-config-options';
import type { HttpConnectionConfig, UIConnectionType } from '../../types';

export const DEFAULT_HTTP_CONFIG: HttpConnectionConfig = {
    baseUrl: '',
    timeout: HTTP_CONNECTION_DEFAULTS.TIMEOUT_MS,
    headers: {},
    auth: { type: ConnectionAuthType.NONE },
};

const HTTP_LIKE_TYPES = new Set<string>([
    CONNECTION_TYPE.HTTP,
    CONNECTION_TYPE.REST,
    CONNECTION_TYPE.GRAPHQL,
]);

export interface ConfigFieldDef {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'password' | 'secret' | 'select' | 'json';
    placeholder?: string;
    required?: boolean;
    description?: string;
    defaultValue?: unknown;
    min?: number;
    max?: number;
    options?: Array<{ value: string; label: string }>;
}

export type UpdateHttpConnectionConfig = (
    patch: Partial<HttpConnectionConfig>,
) => void;

export function isHttpLikeConnectionType(
    type: string,
    schemas: readonly ConnectionSchema[] = [],
): boolean {
    return HTTP_LIKE_TYPES.has(type)
        || schemas.some(schema => schema.type === type && schema.httpLike === true);
}

export function normalizeHttpConfig(
    config: Record<string, unknown>,
): HttpConnectionConfig {
    const normalized = createDefaultHttpConfig();
    if (typeof config.baseUrl === 'string') {
        normalized.baseUrl = config.baseUrl;
    }
    if (typeof config.timeout === 'number') {
        normalized.timeout = config.timeout;
    }
    if (config.headers && typeof config.headers === 'object') {
        normalized.headers = Object.fromEntries(
            Object.entries(config.headers)
                .filter((entry): entry is [string, string] => (
                    typeof entry[1] === 'string'
                )),
        );
    }
    if (config.auth && typeof config.auth === 'object') {
        normalized.auth = normalizeAuthConfig(
            config.auth as Record<string, unknown>,
        );
    }
    return normalized;
}

function normalizeAuthConfig(
    auth: Record<string, unknown>,
): NonNullable<HttpConnectionConfig['auth']> {
    const normalized: NonNullable<HttpConnectionConfig['auth']> = {
        type: (auth.type as ConnectionAuthType) ?? ConnectionAuthType.NONE,
    };
    for (const key of [
        'headerName',
        'secretCode',
        'username',
        'usernameSecretCode',
    ] as const) {
        if (typeof auth[key] === 'string') {
            normalized[key] = auth[key];
        }
    }
    return normalized;
}

export function resolveConnectionSchema(
    type: string,
    backendSchemas: readonly ConnectionSchema[],
): ConfigFieldDef[] {
    const backendEntry = backendSchemas.find(schema => schema.type === type);
    if (!backendEntry || backendEntry.fields.length === 0) return [];
    return backendEntry.fields.map(mapConnectionSchemaField);
}

function mapConnectionSchemaField(field: ConnectionSchemaField): ConfigFieldDef {
    return {
        key: field.key,
        label: field.label,
        type: mapBackendFieldType(field.type),
        placeholder: field.placeholder ?? undefined,
        required: field.required ?? undefined,
        description: field.description ?? undefined,
        defaultValue: field.defaultValue ?? undefined,
        min: field.min ?? undefined,
        max: field.max ?? undefined,
        options: field.options?.map(option => ({
            value: option.value,
            label: option.label,
        })),
    };
}

function mapBackendFieldType(backendType: string): ConfigFieldDef['type'] {
    switch (backendType) {
        case 'number':
        case 'password':
        case 'boolean':
        case 'secret':
        case 'select':
        case 'json':
            return backendType;
        case 'text':
        default:
            return 'string';
    }
}

export function getConfigFieldId(key: string): string {
    return `connection-config-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function createDefaultConnectionConfig(
    type: UIConnectionType,
    schemas: readonly ConnectionSchema[] = [],
): Record<string, unknown> {
    if (isHttpLikeConnectionType(type, schemas)) {
        return { ...createDefaultHttpConfig() };
    }
    const schema = resolveConnectionSchema(type, schemas);
    return Object.fromEntries(
        schema
            .filter(field => field.defaultValue !== undefined)
            .map(field => [field.key, field.defaultValue]),
    );
}

function createDefaultHttpConfig(): HttpConnectionConfig {
    return {
        ...DEFAULT_HTTP_CONFIG,
        headers: {},
        auth: { type: ConnectionAuthType.NONE },
    };
}

export function normalizeConnectionConfig(
    type: UIConnectionType,
    config: Record<string, unknown> | string | null | undefined,
    schemas: readonly ConnectionSchema[] = [],
): Record<string, unknown> {
    const parsed = parseConnectionConfig(config);
    if (!parsed) {
        return createDefaultConnectionConfig(type, schemas);
    }
    return isHttpLikeConnectionType(type, schemas)
        ? { ...normalizeHttpConfig(parsed) }
        : parsed;
}

export function serializeConnectionConfig(
    type: UIConnectionType,
    config: Record<string, unknown> | null | undefined,
    schemas: readonly ConnectionSchema[] = [],
): Record<string, unknown> {
    if (isHttpLikeConnectionType(type, schemas)) {
        return serializeHttpConfig(config ?? {});
    }

    const serialized = { ...(config ?? {}) };
    for (const field of resolveConnectionSchema(type, schemas)) {
        const draft = serialized[field.key];
        if (field.type !== 'json' || typeof draft !== 'string') {
            continue;
        }
        const text = draft.trim();
        if (text === '') {
            delete serialized[field.key];
            continue;
        }
        try {
            serialized[field.key] = JSON.parse(text) as unknown;
        } catch {
            continue;
        }
    }
    return serialized;
}

function serializeHttpConfig(config: Record<string, unknown>): Record<string, unknown> {
    const normalized = normalizeHttpConfig(config);
    const serialized: Record<string, unknown> = {
        timeout: normalized.timeout,
    };
    const baseUrl = normalized.baseUrl.trim();
    if (baseUrl !== '') serialized.baseUrl = baseUrl;
    if (normalized.headers && Object.keys(normalized.headers).length > 0) {
        serialized.headers = normalized.headers;
    }
    if (normalized.auth && normalized.auth.type !== ConnectionAuthType.NONE) {
        serialized.auth = Object.fromEntries(
            Object.entries(normalized.auth).filter(([, value]) => (
                typeof value !== 'string' || value.trim() !== ''
            )),
        );
    }
    return serialized;
}

function parseConnectionConfig(
    config: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> | undefined {
    if (config == null) return undefined;
    if (typeof config !== 'string') return config;
    try {
        const parsed: unknown = JSON.parse(config);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : undefined;
    } catch {
        return undefined;
    }
}
