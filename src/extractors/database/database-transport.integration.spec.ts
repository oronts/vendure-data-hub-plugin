import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExtractorContext } from '../../types';
import { DatabaseType } from '../../constants';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import { createDatabaseClient } from './connection-pool';
import type {
    DatabaseExtractorConfig,
    DatabaseSslConfig,
} from './types';

const postgresUrl = process.env.DATAHUB_TEST_POSTGRES_URL;
const mysqlUrl = process.env.DATAHUB_TEST_MYSQL_URL;
const caFile = process.env.DATAHUB_TEST_DATABASE_CA_FILE;
const clientCertificateFile = process.env.DATAHUB_TEST_DATABASE_CLIENT_CERT_FILE;
const clientKeyFile = process.env.DATAHUB_TEST_DATABASE_CLIENT_KEY_FILE;
const untrustedCaFile = process.env.DATAHUB_TEST_DATABASE_UNTRUSTED_CA_FILE;
const hasTlsEnvironment = postgresUrl
    && mysqlUrl
    && caFile
    && clientCertificateFile
    && clientKeyFile
    && untrustedCaFile;
const describeIntegration = hasTlsEnvironment ? describe : describe.skip;

const SECRET_CODES = {
    ca: 'database-ca',
    clientCertificate: 'database-client-certificate',
    clientKey: 'database-client-key',
} as const;

interface DatabaseAcceptanceCase {
    readonly databaseType: DatabaseType.POSTGRESQL | DatabaseType.MYSQL;
    readonly connectionString: string;
    readonly tlsQuery: string;
    readonly assertTls: (row: Record<string, unknown>) => void;
}

describeIntegration('database pinned TLS transport integration', () => {
    let trustedCa: string;
    let untrustedCa: string;
    let clientCertificate: string;
    let clientKey: string;
    const acceptanceCases: readonly DatabaseAcceptanceCase[] = [
        {
            databaseType: DatabaseType.POSTGRESQL,
            connectionString: postgresUrl ?? '',
            tlsQuery: 'SELECT ssl, version, client_dn FROM pg_stat_ssl WHERE pid = pg_backend_pid()',
            assertTls: row => {
                expect(row.ssl).toBe(true);
                expect(row.version).toEqual(expect.any(String));
                expect(row.client_dn).toBe('/CN=datahub');
            },
        },
        {
            databaseType: DatabaseType.MYSQL,
            connectionString: mysqlUrl ?? '',
            tlsQuery: "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
            assertTls: row => {
                expect(row.Variable_name).toBe('Ssl_cipher');
                expect(row.Value).toEqual(expect.any(String));
                expect(String(row.Value)).not.toHaveLength(0);
            },
        },
    ];

    beforeAll(() => {
        trustedCa = readFileSync(requireTestPath('DATAHUB_TEST_DATABASE_CA_FILE', caFile), 'utf8');
        untrustedCa = readFileSync(
            requireTestPath('DATAHUB_TEST_DATABASE_UNTRUSTED_CA_FILE', untrustedCaFile),
            'utf8',
        );
        clientCertificate = readFileSync(
            requireTestPath('DATAHUB_TEST_DATABASE_CLIENT_CERT_FILE', clientCertificateFile),
            'utf8',
        );
        clientKey = readFileSync(
            requireTestPath('DATAHUB_TEST_DATABASE_CLIENT_KEY_FILE', clientKeyFile),
            'utf8',
        );
        configureGlobalSsrfProtection({
            allowedHostnames: ['localhost', 'localhost.localdomain'],
        });
    });

    afterAll(() => {
        configureGlobalSsrfProtection({});
    });

    it.each(acceptanceCases)(
        'executes a verified mTLS query through the $databaseType pinned pool',
        async acceptance => {
            const result = await executeQuery(
                acceptance,
                createTlsContext(trustedCa, clientCertificate, clientKey),
                trustedTlsConfig(),
            );
            expect(result.rowCount).toBe(1);
            acceptance.assertTls(result.rows[0] ?? {});
        },
    );

    it.each(acceptanceCases)(
        'rejects an untrusted server certificate for $databaseType',
        async acceptance => {
            await expect(executeQuery(
                acceptance,
                createTlsContext(untrustedCa, clientCertificate, clientKey),
                trustedTlsConfig(),
            )).rejects.toThrow();
        },
    );

    it.each(acceptanceCases)(
        'rejects a certificate hostname mismatch for $databaseType',
        async acceptance => {
            const mismatchedHostnameCase = {
                ...acceptance,
                connectionString: acceptance.connectionString.replace(
                    '@localhost:',
                    '@localhost.localdomain:',
                ),
            };
            await expect(executeQuery(
                mismatchedHostnameCase,
                createTlsContext(trustedCa, clientCertificate, clientKey),
                trustedTlsConfig(),
            )).rejects.toThrow();
        },
    );

    it.each(acceptanceCases)(
        'rejects a missing client certificate for $databaseType',
        async acceptance => {
            await expect(executeQuery(
                acceptance,
                createTlsContext(trustedCa),
                {
                    enabled: true,
                    rejectUnauthorized: true,
                    caSecretCode: SECRET_CODES.ca,
                },
            )).rejects.toThrow();
        },
    );

    it.each(acceptanceCases)(
        'rejects an unencrypted connection for $databaseType',
        async acceptance => {
            await expect(executeQuery(
                acceptance,
                createTlsContext(trustedCa),
                { enabled: false },
            )).rejects.toThrow();
        },
    );
});

function requireTestPath(name: string, value: string | undefined): string {
    if (!value) throw new Error(`${name} is required for database TLS integration tests`);
    return value;
}

function trustedTlsConfig(): DatabaseSslConfig {
    return {
        enabled: true,
        rejectUnauthorized: true,
        caSecretCode: SECRET_CODES.ca,
        certSecretCode: SECRET_CODES.clientCertificate,
        keySecretCode: SECRET_CODES.clientKey,
    };
}

function createTlsContext(
    ca: string,
    clientCertificate?: string,
    clientKey?: string,
): ExtractorContext {
    const secrets = new Map<string, string>([
        [SECRET_CODES.ca, ca],
    ]);
    if (clientCertificate) {
        secrets.set(SECRET_CODES.clientCertificate, clientCertificate);
    }
    if (clientKey) {
        secrets.set(SECRET_CODES.clientKey, clientKey);
    }

    return {
        secrets: {
            get: async (code: string) => secrets.get(code),
        },
        logger: {
            error: () => undefined,
        },
    } as unknown as ExtractorContext;
}

async function executeQuery(
    acceptance: DatabaseAcceptanceCase,
    context: ExtractorContext,
    ssl: DatabaseSslConfig,
): ReturnType<Awaited<ReturnType<typeof createDatabaseClient>>['query']> {
    const config: DatabaseExtractorConfig = {
        databaseType: acceptance.databaseType,
        connectionString: acceptance.connectionString,
        query: acceptance.tlsQuery,
        ssl,
    };
    const client = await createDatabaseClient(context, config);
    try {
        return await client.query(acceptance.tlsQuery);
    } finally {
        await client.close();
    }
}
