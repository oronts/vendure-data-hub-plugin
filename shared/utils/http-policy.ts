export type HttpUrlValidationError =
    | 'TYPE'
    | 'INVALID'
    | 'PROTOCOL'
    | 'CREDENTIALS';

export type HttpHeaderUsage = 'STATIC' | 'AUTHENTICATION';
export type HttpHeaderNameError = 'INVALID' | 'RESTRICTED';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SENSITIVE_STATIC_HEADER_PATTERN =
    /authorization|cookie|api[-_]?key|token|secret|signature/i;
const REQUEST_CONTROL_HEADERS = new Set([
    'host',
    'content-length',
    'transfer-encoding',
    'connection',
    'upgrade',
    'proxy-authorization',
    'proxy-authenticate',
    '__proto__',
    'constructor',
    'prototype',
]);

export function getHttpUrlValidationError(
    value: unknown,
): HttpUrlValidationError | null {
    if (typeof value !== 'string') return 'TYPE';

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return 'INVALID';
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'PROTOCOL';
    }
    if (url.username !== '' || url.password !== '') {
        return 'CREDENTIALS';
    }
    return null;
}

export function getHttpHeaderNameError(
    name: string,
    usage: HttpHeaderUsage,
): HttpHeaderNameError | null {
    if (!HEADER_NAME_PATTERN.test(name)) return 'INVALID';

    const normalizedName = name.toLowerCase();
    if (
        REQUEST_CONTROL_HEADERS.has(normalizedName)
        || (usage === 'STATIC' && SENSITIVE_STATIC_HEADER_PATTERN.test(normalizedName))
    ) {
        return 'RESTRICTED';
    }
    return null;
}
