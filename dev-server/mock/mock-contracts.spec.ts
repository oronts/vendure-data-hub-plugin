import type { Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { shopifyInventorySync } from '../examples/pipelines/catalog-pipelines';
import { eventStockAlert } from '../examples/pipelines/integration-pipelines';
import { webhookOrderImport } from '../examples/pipelines/operations-pipelines';
import { DEFAULT_DEV_PIMCORE_API_KEY } from '../dev-credentials';
import {
    getMockApiUrl,
    getMockEndpoint,
    mockUrl,
    MOCK_PORTS,
    MOCK_ROUTES,
} from '../ports';
import { app as edgeApp } from './mock-edge-case-api';
import { app as magentoApp } from './mock-magento-api';
import { app as pimcoreApp } from './mock-pimcore-api';
import { app as shopifyApp } from './mock-shopify-api';

interface RunningApp {
    readonly baseUrl: string;
    readonly server: Server;
}

async function startApp(app: Express): Promise<RunningApp> {
    const server = await new Promise<Server>((resolve, reject) => {
        const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
        candidate.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function stopApp(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}

describe('mock URL contracts', () => {
    it('normalizes explicit API overrides and derives endpoint paths', () => {
        vi.stubEnv('EDGE_API_URL', 'http://edge.example.test:9444/');

        expect(getMockApiUrl('EDGE_CASE')).toBe('http://edge.example.test:9444');
        expect(getMockEndpoint('EDGE_CASE', MOCK_ROUTES.EDGE_WEBHOOK))
            .toBe('http://edge.example.test:9444/api/webhook');

        vi.unstubAllEnvs();
    });
});

describe('mock HTTP contracts', () => {
    let shopify: RunningApp;
    let magento: RunningApp;
    let edge: RunningApp;
    let pimcore: RunningApp;

    beforeAll(async () => {
        [shopify, magento, edge, pimcore] = await Promise.all([
            startApp(shopifyApp),
            startApp(magentoApp),
            startApp(edgeApp),
            startApp(pimcoreApp),
        ]);
    });

    afterAll(async () => {
        await Promise.all([
            stopApp(shopify.server),
            stopApp(magento.server),
            stopApp(edge.server),
            stopApp(pimcore.server),
        ]);
    });

    it('exposes Pimcore readiness while keeping product resources authenticated', async () => {
        const health = await fetch(
            `${pimcore.baseUrl}${MOCK_ROUTES.PIMCORE_HEALTH}`,
        );
        const body = await health.json() as {
            status: string;
            productsTotal: number;
        };

        expect(health.status).toBe(200);
        expect(body).toMatchObject({ status: 'ok', productsTotal: 28 });

        const productsEndpoint = `${pimcore.baseUrl}/api/products`;
        expect((await fetch(productsEndpoint)).status).toBe(401);
        expect((await fetch(productsEndpoint, {
            headers: { apiKey: DEFAULT_DEV_PIMCORE_API_KEY },
        })).status).toBe(200);
    });

    it('exposes Shopify readiness without consuming an API rate-limit token', async () => {
        const health = await fetch(`${shopify.baseUrl}${MOCK_ROUTES.HEALTH}`);
        const body = await health.json() as {
            status: string;
            service: string;
            counts: { products: number };
        };

        expect(health.status).toBe(200);
        expect(body).toMatchObject({
            status: 'ok',
            service: 'shopify',
            counts: { products: 1000 },
        });

        const unauthorized = await fetch(
            `${shopify.baseUrl}/admin/api/2024-01/shop.json`,
        );
        expect(unauthorized.status).toBe(401);

        const authorized = await fetch(
            `${shopify.baseUrl}/admin/api/2024-01/shop.json`,
            { headers: { 'X-Shopify-Access-Token': 'shpat_test_mock_access_token_123456' } },
        );
        expect(authorized.status).toBe(200);
    });

    it('exposes Magento readiness while keeping API resources authenticated', async () => {
        const health = await fetch(`${magento.baseUrl}${MOCK_ROUTES.HEALTH}`);
        const body = await health.json() as {
            status: string;
            service: string;
            counts: { products: number; categories: number };
        };

        expect(health.status).toBe(200);
        expect(body).toMatchObject({
            status: 'ok',
            service: 'magento',
            counts: { products: 500, categories: 26 },
        });

        const endpoint = `${magento.baseUrl}/rest/V1/store/storeConfigs`;
        expect((await fetch(endpoint)).status).toBe(401);

        const authorized = await fetch(endpoint, {
            headers: { Authorization: 'Bearer magento-dev-token-static-12345' },
        });
        expect(authorized.status).toBe(200);
        const [store] = await authorized.json() as Array<{ base_url: string }>;
        expect(store.base_url).toBe(`${mockUrl(MOCK_PORTS.MAGENTO)}/`);
    });

    it('accepts the declared Edge REST webhook and GraphQL alert sinks', async () => {
        const webhook = await fetch(
            `${edge.baseUrl}${MOCK_ROUTES.EDGE_WEBHOOK}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku: 'SKU-1', stockOnHand: 4 }),
            },
        );
        expect(webhook.status).toBe(200);
        await expect(webhook.json()).resolves.toMatchObject({
            received: true,
            payload: { sku: 'SKU-1', stockOnHand: 4 },
        });

        const graphql = await fetch(
            `${edge.baseUrl}${MOCK_ROUTES.EDGE_GRAPHQL}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: 'mutation { createAlert(input: {}) { id } }',
                    variables: { input: { sku: 'SKU-1' } },
                }),
            },
        );
        expect(graphql.status).toBe(200);
        await expect(graphql.json()).resolves.toEqual({
            data: { createAlert: { id: 'alert-1' } },
        });
    });
});

describe('integration pipeline mock contracts', () => {
    it('normalizes Shopify variants before validating variant fields', () => {
        const keys = shopifyInventorySync.steps.map(step => step.key);
        expect(keys.indexOf('check-products')).toBeLessThan(keys.indexOf('prepare-stock'));
        expect(keys.indexOf('prepare-stock')).toBeLessThan(keys.indexOf('check-variants'));

        const productValidation = shopifyInventorySync.steps
            .find(step => step.key === 'check-products')?.config;
        const variantValidation = shopifyInventorySync.steps
            .find(step => step.key === 'check-variants')?.config;
        const productRules = productValidation?.rules as Array<{
            spec?: { field?: string };
        }> | undefined;
        expect(productRules?.some(rule => rule.spec?.field === 'sku')).toBe(false);
        expect(variantValidation).toMatchObject({
            rules: expect.arrayContaining([
                expect.objectContaining({ spec: expect.objectContaining({ field: 'sku' }) }),
            ]),
        });
    });

    it('uses canonical environment-aware Edge sink endpoints', () => {
        const shopifyAlert = shopifyInventorySync.steps
            .find(step => step.key === 'alert-low-stock');
        const stockAlert = eventStockAlert.steps.find(step => step.key === 'send-alert');
        const orderCallback = webhookOrderImport.steps
            .find(step => step.key === 'notify-callback');

        expect(shopifyAlert?.config?.endpoint)
            .toBe(getMockEndpoint('EDGE_CASE', MOCK_ROUTES.EDGE_WEBHOOK));
        expect(orderCallback?.config?.endpoint)
            .toBe(getMockEndpoint('EDGE_CASE', MOCK_ROUTES.EDGE_WEBHOOK));
        expect(stockAlert?.config?.endpoint)
            .toBe(getMockEndpoint('EDGE_CASE', MOCK_ROUTES.EDGE_GRAPHQL));
    });
});
