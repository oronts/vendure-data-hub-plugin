import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
    generateMigration,
    revertLastMigration,
    runMigrations,
    type VendureConfig,
} from '@vendure/core';
import { Client } from 'pg';
import { DataHubPlugin } from '../src/data-hub.plugin';

const EXPECTED_DATA_HUB_TABLES = 20;
const connectionUrl = process.env.DATAHUB_TEST_POSTGRES_URL?.trim();
const caFile = process.env.DATAHUB_TEST_DATABASE_CA_FILE?.trim();
const clientCertificateFile = process.env.DATAHUB_TEST_DATABASE_CLIENT_CERT_FILE?.trim();
const clientKeyFile = process.env.DATAHUB_TEST_DATABASE_CLIENT_KEY_FILE?.trim();

if (!connectionUrl || !caFile || !clientCertificateFile || !clientKeyFile) {
    throw new Error('PostgreSQL URL and TLS certificate files are required');
}

const trustedCa = readFileSync(caFile, 'utf8');
const clientCertificate = readFileSync(clientCertificateFile, 'utf8');
const clientKey = readFileSync(clientKeyFile, 'utf8');

function createSslOptions() {
    return {
        ca: trustedCa,
        cert: clientCertificate,
        key: clientKey,
        rejectUnauthorized: true,
    };
}

const sourceUrl = new URL(connectionUrl);
const sourceDatabase = decodeURIComponent(sourceUrl.pathname.slice(1));
const databaseName = `datahub_migration_${process.pid}_${Date.now()}`;

function databaseOptions(database: string) {
    return {
        type: 'postgres' as const,
        host: sourceUrl.hostname,
        port: Number(sourceUrl.port || 5432),
        username: decodeURIComponent(sourceUrl.username),
        password: decodeURIComponent(sourceUrl.password),
        database,
        ssl: createSslOptions(),
        synchronize: false,
        logging: false,
    };
}

function clientOptions(database: string) {
    return {
        host: sourceUrl.hostname,
        port: Number(sourceUrl.port || 5432),
        user: decodeURIComponent(sourceUrl.username),
        password: decodeURIComponent(sourceUrl.password),
        database,
        ssl: createSslOptions(),
    };
}

async function withAdministrativeClient<T>(
    operation: (client: Client) => Promise<T>,
): Promise<T> {
    const client = new Client(clientOptions(sourceDatabase));
    await client.connect();
    try {
        return await operation(client);
    } finally {
        await client.end();
    }
}

async function dataHubTableCount(): Promise<number> {
    const client = new Client(clientOptions(databaseName));
    await client.connect();
    try {
        const result = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'data_hub_%'`,
        );
        return Number(result.rows[0]?.count ?? 0);
    } finally {
        await client.end();
    }
}

async function createDatabase(): Promise<void> {
    await withAdministrativeClient(async client => {
        await client.query(`CREATE DATABASE "${databaseName}"`);
    });
}

async function dropDatabase(): Promise<void> {
    await withAdministrativeClient(async client => {
        await client.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [databaseName],
        );
        await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    });
}

async function verifyMigrationLifecycle(
    migrationDirectory: string,
): Promise<void> {
    process.stdout.write('Creating isolated PostgreSQL migration database\n');
    await createDatabase();
    const migrationPattern = join(migrationDirectory, '*.+(js|ts)');
    const config: Partial<VendureConfig> = {
        dbConnectionOptions: {
            ...databaseOptions(databaseName),
            migrations: [migrationPattern],
        },
        plugins: [DataHubPlugin.init()],
    };
    process.stdout.write('Generating PostgreSQL migration from the current entity schema\n');
    const migrationPath = await generateMigration(config, {
        name: 'data-hub-postgres-install',
        outputDir: migrationDirectory,
    });
    if (!migrationPath) {
        throw new Error('Vendure generated no PostgreSQL migration');
    }

    const migrationSource = await readFile(migrationPath, 'utf8');
    if (!migrationSource.includes('data_hub_pipeline')) {
        throw new Error('Generated migration does not include Data Hub entities');
    }

    process.stdout.write('Applying and reverting the generated PostgreSQL migration\n');
    const firstRun = await runMigrations(config);
    const installedTableCount = await dataHubTableCount();
    if (firstRun.length !== 1 || installedTableCount !== EXPECTED_DATA_HUB_TABLES) {
        throw new Error(
            `Unexpected migration install: runs=${firstRun.length}, tables=${installedTableCount}`,
        );
    }

    const noOpRun = await runMigrations(config);
    if (noOpRun.length !== 0) {
        throw new Error(`Applied migration was not idempotent: runs=${noOpRun.length}`);
    }

    await revertLastMigration(config);
    const revertedTableCount = await dataHubTableCount();
    if (revertedTableCount !== 0) {
        throw new Error(`Migration revert retained ${revertedTableCount} Data Hub tables`);
    }

    const reapplied = await runMigrations(config);
    const reappliedTableCount = await dataHubTableCount();
    if (reapplied.length !== 1 || reappliedTableCount !== EXPECTED_DATA_HUB_TABLES) {
        throw new Error(
            `Unexpected migration reapply: runs=${reapplied.length}, tables=${reappliedTableCount}`,
        );
    }

    process.stdout.write(JSON.stringify({
        migrationBytes: Buffer.byteLength(migrationSource),
        installedTableCount,
        revertedTableCount,
        reappliedTableCount,
    }, null, 2));
}

async function main(): Promise<void> {
    const temporaryRoot = join(process.cwd(), 'tmp');
    await mkdir(temporaryRoot, { recursive: true });
    const migrationDirectory = await mkdtemp(
        join(temporaryRoot, 'datahub-postgres-migration-'),
    );
    try {
        await verifyMigrationLifecycle(migrationDirectory);
    } finally {
        await dropDatabase().catch(() => undefined);
        await rm(migrationDirectory, { recursive: true, force: true });
    }
}

void main();
