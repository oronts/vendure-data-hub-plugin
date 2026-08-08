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
import {
    bootstrap,
    ChannelService,
    CurrencyCode,
    JobQueueService,
    LanguageCode,
    RequestContext,
    RequestContextService,
    RoleService,
    ShippingMethod,
    StockLocationService,
    TransactionalConnection,
    ZoneService,
} from '@vendure/core';
import { populate } from '@vendure/core/cli';
import { config, DEV_DATABASE_PATH } from '../vendure-config.dev';
import { initialData } from './initial-data';
import * as path from 'path';
import * as fs from 'fs';
import { MockServerSupervisor } from './mock-supervisor';
import {
    DEV_CHANNEL_DEFINITIONS,
    ensureDevChannelAssignments,
    ensureDevChannels,
} from './dev-channels';

type DevServerApp = Awaited<ReturnType<typeof bootstrap>>;

let app: DevServerApp | undefined;
let shuttingDown = false;

const mockSupervisor = new MockServerSupervisor(
    path.join(__dirname, 'mock'),
    failure => {
        console.error(
            `Mock server ${failure.file} stopped unexpectedly `
            + `(code=${String(failure.exitCode)}, signal=${String(failure.signal)})`,
        );
        void shutdown(1);
    },
);

async function closeIfStartupCancelled(
    startingApp: DevServerApp,
): Promise<boolean> {
    if (!shuttingDown) {
        return false;
    }

    await startingApp.close();
    return true;
}

async function ensureDevDefaultZone(
    startingApp: DevServerApp,
    ctx: RequestContext,
) {
    const zoneService = startingApp.get(ZoneService);
    const defaultZoneName = initialData.defaultZone;
    const zones = await zoneService.getAllWithMembers(ctx);
    const existingZone = zones.find(zone => zone.name === defaultZoneName);

    return existingZone ?? zoneService.create(ctx, {
        name: defaultZoneName,
        memberIds: [],
    });
}

async function runServer() {
    // Check if database exists - if not, populate with initial data
    const needsPopulate = !fs.existsSync(DEV_DATABASE_PATH);

    if (needsPopulate) {
        console.log('  First run detected - populating database with initial data...');
        const populateApp = await populate(
            () => bootstrap(config),
            initialData,
        );
        await populateApp.close();
        if (shuttingDown) {
            return;
        }
        console.log('  Database populated successfully!');
    }

    const startingApp = await bootstrap(config);
    if (await closeIfStartupCancelled(startingApp)) {
        return;
    }

    await startingApp.get(JobQueueService).start();
    if (await closeIfStartupCancelled(startingApp)) {
        return;
    }

    // Configure default channel for multi-language and multi-currency testing
    try {
        const channelService = startingApp.get(ChannelService);
        const requestContextService = startingApp.get(RequestContextService);
        const ctx = await requestContextService.create({ apiType: 'admin' });
        const defaultChannel = await channelService.getDefaultChannel(ctx);
        const defaultZone = await ensureDevDefaultZone(startingApp, ctx);
        await channelService.update(ctx, {
            id: defaultChannel.id,
            availableLanguageCodes: [LanguageCode.en, LanguageCode.de, LanguageCode.fr],
            availableCurrencyCodes: [CurrencyCode.EUR, CurrencyCode.USD, CurrencyCode.CHF, CurrencyCode.GBP],
            defaultCurrencyCode: CurrencyCode.EUR,
            defaultTaxZoneId: defaultZone.id,
            defaultShippingZoneId: defaultZone.id,
        });
        const devChannels = await ensureDevChannels(
            channelService,
            ctx,
            defaultZone.id,
        );
        await ensureDevChannelAssignments(
            channelService,
            startingApp.get(RoleService),
            startingApp.get(StockLocationService),
            ctx,
            devChannels,
        );
        console.log(
            `  Default channel configured: languages=[en, de, fr], currencies=[EUR, USD, CHF, GBP], zone=${defaultZone.name}`,
        );
        console.log(
            `  Additional channels configured: ${DEV_CHANNEL_DEFINITIONS.map(channel => channel.code).join(', ')}`,
        );

        // Fix shipping method calculator args — Vendure's populate() only stores the 'rate' arg
        // but the default-shipping-calculator also requires 'taxRate' and 'includesTax'.
        // Missing args cause NaN in order price calculations (shippingWithTax).
        const connection = startingApp.get(TransactionalConnection);
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

    if (await closeIfStartupCancelled(startingApp)) {
        return;
    }

    app = startingApp;

    // Start mock API servers unless explicitly disabled
    if (process.env.START_MOCKS !== 'false') {
        await mockSupervisor.start();
        if (shuttingDown) {
            return;
        }
        console.log('  Mock API servers are ready');
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

async function shutdown(exitCode = 0): Promise<void> {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log('\nShutting down...');
    await mockSupervisor.stop();
    await app?.close();
    process.exitCode = exitCode;
}

void runServer().catch(async err => {
    if (shuttingDown) {
        return;
    }
    console.error('Failed to start server:', err);
    await shutdown(1);
});

// Graceful shutdown
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
