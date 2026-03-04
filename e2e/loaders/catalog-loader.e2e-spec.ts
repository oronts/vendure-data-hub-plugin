/**
 * Catalog loader handlers e2e tests (Facet, FacetValue, Collection)
 *
 * Tests FacetHandler, FacetValueHandler, CollectionHandler directly
 * against a real Vendure server. Covers: create, update, upsert,
 * parent-child relationships, and error handling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FacetService, FacetValueService, CollectionService, LanguageCode } from '@vendure/core';
import { createDataHubTestEnvironment } from '../test-config';
import { FacetHandler, FacetValueHandler } from '../../src/runtime/executors/loaders/facet-handler';
import { CollectionHandler } from '../../src/runtime/executors/loaders/collection-handler';
import { getSuperadminContext, makeStep, createErrorCollector, LOADER_TEST_INITIAL_DATA } from './loader-test-helpers';

describe('Catalog Loaders e2e', () => {
    const { server, adminClient } = createDataHubTestEnvironment();
    let facetHandler: FacetHandler;
    let facetValueHandler: FacetValueHandler;
    let collectionHandler: CollectionHandler;
    let facetService: FacetService;
    let facetValueService: FacetValueService;
    let collectionService: CollectionService;
    let ctx: import('@vendure/core').RequestContext;

    beforeAll(async () => {
        await server.init({
            initialData: LOADER_TEST_INITIAL_DATA,
            productsCsvPath: undefined,
        });
        await adminClient.asSuperAdmin();
        facetHandler = server.app.get(FacetHandler);
        facetValueHandler = server.app.get(FacetValueHandler);
        collectionHandler = server.app.get(CollectionHandler);
        facetService = server.app.get(FacetService);
        facetValueService = server.app.get(FacetValueService);
        collectionService = server.app.get(CollectionService);
        ctx = await getSuperadminContext(server.app);
    });

    afterAll(async () => {
        await server.destroy();
    });

    // ── Facet tests ──────────────────────────────────────────────────────────

    describe('FacetHandler', () => {
        it('creates a facet via upsert', async () => {
            const step = makeStep('test-facet-create', {
                strategy: 'UPSERT',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [
                { code: 'material', name: 'Material' },
                { code: 'certification', name: 'Certification' },
            ];

            const result = await facetHandler.execute(ctx, step, input);
            expect(result.ok).toBe(2);
            expect(result.fail).toBe(0);

            const facet = await facetService.findByCode(ctx, 'material', LanguageCode.en);
            expect(facet).toBeDefined();
            expect(facet!.name).toBe('Material');
        });

        it('updates existing facet via upsert (idempotent)', async () => {
            const step = makeStep('test-facet-update', {
                strategy: 'UPSERT',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [{ code: 'material', name: 'Material Type' }];

            const result = await facetHandler.execute(ctx, step, input);
            expect(result.ok).toBe(1);

            const facet = await facetService.findByCode(ctx, 'material', LanguageCode.en);
            expect(facet!.name).toBe('Material Type');
        });

        it('skips existing facet with CREATE strategy', async () => {
            const step = makeStep('test-facet-create-only', {
                strategy: 'CREATE',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [{ code: 'material', name: 'Should Not Update' }];

            const result = await facetHandler.execute(ctx, step, input);
            expect(result.ok).toBe(1);

            const facet = await facetService.findByCode(ctx, 'material', LanguageCode.en);
            expect(facet!.name).toBe('Material Type'); // Unchanged
        });

        it('fails on UPDATE strategy for non-existent facet', async () => {
            const step = makeStep('test-facet-update-only', {
                strategy: 'UPDATE',
                codeField: 'code',
                nameField: 'name',
            });
            const collector = createErrorCollector();
            const input = [{ code: 'nonexistent-facet', name: 'Ghost' }];

            const result = await facetHandler.execute(ctx, step, input, collector.callback);
            expect(result.fail).toBe(1);
        });

        it('skips records missing code', async () => {
            const step = makeStep('test-facet-no-code', {
                codeField: 'code',
                nameField: 'name',
            });
            const input = [{ name: 'No Code' }]; // Missing code field

            const result = await facetHandler.execute(ctx, step, input);
            expect(result.fail).toBe(1);
        });
    });

    // ── FacetValue tests ─────────────────────────────────────────────────────

    describe('FacetValueHandler', () => {
        it('creates facet values for existing facet', async () => {
            const step = makeStep('test-fv-create', {
                strategy: 'UPSERT',
                facetCodeField: 'facetCode',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [
                { facetCode: 'material', code: 'nitril', name: 'Nitrile' },
                { facetCode: 'material', code: 'latex', name: 'Latex' },
                { facetCode: 'material', code: 'ptfe', name: 'PTFE' },
                { facetCode: 'certification', code: 'ce', name: 'CE Mark' },
                { facetCode: 'certification', code: 'iso-9001', name: 'ISO 9001' },
            ];

            const result = await facetValueHandler.execute(ctx, step, input);
            expect(result.ok).toBe(5);
            expect(result.fail).toBe(0);
        });

        it('updates existing facet value via upsert', async () => {
            const step = makeStep('test-fv-update', {
                strategy: 'UPSERT',
                facetCodeField: 'facetCode',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [{ facetCode: 'material', code: 'nitril', name: 'Nitrile Updated' }];

            const result = await facetValueHandler.execute(ctx, step, input);
            expect(result.ok).toBe(1);
        });

        it('fails for facet value when parent facet does not exist', async () => {
            const step = makeStep('test-fv-no-parent', {
                strategy: 'UPSERT',
                facetCodeField: 'facetCode',
                codeField: 'code',
                nameField: 'name',
            });
            const collector = createErrorCollector();
            const input = [{ facetCode: 'nonexistent-facet', code: 'val1', name: 'Value 1' }];

            const result = await facetValueHandler.execute(ctx, step, input, collector.callback);
            expect(result.fail).toBe(1);
            expect(collector.errors[0].message).toContain('Facet not found');
        });

        it('skips records missing facet code or value code', async () => {
            const step = makeStep('test-fv-missing-fields', {
                facetCodeField: 'facetCode',
                codeField: 'code',
                nameField: 'name',
            });
            const input = [
                { code: 'orphan', name: 'No Facet Code' }, // Missing facetCode
                { facetCode: 'material', name: 'No Value Code' }, // Missing code
            ];

            const result = await facetValueHandler.execute(ctx, step, input);
            expect(result.fail).toBe(2);
        });
    });

    // ── Collection tests ─────────────────────────────────────────────────────

    describe('CollectionHandler', () => {
        it('creates root collections', async () => {
            const step = makeStep('test-coll-create', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                descriptionField: 'description',
            });
            const input = [
                { slug: 'safety-equipment', name: 'Safety Equipment', description: 'PPE and safety gear' },
                { slug: 'laboratory-equipment', name: 'Laboratory Equipment', description: 'Lab instruments' },
            ];

            const result = await collectionHandler.execute(ctx, step, input);
            expect(result.ok).toBe(2);
            expect(result.fail).toBe(0);

            const coll = await collectionService.findOneBySlug(ctx, 'safety-equipment');
            expect(coll).toBeDefined();
            expect(coll!.name).toBe('Safety Equipment');
        });

        it('creates child collections with parent reference', async () => {
            const step = makeStep('test-coll-children', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                parentSlugField: 'parentSlug',
            });
            const input = [
                { slug: 'gloves', name: 'Gloves', parentSlug: 'safety-equipment' },
                { slug: 'goggles', name: 'Safety Goggles', parentSlug: 'safety-equipment' },
                { slug: 'pipettes', name: 'Pipettes', parentSlug: 'laboratory-equipment' },
            ];

            const result = await collectionHandler.execute(ctx, step, input);
            expect(result.ok).toBe(3);

            const gloves = await collectionService.findOneBySlug(ctx, 'gloves');
            expect(gloves).toBeDefined();
        });

        it('updates existing collection via upsert', async () => {
            const step = makeStep('test-coll-update', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
                descriptionField: 'description',
            });
            const input = [{ slug: 'safety-equipment', name: 'Safety Equipment Updated', description: 'Updated description' }];

            const result = await collectionHandler.execute(ctx, step, input);
            expect(result.ok).toBe(1);

            const coll = await collectionService.findOneBySlug(ctx, 'safety-equipment');
            expect(coll!.name).toBe('Safety Equipment Updated');
        });

        it('fails on UPDATE strategy for non-existent collection', async () => {
            const step = makeStep('test-coll-update-only', {
                strategy: 'UPDATE',
                slugField: 'slug',
                nameField: 'name',
            });
            const collector = createErrorCollector();
            const input = [{ slug: 'nonexistent-collection', name: 'Ghost' }];

            const result = await collectionHandler.execute(ctx, step, input, collector.callback);
            expect(result.fail).toBe(1);
        });

        it('skips records missing slug or name', async () => {
            const step = makeStep('test-coll-missing', {
                slugField: 'slug',
                nameField: 'name',
            });
            const input = [
                { name: 'No Slug' },      // Missing slug
                { slug: 'no-name' },       // Missing name
            ];

            const result = await collectionHandler.execute(ctx, step, input);
            expect(result.fail).toBe(2);
        });

        it('handles batch of collections', async () => {
            const step = makeStep('test-coll-batch', {
                strategy: 'UPSERT',
                slugField: 'slug',
                nameField: 'name',
            });
            const input = [
                { slug: 'filters', name: 'Filters & Membranes' },
                { slug: 'containers', name: 'Containers' },
                { slug: 'chemicals', name: 'Chemicals' },
                { slug: 'cleaning', name: 'Cleaning Supplies' },
            ];

            const result = await collectionHandler.execute(ctx, step, input);
            expect(result.ok).toBe(4);
            expect(result.fail).toBe(0);
        });
    });
});
