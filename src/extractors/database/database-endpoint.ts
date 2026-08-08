import type { ExtractorContext } from '../../types';
import { DatabaseType } from '../../constants';
import type { DatabaseExtractorConfig } from './types';
import { DATABASE_DEFAULT_PORTS } from './types';

const DATABASE_PROTOCOLS: Record<
    DatabaseType.POSTGRESQL | DatabaseType.MYSQL,
    readonly string[]
> = {
    [DatabaseType.POSTGRESQL]: ['postgres:', 'postgresql:'],
    [DatabaseType.MYSQL]: ['mysql:'],
} as const;

export interface DatabaseEndpoint {
    hostname: string;
    port: number;
    database: string;
    username?: string;
    password?: string;
}

function decodeConnectionComponent(value: string, field: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        throw new Error(`Database connection string contains an invalid ${field}`);
    }
}

function assertTcpPort(port: number): number {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error('Database port must be an integer between 1 and 65535');
    }
    return port;
}

export function parseDatabaseConnectionString(
    connectionString: string,
    databaseType: DatabaseType.POSTGRESQL | DatabaseType.MYSQL,
): DatabaseEndpoint {
    let url: URL;
    try {
        url = new URL(connectionString);
    } catch {
        throw new Error('Database connection string must be a valid TCP URI');
    }

    if (!DATABASE_PROTOCOLS[databaseType].includes(url.protocol)) {
        const expected = databaseType === DatabaseType.POSTGRESQL
            ? 'postgres:// or postgresql://'
            : 'mysql://';
        throw new Error(`Database connection string must use ${expected}`);
    }
    if (url.search || url.hash) {
        throw new Error(
            'Database connection string query parameters and fragments are not supported; configure endpoint and TLS fields explicitly',
        );
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!hostname) {
        throw new Error('Database connection string must include a TCP hostname');
    }

    const database = decodeConnectionComponent(url.pathname.replace(/^\//, ''), 'database name');
    if (!database) {
        throw new Error('Database connection string must include a database name');
    }

    const defaultPort = DATABASE_DEFAULT_PORTS[databaseType];
    const parsedPort = url.port ? Number(url.port) : defaultPort;

    return {
        hostname,
        port: assertTcpPort(parsedPort),
        database,
        username: url.username
            ? decodeConnectionComponent(url.username, 'username')
            : undefined,
        password: url.password
            ? decodeConnectionComponent(url.password, 'password')
            : undefined,
    };
}

async function getConfiguredConnectionString(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
): Promise<string | undefined> {
    if (config.connectionStringSecretCode) {
        const connectionString = await context.secrets.get(config.connectionStringSecretCode);
        if (!connectionString) {
            throw new Error(
                `Secret "${config.connectionStringSecretCode}" not found - create it in DataHub > Secrets`,
            );
        }
        return connectionString;
    }
    return config.connectionString;
}

export async function resolveDatabaseEndpoint(
    context: ExtractorContext,
    config: DatabaseExtractorConfig,
    databaseType: DatabaseType.POSTGRESQL | DatabaseType.MYSQL,
): Promise<DatabaseEndpoint> {
    const connectionString = await getConfiguredConnectionString(context, config);
    if (connectionString) {
        return parseDatabaseConnectionString(connectionString, databaseType);
    }

    if (!config.host) {
        throw new Error('Database host is required');
    }
    if (!config.database) {
        throw new Error('Database name is required');
    }

    const endpoint: DatabaseEndpoint = {
        hostname: config.host,
        port: assertTcpPort(config.port ?? DATABASE_DEFAULT_PORTS[databaseType]),
        database: config.database,
        username: config.username,
    };
    if (config.passwordSecretCode) {
        const password = await context.secrets.get(config.passwordSecretCode);
        if (!password) {
            throw new Error(
                `Secret "${config.passwordSecretCode}" not found - create it in DataHub > Secrets before using this connection`,
            );
        }
        endpoint.password = password;
    }
    return endpoint;
}
