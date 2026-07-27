import type { AddressInfo } from 'net';
import { bootstrap, mergeConfig, VendureConfig } from '@vendure/core';
import { buildClientSchema, getIntrospectionQuery, IntrospectionQuery, printSchema } from 'graphql';
import * as fs from 'fs';
import * as path from 'path';
import { DataHubPlugin } from '../src/index';
import { LockBackendType } from '../src/constants';

const ADMIN_API_PATH = 'admin-api';
const SCHEMA_OUTPUT_PATH = path.join(__dirname, '..', 'schema.graphql');

process.env.DATAHUB_LOCK_BACKEND = LockBackendType.MEMORY;

const baseConfig: VendureConfig = {
    apiOptions: {
        port: 0,
        adminApiPath: ADMIN_API_PATH,
        shopApiPath: 'shop-api',
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: 'schema-generator',
            password: 'schema-generator',
        },
    },
    dbConnectionOptions: {
        type: 'sqljs',
        synchronize: true,
        logging: false,
    },
    paymentOptions: {
        paymentMethodHandlers: [],
    },
    plugins: [],
};

async function generateSchema(): Promise<void> {
    const config = mergeConfig(baseConfig, {
        plugins: [DataHubPlugin.init({})],
    });
    const app = await bootstrap(config);

    try {
        const address = app.getHttpServer().address() as AddressInfo | string | null;
        if (!address || typeof address === 'string') {
            throw new Error('Schema server did not expose a TCP port');
        }
        const response = await fetch(`http://127.0.0.1:${address.port}/${ADMIN_API_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: getIntrospectionQuery() }),
        });
        if (!response.ok) {
            const details = (await response.text()).trim();
            throw new Error(
                `Schema introspection failed with HTTP ${response.status}: ${details || response.statusText}`,
            );
        }
        const result = await response.json() as {
            data?: IntrospectionQuery;
            errors?: Array<{ message: string }>;
        };
        if (!result.data) {
            const details = result.errors?.map(error => error.message).join('; ') || 'No schema data returned';
            throw new Error(`Schema introspection failed: ${details}`);
        }
        fs.writeFileSync(SCHEMA_OUTPUT_PATH, printSchema(buildClientSchema(result.data)), 'utf-8');
    } finally {
        await app.close();
    }
}

generateSchema().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`Failed to generate schema: ${message}\n`);
    process.exitCode = 1;
});
