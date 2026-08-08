import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeSecureFetchDispatchers, secureFetch } from './secure-fetch.utils';

describe('secureFetch', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        await closeSecureFetchDispatchers();
    });

    it('blocks private destinations before a request is sent', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        await expect(secureFetch('http://127.0.0.1/admin')).rejects.toThrow(
            /private|blocked/i,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('validates redirect targets before following them', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(null, {
                status: 302,
                headers: { location: 'http://169.254.169.254/latest/meta-data' },
            }),
        );

        await expect(secureFetch(
            'https://public.example/start',
            {},
            { allowedHostnames: ['public.example'] },
        )).rejects.toThrow(/private|blocked/i);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not forward credentials across origins', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(null, {
                status: 302,
                headers: { location: 'https://second.example/final' },
            }))
            .mockResolvedValueOnce(new Response('ok'));

        await secureFetch('https://first.example/start', {
            headers: {
                authorization: 'Bearer secret',
                cookie: 'session=secret',
                apikey: 'pimcore-secret',
                'x-api-key': 'custom-secret',
            },
        }, {
            allowedHostnames: ['first.example', 'second.example'],
        });

        const secondRequest = fetchSpy.mock.calls[1][1];
        const headers = new Headers(secondRequest?.headers);
        expect(headers.has('authorization')).toBe(false);
        expect(headers.has('cookie')).toBe(false);
        expect(headers.has('apikey')).toBe(false);
        expect(headers.has('x-api-key')).toBe(false);
    });

    it('rejects cross-origin redirects for origin-bound credentials', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(null, {
                status: 302,
                headers: { location: 'https://attacker.example/collect' },
            }),
        );

        await expect(secureFetch(
            'https://trusted.example/start',
            { headers: { 'x-custom-token': 'secret' } },
            { allowedHostnames: ['trusted.example', 'attacker.example'] },
            { allowedOrigins: ['https://trusted.example'] },
        )).rejects.toThrow('outside the allowed credential origins');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('preserves multi-address DNS lookup results used by current Node fetch', async () => {
        const server = createServer((_request, response) => {
            response.end('ok');
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, resolve);
        });

        try {
            const { port } = server.address() as AddressInfo;
            const response = await secureFetch(
                `http://localhost:${port}`,
                {},
                { disableSsrfProtection: true },
            );

            await expect(response.text()).resolves.toBe('ok');
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    });

    it('reuses dispatchers until application shutdown and recreates them afterwards', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
        const config = { allowedHostnames: ['public.example'] };

        await secureFetch('https://public.example/first', {}, config);
        await secureFetch('https://public.example/second', {}, config);
        const firstDispatcher = Reflect.get(fetchSpy.mock.calls[0][1] ?? {}, 'dispatcher');
        const secondDispatcher = Reflect.get(fetchSpy.mock.calls[1][1] ?? {}, 'dispatcher');
        expect(secondDispatcher).toBe(firstDispatcher);

        await closeSecureFetchDispatchers();
        await secureFetch('https://public.example/third', {}, config);
        const replacementDispatcher = Reflect.get(fetchSpy.mock.calls[2][1] ?? {}, 'dispatcher');
        expect(replacementDispatcher).not.toBe(firstDispatcher);
    });
});
