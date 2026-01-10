/**
 * DataHub Plugin Dev Server Entry Point
 *
 * Boots a minimal Vendure server with the DataHub plugin for development.
 *
 * Usage:
 *   npx ts-node dev-server/index.ts
 *
 * Or with the package.json script:
 *   npm run dev
 */
import { bootstrap, JobQueueService } from '@vendure/core';
import { populate } from '@vendure/core/cli';
import { config } from '../vendure-config.dev';
import { initialData } from './initial-data';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = path.join(__dirname, 'vendure.sqlite');

async function runServer() {
    // Check if database exists - if not, populate with initial data
    const needsPopulate = !fs.existsSync(dbPath);

    if (needsPopulate) {
        console.log('  First run detected - populating database with initial data...');
        await populate(
            () => bootstrap(config),
            initialData,
        );
        console.log('  Database populated successfully!');
    }

    const app = await bootstrap(config);
    await app.get(JobQueueService).start();

    console.log('\n========================================');
    console.log('  DataHub Dev Server Started!');
    console.log('========================================');
    console.log(`  Admin API:     http://localhost:${config.apiOptions.port}/admin-api`);
    console.log(`  Shop API:      http://localhost:${config.apiOptions.port}/shop-api`);
    console.log(`  Dashboard:     http://localhost:${config.apiOptions.port}/admin`);
    console.log('========================================\n');
    console.log('  Login: superadmin / superadmin');
    console.log('========================================\n');
}

runServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    process.exit(0);
});
