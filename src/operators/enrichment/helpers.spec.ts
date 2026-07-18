import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyEnrich,
    applyHttpLookup,
    applyHttpLookupBatch,
    getHttpLookupCacheStats,
    resetEnrichmentState,
} from './helpers';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import { httpLookupOperator } from './enrichment.operators';
import type { JsonObject } from '../types';
import type {
    ConnectionConfig,
    ConnectionResolver,
    ConnectionType,
} from '../../sdk/types';
import type {
    HttpLookupRuntimeContext,
    HttpLookupSecretResolver,
} from './http-lookup-security';

describe('applyEnrich defaults', () => {
    it('fills missing and null fields without replacing existing false or zero values', () => {
        expect(applyEnrich(
            {
                existing: 'value',
                active: false,
                stock: 0,
                nullable: null,
            },
            undefined,
            {
                existing: 'replacement',
                active: true,
                stock: 10,
                nullable: 'filled',
                missing: false,
            },
        )).toEqual({
            existing: 'value',
            active: false,
            stock: 0,
            nullable: 'filled',
            missing: false,
        });
    });
});

const BASE_HTTP_LOOKUP_CONFIG = {
    url: 'https://example.com/lookup',
    target: 'lookup',
    cacheTtlSec: 300,
    maxRetries: 0,
} as const;
const LOOKUP_CONNECTION_CODE = 'lookup-api';
const AUTHENTICATED_HTTP_LOOKUP_CONFIG = {
    ...BASE_HTTP_LOOKUP_CONFIG,
    connectionCode: LOOKUP_CONNECTION_CODE,
} as const;

function createConnectionResolver(
    config: JsonObject = { baseUrl: 'https://example.com' },
    type: ConnectionType = 'HTTP',
): ConnectionResolver {
    const connection: ConnectionConfig = {
        code: LOOKUP_CONNECTION_CODE,
        type,
        config,
    };
    return {
        get: async code => code === connection.code ? connection : undefined,
        getRequired: async code => {
            if (code !== connection.code) {
                throw new Error(`Connection not found: ${code}`);
            }
            return connection;
        },
    };
}

function createHttpLookupRuntime(
    secrets?: HttpLookupSecretResolver,
    connections: ConnectionResolver = createConnectionResolver(),
): HttpLookupRuntimeContext {
    return { secrets, connections };
}

beforeEach(() => {
    resetEnrichmentState();
    configureGlobalSsrfProtection({ disableSsrfProtection: true });
    vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
    configureGlobalSsrfProtection({});
    vi.unstubAllGlobals();
});

describe('httpLookup outbound security', () => {
    it('removes records when skipOn404 is enabled', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));

        const result = await applyHttpLookupBatch(
            [{ id: 'missing' }, { id: 'also-missing' }],
            {
                ...BASE_HTTP_LOOKUP_CONFIG,
                cacheTtlSec: 0,
                skipOn404: true,
            },
        );

        expect(result).toEqual({ records: [], errors: [] });
    });

    it('rejects static credential headers before fetch', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            headers: { Authorization: 'Bearer plaintext-token' },
        })).rejects.toThrow('configure credentials with a Secret Code');

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects Secret authentication without an origin-bound connection', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const getSecret = vi.fn(async () => 'credential');

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            bearerTokenSecretCode: 'lookup-token',
        }, { secrets: { get: getSecret } })).rejects.toThrow(
            'requires a saved connection to bind credentials to an origin',
        );

        expect(getSecret).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects a cross-origin URL before resolving or sending credentials', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const getSecret = vi.fn(async () => 'credential');

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            url: 'https://attacker.example/lookup',
            apiKeySecretCode: 'lookup-key',
        }, createHttpLookupRuntime({ get: getSecret }))).rejects.toThrow(
            'cannot authorize request origin',
        );

        expect(getSecret).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows an absolute URL on the saved connection origin', async () => {
        const fetchSpy = vi.fn(async (
            _input: string | URL,
            _init?: RequestInit,
        ) => new Response(
            JSON.stringify({ ok: true }),
            { headers: { 'content-type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchSpy);

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            url: 'https://example.com/v2/products',
            bearerTokenSecretCode: 'lookup-token',
            cacheTtlSec: 0,
        }, createHttpLookupRuntime({ get: async () => 'secret-value' }))).resolves.toMatchObject({
            record: { lookup: { ok: true } },
        });

        expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://example.com/v2/products');
        expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
            'Bearer secret-value',
        );
    });

    it('rejects dynamic host templates before resolving credentials', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const getSecret = vi.fn(async () => 'credential');

        await expect(applyHttpLookup({ host: 'attacker.example' }, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            url: 'https://{{host}}/lookup',
            bearerTokenSecretCode: 'lookup-token',
        }, createHttpLookupRuntime({ get: getSecret }))).rejects.toThrow(
            'cannot authorize request origin',
        );

        expect(getSecret).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves relative URLs and applies saved connection headers and auth', async () => {
        const fetchSpy = vi.fn(async (
            _input: string | URL,
            _init?: RequestInit,
        ) => new Response(
            JSON.stringify({ ok: true }),
            { headers: { 'content-type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchSpy);
        const connections = createConnectionResolver({
            baseUrl: 'https://example.com/api',
            headers: { 'X-Connection': 'saved' },
            auth: {
                type: 'API_KEY',
                secretCode: 'connection-key',
                headerName: 'X-Connection-Key',
            },
        });

        await applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            url: '/products/1',
            connectionCode: LOOKUP_CONNECTION_CODE,
            headers: { 'X-Request': 'pipeline' },
        }, createHttpLookupRuntime({
            get: async code => code === 'connection-key' ? 'secret-value' : undefined,
        }, connections));

        expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://example.com/api/products/1');
        const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
        expect(headers.get('x-connection')).toBe('saved');
        expect(headers.get('x-request')).toBe('pipeline');
        expect(headers.get('x-connection-key')).toBe('secret-value');
    });

    it('prepares the saved connection and credentials once for a batch', async () => {
        const getRequired = vi.fn(async () => ({
            code: LOOKUP_CONNECTION_CODE,
            type: 'HTTP' as const,
            config: {
                baseUrl: 'https://example.com',
                auth: { type: 'BEARER', secretCode: 'connection-token' },
            },
        }));
        const getSecret = vi.fn(async () => 'secret-value');
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ ok: true }),
            { headers: { 'content-type': 'application/json' } },
        )));

        const result = await applyHttpLookupBatch(
            [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
            {
                ...BASE_HTTP_LOOKUP_CONFIG,
                connectionCode: LOOKUP_CONNECTION_CODE,
                cacheTtlSec: 0,
            },
            {
                connections: { get: async () => undefined, getRequired },
                secrets: { get: getSecret },
            },
        );

        expect(result.errors).toEqual([]);
        expect(result.records).toHaveLength(3);
        expect(getRequired).toHaveBeenCalledOnce();
        expect(getSecret).toHaveBeenCalledOnce();
    });

    it('uses explicit operator auth instead of saved connection auth', async () => {
        const getSecret = vi.fn(async code => `${code}-value`);
        const fetchSpy = vi.fn(async (
            _input: string | URL,
            _init?: RequestInit,
        ) => new Response(
            JSON.stringify({ ok: true }),
            { headers: { 'content-type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchSpy);
        const connections = createConnectionResolver({
            baseUrl: 'https://example.com',
            auth: { type: 'BEARER', secretCode: 'connection-token' },
        });

        await applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            apiKeySecretCode: 'operator-key',
            apiKeyHeader: 'X-Operator-Key',
            cacheTtlSec: 0,
        }, createHttpLookupRuntime({ get: getSecret }, connections));

        expect(getSecret).toHaveBeenCalledOnce();
        expect(getSecret).toHaveBeenCalledWith('operator-key');
        const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
        expect(headers.get('x-operator-key')).toBe('operator-key-value');
        expect(headers.has('authorization')).toBe(false);
    });

    it('rejects non-HTTP and incomplete saved connections before fetch', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            connectionCode: LOOKUP_CONNECTION_CODE,
        }, createHttpLookupRuntime(undefined, createConnectionResolver(
            { host: 'localhost' },
            'POSTGRES',
        )))).rejects.toThrow('must use HTTP, REST, or GRAPHQL type');

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            connectionCode: LOOKUP_CONNECTION_CODE,
        }, createHttpLookupRuntime(undefined, createConnectionResolver({})))).rejects.toThrow(
            'must define baseUrl',
        );

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects a connection code without a resolver or a matching connection', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            connectionCode: LOOKUP_CONNECTION_CODE,
        })).rejects.toThrow('requires a Connection resolver');

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            connectionCode: LOOKUP_CONNECTION_CODE,
        }, {
            connections: {
                get: async () => undefined,
                getRequired: async code => {
                    throw new Error(`Connection not found: ${code}`);
                },
            },
        })).rejects.toThrow(`Connection not found: ${LOOKUP_CONNECTION_CODE}`);

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects an invalid API-key header from a saved connection before resolving its Secret', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const getSecret = vi.fn(async () => 'secret-value');
        const connections = createConnectionResolver({
            baseUrl: 'https://example.com',
            auth: {
                type: 'API_KEY',
                secretCode: 'connection-key',
                headerName: 'Invalid Header',
            },
        });

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            connectionCode: LOOKUP_CONNECTION_CODE,
        }, createHttpLookupRuntime({ get: getSecret }, connections))).rejects.toThrow(
            'header name is invalid',
        );

        expect(getSecret).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['request URL', 'https://user:password@example.com/lookup', createConnectionResolver()],
        ['connection base URL', '/lookup', createConnectionResolver({
            baseUrl: 'https://user:password@example.com',
        })],
    ])('rejects embedded credentials in the %s', async (_label, url, connections) => {
        const fetchSpy = vi.mocked(globalThis.fetch);

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            url,
            connectionCode: LOOKUP_CONNECTION_CODE,
        }, createHttpLookupRuntime(undefined, connections))).rejects.toThrow(
            'must not contain embedded credentials',
        );

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('follows same-origin redirects without dropping the bound credential', async () => {
        const fetchSpy = vi.fn(async (input: string | URL, _init?: RequestInit) => {
            if (new URL(input).pathname === '/lookup') {
                return new Response(null, {
                    status: 302,
                    headers: { location: '/redirected' },
                });
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'content-type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchSpy);

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            apiKeySecretCode: 'lookup-key',
            apiKeyHeader: 'X-Custom-Credential',
            cacheTtlSec: 0,
        }, createHttpLookupRuntime({ get: async () => 'secret-value' }))).resolves.toMatchObject({
            record: { lookup: { ok: true } },
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(String(fetchSpy.mock.calls[1]?.[0])).toBe('https://example.com/redirected');
        expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get('x-custom-credential')).toBe(
            'secret-value',
        );
    });

    it('blocks cross-origin redirects for custom credential headers', async () => {
        const fetchSpy = vi.fn(async () => new Response(null, {
            status: 302,
            headers: { location: 'https://example.com:444/redirected' },
        }));
        vi.stubGlobal('fetch', fetchSpy);

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            apiKeySecretCode: 'lookup-key',
            apiKeyHeader: 'X-Custom-Credential',
            failOnError: true,
        }, createHttpLookupRuntime({ get: async () => 'secret-value' }))).resolves.toMatchObject({
            record: {},
            error: 'HTTP request origin https://example.com:444 is outside the allowed credential origins',
        });

        expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('fails closed when an authentication Secret Code cannot resolve', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const resolver = {
            cacheNamespace: 'channel-a',
            get: vi.fn(async () => undefined),
        };

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            bearerTokenSecretCode: 'missing-token',
        }, createHttpLookupRuntime(resolver))).rejects.toThrow('Secret Code is unavailable');

        expect(resolver.get).toHaveBeenCalledWith('missing-token');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects ambiguous authentication configurations before resolving or fetching', async () => {
        const fetchSpy = vi.mocked(globalThis.fetch);
        const resolver = {
            get: vi.fn(async () => 'secret'),
        };

        await expect(applyHttpLookup({}, {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            bearerTokenSecretCode: 'bearer-token',
            apiKeySecretCode: 'api-key',
        }, createHttpLookupRuntime(resolver))).rejects.toThrow('exactly one authentication Secret Code');

        expect(resolver.get).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not reuse cached data across resolved credentials', async () => {
        let responseNumber = 0;
        const fetchSpy = vi.fn(async () => {
            responseNumber += 1;
            return new Response(JSON.stringify({ responseNumber }), {
                headers: { 'content-type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchSpy);
        let token = 'credential-a';
        const resolver = {
            cacheNamespace: 'channel-a',
            get: vi.fn(async () => token),
        };
        const config = {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            bearerTokenSecretCode: 'lookup-token',
        };

        const runtime = createHttpLookupRuntime(resolver);
        const first = await applyHttpLookup({}, config, runtime);
        token = 'credential-b';
        const second = await applyHttpLookup({}, config, runtime);
        const cachedSecond = await applyHttpLookup({}, config, runtime);

        expect(first.record.lookup).toEqual({ responseNumber: 1 });
        expect(second.record.lookup).toEqual({ responseNumber: 2 });
        expect(cachedSecond.record.lookup).toEqual({ responseNumber: 2 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(getHttpLookupCacheStats()).toEqual({ size: 2 });
    });

    it('does not reuse cached data across channel namespaces', async () => {
        let responseNumber = 0;
        const fetchSpy = vi.fn(async () => {
            responseNumber += 1;
            return new Response(JSON.stringify({ responseNumber }), {
                headers: { 'content-type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchSpy);
        const config = {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            apiKeySecretCode: 'lookup-key',
        };
        const first = await applyHttpLookup({}, config, createHttpLookupRuntime({
            cacheNamespace: 'channel-a',
            get: async () => 'same-credential',
        }));
        const second = await applyHttpLookup({}, config, createHttpLookupRuntime({
            cacheNamespace: 'channel-b',
            get: async () => 'same-credential',
        }));

        expect(first.record.lookup).toEqual({ responseNumber: 1 });
        expect(second.record.lookup).toEqual({ responseNumber: 2 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('includes response extraction configuration in cache identity', async () => {
        const fetchSpy = vi.fn(async () => new Response(
            JSON.stringify({ data: { left: 'left-value', right: 'right-value' } }),
            { headers: { 'content-type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchSpy);

        const left = await applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            responsePath: 'data.left',
        }, { secrets: { cacheNamespace: 'channel-a', get: async () => undefined } });
        const right = await applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            responsePath: 'data.right',
        }, { secrets: { cacheNamespace: 'channel-a', get: async () => undefined } });

        expect(left.record.lookup).toBe('left-value');
        expect(right.record.lookup).toBe('right-value');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['timeoutMs', { timeoutMs: 0 }],
        ['cacheTtlSec', { cacheTtlSec: -1 }],
        ['maxRetries', { maxRetries: 11 }],
        ['batchSize', { batchSize: 0 }],
        ['rateLimitPerSecond', { rateLimitPerSecond: 0 }],
    ])('rejects invalid %s before fetch', async (_name, invalidConfig) => {
        const fetchSpy = vi.mocked(globalThis.fetch);

        await expect(applyHttpLookup({}, {
            ...BASE_HTTP_LOOKUP_CONFIG,
            ...invalidConfig,
        })).rejects.toThrow('must be an integer');

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('httpLookup operator context isolation', () => {
    it('derives separate cache identities for different Vendure channels', async () => {
        let responseNumber = 0;
        const fetchSpy = vi.fn(async () => {
            responseNumber += 1;
            return new Response(JSON.stringify({ responseNumber }), {
                headers: { 'content-type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchSpy);
        const helpersForChannel = (channelId: string) => ({
            ctx: {
                ctx: { channelId },
                pipelineId: 'pipeline-1',
                stepKey: 'http-lookup',
            },
            secrets: { get: async () => undefined },
        }) as never;

        const first = await httpLookupOperator(
            [{}],
            BASE_HTTP_LOOKUP_CONFIG,
            helpersForChannel('channel-a'),
        );
        const second = await httpLookupOperator(
            [{}],
            BASE_HTTP_LOOKUP_CONFIG,
            helpersForChannel('channel-b'),
        );

        expect(first.records[0].lookup).toEqual({ responseNumber: 1 });
        expect(second.records[0].lookup).toEqual({ responseNumber: 2 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});

describe('httpLookup cache authentication boundary', () => {
    it('does not serve authenticated cache entries after the Secret becomes unavailable', async () => {
        const fetchSpy = vi.fn(async () => new Response(
            JSON.stringify({ source: 'remote' }),
            { headers: { 'content-type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchSpy);
        let token: string | undefined = 'available-token';
        const resolver = {
            cacheNamespace: 'channel-a',
            get: async () => token,
        };
        const config = {
            ...AUTHENTICATED_HTTP_LOOKUP_CONFIG,
            bearerTokenSecretCode: 'lookup-token',
        };

        const runtime = createHttpLookupRuntime(resolver);
        await expect(applyHttpLookup({}, config, runtime)).resolves.toMatchObject({
            record: { lookup: { source: 'remote' } },
        });
        token = undefined;
        await expect(applyHttpLookup({}, config, runtime)).rejects.toThrow(
            'Secret Code is unavailable',
        );

        expect(fetchSpy).toHaveBeenCalledOnce();
    });
});
