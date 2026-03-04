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
import { bootstrap, JobQueueService, ChannelService, LanguageCode, CurrencyCode, RequestContextService, TransactionalConnection, ShippingMethod } from '@vendure/core';
import { populate } from '@vendure/core/cli';
import { fork } from 'child_process';
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
        const populateApp = await populate(
            () => bootstrap(config),
            initialData,
        );
        await populateApp.close();
        console.log('  Database populated successfully!');
    }

    const app = await bootstrap(config);
    await app.get(JobQueueService).start();

    // Configure default channel for multi-language and multi-currency testing
    try {
        const channelService = app.get(ChannelService);
        const requestContextService = app.get(RequestContextService);
        const ctx = await requestContextService.create({ apiType: 'admin' });
        const defaultChannel = await channelService.getDefaultChannel(ctx);
        await channelService.update(ctx, {
            id: defaultChannel.id,
            availableLanguageCodes: [LanguageCode.en, LanguageCode.de, LanguageCode.fr],
            availableCurrencyCodes: [CurrencyCode.EUR, CurrencyCode.USD, CurrencyCode.CHF, CurrencyCode.GBP],
            defaultCurrencyCode: CurrencyCode.EUR,
        });
        console.log('  Default channel configured: languages=[en, de, fr], currencies=[EUR, USD, CHF, GBP]');

        // Fix shipping method calculator args — Vendure's populate() only stores the 'rate' arg
        // but the default-shipping-calculator also requires 'taxRate' and 'includesTax'.
        // Missing args cause NaN in order price calculations (shippingWithTax).
        const connection = app.get(TransactionalConnection);
        const shippingMethods = await connection.getRepository(ctx, ShippingMethod).find();
        for (const sm of shippingMethods) {
            const calcArgs = sm.calculator?.args ?? [];
            const hasAllArgs = calcArgs.some((a: { name: string }) => a.name === 'taxRate')
                            && calcArgs.some((a: { name: string }) => a.name === 'includesTax');
            if (!hasAllArgs && sm.calculator?.code === 'default-shipping-calculator') {
                const argsMap = new Map(calcArgs.map((a: { name: string; value: string }) => [a.name, a.value]));
                sm.calculator.args = [
                    { name: 'rate', value: argsMap.get('rate') ?? '0' },
                    { name: 'taxRate', value: argsMap.get('taxRate') ?? '0' },
                    { name: 'includesTax', value: argsMap.get('includesTax') ?? 'auto' },
                ];
                await connection.getRepository(ctx, ShippingMethod).save(sm);
            }
        }
        console.log(`  Shipping methods verified: ${shippingMethods.length} methods checked`);
    } catch (e) {
        console.warn('  Warning: Could not configure default channel languages/currencies:', (e as Error).message);
    }

    // Start mock API servers unless explicitly disabled
    if (process.env.START_MOCKS !== 'false') {
        startMockServers();
    }

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

function startMockServers() {
    const mockDir = path.join(__dirname, 'mock');
    const mockFiles = [
        'mock-pimcore-api.ts',
        'mock-magento-api.ts',
        'mock-shopify-api.ts',
        'mock-edge-case-api.ts',
    ].filter(f => {
        try { require.resolve(path.join(mockDir, f)); return true; } catch { return false; }
    });

    for (const file of mockFiles) {
        const fullPath = path.join(mockDir, file);
        try {
            const child = fork(fullPath, [], { execArgv: ['-r', 'ts-node/register'] });
            child.on('error', (err) => console.warn(`Mock server ${file} failed: ${err.message}`));
            console.log(`[DataHub Dev] Started mock server: ${file}`);
        } catch (e) {
            console.warn(`[DataHub Dev] Could not start ${file}: ${(e as Error).message}`);
        }
    }
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
