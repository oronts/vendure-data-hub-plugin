import { describe, expect, it, vi } from 'vitest';
import type { TransactionalConnection } from '@vendure/core';
import { readdirSync } from 'fs';
import { resolve } from 'path';
import type { PipelineDefinition } from '../types';
import { multiFeedExport } from '../../dev-server/examples/pipelines/sink-feed-pipelines';
import { pimCatalogSync } from '../../dev-server/examples/pipelines/catalog-pipelines';
import { customAdapterPipeline } from '../../dev-server/examples/pipelines/advanced-pipelines';
import { BUILTIN_ADAPTERS } from '../constants/builtin-adapters';
import { DataHubRegistryService } from '../sdk/registry.service';
import { allCustomAdapterDefinitions } from '../../dev-server/examples/custom';
import { HookScriptRegistryService } from '../services/events/hook-script-registry.service';
import { DefinitionValidationService } from '../services/validation/definition-validation.service';
import { deriveCapabilities } from '../types/typed-config';
import type { DataHubLoggerFactory } from '../services/logger';
import type { ExecutorContext } from '../runtime/executor-types';
import { TransformExecutor } from '../runtime/executors/transform.executor';

const MIN_EXPECTED_EXAMPLE_PIPELINES = 100;

function isPipelineDefinition(value: unknown): value is PipelineDefinition {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.version === 'number' && Array.isArray(candidate.steps);
}

async function loadExportedPipelines(): Promise<Array<{
    source: string;
    definition: PipelineDefinition;
}>> {
    const pipelineDirectory = resolve(process.cwd(), 'dev-server/examples/pipelines');
    const moduleFiles = readdirSync(pipelineDirectory)
        .filter(file => file.endsWith('.ts') && file !== 'index.ts')
        .sort();
    const modulePaths = moduleFiles.map(file => ({ source: file, path: resolve(pipelineDirectory, file) }));
    modulePaths.push({
        source: 'custom/index.ts',
        path: resolve(process.cwd(), 'dev-server/examples/custom/index.ts'),
    });

    const definitions: Array<{ source: string; definition: PipelineDefinition }> = [];
    for (const modulePath of modulePaths) {
        const moduleExports = await import(modulePath.path) as Record<string, unknown>;
        for (const [exportName, value] of Object.entries(moduleExports)) {
            if (isPipelineDefinition(value)) {
                definitions.push({ source: `${modulePath.source}#${exportName}`, definition: value });
            }
        }
    }
    return definitions;
}

function createDefinitionValidator(registry: DataHubRegistryService): DefinitionValidationService {
    return new DefinitionValidationService(
        registry,
        {} as TransactionalConnection,
        { findMissingDefinitionReferences: vi.fn() } as never,
        new HookScriptRegistryService(),
        { createLogger: vi.fn(() => ({ warn: vi.fn() })) } as never,
    );
}

describe('dev pipeline trigger contracts', () => {
    it('serializes facet persistence before product loading without mixing dependency records', () => {
        const edges = new Set(
            (pimCatalogSync.edges ?? []).map(edge => `${edge.from}->${edge.to}`),
        );

        expect([...edges]).toEqual(expect.arrayContaining([
            'map-fv->filter-fv-records',
            'upsert-facets->filter-fv-records',
            'filter-fv-records->upsert-fv',
            'map-products->filter-product-records',
            'upsert-fv->filter-product-records',
            'filter-product-records->upsert-products',
            'map-variants->filter-variant-records',
            'upsert-products->filter-variant-records',
            'filter-variant-records->upsert-variants',
        ]));
        expect(pimCatalogSync.steps.find(step => step.key === 'filter-fv-records'))
            .toBeDefined();
        expect(pimCatalogSync.steps.find(step => step.key === 'filter-product-records'))
            .toBeDefined();
        expect(pimCatalogSync.steps.find(step => step.key === 'filter-variant-records'))
            .toBeDefined();
    });

    it('uses the canonical custom-feed field mapping contract', () => {
        const customFeed = multiFeedExport.steps.find(step => step.key === 'feed-custom');

        expect(customFeed?.config).toEqual(expect.objectContaining({
            fieldMapping: expect.objectContaining({
                product_id: 'id',
                product_title: 'title',
            }),
        }));
        expect(customFeed?.config).not.toHaveProperty('customFields');
    });

    it('validates every exported pipeline against runtime adapter contracts', async () => {
        const registry = new DataHubRegistryService();
        for (const adapter of BUILTIN_ADAPTERS) {
            registry.register(adapter, { builtIn: true });
        }
        for (const adapter of allCustomAdapterDefinitions) {
            registry.register(adapter, { builtIn: false });
        }
        const validator = createDefinitionValidator(registry);
        const failures: string[] = [];
        const exportedPipelines = await loadExportedPipelines();

        for (const exported of exportedPipelines) {
            const result = validator.validateSync(exported.definition);
            for (const issue of result.issues) {
                failures.push(`${exported.source}: ${issue.message}`);
            }
        }

        expect(exportedPipelines.length).toBeGreaterThanOrEqual(MIN_EXPECTED_EXAMPLE_PIPELINES);
        expect(failures).toEqual([]);
    });

    it('declares the permissions and write domains required by built-in loaders', async () => {
        const failures: string[] = [];
        const exportedPipelines = await loadExportedPipelines();

        for (const exported of exportedPipelines) {
            const derived = deriveCapabilities(exported.definition.steps);
            const declaredPermissions = new Set(
                exported.definition.capabilities?.requires ?? [],
            );
            const declaredDomains = new Set(
                exported.definition.capabilities?.writes ?? [],
            );

            for (const permission of derived.requires ?? []) {
                if (!declaredPermissions.has(permission)) {
                    failures.push(
                        `${exported.source}: missing permission ${permission}`,
                    );
                }
            }
            for (const domain of derived.writes ?? []) {
                if (!declaredDomains.has(domain)) {
                    failures.push(`${exported.source}: missing write domain ${domain}`);
                }
            }
        }

        expect(failures).toEqual([]);
    });

    it('exposes the factory definition and normalizes Shopify variants for persistence', async () => {
        expect(allCustomAdapterDefinitions).toContainEqual(expect.objectContaining({
            type: 'LOADER',
            code: 'vendure-product-sync',
        }));
        expect(allCustomAdapterDefinitions).toContainEqual(expect.objectContaining({
            type: 'EXTRACTOR',
            code: 'shopify-product-generator',
        }));
        const extraction = customAdapterPipeline.steps.find(
            step => step.key === 'generate-shopify-products',
        );
        expect(extraction?.adapterCode).toBe('shopify-product-generator');
        expect(extraction?.config).toEqual({
            productStatus: 'active',
        });
        const transform = customAdapterPipeline.steps.find(step => step.key === 'normalize-data');

        expect(transform?.config).toMatchObject({
            operators: expect.arrayContaining([
                expect.objectContaining({
                    op: 'map',
                    args: expect.objectContaining({
                        mapping: expect.objectContaining({
                            sku: 'node.sku',
                            priceMajor: 'node.price',
                            stockOnHand: 'node.inventoryQuantity',
                        }),
                    }),
                }),
                { op: 'toCents', args: { source: 'priceMajor', target: 'price' } },
            ]),
        });
        expect(customAdapterPipeline.capabilities?.writes).toEqual(
            expect.arrayContaining(['CATALOG', 'INVENTORY']),
        );

        const executor = new TransformExecutor({
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory);
        const executorContext: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        };

        const result = await executor.executeOperator(
            {} as never,
            transform!,
            [
                {
                    id: 'gid://shopify/Product/1',
                    title: 'Demo product',
                    handle: 'demo-product',
                    status: 'ACTIVE',
                    variants: {
                        edges: [
                            {
                                node: {
                                    sku: 'SKU-1',
                                    price: '19.995',
                                    inventoryQuantity: '7',
                                },
                            },
                        ],
                    },
                },
            ],
            executorContext,
        );

        expect(result).toEqual([{
            sku: 'SKU-1',
            productExternalId: 'gid://shopify/Product/1',
            productName: 'Demo product',
            productSlug: 'demo-product',
            priceMajor: 19.995,
            stockOnHand: 7,
            price: 2000,
        }]);
    });
});
