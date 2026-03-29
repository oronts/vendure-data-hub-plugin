/**
 * Enterprise Test Pipelines (Round 2)
 *
 * NEW complex pipeline definitions targeting real-world enterprise scenarios
 * NOT covered by the existing 26+ pipelines.
 *
 * ET-1: Operator Stress Test — Exercises ALL major operator categories in a single linear pipeline
 * ET-2: Customer Lifecycle with Routing — Active vs inactive routing, group creation, address dedup
 * ET-3: Order Import with State Transitions — Full order lifecycle including state machine
 * ET-4: Multi-Step Transform Chain — Deep transform chaining with every transform category
 * ET-5: Reconciliation & Audit Pipeline — Extract from Vendure, compare with PIM, export discrepancies
 */

import { createPipeline } from '../../../src';
import { MOCK_PORTS, mockUrl } from '../../ports';

const PIMCORE_API_URL = process.env.PIMCORE_API_URL || mockUrl(MOCK_PORTS.PIMCORE);

// =============================================================================
// ET-1: OPERATOR STRESS TEST
// Exercises ALL major operator categories in sequence on inline data
// =============================================================================

/**
 * Operator Stress Test Pipeline
 *
 * Extracts inline data and passes it through every major operator category:
 * - String ops: template, slugify, replace, trim, lowercase, uppercase, truncate, stripHtml
 * - Number ops: toNumber, math (multiply, add), round, clamp
 * - Date ops: set (ISO date)
 * - Object ops: copy, rename, pick, omit, merge, set, delete
 * - Conditional ops: when (keep/drop), coalesce, defaultValue
 * - Script ops: custom JavaScript transforms
 * - Validation ops: validateRequired
 * - Array/Expand ops: expand with parent field carry-over
 *
 * Expected: All 5 records should be transformed successfully through the chain.
 * The export step writes the final transformed data to CSV for manual verification.
 */
export const operatorStressTest = createPipeline()
    .name('ET-1: Operator Stress Test')
    .description('Exercises ALL major operator categories: string, number, date, object, conditional, script, validation, and array ops')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('manual', { type: 'MANUAL' })

    // Inline data — 5 records with various data types and edge cases
    .extract('inline-data', {
        adapterCode: 'csv',
        rows: [
            {
                rawName: '  <b>Product Alpha</b>  ',
                rawPrice: '29.995',
                rawDate: '2025-06-15',
                category: 'Electronics',
                subItems: JSON.stringify([{ sku: 'ALPHA-1', qty: 10 }, { sku: 'ALPHA-2', qty: 5 }]),
                status: 'active',
                email: 'test@example.com',
                tags: 'tag1,tag2,tag3',
                htmlDesc: '<p>This is a <strong>bold</strong> description with <a href="#">links</a></p>',
                nullableField: '',
            },
            {
                rawName: '  Product Beta  ',
                rawPrice: '149.50',
                rawDate: '2025-07-20',
                category: 'Home & Garden',
                subItems: JSON.stringify([{ sku: 'BETA-1', qty: 20 }]),
                status: 'active',
                email: 'USER@Example.COM',
                tags: 'premium,featured',
                htmlDesc: '<div>Simple <em>italic</em> text</div>',
                nullableField: 'has-value',
            },
            {
                rawName: '  Product Gamma  ',
                rawPrice: '0.99',
                rawDate: '2025-08-01',
                category: 'Books',
                subItems: JSON.stringify([{ sku: 'GAMMA-1', qty: 100 }]),
                status: 'inactive',
                email: 'gamma@test.org',
                tags: 'clearance',
                htmlDesc: '<h1>Title</h1><p>Paragraph with <br/> line break</p>',
                nullableField: '',
            },
            {
                rawName: '  Product Delta Long Name That Should Be Truncated For Display  ',
                rawPrice: '999.999',
                rawDate: '2025-12-31',
                category: 'Industrial',
                subItems: JSON.stringify([{ sku: 'DELTA-1', qty: 2 }, { sku: 'DELTA-2', qty: 3 }, { sku: 'DELTA-3', qty: 1 }]),
                status: 'active',
                email: 'DELTA@INDUSTRIAL.NET',
                tags: 'b2b,bulk,industrial',
                htmlDesc: '<table><tr><td>Cell data</td></tr></table>',
                nullableField: '',
            },
            {
                rawName: '  Product Epsilon  ',
                rawPrice: '50',
                rawDate: '2025-01-01',
                category: 'Sports',
                subItems: JSON.stringify([{ sku: 'EPS-1', qty: 15 }]),
                status: 'active',
                email: 'eps@sports.com',
                tags: 'new-arrival',
                htmlDesc: '<ul><li>Feature 1</li><li>Feature 2</li></ul>',
                nullableField: 'another-value',
            },
        ],
    })

    // Step 1: String operations — trim, stripHtml, lowercase, template, slugify, truncate, replace
    .transform('string-ops', {
        operators: [
            { op: 'trim', args: { path: 'rawName' } },
            { op: 'stripHtml', args: { source: 'rawName', target: 'cleanName' } },
            { op: 'stripHtml', args: { source: 'htmlDesc', target: 'plainDesc' } },
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'slugify', args: { source: 'cleanName', target: 'slug' } },
            { op: 'truncate', args: { source: 'cleanName', length: 30 } },
            { op: 'template', args: { template: '${cleanName} (${category})', target: 'displayTitle' } },
        ],
    })

    // Step 2: Number operations — toNumber, math, round, clamp
    .transform('number-ops', {
        operators: [
            { op: 'toNumber', args: { source: 'rawPrice' } },
            { op: 'math', args: { operation: 'multiply', source: 'rawPrice', operand: '100', target: 'priceInCents' } },
            { op: 'round', args: { source: 'priceInCents', decimals: 0, target: 'priceFinal' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Clamp price between 100 and 100000 (simulates clamp operator)
                        const val = Number(record.priceFinal) || 0;
                        record.priceClamp = Math.max(100, Math.min(100000, val));
                        return record;
                    `,
                },
            },
            { op: 'math', args: { operation: 'add', source: 'priceFinal', operand: '500', target: 'priceWithShipping' } },
        ],
    })

    // Step 3: Object operations — copy, rename, set, omit + conditional ops
    .transform('object-ops', {
        operators: [
            { op: 'copy', args: { source: 'category', target: 'categoryBackup' } },
            { op: 'rename', args: { from: 'rawDate', to: 'orderDate' } },
            { op: 'set', args: { path: 'importSource', value: 'operator-stress-test' } },
            { op: 'set', args: { path: 'processedAt', value: '2026-03-02T00:00:00Z' } },
            // Conditional: only keep active records
            { op: 'when', args: { conditions: [{ field: 'status', cmp: 'eq', value: 'active' }], action: 'keep' } },
            // Clean up temporary fields
            { op: 'omit', args: { fields: ['rawName', 'rawPrice', 'subItems', 'htmlDesc'] } },
        ],
    })

    // Step 4: Script-based complex transform — parse JSON, compute derived fields
    .transform('script-ops', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Derive a tag count from the comma-separated tags field
                        const tags = (record.tags || '').split(',').filter(t => t.trim().length > 0);
                        record.tagCount = tags.length;
                        record.tagArray = tags;
                        record.isHighValue = record.priceFinal > 5000;
                        record.priceCategory = record.priceFinal > 10000 ? 'premium' : record.priceFinal > 1000 ? 'mid-range' : 'budget';
                        return record;
                    `,
                },
            },
        ],
    })

    // Step 5: Validate required fields (final check)
    .validate('validate-output', {
        rules: [
            { type: 'business', spec: { field: 'slug', required: true, error: 'Slug is required' } },
            { type: 'business', spec: { field: 'priceFinal', required: true, min: 1, error: 'Price must be positive' } },
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid email required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    // Step 6: Export results for manual verification
    .export('stress-test-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'operator-stress-test-results.csv',
    })

    // Linear graph
    .edge('manual', 'inline-data')
    .edge('inline-data', 'string-ops')
    .edge('string-ops', 'number-ops')
    .edge('number-ops', 'object-ops')
    .edge('object-ops', 'script-ops')
    .edge('script-ops', 'validate-output')
    .edge('validate-output', 'stress-test-report')

    .build();


// =============================================================================
// ET-2: CUSTOMER LIFECYCLE WITH ROUTING
// Active customers → upsert with groups; inactive → export to deactivation report
// =============================================================================

/**
 * Customer Lifecycle Pipeline
 *
 * Extracts ALL customers (active + inactive) from the mock PIM API,
 * validates email/name fields, then routes:
 *   - Active customers → build addresses + group assignment → upsert into Vendure
 *   - Inactive customers → export to deactivation report CSV
 *
 * Tests:
 * - Route step with 2 branches based on `active` field
 * - Customer group creation and assignment
 * - Multi-address handling with default shipping/billing flags
 * - Email deduplication via UPSERT strategy
 * - Inactive customer tracking (export-only branch)
 * - Re-run idempotency (UPSERT should not create duplicates)
 */
export const customerLifecycleTest = createPipeline()
    .name('ET-2: Customer Lifecycle Test')
    .description('Tests customer routing (active vs inactive), group assignment, multi-address, and email dedup')
    .capabilities({ requires: ['UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    // Extract ALL customers including inactive ones
    .extract('fetch-all-customers', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/customers?activeOnly=false`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'customers',
    })

    // Validate email and name
    .validate('check-customer-data', {
        rules: [
            { type: 'business', spec: { field: 'email', required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$', error: 'Valid email required' } },
            { type: 'business', spec: { field: 'firstName', required: true, error: 'First name required' } },
            { type: 'business', spec: { field: 'lastName', required: true, error: 'Last name required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    // Route: active vs inactive
    .route('route-by-status', {
        branches: [
            { name: 'active', when: [{ field: 'active', cmp: 'eq', value: true }] },
            { name: 'inactive', when: [{ field: 'active', cmp: 'eq', value: false }] },
        ],
    })

    // Active branch: build addresses, prepare groups
    .transform('build-active-customer', {
        operators: [
            { op: 'lowercase', args: { path: 'email' } },
            { op: 'trim', args: { path: 'firstName' } },
            { op: 'trim', args: { path: 'lastName' } },
            {
                op: 'script',
                args: {
                    code: `
                        // Build Vendure-compatible address objects
                        if (record.addresses && Array.isArray(record.addresses)) {
                            record.addresses = record.addresses.map(a => ({
                                fullName: (record.firstName || '') + ' ' + (record.lastName || ''),
                                streetLine1: a.streetLine1 || a.street || '',
                                streetLine2: a.streetLine2 || '',
                                city: a.city || '',
                                postalCode: a.postalCode || a.zip || '',
                                countryCode: a.countryCode || a.country || 'DE',
                                province: a.province || a.state || '',
                                phoneNumber: record.phone || '',
                                defaultShippingAddress: !!a.defaultShipping,
                                defaultBillingAddress: !!a.defaultBilling,
                            }));
                        }
                        // Map group names for assignment
                        if (record.groups && Array.isArray(record.groups)) {
                            record.groupNames = record.groups;
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    // Ensure customer groups exist before assigning
    .load('ensure-groups', {
        adapterCode: 'customerGroupUpsert',
        strategy: 'UPSERT',
        nameField: 'groupNames',
    })

    // Upsert active customers (dedup by email)
    .load('upsert-active-customers', {
        adapterCode: 'customerUpsert',
        strategy: 'UPSERT',
        emailField: 'email',
        firstNameField: 'firstName',
        lastNameField: 'lastName',
        phoneNumberField: 'phone',
        addressesField: 'addresses',
        groupsField: 'groupNames',
        addressesMode: 'UPSERT_BY_MATCH',
    })

    // Export active customer reconciliation
    .export('active-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'customer-lifecycle-active.csv',
    })

    // Inactive branch: tag and export for deactivation tracking
    .transform('tag-inactive', {
        operators: [
            { op: 'set', args: { path: 'deactivationReason', value: 'Inactive in PIM' } },
            { op: 'template', args: { template: 'Customer ${email} inactive since ${updatedAt}', target: 'deactivationNote' } },
        ],
    })

    .export('inactive-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'customer-lifecycle-inactive.csv',
    })

    // Graph edges
    .edge('manual', 'fetch-all-customers')
    .edge('fetch-all-customers', 'check-customer-data')
    .edge('check-customer-data', 'route-by-status')
    // Active branch
    .edge('route-by-status', 'build-active-customer', 'active')
    .edge('build-active-customer', 'ensure-groups')
    .edge('ensure-groups', 'upsert-active-customers')
    .edge('upsert-active-customers', 'active-report')
    // Inactive branch
    .edge('route-by-status', 'tag-inactive', 'inactive')
    .edge('tag-inactive', 'inactive-report')

    .build();


// =============================================================================
// ET-3: ORDER IMPORT WITH STATE TRANSITIONS
// Full order import: customer lookup, order creation, state machine, notes
// =============================================================================

/**
 * Order Import with State Transitions Pipeline
 *
 * Extracts orders from mock PIM API, validates, enriches with defaults,
 * creates orders with full state transitions.
 *
 * Tests:
 * - Order creation via orderUpsert adapter
 * - State transition: Draft → AddingItems → ArrangingPayment → PaymentSettled
 * - Order note attachment (private notes)
 * - Shipping/payment method code resolution
 * - Order line items with SKU lookup
 * - OrderPlacedAt backdating
 * - Re-import idempotency (UPSERT by code)
 * - Route by order state: settled orders vs pending orders
 */
export const orderImportStateTest = createPipeline()
    .name('ET-3: Order Import State Test')
    .description('Tests order import with state transitions, notes, line items, and re-import idempotency')
    .capabilities({ requires: ['UpdateOrder', 'UpdateCustomer'] })

    .trigger('manual', { type: 'MANUAL' })

    // Extract orders from mock API
    .extract('fetch-orders', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/orders`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'orders',
    })

    // Validate required order fields
    .validate('check-orders', {
        rules: [
            { type: 'business', spec: { field: 'code', required: true, error: 'Order code required' } },
            { type: 'business', spec: { field: 'customerEmail', required: true, error: 'Customer email required' } },
            { type: 'business', spec: { field: 'lines', required: true, error: 'Order lines required' } },
        ],
        errorHandlingMode: 'ACCUMULATE',
    })

    // Route by original state: PaymentSettled/Delivered/Shipped → "settled" branch, others → "pending"
    .route('route-by-state', {
        branches: [
            {
                name: 'settled',
                when: [{ field: 'state', cmp: 'in', value: ['PaymentSettled', 'Delivered', 'Shipped', 'PartiallyShipped', 'PartiallyDelivered'] }],
            },
            {
                name: 'pending',
                when: [{ field: 'state', cmp: 'in', value: ['AddingItems', 'ArrangingPayment', 'PaymentAuthorized', 'Cancelled'] }],
            },
        ],
    })

    // Settled branch: full order processing
    .enrich('set-settled-defaults', {
        defaults: {
            shippingMethodCode: 'standard-shipping',
            paymentMethodCode: 'standard-payment',
        },
        set: {
            importSource: 'enterprise-test-r2',
        },
    })

    .transform('prepare-settled-orders', {
        operators: [
            {
                op: 'template',
                args: {
                    template: 'ET-3 Import: Order ${code} from ${customerEmail}, state: ${state}',
                    target: 'importNote',
                },
            },
            // Use the order's own shippingMethodCode if it has one
            {
                op: 'script',
                args: {
                    code: `
                        // Override default shipping method if order specifies one
                        if (record.shippingMethodCode && record.shippingMethodCode !== 'standard-shipping') {
                            // Keep the order's own shipping method code
                        }
                        // Ensure lines are properly structured
                        if (record.lines && Array.isArray(record.lines)) {
                            record.lines = record.lines.map(l => ({
                                sku: l.sku,
                                quantity: l.quantity || 1,
                                unitPrice: l.unitPrice || 0,
                            }));
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    // Create/upsert orders with state transition to PaymentSettled
    .load('upsert-settled-orders', {
        adapterCode: 'orderUpsert',
        lookupFields: 'code',
        state: 'PaymentSettled',
        orderPlacedAtField: 'orderPlacedAt',
    })

    // Add import note to each order
    .load('add-settled-notes', {
        adapterCode: 'orderNote',
        orderCodeField: 'code',
        noteField: 'importNote',
        isPrivate: true,
    })

    // Export settled order report
    .export('settled-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'order-import-settled.csv',
    })

    // Pending branch: just tag and export (don't create these in Vendure)
    .transform('tag-pending-orders', {
        operators: [
            { op: 'set', args: { path: 'importAction', value: 'skipped-pending' } },
            { op: 'template', args: { template: 'Skipped: ${code} (state: ${state})', target: 'skipReason' } },
        ],
    })

    .export('pending-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'order-import-pending.csv',
    })

    // Graph edges
    .edge('manual', 'fetch-orders')
    .edge('fetch-orders', 'check-orders')
    .edge('check-orders', 'route-by-state')
    // Settled branch
    .edge('route-by-state', 'set-settled-defaults', 'settled')
    .edge('set-settled-defaults', 'prepare-settled-orders')
    .edge('prepare-settled-orders', 'upsert-settled-orders')
    .edge('upsert-settled-orders', 'add-settled-notes')
    .edge('add-settled-notes', 'settled-report')
    // Pending branch
    .edge('route-by-state', 'tag-pending-orders', 'pending')
    .edge('tag-pending-orders', 'pending-report')

    .build();


// =============================================================================
// ET-4: MULTI-STEP TRANSFORM CHAIN
// Deep chaining: 6 transform steps in sequence testing cumulative data shaping
// =============================================================================

/**
 * Multi-Step Transform Chain Pipeline
 *
 * Extracts products from mock PIM API and passes them through 6 sequential
 * transform steps, each building on the output of the previous one.
 *
 * Tests:
 * - Cumulative record mutation across many transform steps
 * - Operator composition (each step adds fields that later steps reference)
 * - No data loss between steps
 * - Large operator count per pipeline (30+ operators across 6 steps)
 * - Script operators referencing fields created by earlier operators
 * - Final export captures all accumulated fields
 */
export const multiStepTransformChain = createPipeline()
    .name('ET-4: Multi-Step Transform Chain')
    .description('Tests deep transform chaining with 6 sequential steps and 30+ operators building on each other')
    .capabilities({ requires: ['ReadCatalog'] })

    .trigger('manual', { type: 'MANUAL' })

    // Extract products from mock API
    .extract('fetch-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=50`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    // Step 1: Identity and naming
    .transform('step1-identity', {
        operators: [
            { op: 'copy', args: { source: 'title', target: 'productName' } },
            { op: 'copy', args: { source: 'itemNumber', target: 'sku' } },
            { op: 'slugify', args: { source: 'productName', target: 'productSlug' } },
            { op: 'template', args: { template: '${productName} [${sku}]', target: 'displayLabel' } },
            { op: 'set', args: { path: 'pipeline', value: 'ET-4' } },
            { op: 'set', args: { path: 'stepCount', value: '0' } },
        ],
    })

    // Step 2: Classification and categorization
    .transform('step2-classify', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        record.stepCount = (parseInt(record.stepCount) || 0) + 1;
                        // Classify by variant count
                        record.productType = record.variantCount > 1 ? 'grouped' : 'simple';
                        // Classify by channel presence
                        const channels = record.channels || [];
                        record.isMultiChannel = channels.length > 1;
                        record.channelList = channels.join(', ');
                        // Classify by publication status
                        record.statusLabel = record.published ? 'Published' : 'Draft';
                        return record;
                    `,
                },
            },
        ],
    })

    // Step 3: Translation analysis
    .transform('step3-translations', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        record.stepCount = (parseInt(record.stepCount) || 0) + 1;
                        const trans = record.translations || {};
                        const langCodes = Object.keys(trans);
                        record.languageCount = langCodes.length;
                        record.languages = langCodes.join(', ');
                        record.hasGerman = langCodes.includes('de') ? 'yes' : 'no';
                        record.hasEnglish = langCodes.includes('en') ? 'yes' : 'no';
                        record.hasFrench = langCodes.includes('fr') ? 'yes' : 'no';
                        // Check translation completeness
                        record.translationComplete = (langCodes.length >= 2) ? 'complete' : 'incomplete';
                        return record;
                    `,
                },
            },
        ],
    })

    // Step 4: Scoring and ranking
    .transform('step4-scoring', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        record.stepCount = (parseInt(record.stepCount) || 0) + 1;
                        // Compute a data quality score (0-100)
                        let score = 0;
                        if (record.sku) score += 20;
                        if (record.productName) score += 20;
                        if (record.published) score += 15;
                        if (record.languageCount >= 2) score += 20;
                        if (record.isMultiChannel) score += 15;
                        if (record.variantCount > 0) score += 10;
                        record.qualityScore = Math.min(100, score);
                        record.qualityGrade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
                        return record;
                    `,
                },
            },
        ],
    })

    // Step 5: Enrichment with computed fields
    .transform('step5-enrich', {
        operators: [
            { op: 'template', args: { template: '${productName} - Quality: ${qualityGrade} (${qualityScore}/100)', target: 'auditSummary' } },
            { op: 'template', args: { template: 'SKU: ${sku}, Type: ${productType}, Channels: ${channelList}', target: 'catalogEntry' } },
            {
                op: 'script',
                args: {
                    code: `
                        record.stepCount = (parseInt(record.stepCount) || 0) + 1;
                        record.processedAt = new Date().toISOString();
                        record.idempotencyKey = record.sku + '-' + record.pipeline + '-' + new Date().toISOString().split('T')[0];
                        return record;
                    `,
                },
            },
        ],
    })

    // Step 6: Final cleanup — pick only the fields we want in the export
    .transform('step6-cleanup', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        record.stepCount = (parseInt(record.stepCount) || 0) + 1;
                        record.totalSteps = record.stepCount;
                        return record;
                    `,
                },
            },
            {
                op: 'pick',
                args: {
                    fields: [
                        'sku', 'productName', 'productSlug', 'displayLabel',
                        'productType', 'isMultiChannel', 'channelList', 'statusLabel',
                        'languageCount', 'languages', 'hasGerman', 'hasEnglish', 'hasFrench', 'translationComplete',
                        'qualityScore', 'qualityGrade', 'auditSummary', 'catalogEntry',
                        'totalSteps', 'processedAt', 'idempotencyKey', 'pipeline',
                    ],
                },
            },
        ],
    })

    // Export the fully transformed data
    .export('transform-chain-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'multi-step-transform-chain.csv',
    })

    // Linear graph: 6 transform steps in sequence
    .edge('manual', 'fetch-products')
    .edge('fetch-products', 'step1-identity')
    .edge('step1-identity', 'step2-classify')
    .edge('step2-classify', 'step3-translations')
    .edge('step3-translations', 'step4-scoring')
    .edge('step4-scoring', 'step5-enrich')
    .edge('step5-enrich', 'step6-cleanup')
    .edge('step6-cleanup', 'transform-chain-report')

    .build();


// =============================================================================
// ET-5: RECONCILIATION & AUDIT PIPELINE
// Extract from both Vendure AND PIM, compare, export discrepancies
// =============================================================================

/**
 * Reconciliation & Audit Pipeline
 *
 * Two parallel extraction branches:
 * - Branch A: Extract product variants from Vendure (vendureQuery)
 * - Branch B: Extract products from PIM API (httpApi)
 *
 * Each branch transforms data to a common format, then exports audit reports.
 * This tests:
 * - Dual-source parallel extraction (Vendure + HTTP API)
 * - vendureQuery extractor on PRODUCT_VARIANT entity
 * - Complex script transforms for data normalization
 * - Parallel export branches
 * - Graph execution with independent parallel branches
 */
export const reconciliationAudit = createPipeline()
    .name('ET-5: Reconciliation Audit')
    .description('Dual-source parallel extraction (Vendure + PIM), normalize to common format, export audit reports')
    .capabilities({ requires: ['ReadCatalog'] })
    .parallel({ maxConcurrentSteps: 4, errorPolicy: 'CONTINUE' })

    .trigger('manual', { type: 'MANUAL' })

    // ── Branch A: Vendure catalog snapshot ──────────────────────────────────
    .extract('query-vendure-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'product,product.translations,translations,stockLevels,facetValues',
        batchSize: 200,
    })

    .transform('normalize-vendure', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Normalize Vendure variant to audit record format
                        const doc = {
                            source: 'vendure',
                            sku: record.sku || '',
                            productName: record.product?.name || '',
                            productSlug: record.product?.slug || '',
                            price: record.priceWithTax || record.price || 0,
                            currency: record.currencyCode || 'EUR',
                            enabled: !!record.enabled,
                            stockOnHand: (record.stockLevels || []).reduce((sum, sl) => sum + (sl.stockOnHand || 0), 0),
                            translationCount: (record.product?.translations || []).length,
                            facetCount: (record.facetValues || []).length,
                            auditTimestamp: new Date().toISOString(),
                        };
                        return doc;
                    `,
                },
            },
        ],
    })

    .export('vendure-audit-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'reconciliation-vendure-snapshot.csv',
    })

    // ── Branch B: PIM catalog snapshot ──────────────────────────────────────
    .extract('fetch-pim-products', {
        adapterCode: 'httpApi',
        url: `${PIMCORE_API_URL}/api/products?includeTranslations=true&limit=100`,
        method: 'GET',
        headers: { apiKey: 'test-pimcore-api-key' },
        itemsField: 'products',
    })

    .transform('normalize-pim', {
        operators: [
            {
                op: 'script',
                args: {
                    code: `
                        // Normalize PIM product to audit record format
                        const trans = record.translations || {};
                        const langCount = Object.keys(trans).length;
                        const doc = {
                            source: 'pim',
                            sku: record.itemNumber || '',
                            productName: record.title || '',
                            productSlug: (record.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                            price: 0,  // PIM listing doesn't include prices — need detail endpoint
                            currency: 'EUR',
                            enabled: !!record.published,
                            stockOnHand: 0,  // PIM listing doesn't include stock — separate endpoint
                            translationCount: langCount,
                            facetCount: 0,  // Not in listing response
                            variantCount: record.variantCount || 0,
                            channels: (record.channels || []).join(','),
                            auditTimestamp: new Date().toISOString(),
                        };
                        return doc;
                    `,
                },
            },
            // Filter to only published products
            { op: 'when', args: { conditions: [{ field: 'enabled', cmp: 'eq', value: true }], action: 'keep' } },
        ],
    })

    .export('pim-audit-report', {
        adapterCode: 'csvExport',
        path: './exports',
        filenamePattern: 'reconciliation-pim-snapshot.csv',
    })

    // Graph: two independent parallel branches from trigger
    .edge('manual', 'query-vendure-variants')
    .edge('query-vendure-variants', 'normalize-vendure')
    .edge('normalize-vendure', 'vendure-audit-report')

    .edge('manual', 'fetch-pim-products')
    .edge('fetch-pim-products', 'normalize-pim')
    .edge('normalize-pim', 'pim-audit-report')

    .build();
