import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductSyncPipeline } from '../../connectors/pimcore/pipelines/product-sync.pipeline';
import { createCategorySyncPipeline } from '../../connectors/pimcore/pipelines/category-sync.pipeline';
import { createAssetSyncPipeline } from '../../connectors/pimcore/pipelines/asset-sync.pipeline';
import { pimcoreGraphQLExtractor } from '../../connectors/pimcore/extractors/pimcore-graphql.extractor';
import { PimcoreConnector, pimcoreConnectorDefinition } from '../../connectors/pimcore';
import type { PimcoreConnectorConfig } from '../../connectors/pimcore/types';
import { buildSafePathFilter } from '../../connectors/pimcore/utils/security.utils';
import { assertUrlSafe } from '../utils/url-security.utils';
import { getOperatorRuntime } from '../operators/operator-runtime-registry';
import type { AdapterOperatorHelpers, ExtractContext, RecordEnvelope } from '../sdk/types';
import type { JsonObject, PipelineDefinition } from '../types';

vi.mock('../utils/url-security.utils', () => ({
    assertUrlSafe: vi.fn(async () => undefined),
}));

interface OperatorInvocation {
    op: string;
    args?: Record<string, unknown>;
}

const operatorHelpers = {} as AdapterOperatorHelpers;

async function executeTransform(
    definition: PipelineDefinition,
    stepKey: string,
    input: JsonObject[],
): Promise<JsonObject[]> {
    const step = definition.steps.find(candidate => candidate.key === stepKey);
    if (!step) {
        throw new Error(`Missing step: ${stepKey}`);
    }

    const { operators } = step.config as unknown as { operators: OperatorInvocation[] };
    let records = input;
    for (const invocation of operators) {
        const runtime = getOperatorRuntime(invocation.op);
        if (!runtime) {
            throw new Error(`Missing operator runtime: ${invocation.op}`);
        }
        const result = await runtime.apply(records, (invocation.args ?? {}) as unknown as JsonObject, operatorHelpers);
        records = [...result.records];
    }
    return records;
}

function getStepConfig(definition: PipelineDefinition, stepKey: string): Record<string, unknown> {
    const step = definition.steps.find(candidate => candidate.key === stepKey);
    if (!step) {
        throw new Error(`Missing step: ${stepKey}`);
    }
    return step.config as unknown as Record<string, unknown>;
}

const connectorConfig: PimcoreConnectorConfig = {
    connectionCode: 'pimcore-graphql',
    sync: {
        deltaSync: true,
        includeVariants: true,
        maxPages: 25,
    },
    defaultLanguage: 'en',
};

describe('Pimcore connector pipelines', () => {
    it('does not advertise generic wizard imports for configuration-dependent syncs', () => {
        expect(pimcoreConnectorDefinition.importTemplates).toBeUndefined();
        expect(PimcoreConnector.importTemplates).toEqual([]);
    });

    it('propagates bounded extraction settings to every generated pipeline', () => {
        const configured: PimcoreConnectorConfig = {
            ...connectorConfig,
            timeoutMs: 45_000,
            sync: {
                ...connectorConfig.sync,
                batchSize: 37,
                maxPages: 12,
                includeUnpublished: true,
            },
        };

        const registrations = pimcoreConnectorDefinition.createPipelines(configured);
        const extractConfigs = registrations.map(({ definition }) => {
            const extractStep = definition.steps.find(step => step.type === 'EXTRACT');
            if (!extractStep) throw new Error(`Missing extract step in ${definition.name}`);
            return extractStep.config;
        });

        expect(extractConfigs).toHaveLength(3);
        for (const config of extractConfigs) {
            expect(config).toMatchObject({
                first: 37,
                maxPages: 12,
                timeoutMs: 45_000,
                connectionCode: 'pimcore-graphql',
                sortBy: config.entityType === 'category' ? 'fullpath' : 'id',
                sortOrder: 'ASC',
            });
            if (config.entityType === 'asset') {
                expect(config).not.toHaveProperty('includeUnpublished');
            } else {
                expect(config).toMatchObject({ includeUnpublished: true });
            }
        }
    });

    it('returns stable code-first registrations for each enabled pipeline kind', () => {
        const configured = PimcoreConnector({
            ...connectorConfig,
            pipelines: {
                productSync: { enabled: false },
                categorySync: { enabled: true, name: 'Pimcore Taxonomy Sync' },
                assetSync: { enabled: true },
            },
        });

        expect(configured.pipelines).toMatchObject([
            {
                code: 'pimcore-category-sync',
                name: 'Pimcore Taxonomy Sync',
                enabled: true,
                definition: { name: 'Pimcore Taxonomy Sync' },
            },
            {
                code: 'pimcore-asset-sync',
                name: 'Pimcore Asset Sync',
                enabled: true,
                definition: { name: 'Pimcore Asset Sync' },
            },
        ]);
    });

    it('preserves variants, propagates product identity, and keeps prices in major units', async () => {
        const definition = createProductSyncPipeline(connectorConfig);
        const source: JsonObject[] = [{
            id: 100,
            key: 'product-100',
            fullpath: '/Products/product-100',
            published: true,
            sku: 'P-100',
            name: { en: 'Product 100' },
            description: 'Description',
            variants: [{
                id: 101,
                key: 'blue-s',
                sku: 'BLUE-S',
                name: { en: 'Blue / Small' },
                price: '12.34',
                stockQuantity: 5,
                published: false,
            }],
        }];

        const products = await executeTransform(definition, 'transform-products', source);
        expect(products[0].variants).toEqual(source[0].variants);
        expect(products[0]).toMatchObject({
            sku: 'P-100',
            name: 'Product 100',
            slug: 'product-100',
        });

        const variants = await executeTransform(definition, 'extract-variants', products);
        const transformed = await executeTransform(definition, 'transform-variants', variants);
        expect(transformed).toEqual([expect.objectContaining({
            productSlug: 'product-100',
            productName: 'Product 100',
            productSku: 'P-100',
            variantSku: 'P-100-BLUE-S',
            variantName: 'Blue / Small',
            price: 12.34,
            stockQuantity: 5,
            published: false,
        })]);
        expect(transformed[0]).not.toHaveProperty('priceInCents');

        expect(getStepConfig(definition, 'upsert-products')).toMatchObject({ createVariants: false });
        expect(getStepConfig(definition, 'upsert-variants')).toMatchObject({ priceField: 'price' });
        expect(getStepConfig(definition, 'delta-filter')).toMatchObject({
            operators: [expect.objectContaining({
                args: expect.objectContaining({
                    includePaths: expect.arrayContaining(['price', 'variants']),
                }),
            })],
        });
    });

    it('generates official Pimcore selections for configured source fields', () => {
        const definition = createProductSyncPipeline({
            ...connectorConfig,
            mapping: {
                product: {
                    skuField: 'itemNumber',
                    nameField: 'productName',
                    slugField: 'urlKey',
                    descriptionField: 'longDescription',
                    enabledField: 'active',
                },
            },
        });
        const query = String(getStepConfig(definition, 'fetch-products').query);

        expect(query).toContain('... on object_Product');
        expect(query).toContain('id key fullpath published');
        expect(query).toContain('itemNumber productName urlKey longDescription active price');
        expect(query).toContain('variants: children(objectTypes: ["variant"])');
        expect(query).not.toContain('fullPath');
    });

    it('supports custom Pimcore class, fragment, listing, and response names', () => {
        const definition = createProductSyncPipeline({
            ...connectorConfig,
            queries: {
                product: {
                    className: 'CommerceProduct',
                    listingField: 'getCommerceProducts',
                    responseField: 'products',
                    fragmentType: 'object_CommerceProduct',
                },
            },
        });
        const extractConfig = getStepConfig(definition, 'fetch-products');
        const query = String(extractConfig.query);

        expect(extractConfig.responseField).toBe('products');
        expect(query).toContain('products: getCommerceProducts(');
        expect(query).toContain('... on object_CommerceProduct');
        expect(query).not.toContain('getProductListing');
    });

    it('passes a complete custom query through without rebuilding it', () => {
        const query = 'query Custom { products: customListing { totalCount edges { node { id } } } }';
        const definition = createProductSyncPipeline({
            ...connectorConfig,
            queries: { product: { query, responseField: 'products' } },
        });

        expect(getStepConfig(definition, 'fetch-products')).toMatchObject({
            query,
            responseField: 'products',
        });
    });

    it('maps category parents to the slug field consumed by the collection loader', async () => {
        const definition = createCategorySyncPipeline(connectorConfig);
        const transformed = await executeTransform(definition, 'transform-categories', [{
            id: 2,
            key: 'child',
            fullpath: '/Categories/parent/child',
            published: true,
            name: 'Child',
            slug: 'child',
            parent: { id: 1, key: 'parent', slug: 'parent-category' },
        }]);

        expect(transformed[0]).toMatchObject({
            slug: 'child',
            parentSlug: 'parentcategory',
            pimcorePath: '/Categories/parent/child',
        });
        expect(getStepConfig(definition, 'upsert-collections')).toMatchObject({
            parentSlugField: 'parentSlug',
        });
        expect(getStepConfig(definition, 'fetch-categories')).toMatchObject({
            sortBy: 'fullpath',
            sortOrder: 'ASC',
        });
    });

    it('applies the configured Vendure channel to every channel-aware loader', () => {
        const configured = {
            ...connectorConfig,
            vendureChannel: 'b2b',
            mapping: { product: { enabledField: 'active' } },
        } satisfies PimcoreConnectorConfig;

        expect(getStepConfig(createProductSyncPipeline(configured), 'upsert-products')).toMatchObject({
            channel: 'b2b',
        });
        expect(getStepConfig(createProductSyncPipeline(configured), 'upsert-variants')).toMatchObject({
            channel: 'b2b',
            enabledField: 'active',
        });
        expect(getStepConfig(createCategorySyncPipeline(configured), 'upsert-collections')).toMatchObject({
            channel: 'b2b',
        });
        expect(getStepConfig(createAssetSyncPipeline(configured), 'import-assets')).toMatchObject({
            channel: 'b2b',
        });
    });

});


function createJsonResponse(body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
    });
}
describe('Pimcore GraphQL extractor', () => {
    beforeEach(() => {
        vi.mocked(assertUrlSafe).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('follows official numeric offset pagination and array-based sorting', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    getProductListing: {
                        totalCount: 2,
                        edges: [{ node: { id: '1', key: 'Product 1', published: true } }],
                    },
                },
            }))
            .mockResolvedValueOnce(createJsonResponse({
                data: {
                    getProductListing: {
                        totalCount: 2,
                        edges: [{ node: { id: '2', key: 'Product 2', published: true } }],
                    },
                },
            }));
        vi.stubGlobal('fetch', fetchMock);

        const checkpoints: Array<Record<string, unknown>> = [];
        const context = createExtractContext(checkpoints);

        const records: RecordEnvelope[] = [];
        for await (const record of pimcoreGraphQLExtractor.extract(context, {
            connectionCode: connectorConfig.connectionCode,
            entityType: 'product',
            first: 1,
            sortBy: 'key',
            sortOrder: 'DESC',
        })) {
            records.push(record);
        }

        expect(records.map(record => record.data.key)).toEqual(['Product 1', 'Product 2']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const firstBody = JSON.parse(String(firstRequest.body)) as {
            query: string;
            variables: { sortBy?: string[]; sortOrder?: string[] };
        };
        const secondBody = JSON.parse(String(secondRequest.body)) as { variables: { after?: string } };
        expect(firstBody.query).toContain('$after: Int');
        expect(firstBody.query).toContain('$sortBy: [String]');
        expect(firstBody.query).toContain('... on object_Product');
        expect(firstBody.query).toContain('fullpath');
        expect(firstBody.query).not.toContain('pageInfo');
        expect(firstBody.query).not.toContain('fullPath');
        expect(firstBody.variables.sortBy).toEqual(['key']);
        expect(firstBody.variables.sortOrder).toEqual(['DESC']);
        expect(new Headers(firstRequest.headers).get('apikey')).toBe('valid-pimcore-api-key');
        expect(new Headers(firstRequest.headers).get('X-Pimcore-Workspace')).toBe('shop');
        expect(secondBody.variables.after).toBe(1);
        expect(checkpoints).toEqual([{ cursor: '1', page: 1 }, {}]);
    });

    it('fails explicitly when maxPages truncates a listing', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createProductResponse(10, 'Product 1'))
            .mockResolvedValueOnce(createProductResponse(10, 'Product 2'));
        vi.stubGlobal('fetch', fetchMock);

        const records: RecordEnvelope[] = [];
        const consume = async () => {
            for await (const record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
                first: 1,
                maxPages: 2,
            })) {
                records.push(record);
            }
        };

        await expect(consume()).rejects.toThrow(
            'Pimcore extraction truncated at maxPages=2 after 2 of 10 records',
        );
        expect(records.map(record => record.data.key)).toEqual(['Product 1', 'Product 2']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('clears the offset checkpoint after the terminal page', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({
                data: { getProductListing: { totalCount: 1, edges: [] } },
            }))
            .mockResolvedValueOnce(createProductResponse(1, 'Product 1'));
        vi.stubGlobal('fetch', fetchMock);
        const checkpoints: Array<Record<string, unknown>> = [];

        for await (const _record of pimcoreGraphQLExtractor.extract(
            createExtractContext(checkpoints, { checkpoint: { cursor: '8', page: 4 } }),
            {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            },
        )) {
            // A stale offset beyond totalCount produces no records and resets the next run.
        }

        expect(checkpoints).toEqual([{}]);
        for await (const _record of pimcoreGraphQLExtractor.extract(
            createExtractContext([], { checkpoint: checkpoints[0] }),
            {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            },
        )) {
            // The next scheduled traversal starts from zero.
        }
        const offsets = fetchMock.mock.calls.map(call => {
            const request = call[1] as RequestInit;
            const body = JSON.parse(String(request.body)) as { variables: { after: number } };
            return body.variables.after;
        });
        expect(offsets).toEqual([8, 0]);
    });

    it('includes unpublished records only when explicitly configured', async () => {
        const responseBody = {
            data: {
                getProductListing: {
                    totalCount: 2,
                    edges: [
                        { node: { id: 'draft', key: 'Draft', published: false } },
                        { node: { id: 'live', key: 'Live', published: true } },
                    ],
                },
            },
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createJsonResponse(responseBody))
            .mockResolvedValueOnce(createJsonResponse(responseBody));
        vi.stubGlobal('fetch', fetchMock);

        const extract = async (includeUnpublished: boolean) => {
            const ids: unknown[] = [];
            for await (const record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
                includeUnpublished,
            })) {
                ids.push(record.data.id);
            }
            return ids;
        };

        await expect(extract(false)).resolves.toEqual(['live']);
        await expect(extract(true)).resolves.toEqual(['draft', 'live']);
        const publishedVariables = fetchMock.mock.calls.map(call => {
            const request = call[1] as RequestInit;
            return (JSON.parse(String(request.body)) as { variables: { published?: boolean } }).variables.published;
        });
        expect(publishedVariables).toEqual([undefined, false]);
    });

    it('fails closed before fetching when saved connection auth cannot be resolved', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const context = createExtractContext([], { secret: null });

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(context, {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            })) {
                // The extractor must fail before yielding.
            }
        };

        await expect(consume()).rejects.toThrow('API key secret "pimcore-api-key" is empty or unavailable');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a saved connection with the wrong type before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const context = createExtractContext([], {
            connection: {
                code: 'pimcore-graphql',
                type: 'POSTGRES',
                config: { baseUrl: 'https://pimcore.example/graphql' },
            },
        });

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(context, {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            })) {
                // The extractor must fail before yielding.
            }
        };

        await expect(consume()).rejects.toThrow('expected HTTP or REST or GRAPHQL');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a saved connection without a GraphQL base URL before fetching', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const context = createExtractContext([], {
            connection: {
                code: 'pimcore-graphql',
                type: 'GRAPHQL',
                config: {
                    auth: {
                        type: 'API_KEY',
                        secretCode: 'pimcore-api-key',
                        headerName: 'apikey',
                    },
                },
            },
        });

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(context, {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            })) {
                // The connection contract is checked before records are yielded.
            }
        };

        await expect(consume()).rejects.toThrow('must define baseUrl');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('binds generated asset URLs to the resolved GraphQL origin', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: {
                getAssetListing: {
                    totalCount: 1,
                    edges: [{
                        node: {
                            id: 'asset-1',
                            filename: 'product.jpg',
                            fullpath: '/images/product.jpg',
                        },
                    }],
                },
            },
        })));

        const records: RecordEnvelope[] = [];
        for await (const record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
            connectionCode: connectorConfig.connectionCode,
            entityType: 'asset',
        })) {
            records.push(record);
        }

        expect(records[0]?.data).toMatchObject({
            _pimcoreSourceOrigin: 'https://pimcore.example',
            _pimcoreSourceUrl: 'https://pimcore.example/images/product.jpg',
            fullpath: '/images/product.jpg',
        });
    });

    it('preserves absolute HTTP asset URLs and resolves relative paths once', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: {
                getAssetListing: {
                    totalCount: 2,
                    edges: [
                        { node: { id: 'absolute', filename: 'a.jpg', downloadUrl: 'https://cdn.example/a.jpg' } },
                        { node: { id: 'relative', filename: 'b.jpg', downloadUrl: 'images/b.jpg' } },
                    ],
                },
            },
        })));

        const records: RecordEnvelope[] = [];
        for await (const record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
            connectionCode: connectorConfig.connectionCode,
            entityType: 'asset',
            assetUrlField: 'downloadUrl',
        })) {
            records.push(record);
        }

        expect(records.map(record => record.data._pimcoreSourceUrl)).toEqual([
            'https://cdn.example/a.jpg',
            'https://pimcore.example/images/b.jpg',
        ]);
    });

    it.each([
        { edges: [null], error: 'edges[0] must be an object' },
        { edges: [{ node: null }], error: 'edges[0].node must be an object' },
        { edges: [{ node: {} }], error: 'edges[0].node.id must be a string or number' },
        { edges: [], error: 'empty page at offset 0 before totalCount 1' },
    ])('rejects malformed listing nodes: $error', async ({ edges, error }) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: { getProductListing: { totalCount: 1, edges } },
        })));

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
            })) {
                // The full page is validated before any record is yielded.
            }
        };

        await expect(consume()).rejects.toThrow(error);
    });

    it('rejects custom queries that omit the configured response field', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createJsonResponse({
            data: { getCustomProductListing: { totalCount: 0, edges: [] } },
        })));

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
                query: 'query { getCustomProductListing { totalCount edges { node { id } } } }',
                maxRetries: 1,
            })) {
                // The response contract is checked before records are yielded.
            }
        };

        await expect(consume()).rejects.toThrow(/configured responseField/);
    });

    it('blocks a cross-origin redirect before connection credentials are sent again', async () => {
        vi.mocked(assertUrlSafe).mockImplementation(async url => {
            if (String(url).includes('127.0.0.1')) {
                throw new Error('SSRF protection: redirect target blocked');
            }
        });
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/private' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const consume = async () => {
            for await (const _record of pimcoreGraphQLExtractor.extract(createExtractContext(), {
                connectionCode: connectorConfig.connectionCode,
                entityType: 'product',
                maxRetries: 1,
            })) {
                // The redirect is rejected before a second request.
            }
        };

        await expect(consume()).rejects.toThrow(/outside the allowed credential origins/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(assertUrlSafe).not.toHaveBeenCalledWith('http://127.0.0.1/private', undefined);
    });
});

describe('Pimcore connector config validation', () => {
    it('preserves valid folder paths instead of rewriting their identity', () => {
        expect(buildSafePathFilter('/Product Images/Über/')).toEqual({
            fullpath: { $like: '/Product Images/Über/%' },
        });
    });

    it('rejects relative and wildcard path filters during connector validation', () => {
        expect(() => buildSafePathFilter('Products/')).toThrow('absolute paths');
        const result = pimcoreConnectorDefinition.validateConfig?.({
            ...connectorConfig,
            sync: { pathFilter: '/Products/%' },
        });

        expect(result).toMatchObject({
            valid: false,
            errors: [expect.stringContaining('sync.pathFilter')],
        });
    });

    it('accepts the canonical saved connection and bounded sync settings', () => {
        expect(pimcoreConnectorDefinition.validateConfig?.(connectorConfig)).toEqual({
            valid: true,
            errors: [],
        });
    });

    it('accepts valid query contracts and rejects unsafe GraphQL names', () => {
        expect(pimcoreConnectorDefinition.validateConfig?.({
            ...connectorConfig,
            queries: {
                product: {
                    className: 'CommerceProduct',
                    listingField: 'getCommerceProducts',
                    responseField: 'products',
                    fragmentType: 'object_CommerceProduct',
                },
            },
        })).toEqual({ valid: true, errors: [] });

        const invalid = pimcoreConnectorDefinition.validateConfig?.({
            ...connectorConfig,
            queries: {
                product: { listingField: 'listing { injected }' },
                asset: { query: '   ' },
            },
        });
        expect(invalid).toMatchObject({
            valid: false,
            errors: expect.arrayContaining([
                expect.stringContaining('queries.product.listingField'),
                expect.stringContaining('queries.asset.query'),
            ]),
        });
    });

    it('rejects legacy inline connection fields and unbounded extraction settings', () => {
        const result = pimcoreConnectorDefinition.validateConfig?.({
            connection: {
                endpoint: 'https://pimcore.example/graphql?apikey=plaintext',
                apiKeySecretCode: '',
                apiKey: 'plaintext',
            },
            connectionCode: ' ',
            timeoutMs: 300_001,
            sync: { batchSize: 0, maxPages: 10_001 },
        } as unknown as PimcoreConnectorConfig);

        expect(result?.valid).toBe(false);
        expect(result?.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('config.connection'),
            expect.stringContaining('connectionCode'),
            expect.stringContaining('timeoutMs'),
            expect.stringContaining('sync.batchSize'),
            expect.stringContaining('sync.maxPages'),
        ]));
    });

    it('rejects legacy fields, unsafe mapping names, and invalid MIME filters', () => {
        const result = pimcoreConnectorDefinition.validateConfig?.({
            ...connectorConfig,
            languages: ['en'],
            mapping: { product: { nameField: 'nested.name' } },
            pipelines: {
                facetSync: { enabled: true },
                assetSync: { mimeTypes: [] },
            },
        } as unknown as PimcoreConnectorConfig);

        expect(result?.valid).toBe(false);
        expect(result?.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('config.languages'),
            expect.stringContaining('pipelines.facetSync'),
            expect.stringContaining('mapping.product.nameField must be a GraphQL field name'),
            expect.stringContaining('mimeTypes must be a non-empty array'),
        ]));
    });
});

function createExtractContext(
    checkpoints: Array<Record<string, unknown>> = [],
    options: {
        secret?: string | null;
        checkpoint?: Record<string, unknown>;
        connection?: {
            code: string;
            type: 'HTTP' | 'REST' | 'GRAPHQL' | 'POSTGRES';
            config: JsonObject;
        };
    } = {},
): ExtractContext {
    const connection = options.connection ?? {
        code: 'pimcore-graphql',
        type: 'GRAPHQL' as const,
        config: {
            baseUrl: 'https://pimcore.example/graphql',
            headers: { 'X-Pimcore-Workspace': 'shop' },
            auth: {
                type: 'API_KEY',
                secretCode: 'pimcore-api-key',
                headerName: 'apikey',
            },
        },
    };
    const secret = options.secret === undefined
        ? 'valid-pimcore-api-key'
        : options.secret;

    return {
        checkpoint: options.checkpoint ?? {},
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        secrets: { get: vi.fn(async () => secret ?? undefined) },
        connections: {
            get: vi.fn(async (code: string) => code === connection.code ? connection : undefined),
            getRequired: vi.fn(async (code: string) => {
                if (code !== connection.code) throw new Error(`Connection not found: ${code}`);
                return connection;
            }),
        },
        setCheckpoint: (checkpoint: Record<string, unknown>) => checkpoints.push(checkpoint),
    } as unknown as ExtractContext;
}

function createProductResponse(totalCount: number, key: string): Response {
    return createJsonResponse({
        data: {
            getProductListing: {
                totalCount,
                edges: [{ node: { id: key.toLowerCase(), key, published: true } }],
            },
        },
    });
}
