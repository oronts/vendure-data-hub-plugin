/**
 * Vendure Entity Loaders
 *
 * Adapters for loading data into Vendure entities.
 */

import { Product, ProductVariant } from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { RecordObject } from '../runtime/executor-types';
import { AdapterDefinition, AdapterStats, AdapterError } from './types';
import { getFieldValue, slugify } from './utils';

/**
 * Product Loader
 */
export const productLoader: AdapterDefinition = {
    code: 'vendure-product-loader',
    name: 'Vendure Product Loader',
    type: 'loader',
    description: 'Create or update products in Vendure with full field support',
    configSchema: {
        properties: {
            strategy: { type: 'select', label: 'Load Strategy', default: 'upsert', options: [
                { value: 'create', label: 'Create Only' },
                { value: 'update', label: 'Update Only' },
                { value: 'upsert', label: 'Create or Update' },
            ]},
            conflictResolution: { type: 'select', label: 'Conflict Resolution', default: 'source-wins', options: [
                { value: 'source-wins', label: 'Source wins (overwrite)' },
                { value: 'vendure-wins', label: 'Vendure wins (keep existing)' },
                { value: 'merge', label: 'Merge (combine fields)' },
            ]},
            matchField: { type: 'select', label: 'Match Field', default: 'slug', options: [
                { value: 'slug', label: 'Slug' },
                { value: 'customFields.sku', label: 'SKU (Custom Field)' },
                { value: 'customFields.externalId', label: 'External ID (Custom Field)' },
            ]},
            nameField: { type: 'string', label: 'Name Field', default: 'name' },
            slugField: { type: 'string', label: 'Slug Field', default: 'slug' },
            descriptionField: { type: 'string', label: 'Description Field', default: 'description' },
            enabledField: { type: 'string', label: 'Enabled Field', default: 'enabled' },
            facetValuesField: { type: 'string', label: 'Facet Values Field', description: 'Comma-separated facet value codes' },
            createVariant: { type: 'boolean', label: 'Create Default Variant', default: true },
        },
        required: ['nameField'],
    },
    async process(ctx, records, config, services) {
        const stats: AdapterStats = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
        const errors: AdapterError[] = [];
        const results: RecordObject[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            stats.processed++;

            try {
                const nameValue = getFieldValue(record, String(config.nameField || 'name'));
                if (!nameValue) {
                    errors.push({ index: i, field: String(config.nameField), message: 'Name is required' });
                    stats.failed!++;
                    continue;
                }
                const name = String(nameValue);

                const slugValue = getFieldValue(record, String(config.slugField || 'slug'));
                const slug = String(slugValue || slugify(name));
                const descValue = getFieldValue(record, String(config.descriptionField || 'description'));
                const description = String(descValue || '');
                const enabledValue = config.enabledField ? getFieldValue(record, String(config.enabledField)) : true;
                const enabled = enabledValue !== false;

                // Check if product exists
                let existingProduct: Product | null = null;
                if (config.matchField === 'slug') {
                    const found = await services.productService.findAll(ctx, {
                        filter: { slug: { eq: slug } },
                        take: 1,
                    });
                    existingProduct = found.items[0] ?? null;
                }

                if (existingProduct && config.strategy === 'create') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _productId: existingProduct.id });
                    continue;
                }

                if (!existingProduct && config.strategy === 'update') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _reason: 'not_found' });
                    continue;
                }

                let product: Product;
                if (existingProduct) {
                    // Update
                    product = await services.productService.update(ctx, {
                        id: existingProduct.id,
                        translations: [{
                            languageCode: ctx.languageCode,
                            name: String(name),
                            slug,
                            description,
                        }],
                        enabled,
                    });
                    stats.updated!++;
                } else {
                    // Create
                    product = await services.productService.create(ctx, {
                        translations: [{
                            languageCode: ctx.languageCode,
                            name: String(name),
                            slug,
                            description,
                        }],
                        enabled,
                    });
                    stats.created!++;
                }

                results.push({ ...record, _status: existingProduct ? 'updated' : 'created', _productId: product.id });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ index: i, message });
                stats.failed!++;
            }
        }

        return { success: errors.length === 0, records: results, errors, stats };
    },
};

/**
 * Product Variant Loader
 */
export const variantLoader: AdapterDefinition = {
    code: 'vendure-variant-loader',
    name: 'Vendure Variant Loader',
    type: 'loader',
    description: 'Create or update product variants with pricing and stock',
    configSchema: {
        properties: {
            strategy: { type: 'select', label: 'Load Strategy', default: 'upsert', options: [
                { value: 'create', label: 'Create Only' },
                { value: 'update', label: 'Update Only' },
                { value: 'upsert', label: 'Create or Update' },
            ]},
            conflictResolution: { type: 'select', label: 'Conflict Resolution', default: 'source-wins', options: [
                { value: 'source-wins', label: 'Source wins (overwrite)' },
                { value: 'vendure-wins', label: 'Vendure wins (keep existing)' },
                { value: 'merge', label: 'Merge (combine fields)' },
            ]},
            matchField: { type: 'select', label: 'Match Field', default: 'sku', options: [
                { value: 'sku', label: 'SKU' },
                { value: 'customFields.externalId', label: 'External ID (Custom Field)' },
            ]},
            productIdField: { type: 'string', label: 'Product ID Field', default: 'productId' },
            skuField: { type: 'string', label: 'SKU Field', default: 'sku' },
            nameField: { type: 'string', label: 'Name Field', default: 'name' },
            priceField: { type: 'string', label: 'Price Field', default: 'price', description: 'Price in minor units (cents)' },
            stockOnHandField: { type: 'string', label: 'Stock Field', default: 'stockOnHand' },
            trackInventory: { type: 'boolean', label: 'Track Inventory', default: true },
        },
        required: ['skuField', 'productIdField'],
    },
    async process(ctx, records, config, services) {
        const stats: AdapterStats = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
        const errors: AdapterError[] = [];
        const results: RecordObject[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            stats.processed++;

            try {
                const skuValue = getFieldValue(record, String(config.skuField || 'sku'));
                if (!skuValue) {
                    errors.push({ index: i, field: String(config.skuField), message: 'SKU is required' });
                    stats.failed!++;
                    continue;
                }
                const sku = String(skuValue);

                const productIdValue = getFieldValue(record, String(config.productIdField || 'productId'));
                if (!productIdValue) {
                    errors.push({ index: i, field: String(config.productIdField), message: 'Product ID is required' });
                    stats.failed!++;
                    continue;
                }
                const productId = typeof productIdValue === 'number' ? productIdValue : String(productIdValue);

                const nameValue = getFieldValue(record, String(config.nameField || 'name'));
                const name = String(nameValue || sku);
                const priceValue = getFieldValue(record, String(config.priceField || 'price'));
                const price = parseInt(String(priceValue || '0'), 10);
                const stockValue = getFieldValue(record, String(config.stockOnHandField || 'stockOnHand'));
                const stockOnHand = parseInt(String(stockValue || '0'), 10);

                // Check if variant exists
                let existingVariant: ProductVariant | null = null;
                const found = await services.variantService.findAll(ctx, {
                    filter: { sku: { eq: String(sku) } },
                    take: 1,
                });
                existingVariant = found.items[0] ?? null;

                if (existingVariant && config.strategy === 'create') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _variantId: existingVariant.id });
                    continue;
                }

                if (!existingVariant && config.strategy === 'update') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _reason: 'not_found' });
                    continue;
                }

                let variant: ProductVariant;
                if (existingVariant) {
                    // Update
                    const updated = await services.variantService.update(ctx, [{
                        id: existingVariant.id,
                        translations: [{
                            languageCode: ctx.languageCode,
                            name: String(name),
                        }],
                        price,
                        trackInventory: config.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                        stockOnHand: config.trackInventory ? stockOnHand : undefined,
                    }]);
                    variant = updated[0];
                    stats.updated!++;
                } else {
                    // Create
                    const created = await services.variantService.create(ctx, [{
                        productId: typeof productId === 'number' ? productId : String(productId),
                        sku: String(sku),
                        translations: [{
                            languageCode: ctx.languageCode,
                            name: String(name),
                        }],
                        price,
                        trackInventory: config.trackInventory ? GlobalFlag.TRUE : GlobalFlag.FALSE,
                        stockOnHand: config.trackInventory ? stockOnHand : undefined,
                    }]);
                    variant = created[0];
                    stats.created!++;
                }

                results.push({ ...record, _status: existingVariant ? 'updated' : 'created', _variantId: variant.id });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ index: i, message });
                stats.failed!++;
            }
        }

        return { success: errors.length === 0, records: results, errors, stats };
    },
};

/**
 * Customer Loader
 */
export const customerLoader: AdapterDefinition = {
    code: 'vendure-customer-loader',
    name: 'Vendure Customer Loader',
    type: 'loader',
    description: 'Create or update customers with addresses',
    configSchema: {
        properties: {
            strategy: { type: 'select', label: 'Load Strategy', default: 'upsert', options: [
                { value: 'create', label: 'Create Only' },
                { value: 'update', label: 'Update Only' },
                { value: 'upsert', label: 'Create or Update' },
            ]},
            conflictResolution: { type: 'select', label: 'Conflict Resolution', default: 'source-wins', options: [
                { value: 'source-wins', label: 'Source wins (overwrite)' },
                { value: 'vendure-wins', label: 'Vendure wins (keep existing)' },
                { value: 'merge', label: 'Merge (combine fields)' },
            ]},
            matchField: { type: 'select', label: 'Match Field', default: 'emailAddress', options: [
                { value: 'emailAddress', label: 'Email Address' },
                { value: 'customFields.externalId', label: 'External ID (Custom Field)' },
            ]},
            emailField: { type: 'string', label: 'Email Field', default: 'email' },
            firstNameField: { type: 'string', label: 'First Name Field', default: 'firstName' },
            lastNameField: { type: 'string', label: 'Last Name Field', default: 'lastName' },
            phoneField: { type: 'string', label: 'Phone Field', default: 'phone' },
            titleField: { type: 'string', label: 'Title Field', default: 'title' },
        },
        required: ['emailField'],
    },
    async process(ctx, records, config, services) {
        const stats: AdapterStats = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
        const errors: AdapterError[] = [];
        const results: RecordObject[] = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            stats.processed++;

            try {
                const emailValue = getFieldValue(record, String(config.emailField || 'email'));
                if (!emailValue) {
                    errors.push({ index: i, field: String(config.emailField), message: 'Email is required' });
                    stats.failed!++;
                    continue;
                }
                const email = String(emailValue);

                const firstNameValue = getFieldValue(record, String(config.firstNameField || 'firstName'));
                const firstName = String(firstNameValue || '');
                const lastNameValue = getFieldValue(record, String(config.lastNameField || 'lastName'));
                const lastName = String(lastNameValue || '');
                const phoneValue = config.phoneField ? getFieldValue(record, String(config.phoneField)) : undefined;
                const phoneNumber = phoneValue ? String(phoneValue) : undefined;
                const titleValue = config.titleField ? getFieldValue(record, String(config.titleField)) : undefined;
                const title = titleValue ? String(titleValue) : undefined;

                // Check if customer exists
                const existingByEmail = await services.customerService.findAll(ctx, {
                    filter: { emailAddress: { eq: String(email) } },
                    take: 1,
                });
                const existing = existingByEmail.items[0] ?? null;

                if (existing && config.strategy === 'create') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _customerId: existing.id });
                    continue;
                }

                if (!existing && config.strategy === 'update') {
                    stats.skipped!++;
                    results.push({ ...record, _status: 'skipped', _reason: 'not_found' });
                    continue;
                }

                let customerId: string;
                if (existing) {
                    // Update
                    const updated = await services.customerService.update(ctx, {
                        id: existing.id,
                        firstName,
                        lastName,
                        phoneNumber,
                        title,
                    });
                    customerId = updated.id.toString();
                    stats.updated!++;
                } else {
                    // Create
                    const created = await services.customerService.create(ctx, {
                        emailAddress: String(email),
                        firstName,
                        lastName,
                        phoneNumber,
                        title,
                    }, undefined);
                    // Handle ErrorResult union type
                    if ('id' in created) {
                        customerId = created.id.toString();
                    } else {
                        throw new Error(created.message);
                    }
                    stats.created!++;
                }

                results.push({ ...record, _status: existing ? 'updated' : 'created', _customerId: customerId });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                errors.push({ index: i, message });
                stats.failed!++;
            }
        }

        return { success: errors.length === 0, records: results, errors, stats };
    },
};

/**
 * Collection of all loaders
 */
export const loaders = {
    product: productLoader,
    variant: variantLoader,
    customer: customerLoader,
};
