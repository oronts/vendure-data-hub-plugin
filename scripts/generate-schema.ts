/**
 * Generate GraphQL Schema for DataHub Plugin
 *
 * This script bootstraps a minimal Vendure server with the DataHub plugin
 * and exports the GraphQL schema to schema.graphql.
 *
 * Run with: npx ts-node scripts/generate-schema.ts
 */

import { bootstrap, mergeConfig, VendureConfig } from '@vendure/core';
import { printSchema } from 'graphql';
import * as fs from 'fs';
import * as path from 'path';

const baseConfig: VendureConfig = {
    apiOptions: {
        port: 3199, // Use a different port to avoid conflicts
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: 'superadmin',
            password: 'superadmin',
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

async function generateSchema() {
    console.log('Bootstrapping Vendure server with DataHub plugin...');

    const { DataHubPlugin } = await import('../src/index.js');

    const mergedConfig = mergeConfig(baseConfig, {
        plugins: [
            DataHubPlugin.init({
                enableDashboard: true,
            }),
        ],
    });

    const app = await bootstrap(mergedConfig);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vendure internal API access
    const { schema } = (app as unknown as { get(token: string): { schema: unknown } }).get('VENDURE_GRAPHQL_ADMIN_SCHEMA');

    if (!schema) {
        console.error('Could not get GraphQL schema from server');
        await app.close();
        process.exit(1);
    }

    const schemaString = printSchema(schema);
    const outputPath = path.join(__dirname, '..', 'schema.graphql');

    fs.writeFileSync(outputPath, schemaString, 'utf-8');
    console.log(`Schema written to ${outputPath}`);

    await app.close();
    console.log('Done!');
    process.exit(0);
}

generateSchema().catch((err) => {
    console.error('Failed to generate schema:', err);
    process.exit(1);
});
