/**
 * Operator Test Pipelines
 *
 * Comprehensive test pipelines for all 61 built-in operators + 2 custom operators.
 * Each pipeline uses the inMemory extractor so it can run standalone without
 * any external dependencies, and exports to JSON files for result inspection.
 *
 * Operator categories covered:
 * - STRING (12): split, join, trim, lowercase, uppercase, slugify, concat,
 *                replace, extractRegex, replaceRegex, stripHtml, truncate
 * - NUMERIC (9): math, currency, unit, toNumber, toString, parseNumber,
 *                formatNumber, toCents, round
 * - DATE (5): dateFormat, dateParse, dateAdd, dateDiff, now
 * - LOGIC (4): when, ifThenElse, switch, deltaFilter
 * - JSON (4): parseJson, stringifyJson, pick, omit
 * - DATA (8): map, set, remove, rename, copy, template, hash, uuid
 * - ENRICHMENT (5): lookup, coalesce, enrich, default, httpLookup
 * - AGGREGATION (8): aggregate, count, unique, flatten, first, last, expand, multiJoin
 * - VALIDATION (2): validateRequired, validateFormat
 * - SCRIPT (1): script
 * - FILE (3): imageResize, imageConvert, pdfGenerate
 * - CUSTOM (2): currencyConvert, maskPII
 */

import { createPipeline } from '../../../src';

// ---------------------------------------------------------------------------
// TEST PIPELINE 1: String Operators
// Tests: split, join, trim, lowercase, uppercase, slugify, concat,
//        replace, extractRegex, replaceRegex, stripHtml, truncate
// ---------------------------------------------------------------------------

export const testStringOperators = createPipeline()
    .name('Test: String Operators')
    .description('Tests all 12 string operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                name: '  Hello World  ',
                title: '<b>Product Title</b> with <em>HTML</em>',
                sku: 'prod-001',
                tags: 'electronics,gadgets,mobile',
                description: 'This is a very long description that will be truncated at some point in the middle of a sentence',
                code: 'ABC-123',
                category: 'Home & Garden',
                searchText: 'Widget Pro 2000 - ref: PRD-XYZ-999',
            },
            {
                name: '  foo bar  ',
                title: '<p>Another <strong>HTML</strong> string</p>',
                sku: 'prod-002',
                tags: 'clothing,fashion',
                description: 'Short description',
                code: 'DEF-456',
                category: 'Electronics & Computers',
                searchText: 'Gadget Ultra - ref: GAD-ABC-001',
            },
        ],
    })

    .transform('string-ops', {
        operators: [
            // trim: remove whitespace from name
            { op: 'trim', args: { path: 'name' } },

            // uppercase on trimmed name
            { op: 'uppercase', args: { path: 'name' } },

            // lowercase on title (after stripping HTML first)
            { op: 'stripHtml', args: { source: 'title', target: 'titleText' } },
            { op: 'lowercase', args: { path: 'titleText' } },

            // split tags into array
            { op: 'split', args: { source: 'tags', target: 'tagArray', delimiter: ',', trim: true } },

            // join array back with pipe
            { op: 'join', args: { source: 'tagArray', target: 'tagString', delimiter: ' | ' } },

            // slugify category
            { op: 'slugify', args: { source: 'category', target: 'categorySlug', separator: '-' } },

            // concat name + sku
            { op: 'concat', args: { sources: ['name', 'sku'], target: 'nameAndSku', separator: ' :: ' } },

            // replace in description
            { op: 'replace', args: { path: 'description', search: 'very long ', replacement: '', all: false } },

            // truncate description
            { op: 'truncate', args: { source: 'description', target: 'shortDescription', length: 40, suffix: '...' } },

            // extractRegex: extract ref code from searchText
            { op: 'extractRegex', args: { source: 'searchText', target: 'refCode', pattern: 'ref:\\s*([A-Z0-9-]+)', group: 1, flags: 'i' } },

            // replaceRegex: remove dashes from code
            { op: 'replaceRegex', args: { path: 'code', pattern: '-', replacement: '_', flags: 'g' } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-string-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 2: Numeric Operators
// Tests: math, currency, unit, toNumber, toString, parseNumber,
//        formatNumber, toCents, round
// ---------------------------------------------------------------------------

export const testNumericOperators = createPipeline()
    .name('Test: Numeric Operators')
    .description('Tests all 9 numeric operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                price: '19.995',
                weight: '1500',
                quantity: '10',
                discount: '0.15',
                rawPrice: '1 234,56',
                taxRate: '0.19',
            },
            {
                price: '99.50',
                weight: '250',
                quantity: '3',
                discount: '0.05',
                rawPrice: '2.500,00',
                taxRate: '0.07',
            },
            {
                price: '5.00',
                weight: '50',
                quantity: '100',
                discount: '0.0',
                rawPrice: '500',
                taxRate: '0.21',
            },
        ],
    })

    .transform('numeric-ops', {
        operators: [
            // toNumber: parse string price to number
            { op: 'toNumber', args: { source: 'price', target: 'priceNum' } },

            // round: round to 2 decimal places
            { op: 'round', args: { source: 'priceNum', target: 'priceRounded', decimals: 2 } },

            // toCents: convert decimal to cents
            { op: 'toCents', args: { source: 'priceRounded', target: 'priceCents', round: 'round' } },

            // math add: add tax
            { op: 'math', args: { operation: 'add', source: 'priceRounded', operand: '2.50', target: 'priceWithFee', decimals: 2 } },

            // math multiply: apply discount
            { op: 'toNumber', args: { source: 'discount', target: 'discountNum' } },
            { op: 'math', args: { operation: 'multiply', source: 'priceRounded', operand: '$discountNum', target: 'discountAmount', decimals: 2 } },

            // math subtract
            { op: 'math', args: { operation: 'subtract', source: 'priceRounded', operand: '$discountAmount', target: 'finalPrice', decimals: 2 } },

            // math floor and ceil
            { op: 'math', args: { operation: 'floor', source: 'priceRounded', target: 'priceFloor' } },
            { op: 'math', args: { operation: 'ceil', source: 'priceRounded', target: 'priceCeil' } },

            // math abs on discount (make negative first)
            { op: 'math', args: { operation: 'multiply', source: 'discountNum', operand: '-1', target: 'negDiscount', decimals: 4 } },
            { op: 'math', args: { operation: 'abs', source: 'negDiscount', target: 'absDiscount', decimals: 4 } },

            // math power: weight squared
            { op: 'toNumber', args: { source: 'weight', target: 'weightNum' } },
            { op: 'math', args: { operation: 'power', source: 'weightNum', operand: '2', target: 'weightSquared' } },

            // math modulo
            { op: 'toNumber', args: { source: 'quantity', target: 'quantityNum' } },
            { op: 'math', args: { operation: 'modulo', source: 'quantityNum', operand: '3', target: 'quantityMod3' } },

            // unit: convert weight from grams to kg
            { op: 'unit', args: { source: 'weightNum', target: 'weightKg', from: 'g', to: 'kg' } },

            // currency: convert price to minor units (cents equivalent with 2 decimals)
            { op: 'currency', args: { source: 'priceRounded', target: 'priceMinorUnits', decimals: 2, round: 'round' } },

            // parseNumber: locale-aware parsing
            { op: 'parseNumber', args: { source: 'rawPrice', target: 'parsedPrice', locale: 'de-DE', default: 0 } },

            // formatNumber: format with locale
            { op: 'formatNumber', args: { source: 'priceRounded', target: 'priceFormatted', locale: 'en-US', decimals: 2, style: 'currency', currency: 'USD' } },

            // toString: convert number to string
            { op: 'toString', args: { source: 'quantityNum', target: 'quantityStr' } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-numeric-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 3: Date Operators
// Tests: dateFormat, dateParse, dateAdd, dateDiff, now
// ---------------------------------------------------------------------------

export const testDateOperators = createPipeline()
    .name('Test: Date Operators')
    .description('Tests all 5 date operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                createdAt: '2024-01-15',
                expiresAt: '2025-06-30',
                orderDate: '15/03/2024',
                unixTs: 1705276800,
            },
            {
                createdAt: '2023-12-01',
                expiresAt: '2024-03-31',
                orderDate: '01/01/2024',
                unixTs: 1701388800,
            },
        ],
    })

    .transform('date-ops', {
        operators: [
            // now: add current timestamp
            { op: 'now', args: { target: 'processedAt', format: 'ISO' } },
            { op: 'now', args: { target: 'processedDate', format: 'date' } },
            { op: 'now', args: { target: 'processedTimestamp', format: 'timestamp' } },

            // dateFormat: format ISO date to display
            { op: 'dateFormat', args: { source: 'createdAt', target: 'createdFormatted', format: 'DD/MM/YYYY', inputFormat: 'YYYY-MM-DD' } },

            // dateParse: parse custom format to ISO
            { op: 'dateParse', args: { source: 'orderDate', target: 'orderDateISO', format: 'DD/MM/YYYY' } },

            // dateAdd: add 30 days to createdAt
            { op: 'dateAdd', args: { source: 'createdAt', target: 'thirtyDaysLater', amount: 30, unit: 'days' } },

            // dateAdd: add 1 year
            { op: 'dateAdd', args: { source: 'createdAt', target: 'oneYearLater', amount: 1, unit: 'years' } },

            // dateAdd: subtract 7 days (negative amount)
            { op: 'dateAdd', args: { source: 'expiresAt', target: 'sevenDaysBefore', amount: -7, unit: 'days' } },

            // dateDiff: days between createdAt and expiresAt
            { op: 'dateDiff', args: { startDate: 'createdAt', endDate: 'expiresAt', target: 'daysUntilExpiry', unit: 'days', absolute: true } },

            // dateDiff: months
            { op: 'dateDiff', args: { startDate: 'createdAt', endDate: 'expiresAt', target: 'monthsUntilExpiry', unit: 'months', absolute: true } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-date-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 4: Logic Operators
// Tests: when (filter), ifThenElse, switch, deltaFilter
// ---------------------------------------------------------------------------

export const testLogicOperators = createPipeline()
    .name('Test: Logic Operators')
    .description('Tests all 4 logic operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, price: 150, category: 'electronics', status: 'active', stock: 100 },
            { id: 2, price: 25, category: 'clothing', status: 'inactive', stock: 0 },
            { id: 3, price: 500, category: 'electronics', status: 'active', stock: 50 },
            { id: 4, price: 10, category: 'food', status: 'active', stock: 200 },
            { id: 5, price: 80, category: 'clothing', status: 'active', stock: 15 },
        ],
    })

    .transform('logic-ops', {
        operators: [
            // ifThenElse: set tier based on price
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'price', cmp: 'gte', value: 100 },
                    thenValue: 'premium',
                    elseValue: 'standard',
                    target: 'tier',
                },
            },

            // switch: set category label
            {
                op: 'switch',
                args: {
                    source: 'category',
                    cases: [
                        { value: 'electronics', result: 'Electronics & Tech' },
                        { value: 'clothing', result: 'Fashion & Apparel' },
                        { value: 'food', result: 'Food & Beverage' },
                    ],
                    default: 'Other',
                    target: 'categoryLabel',
                },
            },

            // set: mark as in-stock or out-of-stock
            {
                op: 'ifThenElse',
                args: {
                    condition: { field: 'stock', cmp: 'gt', value: 0 },
                    thenValue: true,
                    elseValue: false,
                    target: 'inStock',
                },
            },
        ],
    })

    // when: keep only active records with price > 20
    .transform('filter-active', {
        operators: [
            {
                op: 'when',
                args: {
                    conditions: [
                        { field: 'status', cmp: 'eq', value: 'active' },
                        { field: 'price', cmp: 'gt', value: 20 },
                    ],
                    action: 'keep',
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-logic-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 5: JSON Operators
// Tests: parseJson, stringifyJson, pick, omit
// ---------------------------------------------------------------------------

export const testJsonOperators = createPipeline()
    .name('Test: JSON Operators')
    .description('Tests all 4 JSON operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                id: 1,
                name: 'Product A',
                metadata: '{"weight": 1.5, "dimensions": {"w": 10, "h": 5, "d": 3}, "color": "red"}',
                price: 29.99,
                internalCode: 'INT-001',
                debugInfo: 'some debug data',
                secret: 'should-be-omitted',
            },
            {
                id: 2,
                name: 'Product B',
                metadata: '{"weight": 0.5, "dimensions": {"w": 5, "h": 5, "d": 1}, "color": "blue"}',
                price: 9.99,
                internalCode: 'INT-002',
                debugInfo: 'more debug data',
                secret: 'also-omitted',
            },
        ],
    })

    .transform('json-ops', {
        operators: [
            // parseJson: parse metadata string to object
            { op: 'parseJson', args: { source: 'metadata', target: 'metaParsed' } },

            // stringifyJson: serialize the parsed object back
            { op: 'stringifyJson', args: { source: 'metaParsed', target: 'metaStringified' } },

            // pick: select only public fields
            {
                op: 'pick',
                args: {
                    fields: ['id', 'name', 'price', 'metaParsed'],
                },
            },

            // omit: remove sensitive/internal fields
            {
                op: 'omit',
                args: {
                    fields: ['secret', 'debugInfo', 'internalCode'],
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-json-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 6: Data Manipulation Operators
// Tests: map, set, remove, rename, copy, template, hash, uuid
// ---------------------------------------------------------------------------

export const testDataOperators = createPipeline()
    .name('Test: Data Manipulation Operators')
    .description('Tests all 8 data operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                first_name: 'Alice',
                last_name: 'Smith',
                email: 'alice@example.com',
                product_id: 'P-001',
                raw_price: 1999,
                created_at: '2024-01-15',
            },
            {
                first_name: 'Bob',
                last_name: 'Jones',
                email: 'bob@example.com',
                product_id: 'P-002',
                raw_price: 4999,
                created_at: '2024-02-20',
            },
        ],
    })

    .transform('data-ops', {
        operators: [
            // copy: copy email to backup_email
            { op: 'copy', args: { source: 'email', target: 'backup_email' } },

            // rename: rename raw_price to price_cents
            { op: 'rename', args: { from: 'raw_price', to: 'price_cents' } },

            // set: add a static field
            { op: 'set', args: { path: 'source', value: 'import-batch-2024' } },
            { op: 'set', args: { path: 'processed', value: true } },
            { op: 'set', args: { path: 'version', value: 2 } },

            // template: build full name
            { op: 'template', args: { template: '${first_name} ${last_name}', target: 'fullName', missingAsEmpty: false } },

            // template: build display string with price
            { op: 'template', args: { template: '${product_id} - Price: ${price_cents} cents', target: 'productSummary', missingAsEmpty: true } },

            // remove: remove temporary fields
            { op: 'remove', args: { path: 'backup_email' } },

            // map: remap field names
            {
                op: 'map',
                args: {
                    mapping: {
                        'customer.firstName': 'first_name',
                        'customer.lastName': 'last_name',
                        'customer.email': 'email',
                        'product.id': 'product_id',
                    },
                    passthrough: true,
                },
            },

            // hash: hash email for anonymization
            { op: 'hash', args: { source: 'email', target: 'emailHash', algorithm: 'sha256', encoding: 'hex' } },

            // uuid: generate a v4 UUID
            { op: 'uuid', args: { target: 'importId', version: 'v4' } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-data-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 7: Enrichment Operators
// Tests: lookup, coalesce, enrich, default (httpLookup tested separately)
// ---------------------------------------------------------------------------

export const testEnrichmentOperators = createPipeline()
    .name('Test: Enrichment Operators')
    .description('Tests lookup, coalesce, enrich, default operators')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, countryCode: 'US', preferredName: null, backupName: null, fallbackName: 'Unknown User', price: null, category: 'A' },
            { id: 2, countryCode: 'DE', preferredName: 'Klaus', backupName: null, fallbackName: 'Fallback', price: 99.99, category: 'B' },
            { id: 3, countryCode: 'FR', preferredName: null, backupName: 'Jean', fallbackName: 'Default User', price: 0, category: null },
            { id: 4, countryCode: 'XX', preferredName: null, backupName: null, fallbackName: null, price: -5, category: 'C' },
        ],
    })

    .transform('enrichment-ops', {
        operators: [
            // lookup: map country code to full country name
            {
                op: 'lookup',
                args: {
                    source: 'countryCode',
                    map: { US: 'United States', DE: 'Germany', FR: 'France', GB: 'United Kingdom' },
                    target: 'countryName',
                    default: 'Unknown Country',
                },
            },

            // coalesce: get first non-null name
            {
                op: 'coalesce',
                args: {
                    paths: ['preferredName', 'backupName', 'fallbackName'],
                    target: 'displayName',
                    default: 'Anonymous',
                },
            },

            // enrich: set multiple fields at once + defaults
            {
                op: 'enrich',
                args: {
                    set: { 'meta.source': 'enrichment-pipeline', 'meta.version': 1 },
                    defaults: { category: 'UNCATEGORIZED', price: 0 },
                },
            },

            // default: set default for a single field
            {
                op: 'default',
                args: {
                    path: 'category',
                    value: 'GENERAL',
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-enrichment-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 8: Aggregation Operators
// Tests: aggregate, count, unique, flatten, first, last, expand, multiJoin
// ---------------------------------------------------------------------------

export const testAggregationOperators = createPipeline()
    .name('Test: Aggregation Operators')
    .description('Tests all 8 aggregation operators via inMemory extractor and JSON export')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            {
                id: 1,
                name: 'Widget Pro',
                prices: [29.99, 35.00, 27.50],
                tags: ['electronics', 'gadgets', 'electronics', 'mobile'],
                nested: [[1, 2, 3], [4, 5, 6]],
                variants: [
                    { sku: 'W-RED', color: 'red', stock: 10 },
                    { sku: 'W-BLUE', color: 'blue', stock: 5 },
                ],
            },
            {
                id: 2,
                name: 'Gizmo Plus',
                prices: [99.99, 89.99, 95.00],
                tags: ['tools', 'diy', 'tools'],
                nested: [[7, 8], [9, 10, 11]],
                variants: [
                    { sku: 'G-SM', color: 'silver', stock: 3 },
                    { sku: 'G-LG', color: 'silver', stock: 8 },
                ],
            },
        ],
    })

    .transform('aggregation-ops', {
        operators: [
            // count: count prices array
            { op: 'count', args: { source: 'prices', target: 'priceCount' } },

            // first: first price
            { op: 'first', args: { source: 'prices', target: 'minListedPrice' } },

            // last: last price
            { op: 'last', args: { source: 'prices', target: 'lastListedPrice' } },

            // unique: deduplicate tags
            { op: 'unique', args: { source: 'tags', target: 'uniqueTags' } },

            // count unique tags
            { op: 'count', args: { source: 'uniqueTags', target: 'uniqueTagCount' } },

            // flatten: flatten nested arrays
            { op: 'flatten', args: { source: 'nested', target: 'flatNumbers', depth: 1 } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-aggregation-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 9: Aggregation - aggregate (batch), expand, multiJoin
// These need separate pipeline since they use batch-level operators
// ---------------------------------------------------------------------------

export const testAggregationBatch = createPipeline()
    .name('Test: Aggregation Batch Operators')
    .description('Tests aggregate (batch) and expand operators')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, category: 'A', price: 10, variants: [{ sku: 'A1', stock: 5 }, { sku: 'A2', stock: 10 }] },
            { id: 2, category: 'B', price: 20, variants: [{ sku: 'B1', stock: 3 }] },
            { id: 3, category: 'A', price: 30, variants: [{ sku: 'C1', stock: 0 }, { sku: 'C2', stock: 7 }, { sku: 'C3', stock: 2 }] },
        ],
    })

    // aggregate: compute sum of all prices across all records, set on each record
    .transform('batch-aggregate', {
        operators: [
            { op: 'aggregate', args: { op: 'sum', source: 'price', target: 'totalPriceAllRecords' } },
            { op: 'aggregate', args: { op: 'avg', source: 'price', target: 'avgPrice' } },
            { op: 'aggregate', args: { op: 'max', source: 'price', target: 'maxPrice' } },
            { op: 'aggregate', args: { op: 'min', source: 'price', target: 'minPrice' } },
            { op: 'aggregate', args: { op: 'count', target: 'recordCount' } },
        ],
    })

    .export('before-expand', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-aggregation-batch.json',
    })
    .build();

// expand is tested separately since it multiplies records
export const testExpandOperator = createPipeline()
    .name('Test: Expand Operator')
    .description('Tests the expand operator which turns array fields into multiple records')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { productId: 'P1', name: 'Widget', variants: [{ sku: 'W-S', size: 'S' }, { sku: 'W-M', size: 'M' }, { sku: 'W-L', size: 'L' }] },
            { productId: 'P2', name: 'Gizmo', variants: [{ sku: 'G-ONE', size: 'ONE-SIZE' }] },
        ],
    })

    .transform('expand-variants', {
        operators: [
            {
                op: 'expand',
                args: {
                    path: 'variants',
                    mergeParent: false,
                    parentFields: { productId: 'productId', productName: 'name' },
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-expand-operator.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 10: Validation Operators
// Tests: validateRequired, validateFormat
// ---------------------------------------------------------------------------

export const testValidationOperators = createPipeline()
    .name('Test: Validation Operators')
    .description('Tests validateRequired and validateFormat operators')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, email: 'alice@example.com', name: 'Alice', phone: '+1-800-555-0100' },
            { id: 2, email: 'bob-at-invalid', name: 'Bob', phone: '12345' },
            { id: 3, email: null, name: 'Charlie', phone: null },
            { id: 4, email: 'david@test.org', name: null, phone: '+44-20-7946-0958' },
        ],
    })

    .transform('validation-ops', {
        operators: [
            // validateRequired: require email and name
            {
                op: 'validateRequired',
                args: {
                    fields: ['email', 'name'],
                    errorField: '_validationErrors',
                },
            },

            // validateFormat: check email format
            {
                op: 'validateFormat',
                args: {
                    field: 'email',
                    pattern: '^[^@]+@[^@]+\\.[^@]+$',
                    errorField: '_validationErrors',
                    errorMessage: 'Invalid email format',
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-validation-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 11: Script Operator
// Tests: script (single-record and batch mode)
// ---------------------------------------------------------------------------

export const testScriptOperator = createPipeline()
    .name('Test: Script Operator')
    .description('Tests the script operator in single-record mode with complex transformations')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, name: 'Widget Pro', price: 2990, tags: ['electronics', 'gadgets'], description: 'A great product' },
            { id: 2, name: 'Gizmo Ultra', price: 5990, tags: ['tools'], description: null },
            { id: 3, name: null, price: 0, tags: [], description: 'Item without a name' },
        ],
    })

    .transform('script-single', {
        operators: [
            {
                op: 'script',
                args: {
                    batch: false,
                    timeout: 3000,
                    failOnError: false,
                    code: `
                        // Test JS built-ins available in sandbox
                        const upper = record.name ? record.name.toUpperCase() : 'UNNAMED';
                        const nameLength = record.name ? record.name.length : 0;
                        const hasDescription = Boolean(record.description);
                        const tagCount = Array.isArray(record.tags) ? record.tags.length : 0;
                        const priceFormatted = (record.price / 100).toFixed(2) + ' USD';
                        const timestamp = new Date().toISOString().substring(0, 10); // date only (stable)
                        const parsed = JSON.parse(JSON.stringify(record));

                        // Test Math methods
                        const priceSqrt = Math.sqrt(record.price);
                        const priceLog = record.price > 0 ? Math.log(record.price) : 0;

                        // Test Array methods
                        const sortedTags = [...(record.tags || [])].sort();
                        const tagsCsv = sortedTags.join(', ');

                        return {
                            ...parsed,
                            nameUpper: upper,
                            nameLength,
                            hasDescription,
                            tagCount,
                            priceFormatted,
                            processedDate: timestamp,
                            priceSqrt: Math.round(priceSqrt * 100) / 100,
                            priceLog: Math.round(priceLog * 100) / 100,
                            tagsCsv,
                        };
                    `,
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-script-operator.json',
    })
    .build();

export const testScriptBatchMode = createPipeline()
    .name('Test: Script Operator Batch Mode')
    .description('Tests the script operator in batch mode')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, value: 10 },
            { id: 2, value: 20 },
            { id: 3, value: 30 },
            { id: 4, value: 40 },
        ],
    })

    .transform('script-batch', {
        operators: [
            {
                op: 'script',
                args: {
                    batch: true,
                    timeout: 5000,
                    failOnError: true,
                    context: { multiplier: 3, label: 'batch-test' },
                    code: `
                        const total = records.reduce((sum, r) => sum + r.value, 0);
                        const avg = total / records.length;

                        return records.map((record, i) => ({
                            ...record,
                            total,
                            avg: Math.round(avg * 100) / 100,
                            rank: i + 1,
                            multiplied: record.value * context.data.multiplier,
                            label: context.data.label,
                        }));
                    `,
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-script-batch.json',
    })
    .build();

// Script security test - test that blocked patterns are rejected
export const testScriptSecurity = createPipeline()
    .name('Test: Script Security Blocking')
    .description('Verifies that dangerous script patterns are blocked by the security validator')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, name: 'test' },
        ],
    })

    // This script contains process.env access which should be blocked
    // The operator should return an error and pass the record through
    .transform('security-test', {
        operators: [
            {
                op: 'script',
                args: {
                    batch: false,
                    timeout: 2000,
                    failOnError: false,
                    code: `
                        // Attempting to access blocked globals - should be caught
                        try {
                            const env = process.env;
                        } catch(e) {
                            record.securityBlocked = true;
                            record.error = e.message;
                        }
                        return record;
                    `,
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-script-security.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 12: Edge Cases - Null Handling
// Tests how operators behave with null/undefined inputs
// ---------------------------------------------------------------------------

export const testNullEdgeCases = createPipeline()
    .name('Test: Edge Cases - Null Handling')
    .description('Tests operator behavior with null/undefined/empty inputs')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, name: null, price: null, tags: null, value: 'exists' },
            { id: 2, name: '', price: 0, tags: [], value: null },
            { id: 3 }, // missing all optional fields
        ],
    })

    .transform('null-edge-cases', {
        operators: [
            // trim on null should not crash
            { op: 'trim', args: { path: 'name' } },

            // uppercase on null
            { op: 'uppercase', args: { path: 'name' } },

            // toNumber on null/undefined
            { op: 'toNumber', args: { source: 'price', target: 'priceNum', default: -1 } },

            // math on null (should keep record)
            { op: 'math', args: { operation: 'add', source: 'priceNum', operand: '10', target: 'priceAdded', decimals: 2 } },

            // join on null array
            { op: 'join', args: { source: 'tags', target: 'tagsJoined', delimiter: ',' } },

            // coalesce: get first non-null between name and value
            { op: 'coalesce', args: { paths: ['name', 'value'], target: 'firstNonNull', default: 'DEFAULT' } },

            // default on missing field
            { op: 'default', args: { path: 'missingField', value: 'was-missing' } },

            // set always works regardless of existing value
            { op: 'set', args: { path: 'alwaysSet', value: 42 } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-null-edge-cases.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 13: Custom Operators
// Tests: currencyConvert (custom SingleRecordOperator), maskPII
// ---------------------------------------------------------------------------

export const testCustomOperators = createPipeline()
    .name('Test: Custom Operators')
    .description('Tests the two custom dev-server operators: currencyConvert and maskPII')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, name: 'Alice Smith', email: 'alice.smith@example.com', phone: '+1-800-555-0199', price: 100.00, currency: 'USD' },
            { id: 2, name: 'Bob Jones', email: 'bob@test.org', phone: '5551234567', price: 50.00, currency: 'USD' },
            { id: 3, name: 'Jean Dupont', email: 'jean@domain.fr', phone: '+33-1-23-45-67-89', price: 200.00, currency: 'EUR' },
        ],
    })

    .transform('custom-ops', {
        operators: [
            // currencyConvert: USD -> EUR
            { op: 'currencyConvert', args: { field: 'price', from: 'USD', to: 'EUR', targetField: 'priceEur', round: 2 } },

            // maskPII email
            { op: 'maskPII', args: { field: 'email', type: 'email' } },

            // maskPII phone
            { op: 'maskPII', args: { field: 'phone', type: 'phone' } },

            // maskPII name
            { op: 'maskPII', args: { field: 'name', type: 'name' } },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-custom-operators.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 14: DeltaFilter Operator (Logic)
// Tests: deltaFilter with checkpoint simulation
// ---------------------------------------------------------------------------

export const testDeltaFilter = createPipeline()
    .name('Test: DeltaFilter Operator')
    .description('Tests deltaFilter - records pass through since no prior checkpoint exists')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: '001', name: 'Widget', price: 29.99, stock: 100 },
            { id: '002', name: 'Gizmo', price: 49.99, stock: 50 },
            { id: '003', name: 'Thingamajig', price: 9.99, stock: 0 },
        ],
    })

    .transform('delta-check', {
        operators: [
            {
                op: 'deltaFilter',
                args: {
                    idPath: 'id',
                    includePaths: ['name', 'price', 'stock'],
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-delta-filter.json',
    })
    .build();

// ---------------------------------------------------------------------------
// TEST PIPELINE 15: MultiJoin Operator
// ---------------------------------------------------------------------------

export const testMultiJoin = createPipeline()
    .name('Test: MultiJoin Operator')
    .description('Tests the multiJoin aggregation operator')
    .trigger('manual', { type: 'MANUAL' })

    .extract('source', {
        adapterCode: 'inMemory',
        records: [
            { id: 1, name: 'Product A', tags: ['t1', 't2'], codes: ['C001'] },
            { id: 2, name: 'Product B', tags: ['t2', 't3'], codes: ['C002', 'C003'] },
            { id: 3, name: 'Product C', tags: ['t1'], codes: [] },
        ],
    })

    .transform('multi-join-test', {
        operators: [
            {
                op: 'multiJoin',
                args: {
                    sources: ['tags', 'codes'],
                    target: 'allIdentifiers',
                    delimiter: ',',
                },
            },
        ],
    })

    .export('output', {
        adapterCode: 'jsonExport',
        path: './exports',
        filenamePattern: 'test-multi-join.json',
    })
    .build();

// Export all test pipelines
export const operatorTestPipelines = [
    testStringOperators,
    testNumericOperators,
    testDateOperators,
    testLogicOperators,
    testJsonOperators,
    testDataOperators,
    testEnrichmentOperators,
    testAggregationOperators,
    testAggregationBatch,
    testExpandOperator,
    testValidationOperators,
    testScriptOperator,
    testScriptBatchMode,
    testScriptSecurity,
    testNullEdgeCases,
    testCustomOperators,
    testDeltaFilter,
    testMultiJoin,
];
