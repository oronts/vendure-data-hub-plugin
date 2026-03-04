/**
 * Hook Examples Pipelines - Demonstrates all hook capabilities
 *
 * These pipelines demonstrate:
 * - P-HOOK-1: Record modification via INTERCEPTOR hooks at every stage
 * - P-HOOK-2: SCRIPT hooks with DI closure access (registered in vendure-config.dev.ts)
 * - P-HOOK-3: Search enrichment — BEFORE_SINK hooks to add computed fields before indexing
 * - P-HOOK-4: Multi-hook pipeline — chaining BEFORE/AFTER hooks across TRANSFORM → LOAD → EXPORT
 */

import { createPipeline } from '../../../src';
import { ScriptFunction } from '../../../shared/types/hook.types';

// =============================================================================
// HOOK SCRIPTS — registered via DataHubPlugin.init({ scripts: { ... } })
// =============================================================================

/**
 * Normalize prices: convert decimal euros to integer cents.
 * Demonstrates: simple record transformation in a named script.
 */
export const normalizePricesScript: ScriptFunction = async (records) => {
    return records.map(r => ({
        ...r,
        price: typeof r.price === 'number' ? Math.round(r.price * 100) : r.price,
        _priceNormalized: true,
    }));
};

/**
 * Add import metadata: stamps each record with pipeline run info.
 * Demonstrates: using HookContext to access pipeline/run metadata.
 */
export const addImportMetadataScript: ScriptFunction = async (records, context) => {
    return records.map(r => ({
        ...r,
        _importedAt: new Date().toISOString(),
        _pipelineId: context.pipelineId,
        _runId: context.runId,
        _hookStage: context.stage,
    }));
};

/**
 * Filter inactive records: removes records where enabled !== true.
 * Demonstrates: filtering (reducing record count) in a hook.
 */
export const filterInactiveScript: ScriptFunction = async (records) => {
    return records.filter(r => r.enabled !== false);
};

/**
 * Build search attributes: adds computed search fields before sink indexing.
 * Demonstrates: BEFORE_SINK enrichment for Meilisearch/Elasticsearch.
 */
export const buildSearchAttributesScript: ScriptFunction = async (records) => {
    return records.map(r => ({
        ...r,
        searchText: [r.name, r.sku, r.description].filter(Boolean).join(' ').toLowerCase(),
        facetTags: typeof r.tags === 'string'
            ? r.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [],
        priceRange: typeof r.price === 'number'
            ? (r.price < 5000 ? 'budget' : r.price < 20000 ? 'mid' : 'premium')
            : 'unknown',
        _searchEnriched: true,
    }));
};

/**
 * Post-load audit: stamps records after loading with audit trail info.
 * Demonstrates: AFTER_LOAD hook that modifies records flowing to next step.
 */
export const postLoadAuditScript: ScriptFunction = async (records, context) => {
    return records.map(r => ({
        ...r,
        _loadedAt: new Date().toISOString(),
        _loadedInRun: context.runId,
        _auditTrail: 'loaded-successfully',
    }));
};

/**
 * Custom pricing logic: applies business pricing rules using script args.
 * Demonstrates: using args parameter for configurable hook behavior.
 */
export const applyBusinessPricingScript: ScriptFunction = async (records, _context, args) => {
    const marginPercent = (args?.marginPercent as number) || 20;
    const roundTo = (args?.roundTo as number) || 99;

    return records.map(r => {
        if (typeof r.costPrice !== 'number') return r;
        const withMargin = r.costPrice * (1 + marginPercent / 100);
        const rounded = Math.floor(withMargin / 100) * 100 + roundTo;
        return { ...r, price: rounded, _pricingApplied: true };
    });
};

/**
 * Match by external ID: looks up Vendure entities by an external system ID
 * stored in a custom field, then enriches the record with the Vendure entity ID.
 *
 * This demonstrates the DI closure pattern — the script captures injected services
 * at registration time and uses them at execution time. Use this pattern when:
 * - You need to match records by a field that's not a standard matchBy option
 * - You want to enrich records with data from the Vendure database
 * - You need custom lookup logic (e.g., fuzzy matching, composite keys)
 *
 * Usage: Register as a BEFORE_LOAD hook to resolve external IDs before the loader runs.
 *
 * In a real project, you'd inject TransactionalConnection:
 * ```typescript
 * import { TransactionalConnection } from '@vendure/core';
 * import { registerScript, ScriptFunction } from '@oronts/vendure-data-hub-plugin';
 *
 * export function createMatchByExternalId(connection: TransactionalConnection): ScriptFunction {
 *     return async (records, context, args) => {
 *         const entityType = (args?.entityType as string) || 'ProductVariant';
 *         const externalIdField = (args?.externalIdField as string) || 'externalId';
 *
 *         return Promise.all(records.map(async (record) => {
 *             const extId = record[externalIdField];
 *             if (!extId) return record;
 *
 *             const entity = await connection
 *                 .getRepository(context.ctx, entityType)
 *                 .findOne({ where: { customFields: { externalId: extId } } });
 *
 *             return { ...record, _vendureId: entity?.id ?? null, _matchedBy: externalIdField };
 *         }));
 *     };
 * }
 * ```
 */
export const matchByExternalIdScript: ScriptFunction = async (records, context, args) => {
    const externalIdField = (args?.externalIdField as string) || 'externalId';

    // Demo: simulate external ID lookup (in production, query the DB via DI)
    return records.map(r => {
        const extId = r[externalIdField];
        return {
            ...r,
            _vendureId: extId ? `matched-${extId}` : null,
            _matchedBy: externalIdField,
            _matchStage: context.stage,
            _matchedInRun: context.runId,
        };
    });
};

/** All hook scripts to register */
export const hookScripts: Record<string, ScriptFunction> = {
    'normalize-prices': normalizePricesScript,
    'add-import-metadata': addImportMetadataScript,
    'filter-inactive': filterInactiveScript,
    'build-search-attributes': buildSearchAttributesScript,
    'post-load-audit': postLoadAuditScript,
    'apply-business-pricing': applyBusinessPricingScript,
    'match-by-external-id': matchByExternalIdScript,
};

// =============================================================================
// P-HOOK-1: INTERCEPTOR HOOKS — Inline JS record modification
// =============================================================================

/**
 * Demonstrates INTERCEPTOR hooks modifying records at BEFORE/AFTER TRANSFORM.
 * The BEFORE hook adds a field, the operator processes it, the AFTER hook stamps
 * the result — proving the full chain: hook → operator → hook → next step.
 */
export const interceptorHookDemo = createPipeline()
    .name('Hook Demo: Interceptors')
    .description('Demonstrates INTERCEPTOR hooks modifying records before and after transform')

    .trigger('manual', { type: 'MANUAL' })

    .extract('inline-data', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations',
        batchSize: 10,
    })

    .transform('uppercase-name', {
        operators: [
            { op: 'uppercase', args: { source: 'name', target: 'name' } },
        ],
    })

    .hooks({
        // BEFORE_TRANSFORM: Add a prefix field before the operator runs
        BEFORE_TRANSFORM: [{
            type: 'INTERCEPTOR',
            name: 'Add prefix before transform',
            code: `
                return records.map(function(r) {
                    return Object.assign({}, r, {
                        _beforeTransform: true,
                        originalName: r.name
                    })
                })
            `,
        }],
        // AFTER_TRANSFORM: Stamp records after operator has uppercased the name
        AFTER_TRANSFORM: [{
            type: 'INTERCEPTOR',
            name: 'Stamp after transform',
            code: `
                return records.map(function(r) {
                    return Object.assign({}, r, {
                        _afterTransform: true,
                        _transformChain: 'interceptor-before > operator > interceptor-after'
                    })
                })
            `,
        }],
        // AFTER_EXTRACT: Filter to only enabled variants
        AFTER_EXTRACT: [{
            type: 'INTERCEPTOR',
            name: 'Filter enabled only',
            code: `
                return records.filter(function(r) { return r.enabled !== false })
            `,
        }],
    })

    .edge('manual', 'inline-data')
    .edge('inline-data', 'uppercase-name')

    .build();

// =============================================================================
// P-HOOK-2: SCRIPT HOOKS — DI-injected named scripts
// =============================================================================

/**
 * Demonstrates SCRIPT hooks using pre-registered TypeScript functions.
 * Scripts have full Node.js access (DB, APIs, etc.) via DI closures.
 */
export const scriptHookDemo = createPipeline()
    .name('Hook Demo: Scripts')
    .description('Demonstrates SCRIPT hooks with DI access — price normalization, metadata stamping, filtering')

    .trigger('manual', { type: 'MANUAL' })

    .extract('query-variants', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations,productVariantPrices',
        batchSize: 20,
    })

    .transform('basic-mapping', {
        operators: [
            { op: 'copy', args: { source: 'product.name', target: 'productName' } },
            { op: 'copy', args: { source: 'sku', target: 'sku' } },
            { op: 'copy', args: { source: 'priceWithTax', target: 'price' } },
        ],
    })

    .hooks({
        // AFTER_EXTRACT: Filter out disabled variants using a named script
        AFTER_EXTRACT: [{
            type: 'SCRIPT',
            scriptName: 'filter-inactive',
        }],
        // BEFORE_TRANSFORM: Add import metadata before transform
        BEFORE_TRANSFORM: [{
            type: 'SCRIPT',
            scriptName: 'add-import-metadata',
        }],
        // AFTER_TRANSFORM: Apply business pricing rules with configurable args
        AFTER_TRANSFORM: [{
            type: 'SCRIPT',
            scriptName: 'apply-business-pricing',
            args: { marginPercent: 30, roundTo: 99 },
        }],
    })

    .edge('manual', 'query-variants')
    .edge('query-variants', 'basic-mapping')

    .build();

// =============================================================================
// P-HOOK-3: SEARCH ENRICHMENT — BEFORE_SINK hooks for search indexing
// =============================================================================

/**
 * Demonstrates BEFORE_SINK hooks to add computed search attributes
 * before records reach Meilisearch. This is the recommended pattern
 * for search enrichment — hooks add fields, sink config sets index settings.
 */
export const searchEnrichmentHookDemo = createPipeline()
    .name('Hook Demo: Search Enrichment')
    .description('BEFORE_SINK hook adds computed search attributes before Meilisearch indexing')

    .trigger('manual', { type: 'MANUAL' })

    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations,featuredAsset,facetValues',
        batchSize: 50,
    })

    .transform('prepare-search-doc', {
        operators: [
            { op: 'copy', args: { source: 'sku', target: 'objectID' } },
            { op: 'copy', args: { source: 'product.name', target: 'name' } },
            { op: 'copy', args: { source: 'product.description', target: 'description' } },
            { op: 'copy', args: { source: 'sku', target: 'sku' } },
            { op: 'copy', args: { source: 'priceWithTax', target: 'price' } },
            { op: 'copy', args: { source: 'featuredAsset.preview', target: 'image' } },
        ],
    })

    .sink('index-meili', {
        adapterCode: 'meilisearch',
        indexName: 'products-hook-demo',
        primaryKey: 'objectID',
        host: 'http://localhost:7700',
        apiKeySecretCode: 'meilisearch-api-key',
        bulkSize: 50,
        languageCode: 'en',
        // Sink config controls index settings (not hooks)
        searchableFields: ['name', 'description', 'sku', 'searchText'],
        filterableFields: ['priceRange', 'facetTags', '_searchEnriched'],
        sortableFields: ['price'],
    })

    .hooks({
        // AFTER_EXTRACT: Match records by external ID (DI closure pattern demo)
        AFTER_EXTRACT: [{
            type: 'SCRIPT',
            scriptName: 'match-by-external-id',
            args: { externalIdField: 'sku' },
        }],
        // BEFORE_SINK: Add computed search attributes right before indexing
        BEFORE_SINK: [{
            type: 'SCRIPT',
            scriptName: 'build-search-attributes',
        }],
        // AFTER_SINK: Log completion (side-effect only, records don't flow further)
        AFTER_SINK: [{
            type: 'LOG',
            level: 'INFO',
            message: 'Search enrichment complete — records indexed with computed search fields',
        }],
    })

    .edge('manual', 'query-products')
    .edge('query-products', 'prepare-search-doc')
    .edge('prepare-search-doc', 'index-meili')

    .build();

// =============================================================================
// P-HOOK-4: MULTI-HOOK CHAIN — TRANSFORM → LOAD → EXPORT with hooks at every stage
// =============================================================================

/**
 * Full hook chain across multiple steps: demonstrates that AFTER_LOAD hooks
 * modify records that flow to the EXPORT step. Also shows webhook + emit hooks
 * for pipeline lifecycle events.
 */
export const multiHookChainDemo = createPipeline()
    .name('Hook Demo: Multi-Stage Chain')
    .description('Hooks at every stage: TRANSFORM → LOAD → EXPORT, proving AFTER_LOAD flows to EXPORT')

    .trigger('manual', { type: 'MANUAL' })

    .extract('query-products', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations',
        batchSize: 10,
    })

    .transform('map-fields', {
        operators: [
            { op: 'copy', args: { source: 'sku', target: 'sku' } },
            { op: 'copy', args: { source: 'product.name', target: 'name' } },
            { op: 'copy', args: { source: 'priceWithTax', target: 'price' } },
        ],
    })

    .load('upsert-products', {
        adapterCode: 'productUpsert',
        strategy: 'UPDATE',
        conflictStrategy: 'SOURCE_WINS',
        channel: '__default_channel__',
        matchField: 'sku',
        nameField: 'name',
        slugField: 'slug',
    })

    .export('export-results', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'hook-chain-results.csv',
        languageCode: 'en',
    })

    .hooks({
        // BEFORE_TRANSFORM: Normalize prices before operator runs
        BEFORE_TRANSFORM: [{
            type: 'SCRIPT',
            scriptName: 'normalize-prices',
        }],
        // AFTER_TRANSFORM: Add metadata proving transform hook ran
        AFTER_TRANSFORM: [{
            type: 'INTERCEPTOR',
            name: 'Mark transform complete',
            code: `
                return records.map(function(r) {
                    return Object.assign({}, r, { _transformComplete: true })
                })
            `,
        }],
        // BEFORE_LOAD: Filter invalid records right before loading
        BEFORE_LOAD: [{
            type: 'INTERCEPTOR',
            name: 'Filter valid only',
            code: `
                return records.filter(function(r) { return r.sku && r.name })
            `,
        }],
        // AFTER_LOAD: Stamp audit trail — these modifications flow to EXPORT step
        AFTER_LOAD: [{
            type: 'SCRIPT',
            scriptName: 'post-load-audit',
        }],
        // BEFORE_EXPORT: Add export metadata
        BEFORE_EXPORT: [{
            type: 'SCRIPT',
            scriptName: 'add-import-metadata',
        }],
        // Pipeline lifecycle: emit events
        PIPELINE_COMPLETED: [{
            type: 'EMIT',
            event: 'HookDemoCompleted',
        }],
        PIPELINE_FAILED: [{
            type: 'LOG',
            level: 'ERROR',
            message: 'Hook demo pipeline failed',
        }],
    })

    .edge('manual', 'query-products')
    .edge('query-products', 'map-fields')
    .edge('map-fields', 'upsert-products')
    .edge('upsert-products', 'export-results')

    .build();

// =============================================================================
// P-HOOK-5: ALL STAGES — Hooks at every data stage proving modification everywhere
// =============================================================================

/**
 * Ultimate proof pipeline: attaches interceptor hooks to every stage in the
 * EXTRACT → TRANSFORM → EXPORT chain, each stamping a unique marker field.
 * The CSV output should contain ALL marker fields, proving hooks at every
 * stage can modify records and modifications flow through the entire pipeline.
 *
 * ## Event Subscription Pattern
 *
 * External plugins can subscribe to Data Hub events via Vendure's EventBus:
 *
 * ```typescript
 * import { Injectable, OnModuleInit } from '@nestjs/common';
 * import { EventBus } from '@vendure/core';
 * import { DataHubDomainEvent } from '@oronts/vendure-data-hub-plugin';
 *
 * @Injectable()
 * class MyEventListener implements OnModuleInit {
 *     constructor(private eventBus: EventBus) {}
 *
 *     onModuleInit() {
 *         // Subscribe to ALL DataHub events
 *         this.eventBus.ofType(DataHubDomainEvent).subscribe(event => {
 *             switch (event.name) {
 *                 case 'PipelineRunCompleted':
 *                     console.log('Pipeline finished:', event.payload);
 *                     break;
 *                 case 'StepCompleted':
 *                     console.log('Step done:', event.payload.stepKey);
 *                     break;
 *                 case 'RecordLoaded':
 *                     console.log('Entity loaded:', event.payload);
 *                     break;
 *             }
 *         });
 *     }
 * }
 * ```
 */
export const allStagesHookDemo = createPipeline()
    .name('Hook Demo: All Stages')
    .description('Hooks at every stage — proves record modification works everywhere')

    .trigger('manual', { type: 'MANUAL' })

    .extract('query-data', {
        adapterCode: 'vendureQuery',
        entity: 'PRODUCT_VARIANT',
        relations: 'translations,product,product.translations',
        batchSize: 10,
    })

    .transform('map', {
        operators: [
            { op: 'copy', args: { source: 'sku', target: 'sku' } },
            { op: 'copy', args: { source: 'product.name', target: 'name' } },
            { op: 'copy', args: { source: 'priceWithTax', target: 'price' } },
        ],
    })

    .export('csv-out', {
        adapterCode: 'csvExport',
        path: './exports',
        filename: 'all-stages-hook-test.csv',
        languageCode: 'en',
    })

    .hooks({
        // Each stage stamps a unique field — CSV output proves all hooks ran
        AFTER_EXTRACT: [{
            type: 'INTERCEPTOR',
            name: 'Stage 1: after-extract',
            code: `return records.map(function(r) { return Object.assign({}, r, { _stage1_afterExtract: true }) })`,
        }],
        BEFORE_TRANSFORM: [{
            type: 'INTERCEPTOR',
            name: 'Stage 2: before-transform',
            code: `return records.map(function(r) { return Object.assign({}, r, { _stage2_beforeTransform: true }) })`,
        }],
        AFTER_TRANSFORM: [{
            type: 'INTERCEPTOR',
            name: 'Stage 3: after-transform',
            code: `return records.map(function(r) { return Object.assign({}, r, { _stage3_afterTransform: true }) })`,
        }],
        BEFORE_EXPORT: [{
            type: 'INTERCEPTOR',
            name: 'Stage 4: before-export',
            code: `return records.map(function(r) { return Object.assign({}, r, { _stage4_beforeExport: true }) })`,
        }],
        AFTER_EXPORT: [{
            type: 'INTERCEPTOR',
            name: 'Stage 5: after-export',
            code: `return records.map(function(r) { return Object.assign({}, r, { _stage5_afterExport: true }) })`,
        }],
        // Lifecycle hooks
        PIPELINE_COMPLETED: [{
            type: 'LOG',
            level: 'INFO',
            message: 'All-stages hook test complete — check CSV for _stage1 through _stage5 fields',
        }],
        PIPELINE_FAILED: [{
            type: 'LOG',
            level: 'ERROR',
            message: 'All-stages hook test failed',
        }],
        // ON_ERROR: observe record failures
        ON_ERROR: [{
            type: 'LOG',
            level: 'WARN',
            message: 'Record error detected in all-stages hook demo',
        }],
    })

    .edge('manual', 'query-data')
    .edge('query-data', 'map')
    .edge('map', 'csv-out')

    .build();
