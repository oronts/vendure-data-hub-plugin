import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExtractContext } from '../../src/sdk/types';
import { configureGlobalSsrfProtection } from '../../src/utils/url-security.utils';
import { pimcoreGraphQLExtractor } from './extractors/pimcore-graphql.extractor';

describe('Pimcore GraphQL transport integration', () => {
    let server: Server;
    let endpoint = '';
    let requests = 0;
    const receivedApiKeys: string[] = [];

    beforeAll(async () => {
        configureGlobalSsrfProtection({ allowedHostnames: ['127.0.0.1'] });
        server = createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on('data', chunk => chunks.push(Buffer.from(chunk)));
            request.on('end', () => {
                requests++;
                receivedApiKeys.push(String(request.headers['x-api-key'] ?? ''));
                if (requests === 1) {
                    response.writeHead(503, { 'Content-Type': 'application/json' });
                    response.end('{"error":"temporary"}');
                    return;
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                    variables?: { after?: number };
                };
                const after = body.variables?.after ?? 0;
                const nodes = after === 0
                    ? [
                        {
                            id: 1,
                            key: 'product-1',
                            fullpath: '/Products/product-1',
                            published: true,
                            sku: 'PIM-1',
                        },
                        {
                            id: 2,
                            key: 'product-2',
                            fullpath: '/Products/product-2',
                            published: true,
                            sku: 'PIM-2',
                        },
                    ]
                    : [
                        {
                            id: 3,
                            key: 'product-3',
                            fullpath: '/Products/product-3',
                            published: true,
                            sku: 'PIM-3',
                        },
                    ];
                response.writeHead(200, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({
                    data: {
                        getProductListing: {
                            totalCount: 3,
                            edges: nodes.map(node => ({ node })),
                        },
                    },
                }));
            });
        });
        await new Promise<void>(resolve => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address() as AddressInfo;
        endpoint = `http://127.0.0.1:${address.port}/pimcore-graphql-webservices/datahub`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
        configureGlobalSsrfProtection({});
    });

    it('authenticates, retries, paginates, and resets a completed local HTTP traversal', async () => {
        const setCheckpoint = vi.fn();
        const context = createContext(setCheckpoint);
        const records = [];

        for await (const record of pimcoreGraphQLExtractor.extract(context, {
            connectionCode: 'pimcore-graphql',
            entityType: 'product',
            first: 2,
            maxPages: 2,
            maxRetries: 2,
            retryDelayMs: 0,
        })) {
            records.push(record.data);
        }

        expect(records).toEqual([
            expect.objectContaining({ id: 1, sku: 'PIM-1' }),
            expect.objectContaining({ id: 2, sku: 'PIM-2' }),
            expect.objectContaining({ id: 3, sku: 'PIM-3' }),
        ]);
        expect(requests).toBe(3);
        expect(receivedApiKeys).toEqual([
            'pimcore-integration-key',
            'pimcore-integration-key',
            'pimcore-integration-key',
        ]);
        expect(setCheckpoint.mock.calls).toEqual([
            [{ cursor: '2', page: 1 }],
            [{}],
        ]);
    });

    function createContext(setCheckpoint: ReturnType<typeof vi.fn>): ExtractContext {
        return {
            checkpoint: {},
            connections: {
                get: vi.fn(),
                getRequired: vi.fn(async () => ({
                    code: 'pimcore-graphql',
                    type: 'GRAPHQL',
                    config: {
                        baseUrl: endpoint,
                        auth: {
                            type: 'API_KEY',
                            secretCode: 'pimcore-api-key',
                            headerName: 'X-API-Key',
                        },
                    },
                })),
            },
            secrets: {
                get: vi.fn(async code => code === 'pimcore-api-key'
                    ? 'pimcore-integration-key'
                    : undefined),
                getRequired: vi.fn(async () => 'pimcore-integration-key'),
            },
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
            setCheckpoint,
            isCancelled: vi.fn(async () => false),
        } as unknown as ExtractContext;
    }
});
