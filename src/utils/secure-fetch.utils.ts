import { lookup as dnsLookup } from 'dns';
import type { LookupFunction } from 'net';
import { Agent } from 'undici';
import {
    assertUrlSafe,
    type UrlSecurityConfig,
    validateResolvedIp,
} from './url-security.utils';

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_REDIRECT_HEADERS = [
    'authorization',
    'cookie',
    'proxy-authorization',
    'apikey',
    'x-api-key',
] as const;
const ENTITY_HEADERS = ['content-length', 'content-type'] as const;

const configuredDispatchers = new WeakMap<UrlSecurityConfig, Agent>();
let defaultDispatcher: Agent | undefined;

function createDispatcher(config?: UrlSecurityConfig): Agent {
    const lookup: LookupFunction = (hostname, options, callback) => {
        dnsLookup(hostname, { ...options, all: false }, (error, address, family) => {
            if (error) {
                callback(error, address, family);
                return;
            }
            if (!validateResolvedIp(address, config)) {
                const blocked = new Error(
                    `SSRF protection: ${hostname} resolved to blocked address ${address}`,
                ) as NodeJS.ErrnoException;
                blocked.code = 'ECONNREFUSED';
                callback(blocked, '', 0);
                return;
            }
            callback(null, address, family);
        });
    };

    return new Agent({
        connect: {
            lookup,
        },
    });
}

function getDispatcher(config?: UrlSecurityConfig): Agent {
    if (!config) {
        defaultDispatcher ??= createDispatcher();
        return defaultDispatcher;
    }

    const existing = configuredDispatchers.get(config);
    if (existing) {
        return existing;
    }
    const dispatcher = createDispatcher(config);
    configuredDispatchers.set(config, dispatcher);
    return dispatcher;
}

function prepareRedirect(
    currentUrl: URL,
    nextUrl: URL,
    status: number,
    method: string,
    body: RequestInit['body'],
    headers: Headers,
): { method: string; body: RequestInit['body']; headers: Headers } {
    if (currentUrl.origin !== nextUrl.origin) {
        for (const header of SENSITIVE_REDIRECT_HEADERS) {
            headers.delete(header);
        }
    }

    const upperMethod = method.toUpperCase();
    const switchToGet = status === 303 && upperMethod !== 'HEAD' ||
        (status === 301 || status === 302) && upperMethod === 'POST';
    if (!switchToGet) {
        return { method, body, headers };
    }

    for (const header of ENTITY_HEADERS) {
        headers.delete(header);
    }
    return { method: 'GET', body: undefined, headers };
}

export async function secureFetch(
    input: string | URL,
    init: RequestInit = {},
    config?: UrlSecurityConfig,
): Promise<Response> {
    let currentUrl = new URL(input);
    let method = init.method ?? 'GET';
    let body = init.body;
    let headers = new Headers(init.headers);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        await assertUrlSafe(currentUrl.href, config);

        const response = await globalThis.fetch(currentUrl, {
            ...init,
            method,
            body,
            headers,
            redirect: 'manual',
            dispatcher: getDispatcher(config),
        } as RequestInit & { dispatcher: Agent });

        const location = response.headers.get('location');
        if (!REDIRECT_STATUSES.has(response.status) || !location) {
            return response;
        }
        if (redirectCount === MAX_REDIRECTS) {
            await response.body?.cancel();
            throw new Error(`HTTP redirect limit exceeded (${MAX_REDIRECTS})`);
        }

        const nextUrl = new URL(location, currentUrl);
        await assertUrlSafe(nextUrl.href, config);
        await response.body?.cancel();
        ({ method, body, headers } = prepareRedirect(
            currentUrl,
            nextUrl,
            response.status,
            method,
            body,
            headers,
        ));
        currentUrl = nextUrl;
    }

    throw new Error('HTTP redirect handling failed');
}
