/**
 * Vendure Product Sync Loader (Demo)
 *
 * Demonstrates a custom loader that syncs external products to Vendure.
 * In demo mode, it logs what would be synced. In a real implementation,
 * this would use Vendure's admin API to create/update products.
 */
import { JsonObject, LoaderAdapter, LoadContext, LoadResult, StepConfigSchema } from '../../../../src';

export const vendureProductSyncSchema: StepConfigSchema = {
    fields: [
        { key: 'matchField', type: 'string', label: 'Match Field', required: true, defaultValue: 'sku', description: 'Field to match for existing products (sku, externalId)' },
        { key: 'createMissing', type: 'boolean', label: 'Create Missing', required: false, defaultValue: true, description: 'Create products that do not exist in Vendure' },
        { key: 'updateExisting', type: 'boolean', label: 'Update Existing', required: false, defaultValue: true, description: 'Update products that already exist in Vendure' },
        { key: 'channel', type: 'string', label: 'Channel', required: false, defaultValue: '__default_channel__', description: 'Vendure channel to sync to' },
        { key: 'demoMode', type: 'boolean', label: 'Demo Mode', required: false, defaultValue: true, description: 'Log actions instead of making changes' },
    ],
};

interface VendureProductSyncConfig {
    matchField: string;
    createMissing?: boolean;
    updateExisting?: boolean;
    channel?: string;
    demoMode?: boolean;
}

interface SyncStats {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ record: JsonObject; message: string }>;
}

export const vendureProductSyncLoader: LoaderAdapter<VendureProductSyncConfig> = {
    type: 'loader',
    code: 'vendure-product-sync',
    name: 'Vendure Product Sync (Demo)',
    description: 'Sync external products to Vendure catalog (demo mode logs actions)',
    category: 'data-source',
    schema: vendureProductSyncSchema,
    icon: 'refresh',
    version: '1.0.0',

    async load(context: LoadContext, config: VendureProductSyncConfig, records: readonly JsonObject[]): Promise<LoadResult> {
        const {
            matchField = 'sku',
            createMissing = true,
            updateExisting = true,
            channel = '__default_channel__',
            demoMode = true,
        } = config;

        const stats: SyncStats = {
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };

        context.logger.info(`Vendure Product Sync: Processing ${records.length} records`);
        context.logger.info(`  Match field: ${matchField}`);
        context.logger.info(`  Create missing: ${createMissing}`);
        context.logger.info(`  Update existing: ${updateExisting}`);
        context.logger.info(`  Channel: ${channel}`);
        context.logger.info(`  Demo mode: ${demoMode}`);

        if (context.dryRun || demoMode) {
            context.logger.info(`[DEMO MODE] Simulating sync operations...`);
        }

        for (const record of records) {
            const matchValue = record[matchField];

            if (!matchValue) {
                stats.failed++;
                stats.errors.push({
                    record,
                    message: `Missing required match field: ${matchField}`,
                });
                continue;
            }

            // Simulate checking if product exists
            // In a real implementation, query Vendure for existing product
            const existsInVendure = Math.random() > 0.5; // Simulate 50% existing

            if (existsInVendure && updateExisting) {
                if (context.dryRun || demoMode) {
                    context.logger.debug(`[DEMO] Would UPDATE product with ${matchField}=${matchValue}`);
                } else {
                    // Real implementation would call Vendure Admin API
                    // await vendureClient.updateProduct({ ... });
                }
                stats.updated++;
            } else if (!existsInVendure && createMissing) {
                if (context.dryRun || demoMode) {
                    context.logger.debug(`[DEMO] Would CREATE product with ${matchField}=${matchValue}`);
                } else {
                    // Real implementation would call Vendure Admin API
                    // await vendureClient.createProduct({ ... });
                }
                stats.created++;
            } else {
                stats.skipped++;
                context.logger.debug(`Skipped product with ${matchField}=${matchValue} (exists=${existsInVendure})`);
            }
        }

        context.logger.info(`Vendure Product Sync Complete:`);
        context.logger.info(`  Created: ${stats.created}`);
        context.logger.info(`  Updated: ${stats.updated}`);
        context.logger.info(`  Skipped: ${stats.skipped}`);
        context.logger.info(`  Failed: ${stats.failed}`);

        return {
            succeeded: stats.created + stats.updated,
            failed: stats.failed,
            errors: stats.errors.length > 0 ? stats.errors : undefined,
        };
    },
};

export default vendureProductSyncLoader;
