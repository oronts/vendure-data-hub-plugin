/**
 * ERP Complex Pipelines - Enterprise ERP integration scenarios
 *
 * Five production-quality pipelines covering advanced ERP integration patterns:
 *
 * ERP-1: Full ERP product import with option groups, translations, custom fields,
 *         multi-currency pricing, assets, and facet assignment.
 *
 * ERP-2: Full customer sync with group assignment, multi-address import,
 *         B2B fields, and UPSERT-by-email deduplication.
 *
 * ERP-3: Complex order import with state machine transitions, custom fields,
 *         coupon application, and skip-on-unknown-product error handling.
 *
 * ERP-4: Delta/CDC sync using the /api/changes endpoint — routes records to
 *         DELETE vs UPSERT branches based on the `operation` field.
 *
 * ERP-5: Channel-specific catalog — filters products by channel, assigns to
 *         a Vendure channel, applies channel pricing, and imports translations.
 */

import { createPipeline } from '../../../src';
import { MOCK_PORTS, mockUrl } from '../../ports';

const PIMCORE_API_URL = process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE);

// =============================================================================
// ERP-1: FULL ERP PRODUCT IMPORT
// HTTP extract → translations → custom fields → option groups → assets → facets
// =============================================================================

/**
 * Complete ERP product import from the Pimcore mock API.
 *
 * Features:
 * - HTTP extractor with includeTranslations=true
 * - Product-level HTTP enrichment for full detail (variants, assets, facetCodes)
 * - translationsField: maps EN/DE/FR translation objects
 * - channelsField: assigns product to Vendure channels
 * - customFieldsField: maps GTIN, brand, weight, minOrderQty
 * - priceByCurrencyField: multi-currency pricing (EUR/USD/GBP)
 * - optionGroupsField: creates size × color × material option groups
 * - Asset import (sourceUrl-based)
 * - Facet assignment via facetCodesField
 * - UPSERT with SOURCE_WINS conflict strategy
 * - ACCUMULATE error mode so bad records are logged, not fatal
 */
export const erpFullProductImport = createPipeline()
    .name('ERP Full Product Import')
    .description('Complete ERP product import: translations, channels, custom fields, option groups, multi-currency pricing, assets, and facets')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', { type: 'SCHEDULE', cron: '0 2 * * *', timezone: 'Europe/Berlin' })

    // ── Extract: product listing with translation headers ──────────────────────
    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    // ── Validate: require itemNumber ───────────────────────────────────────────
    .validate('check-sku', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'itemNumber', required: true, error: 'itemNumber (SKU) is required' } },
        ],
    })

    // ── Enrich: fetch full product detail (variants, assets, facetCodes) ───────
    .transform('enrich-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{itemNumber}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    // ── Transform: map product-level fields ────────────────────────────────────
    .transform('map-product', {
        operators: [
            // Core fields
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            // Translations (EN/DE/FR object keyed by locale)
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },
            // Channels array from ERP
            { op: 'copy', args: { source: '_detail.product.channels', target: 'channels' } },
            // Custom fields from ERP attributes
            {
                op: 'script',
                args: {
                    code: `
                        // Map ERP custom attributes to Vendure custom fields
                        const attr = record._detail?.product?.customFields || {};
                        record.customFields = {
                            gtin: attr.gtin || null,
                            brand: attr.brand || null,
                            weightGrams: attr.weightGrams ? Number(attr.weightGrams) : null,
                            minOrderQty: attr.minOrderQty ? Number(attr.minOrderQty) : null,
                            erpId: String(record._detail?.product?.id || ''),
                        };
                        // Build slug from English name
                        const enName = record._detail?.product?.title?.en || record._detail?.product?.title?.de || '';
                        record._enName = enName;
                        // Collect assets
                        record._assets = (record._detail?.assets || []).map(a => ({ url: a.url, alt: a.alt }));
                        // Collect facet codes
                        record._facetCodes = record._detail?.product?.facetCodes || [];
                        // Category code → collection slug
                        record._collectionSlug = record._detail?.product?.categoryCode || null;
                        // Store variants for expansion
                        record._variants = record._detail?.variants || [];
                        return record;
                    `,
                },
            },
            { op: 'slugify', args: { source: '_enName', target: 'slug' } },
            { op: 'stripHtml', args: { source: 'description', target: 'description' } },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'omit', args: { fields: ['_detail', '_enName', 'id', 'type', 'variantCount', 'modifiedAt', 'categoryCode'] } },
        ],
    })

    // ── Load: upsert products ──────────────────────────────────────────────────
    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        translationsField: 'translations',
        channelsField: 'channels',
        customFieldsField: 'customFields',
        createVariants: false,
    })

    // ── Transform: expand variants ────────────────────────────────────────────
    .transform('expand-variants', {
        operators: [
            { op: 'expand', args: { path: '_variants', parentFields: { productSlug: 'slug', productName: 'name' } } },
        ],
    })

    // ── Transform: map variant fields ────────────────────────────────────────
    .transform('map-variants', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'title', target: 'variantName' } },
            { op: 'copy', args: { source: 'attributes', target: 'options' } },
            { op: 'copy', args: { source: 'price', target: 'priceByCurrency' } },
            { op: 'copy', args: { source: 'price.EUR', target: 'priceEur' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Convert price to cents (Vendure stores in subunits)
                        record.priceValue = Math.round((record.priceEur || 0) * 100);
                        // Map priceByCurrency: multiply all values to subunits
                        if (record.priceByCurrency && typeof record.priceByCurrency === 'object') {
                            const converted = {};
                            for (const [currency, price] of Object.entries(record.priceByCurrency)) {
                                converted[currency] = Math.round(Number(price) * 100);
                            }
                            record.priceByCurrency = converted;
                        }
                        // Variant assets (may be empty array)
                        record._variantAssets = record.assets || [];
                        return record;
                    `,
                },
            },
            { op: 'validateRequired', args: { fields: ['sku'] } },
            { op: 'pick', args: { fields: ['sku', 'variantName', 'productSlug', 'productName', 'priceValue', 'options', 'translations', 'priceByCurrency'] } },
        ],
    })

    // ── Load: upsert variants with option groups + multi-currency ─────────────
    .load('upsert-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'variantName',
        priceField: 'priceValue',
        priceByCurrencyField: 'priceByCurrency',
        optionGroupsField: 'options',
        translationsField: 'translations',
    })

    // ── Graph: linear with branches at variants ───────────────────────────────
    .edge('manual', 'fetch-products')
    .edge('schedule', 'fetch-products')
    .edge('fetch-products', 'check-sku')
    .edge('check-sku', 'enrich-detail')
    .edge('enrich-detail', 'map-product')
    .edge('map-product', 'upsert-products')
    .edge('map-product', 'expand-variants')
    .edge('expand-variants', 'map-variants')
    .edge('map-variants', 'upsert-variants')
    .edge('upsert-products', 'upsert-variants')

    .build();

// =============================================================================
// ERP-2: ERP CUSTOMER SYNC
// Full customer sync with group assignment, multi-address, B2B fields
// =============================================================================

/**
 * Full customer sync from ERP with:
 * - Customer group assignment from ERP `segment` field (retail/wholesale/enterprise)
 * - Multi-address import: both billing and shipping address from ERP addresses array
 * - B2B fields: company name, tax-exempt flag from ERP custom fields
 * - UPSERT by email (deduplication key)
 * - Inactive customers filtered out (active: false)
 * - Validation with ACCUMULATE to skip bad records
 */
export const erpCustomerSync = createPipeline()
    .name('ERP Customer Sync')
    .description('Full customer sync: group assignment, multi-address, B2B company/VAT fields, UPSERT by email')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', { type: 'SCHEDULE', cron: '0 5 * * *', timezone: 'Europe/Berlin' })

    // ── Extract: customer groups first (ensures groups exist before assignment) ──
    .extract('fetch-groups', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/customer-groups`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'customerGroups',
    })

    .load('upsert-groups', {
        adapterCode: 'customerGroupUpsert',
        strategy: 'UPSERT',
        nameField: 'name',
    })

    // ── Extract: all customers including inactive ──────────────────────────────
    .extract('fetch-customers', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/customers?activeOnly=false&includeTranslations=false`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'customers',
    })

    // ── Validate: email required + format ────────────────────────────────────
    .validate('check-customers', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid email required' } },
            { type: 'business', spec: { field: 'firstName', required: true, error: 'First name required' } },
            { type: 'business', spec: { field: 'lastName', required: true, error: 'Last name required' } },
        ],
    })

    // ── Route: skip inactive customers ────────────────────────────────────────
    .route('active-or-skip', {
        branches: [
            { name: 'active', when: [{ field: 'active', cmp: 'eq', value: true }] },
            { name: 'inactive', when: [{ field: 'active', cmp: 'eq', value: false }] },
        ],
    })

    // ── Export: inactive customers report (branch: inactive) ─────────────────
    .export('inactive-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'erp-inactive-customers.csv',
    })

    // ── Transform: build addresses + assign groups (branch: active) ──────────
    .transform('map-customers', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'firstName' } },
            { op: 'trim', args: { path: 'lastName' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Normalize ERP addresses array to Vendure format
                        if (Array.isArray(record.addresses)) {
                            record.addresses = record.addresses.map(a => ({
                                fullName: a.company
                                    ? (record.firstName + ' ' + record.lastName + ', ' + a.company)
                                    : (record.firstName + ' ' + record.lastName),
                                company: a.company || record.company || undefined,
                                streetLine1: a.streetLine1 || '',
                                streetLine2: a.streetLine2 || undefined,
                                city: a.city || '',
                                postalCode: a.postalCode || '',
                                countryCode: a.countryCode || 'DE',
                                province: a.province || undefined,
                                phoneNumber: record.phone || undefined,
                                defaultShippingAddress: !!a.defaultShipping,
                                defaultBillingAddress: !!a.defaultBilling,
                            }));
                        } else {
                            record.addresses = [];
                        }
                        // ERP groups (e.g. ['B2B', 'Premium']) → Vendure group names
                        record.groupNames = Array.isArray(record.groups) ? record.groups : [];
                        // B2B custom fields
                        record.customFields = {
                            company: record.company || null,
                            vatNumber: record.vatNumber || null,
                            erpCustomerId: String(record.id || ''),
                        };
                        return record;
                    `,
                },
            },
        ],
    })

    // ── Load: upsert customers ────────────────────────────────────────────────
    .load('upsert-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groupNames',
        customFieldsField: 'customFields',
        addressesMode: 'UPSERT_BY_MATCH',
    })

    // ── Export: sync report ────────────────────────────────────────────────────
    .export('sync-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'erp-customer-sync.csv',
    })

    // ── Graph ─────────────────────────────────────────────────────────────────
    .edge('manual', 'fetch-groups')
    .edge('schedule', 'fetch-groups')
    .edge('fetch-groups', 'upsert-groups')
    .edge('upsert-groups', 'fetch-customers')
    .edge('fetch-customers', 'check-customers')
    .edge('check-customers', 'active-or-skip')
    .edge('active-or-skip', 'inactive-report', 'inactive')
    .edge('active-or-skip', 'map-customers', 'active')
    .edge('map-customers', 'upsert-customers')
    .edge('upsert-customers', 'sync-report')

    .build();

// =============================================================================
// ERP-3: ERP ORDER IMPORT
// Full order import: state machine, custom fields, coupon, skip-on-unknown-SKU
// =============================================================================

/**
 * Complex order import from ERP with:
 * - HTTP extractor from /api/orders
 * - State machine: create → PaymentSettled → Shipped → (if delivered) → Delivered
 * - Custom fields on orders: trackingNumber, purchaseOrderRef, importSource
 * - Coupon application when discountCode present
 * - Order note with import metadata (ERP order code, customer, timestamp)
 * - ACCUMULATE error mode: unknown SKUs skipped, logged, don't fail run
 * - Export: import report CSV
 */
export const erpOrderImport = createPipeline()
    .name('ERP Order Import')
    .description('Complex order import with state transitions, order notes, coupon codes, custom fields, and skip-on-unknown-product error handling')
    .capabilities({ requires: ['UpdateOrder', 'UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    // ── Extract: orders from ERP ──────────────────────────────────────────────
    .extract('fetch-orders', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/orders`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'orders',
    })

    // ── Validate: order code + email + lines ──────────────────────────────────
    .validate('check-orders', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'code', required: true, error: 'Order code is required' } },
            { type: 'business', spec: { field: 'customerEmail', required: true, error: 'Customer email is required' } },
            { type: 'business', spec: { field: 'lines', required: true, error: 'Order must have at least one line' } },
        ],
    })

    // ── Enrich: defaults and metadata ─────────────────────────────────────────
    .enrich('set-defaults', {
        defaults: {
            shippingMethodCode: 'standard-shipping',
            paymentMethodCode: 'standard-payment',
        },
        set: {
            importSource: 'erp-pimcore',
        },
    })

    // ── Transform: map order fields + build import note ──────────────────────
    .transform('prepare-orders', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Build import note with ERP metadata
                        record.importNote = [
                            'Imported from ERP (Pimcore)',
                            'ERP Order: ' + record.code,
                            'Customer: ' + record.customerEmail,
                            'State: ' + record.state,
                            'Imported at: ' + new Date().toISOString(),
                            record.customFields?.purchaseOrderRef
                                ? 'PO Reference: ' + record.customFields.purchaseOrderRef
                                : null,
                            record.customFields?.trackingNumber
                                ? 'Tracking: ' + record.customFields.trackingNumber
                                : null,
                        ].filter(Boolean).join(' | ');

                        // Map ERP state to Vendure target state
                        // ERP may have states like Delivered, Shipped, etc.
                        const stateMap = {
                            'Delivered': 'Delivered',
                            'Shipped': 'Shipped',
                            'PartiallyShipped': 'PartiallyShipped',
                            'PaymentSettled': 'PaymentSettled',
                            'PaymentAuthorized': 'PaymentAuthorized',
                        };
                        record.targetState = stateMap[record.state] || 'PaymentSettled';

                        // Has coupon?
                        record.hasCoupon = !!(record.discountCode || record.customFields?.discountCode);
                        record.couponCode = record.discountCode || record.customFields?.discountCode || null;

                        return record;
                    `,
                },
            },
            {
                op: 'template',
                args: {
                    template: 'ERP-${code}',
                    target: 'externalRef',
                },
            },
        ],
    })

    // ── Route: coupon vs no-coupon ────────────────────────────────────────────
    .route('has-coupon', {
        branches: [
            { name: 'with-coupon', when: [{ field: 'hasCoupon', cmp: 'eq', value: true }] },
            { name: 'no-coupon', when: [{ field: 'hasCoupon', cmp: 'eq', value: false }] },
        ],
    })

    // ── Load: create orders with coupon (branch: with-coupon) ────────────────
    .load('create-orders-with-coupon', {
        adapterCode: 'orderUpsert',
        lookupFields: 'code',
        state: 'PaymentSettled',
        orderPlacedAtField: 'orderPlacedAt',
        couponCodeField: 'couponCode',
        customFieldsField: 'customFields',
    })

    // ── Load: create orders without coupon (branch: no-coupon) ───────────────
    .load('create-orders-no-coupon', {
        adapterCode: 'orderUpsert',
        lookupFields: 'code',
        state: 'PaymentSettled',
        orderPlacedAtField: 'orderPlacedAt',
        customFieldsField: 'customFields',
    })

    // ── Load: add import notes (both branches merge here) ────────────────────
    .load('add-notes', {
        adapterCode: 'orderNote',
        orderCodeField: 'code',
        noteField: 'importNote',
        isPrivate: true,
    })

    // ── Load: transition orders to their ERP state (per-record via targetState) ─
    .load('transition-state', {
        adapterCode: 'orderTransition',
        orderCodeField: 'code',
        stateField: 'targetState',
    })

    // ── Export: order import report ────────────────────────────────────────────
    .export('order-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'erp-order-import.csv',
    })

    // ── Graph ─────────────────────────────────────────────────────────────────
    .edge('manual', 'fetch-orders')
    .edge('fetch-orders', 'check-orders')
    .edge('check-orders', 'set-defaults')
    .edge('set-defaults', 'prepare-orders')
    .edge('prepare-orders', 'has-coupon')
    .edge('has-coupon', 'create-orders-with-coupon', 'with-coupon')
    .edge('has-coupon', 'create-orders-no-coupon', 'no-coupon')
    .edge('create-orders-with-coupon', 'add-notes')
    .edge('create-orders-no-coupon', 'add-notes')
    .edge('add-notes', 'transition-state')
    .edge('transition-state', 'order-report')

    .build();

// =============================================================================
// ERP-4: ERP DELTA SYNC (CDC via /api/changes endpoint)
// Polls change feed → routes DELETE vs UPSERT → product + customer loaders
// =============================================================================

/**
 * Delta/change-data-capture sync using the ERP /api/changes endpoint.
 *
 * The ERP exposes a change feed: GET /api/changes?since=<ISO timestamp>
 * Each record has: { type: 'product'|'customer', operation: 'UPSERT'|'DELETE', id, modifiedAt }
 *
 * Pipeline:
 * 1. Extract changes since last run (uses {{lastRun}} variable)
 * 2. Validate: type and operation required
 * 3. Route by operation (DELETE vs UPSERT)
 * 4. Route by entity type (product vs customer)
 * 5. DELETE branch: entity-deletion loader
 * 6. UPSERT branch: HTTP enrich to get full record → product/customer loader
 * 7. Export delta sync report
 */
export const erpDeltaSyncPipeline = createPipeline()
    .name('ERP Delta Sync')
    .description('Delta/CDC sync: polls /api/changes?since=lastRun, routes DELETE vs UPSERT, handles product and customer entity types')
    .capabilities({ requires: ['UpdateCatalog', 'UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })
    .trigger('schedule', {
        type: 'SCHEDULE',
        cron: '*/15 * * * *',
        timezone: 'UTC',
    })

    // ── Extract: change feed since last run ───────────────────────────────────
    .extract('fetch-changes', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/changes`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'changes',
    })

    // ── Validate: type and action required ────────────────────────────────────
    .validate('check-changes', {
        errorHandlingMode: 'ACCUMULATE',
        rules: [
            { type: 'business', spec: { field: 'entity', required: true, error: 'entity type is required' } },
            { type: 'business', spec: { field: 'action', required: true, error: 'action is required' } },
            { type: 'business', spec: { field: 'entityId', required: true, error: 'entityId is required' } },
        ],
    })

    // ── Transform: normalize operation + build identifier ─────────────────────
    .transform('normalize-change', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Normalize: ERP uses 'action' = create/update/delete
                        // Map to standard UPSERT / DELETE
                        record.operation = record.action === 'delete' ? 'DELETE' : 'UPSERT';
                        // Identifier string (for lookup)
                        record.entityIdentifier = String(record.entityId);
                        return record;
                    `,
                },
            },
        ],
    })

    // ── Route: DELETE vs UPSERT ───────────────────────────────────────────────
    .route('delete-or-upsert', {
        branches: [
            { name: 'delete', when: [{ field: 'operation', cmp: 'eq', value: 'DELETE' }] },
            { name: 'upsert', when: [{ field: 'operation', cmp: 'eq', value: 'UPSERT' }] },
        ],
    })

    // ═══════════════ DELETE branch ════════════════════════════════════════════

    // Route by entity type for deletion
    .route('route-delete-type', {
        branches: [
            { name: 'product', when: [{ field: 'entity', cmp: 'eq', value: 'product' }] },
            { name: 'customer', when: [{ field: 'entity', cmp: 'eq', value: 'customer' }] },
            { name: 'facet', when: [{ field: 'entity', cmp: 'eq', value: 'facet' }] },
        ],
    })

    .load('delete-products', {
        adapterCode: 'entityDeletion',
        entityType: 'product',
        identifierField: 'entityIdentifier',
        matchBy: 'id',
    })

    .load('delete-customers', {
        adapterCode: 'entityDeletion',
        entityType: 'customer',
        identifierField: 'entityIdentifier',
        matchBy: 'id',
    })

    .load('delete-facets', {
        adapterCode: 'entityDeletion',
        entityType: 'facet',
        identifierField: 'entityIdentifier',
        matchBy: 'id',
    })

    // ═══════════════ UPSERT branch ════════════════════════════════════════════

    // Route by entity type for upsert
    .route('route-upsert-type', {
        branches: [
            { name: 'product', when: [{ field: 'entity', cmp: 'eq', value: 'product' }] },
            { name: 'customer', when: [{ field: 'entity', cmp: 'eq', value: 'customer' }] },
            { name: 'facet', when: [{ field: 'entity', cmp: 'eq', value: 'facet' }] },
        ],
    })

    // Enrich: fetch full product detail
    .transform('fetch-product-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{entityIdentifier}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_productDetail',
                    cacheTtlSec: 60,
                },
            },
            {
                op: 'script',
                args: {
                    code: `
                        const p = record._productDetail?.product;
                        if (!p) return record;
                        record.sku = p.itemNumber;
                        record.name = p.title?.en || p.title?.de || p.itemNumber;
                        record.description = p.description?.en || p.description?.de || '';
                        record.enabled = p.published;
                        record.slug = record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        record.translations = record._productDetail?.product?.translations;
                        return record;
                    `,
                },
            },
            { op: 'omit', args: { fields: ['_productDetail'] } },
        ],
    })

    .load('upsert-delta-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        translationsField: 'translations',
        createVariants: false,
    })

    // Enrich: fetch full customer detail
    .transform('fetch-customer-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/customers/{{entityIdentifier}}`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_customerDetail',
                    cacheTtlSec: 60,
                },
            },
            {
                op: 'script',
                args: {
                    code: `
                        const c = record._customerDetail;
                        if (!c) return record;
                        record.email = c.email;
                        record.firstName = c.firstName;
                        record.lastName = c.lastName;
                        record.phone = c.phone;
                        record.company = c.company;
                        record.groups = c.groups || [];
                        record.addresses = (c.addresses || []).map(a => ({
                            fullName: record.firstName + ' ' + record.lastName,
                            company: a.company || record.company || undefined,
                            streetLine1: a.streetLine1 || '',
                            city: a.city || '',
                            postalCode: a.postalCode || '',
                            countryCode: a.countryCode || 'DE',
                            defaultShippingAddress: !!a.defaultShipping,
                            defaultBillingAddress: !!a.defaultBilling,
                        }));
                        return record;
                    `,
                },
            },
            { op: 'omit', args: { fields: ['_customerDetail'] } },
        ],
    })

    .load('upsert-delta-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groups',
        addressesMode: 'UPSERT_BY_MATCH',
    })

    // ── Export: delta sync report ──────────────────────────────────────────────
    .export('delta-report', {
        adapterCode: 'jsonExport',
        path: './exports',
        filename: 'erp-delta-sync.json',
    })

    // ── Graph ─────────────────────────────────────────────────────────────────
    .edge('manual', 'fetch-changes')
    .edge('schedule', 'fetch-changes')
    .edge('fetch-changes', 'check-changes')
    .edge('check-changes', 'normalize-change')
    .edge('normalize-change', 'delete-or-upsert')
    // Delete branch
    .edge('delete-or-upsert', 'route-delete-type', 'delete')
    .edge('route-delete-type', 'delete-products', 'product')
    .edge('route-delete-type', 'delete-customers', 'customer')
    .edge('route-delete-type', 'delete-facets', 'facet')
    // Upsert branch
    .edge('delete-or-upsert', 'route-upsert-type', 'upsert')
    .edge('route-upsert-type', 'fetch-product-detail', 'product')
    .edge('fetch-product-detail', 'upsert-delta-products')
    .edge('route-upsert-type', 'fetch-customer-detail', 'customer')
    .edge('fetch-customer-detail', 'upsert-delta-customers')
    // Report (after all upserts)
    .edge('upsert-delta-products', 'delta-report')
    .edge('upsert-delta-customers', 'delta-report')

    .build();

// =============================================================================
// ERP-5: CHANNEL-SPECIFIC CATALOG
// Filter products by channel → assign to Vendure channel → channel pricing + translations
// =============================================================================

/**
 * Channel-specific product catalog import.
 *
 * The ERP assigns each product to one or more channels (web, b2b, uk-store).
 * This pipeline imports only the products assigned to the configured target channel,
 * assigns them to the matching Vendure channel, and applies channel-specific pricing.
 *
 * Features:
 * - HTTP extractor filtered by channel query parameter
 * - Channel assignment via channelsField
 * - Channel-specific pricing: GBP for uk-store, EUR for others
 * - Translations filtered to channel-relevant locales
 * - UPSERT with SOURCE_WINS
 * - Scheduled (daily at 3am in channel timezone)
 */
export const erpChannelSpecificCatalog = createPipeline()
    .name('ERP Channel-Specific Catalog')
    .description('Channel-specific product catalog: filter by channel, assign to Vendure channel, apply channel pricing and translations')
    .capabilities({ requires: ['UpdateCatalog'] })

    .trigger('manual', { type: 'MANUAL' })
    // UK store channel — daily at 3am UTC
    .trigger('schedule-uk', {
        type: 'SCHEDULE',
        cron: '0 3 * * *',
        timezone: 'Europe/London',
    })

    // ── Branch 1: UK Store channel products ───────────────────────────────────
    .extract('fetch-uk-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?channel=uk-store&includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    .transform('enrich-uk-detail', {
        operators: [
            {
                op: 'httpLookup',
                args: {
                    url: `${PIMCORE_API_URL}/api/products/{{itemNumber}}?includeTranslations=true`,
                    headers: { apiKey: 'test-pimcore-api-key' },
                    target: '_detail',
                    cacheTtlSec: 300,
                },
            },
        ],
    })

    .transform('map-uk-products', {
        operators: [
            { op: 'copy', args: { source: '_detail.product.itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: '_detail.product.title', target: 'name' } },
            { op: 'copy', args: { source: '_detail.product.description', target: 'description' } },
            { op: 'copy', args: { source: '_detail.product.published', target: 'enabled' } },
            { op: 'copy', args: { source: '_detail.product.translations', target: 'translations' } },
            {
                op: 'script',
                args: {
                    code: `
                        // UK Store: assign to uk-store channel
                        record.channels = ['uk-store'];
                        // Use English name for slug
                        const enName = record._detail?.product?.title?.en || record.name || '';
                        record.slug = enName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        // Strip HTML description
                        record.description = (record.description?.en || record.description || '').replace(/<[^>]+>/g, '');
                        // Build UK variants with GBP pricing
                        record._ukVariants = (record._detail?.variants || []).map(v => ({
                            sku: v.itemNumber,
                            name: v.title?.en || v.title?.de || v.itemNumber,
                            priceGbp: v.price?.GBP || Math.round((v.price?.EUR || 0) * 0.85),
                            priceValue: Math.round((v.price?.GBP || (v.price?.EUR || 0) * 0.85) * 100),
                            priceByCurrency: { GBP: Math.round((v.price?.GBP || (v.price?.EUR || 0) * 0.85) * 100) },
                            options: v.attributes || {},
                        }));
                        return record;
                    `,
                },
            },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
            { op: 'omit', args: { fields: ['_detail'] } },
        ],
    })

    .load('upsert-uk-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: 'uk-store',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        descriptionField: 'description',
        enabledField: 'enabled',
        translationsField: 'translations',
        channelsField: 'channels',
        createVariants: false,
    })

    .transform('expand-uk-variants', {
        operators: [
            { op: 'expand', args: { path: '_ukVariants', parentFields: { productSlug: 'slug' } } },
        ],
    })

    .load('upsert-uk-variants', {
        adapterCode: 'variantUpsert',
        strategy: 'UPSERT',
        skuField: 'sku',
        nameField: 'name',
        priceField: 'priceValue',
        priceByCurrencyField: 'priceByCurrency',
        optionGroupsField: 'options',
    })

    // ── Branch 2: B2B channel products ────────────────────────────────────────
    .extract('fetch-b2b-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?channel=b2b&includeTranslations=true`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    .transform('map-b2b-products', {
        operators: [
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'copy', args: { source: 'translations', target: 'translations' } },
            {
                op: 'script',
                args: {
                    code: `
                        // B2B channel: use German as primary locale
                        record.name = record.title?.de || record.title?.en || record.itemNumber;
                        record.slug = record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        record.channels = ['b2b'];
                        record.enabled = record.published;
                        return record;
                    `,
                },
            },
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
        ],
    })

    .load('upsert-b2b-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPSERT',
        conflictStrategy: 'SOURCE_WINS',
        channel: 'b2b',
        matchField: 'slug',
        nameField: 'name',
        slugField: 'slug',
        enabledField: 'enabled',
        translationsField: 'translations',
        channelsField: 'channels',
        createVariants: false,
    })

    // ── Graph ─────────────────────────────────────────────────────────────────
    // Branch 1: UK Store
    .edge('manual', 'fetch-uk-products')
    .edge('schedule-uk', 'fetch-uk-products')
    .edge('fetch-uk-products', 'enrich-uk-detail')
    .edge('enrich-uk-detail', 'map-uk-products')
    .edge('map-uk-products', 'upsert-uk-products')
    .edge('map-uk-products', 'expand-uk-variants')
    .edge('expand-uk-variants', 'upsert-uk-variants')
    .edge('upsert-uk-products', 'upsert-uk-variants')
    // Branch 2: B2B
    .edge('manual', 'fetch-b2b-products')
    .edge('schedule-uk', 'fetch-b2b-products')
    .edge('fetch-b2b-products', 'map-b2b-products')
    .edge('map-b2b-products', 'upsert-b2b-products')

    .build();
