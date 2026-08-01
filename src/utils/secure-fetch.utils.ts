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

export interface SecureFetchPolicy {
    readonly allowedOrigins?: readonly string[];
}

let configuredDispatchers = new WeakMap<UrlSecurityConfig, Agent>();
const activeDispatchers = new Set<Agent>();
let defaultDispatcher: Agent | undefined;

function createDispatcher(config?: UrlSecurityConfig): Agent {
    const lookup: LookupFunction = (hostname, options, callback) => {
        dnsLookup(hostname, options, (error, address, family) => {
            if (error) {
                callback(error, address, family);
                return;
            }
            const addresses = Array.isArray(address)
                ? address
                : [{ address, family }];
            const blockedAddress = addresses.find(
                value => !validateResolvedIp(value.address, config),
            );
            if (blockedAddress) {
                const blocked = new Error(
                    `SSRF protection: ${hostname} resolved to blocked address ${blockedAddress.address}`,
                ) as NodeJS.ErrnoException;
                blocked.code = 'ECONNREFUSED';
                callback(blocked, Array.isArray(address) ? [] : '', 0);
                return;
            }
            callback(null, address, family);
        });
    };

    const dispatcher = new Agent({
        connect: {
            lookup,
        },
    });
    activeDispatchers.add(dispatcher);
    return dispatcher;
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

export async function closeSecureFetchDispatchers(): Promise<void> {
    const dispatchers = [...activeDispatchers];
    activeDispatchers.clear();
    defaultDispatcher = undefined;
    configuredDispatchers = new WeakMap<UrlSecurityConfig, Agent>();

    const results = await Promise.allSettled(
        dispatchers.map(dispatcher => Promise.resolve().then(() => dispatcher.close())),
    );
    const failureCount = results.filter(result => result.status === 'rejected').length;
    if (failureCount > 0) {
        throw new Error(`Failed to close ${failureCount} secure HTTP dispatcher(s)`);
    }
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

function assertOriginAllowed(url: URL, policy?: SecureFetchPolicy): void {
    if (!policy?.allowedOrigins || policy.allowedOrigins.length === 0) {
        return;
    }
    const allowedOrigins = policy.allowedOrigins.map(origin => new URL(origin).origin);
    if (!allowedOrigins.includes(url.origin)) {
        throw new Error(`HTTP request origin ${url.origin} is outside the allowed credential origins`);
    }
}

export async function secureFetch(
    input: string | URL,
    init: RequestInit = {},
    config?: UrlSecurityConfig,
    policy?: SecureFetchPolicy,
): Promise<Response> {
    let currentUrl = new URL(input);
    let method = init.method ?? 'GET';
    let body = init.body;
    let headers = new Headers(init.headers);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
        assertOriginAllowed(currentUrl, policy);
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
        assertOriginAllowed(nextUrl, policy);
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
