/**
 * DataHub Plugin Dev Server Populate Script
 *
 * Seeds the dev database with initial data for testing.
 *
 * Usage:
 *   npx ts-node dev-server/populate.ts
 *
 * Or with the package.json script:
 *   npm run populate
 */
import { bootstrap, JobQueueService } from '@vendure/core';
import { populate } from '@vendure/core/cli';
import path from 'path';
import { config } from '../vendure-config.dev';

async function runPopulate() {
    console.log('Populating dev database...');

    const initialDataPath = getVendureCreateAsset('assets/initial-data.json');
    const productsCsvPath = getVendureCreateAsset('assets/products.csv');

    const app = await populate(
        () =>
            bootstrap({
                ...config,
                authOptions: {
                    ...config.authOptions,
                    requireVerification: false,
                },
                dbConnectionOptions: {
                    ...config.dbConnectionOptions,
                    synchronize: true,
                },
                importExportOptions: {
                    importAssetsDir: getVendureCreateAsset('assets/images'),
                },
            }).then(async _app => {
                await _app.get(JobQueueService).start();
                return _app;
            }),
        initialDataPath,
        productsCsvPath,
    );

    console.log('Population complete!');
    await app.close();
    process.exit(0);
}

function getVendureCreateAsset(fileName: string): string {
    return path.join(path.dirname(require.resolve('@vendure/create')), fileName);
}

runPopulate().catch(err => {
    console.error('Population failed:', err);
    process.exit(1);
});
