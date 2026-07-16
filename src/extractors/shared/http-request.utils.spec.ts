import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { buildExtractorHeaders, buildExtractorUrl } from './http-request.utils';

function createContext(config: Record<string, unknown>): ExtractorContext {
    return {
        connections: {
            get: vi.fn().mockResolvedValue({
                code: 'erp',
                type: 'HTTP',
                config,
            }),
        },
        secrets: {
            get: vi.fn().mockResolvedValue('runtime-token'),
        },
    } as unknown as ExtractorContext;
}

describe('HTTP extractor connection resolution', () => {
    it('reads URL, headers, and auth only from the canonical nested config', async () => {
        const context = createContext({
            baseUrl: 'https://erp.example.com/api',
            headers: { 'X-Tenant': 'storefront' },
            auth: { type: 'BEARER', secretCode: 'erp-token' },
        });

        await expect(buildExtractorUrl(
            context,
            { url: '/products', connectionCode: 'erp' },
            { disableSsrfProtection: true },
        )).resolves.toBe('https://erp.example.com/api/products');
        await expect(buildExtractorHeaders(context, { connectionCode: 'erp' }))
            .resolves.toMatchObject({
                Authorization: 'Bearer runtime-token',
                'X-Tenant': 'storefront',
            });
    });

    it('fails closed when connection headers are not a string map', async () => {
        const context = createContext({ headers: { 'X-Retry': 3 } });

        await expect(buildExtractorHeaders(context, { connectionCode: 'erp' }))
            .rejects.toThrow('must contain only string values');
    });

    it.each(['Authorization', 'Cookie', 'X-Api-Key', 'X-Signature', 'Host'])(
        'rejects sensitive or routing extractor header %s',
        async headerName => {
            const context = createContext({});

            await expect(buildExtractorHeaders(context, {
                headers: { [headerName]: 'plaintext-value' },
            })).rejects.toThrow('use auth with a Secret Code');
        },
    );

    it('rejects invalid extractor header names', async () => {
        const context = createContext({});

        await expect(buildExtractorHeaders(context, {
            headers: { 'X-Valid\r\nInjected': 'value' },
        })).rejects.toThrow('is invalid');
    });
});
