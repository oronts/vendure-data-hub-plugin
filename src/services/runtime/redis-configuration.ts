import { sanitizeUrlForLogging } from '../../utils/url-sanitize.utils';

const DEFAULT_SENTINEL_PORT = 26379;

export interface RedisSentinelNode {
    readonly host: string;
    readonly port: number;
}

export type RedisConnectionConfiguration =
    | {
        readonly mode: 'standalone';
        readonly url: string;
    }
    | {
        readonly mode: 'sentinel';
        readonly sentinels: readonly RedisSentinelNode[];
        readonly masterName: string;
        readonly db: number;
        readonly username?: string;
        readonly password?: string;
        readonly sentinelUsername?: string;
        readonly sentinelPassword?: string;
        readonly tls: boolean;
        readonly sentinelTls: boolean;
    };

export interface RedisSentinelClientOptions {
    readonly sentinels: RedisSentinelNode[];
    readonly name: string;
    readonly role: 'master';
    readonly db: number;
    readonly username?: string;
    readonly password?: string;
    readonly sentinelUsername?: string;
    readonly sentinelPassword?: string;
    readonly tls?: Record<string, never>;
    readonly sentinelTLS?: Record<string, never>;
    readonly enableTLSForSentinelMode?: boolean;
}

export interface RedisClientConstructor<TClient, TOptions extends object> {
    new(url: string, options: TOptions): TClient;
    new(options: TOptions & RedisSentinelClientOptions): TClient;
}

export function getConfiguredRedisConnection(): RedisConnectionConfiguration | undefined {
    const dataHubUrl = process.env.DATAHUB_REDIS_URL?.trim();
    const sharedUrl = process.env.REDIS_URL?.trim();
    const sentinelList = process.env.DATAHUB_REDIS_SENTINELS?.trim();
    const masterName = process.env.DATAHUB_REDIS_SENTINEL_NAME?.trim();

    if (sentinelList || masterName) {
        if (!sentinelList || !masterName) {
            throw new Error(
                'Redis Sentinel requires both DATAHUB_REDIS_SENTINELS and DATAHUB_REDIS_SENTINEL_NAME',
            );
        }
        if (dataHubUrl) {
            throw new Error(
                'Configure either DATAHUB_REDIS_URL or Redis Sentinel settings, not both',
            );
        }
        return {
            mode: 'sentinel',
            sentinels: parseSentinelNodes(sentinelList),
            masterName: parseMasterName(masterName),
            db: parseDatabase(process.env.DATAHUB_REDIS_DB),
            username: optionalTrimmed(process.env.DATAHUB_REDIS_USERNAME),
            password: optionalSecret(process.env.DATAHUB_REDIS_PASSWORD),
            sentinelUsername: optionalTrimmed(
                process.env.DATAHUB_REDIS_SENTINEL_USERNAME,
            ),
            sentinelPassword: optionalSecret(
                process.env.DATAHUB_REDIS_SENTINEL_PASSWORD,
            ),
            tls: parseBoolean('DATAHUB_REDIS_TLS'),
            sentinelTls: parseBoolean('DATAHUB_REDIS_SENTINEL_TLS'),
        };
    }

    const url = dataHubUrl || sharedUrl;
    return url ? { mode: 'standalone', url } : undefined;
}

export function getConfiguredRedisUrl(): string | undefined {
    const connection = getConfiguredRedisConnection();
    return connection?.mode === 'standalone' ? connection.url : undefined;
}

export function createConfiguredRedisClient<TClient, TOptions extends object>(
    Redis: RedisClientConstructor<TClient, TOptions>,
    connection: RedisConnectionConfiguration | string,
    options: TOptions,
): TClient {
    const normalized = typeof connection === 'string'
        ? { mode: 'standalone' as const, url: connection }
        : connection;
    if (normalized.mode === 'standalone') {
        return new Redis(normalized.url, options);
    }
    return new Redis({
        ...options,
        sentinels: normalized.sentinels.map(node => ({ ...node })),
        name: normalized.masterName,
        role: 'master',
        db: normalized.db,
        username: normalized.username,
        password: normalized.password,
        sentinelUsername: normalized.sentinelUsername,
        sentinelPassword: normalized.sentinelPassword,
        tls: normalized.tls ? {} : undefined,
        sentinelTLS: normalized.sentinelTls ? {} : undefined,
        enableTLSForSentinelMode: normalized.sentinelTls || undefined,
    });
}

export function describeRedisConnection(
    connection: RedisConnectionConfiguration | string,
): string {
    if (typeof connection === 'string') return sanitizeUrlForLogging(connection);
    if (connection.mode === 'standalone') {
        return sanitizeUrlForLogging(connection.url);
    }
    const nodes = connection.sentinels
        .map(node => formatSentinelNode(node))
        .join(',');
    return `sentinel://${nodes}/${connection.masterName}?db=${connection.db}`;
}

function parseSentinelNodes(value: string): RedisSentinelNode[] {
    const nodes = value.split(',').map(node => parseSentinelNode(node.trim()));
    if (nodes.length === 0) {
        throw new Error('DATAHUB_REDIS_SENTINELS must contain at least one node');
    }
    const unique = new Map(nodes.map(node => [formatSentinelNode(node), node]));
    if (unique.size !== nodes.length) {
        throw new Error('DATAHUB_REDIS_SENTINELS must not contain duplicate nodes');
    }
    return [...unique.values()];
}

function parseSentinelNode(value: string): RedisSentinelNode {
    if (!value) {
        throw new Error('DATAHUB_REDIS_SENTINELS contains an empty node');
    }
    if (hasControlOrWhitespace(value)) {
        throw new Error(
            'Invalid Redis Sentinel node: whitespace and control characters are not allowed',
        );
    }
    let parsed: URL;
    try {
        parsed = new URL(`redis://${value}`);
    } catch {
        throw new Error(`Invalid Redis Sentinel node "${value}"`);
    }
    if (
        !parsed.hostname
        || parsed.username
        || parsed.password
        || (parsed.pathname !== '' && parsed.pathname !== '/')
        || parsed.search
        || parsed.hash
    ) {
        throw new Error(`Invalid Redis Sentinel node "${value}"`);
    }
    const port = parsed.port ? Number(parsed.port) : DEFAULT_SENTINEL_PORT;
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`Invalid Redis Sentinel port in "${value}"`);
    }
    const host = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
        ? parsed.hostname.slice(1, -1)
        : parsed.hostname;
    return { host, port };
}

function hasControlOrWhitespace(value: string): boolean {
    return [...value].some(character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return /\s/u.test(character) || codePoint < 32 || codePoint === 127;
    });
}

function parseMasterName(value: string): string {
    if (!/^[A-Za-z0-9._:-]+$/u.test(value)) {
        throw new Error(
            'DATAHUB_REDIS_SENTINEL_NAME must contain only letters, numbers, dot, underscore, colon, or hyphen',
        );
    }
    return value;
}

function formatSentinelNode(node: RedisSentinelNode): string {
    const host = node.host.includes(':') ? `[${node.host}]` : node.host;
    return `${host}:${node.port}`;
}

function parseDatabase(value: string | undefined): number {
    const normalized = value?.trim();
    if (!normalized) return 0;
    const database = Number(normalized);
    if (!Number.isSafeInteger(database) || database < 0) {
        throw new Error('DATAHUB_REDIS_DB must be a non-negative integer');
    }
    return database;
}

function parseBoolean(name: string): boolean {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${name} must be true or false`);
}

function optionalTrimmed(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
}

function optionalSecret(value: string | undefined): string | undefined {
    return value ? value : undefined;
}
