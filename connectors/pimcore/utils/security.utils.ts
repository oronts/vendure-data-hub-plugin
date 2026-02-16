type FilterObject = Record<string, unknown>;

export function buildSafePathFilter(pathFilter: string | undefined): FilterObject | undefined {
    if (!pathFilter) return undefined;

    const sanitized = pathFilter
        .replace(/["\\']/g, '')
        .replace(/[{}[\]]/g, '')
        .replace(/[^a-zA-Z0-9/\-_.]/g, '');

    if (!sanitized) return undefined;

    return { path: { $like: `${sanitized}%` } };
}

export function buildSafeMimeTypeFilter(mimeTypes: string[] | undefined): FilterObject | undefined {
    if (!mimeTypes?.length) return undefined;

    const valid = mimeTypes.filter(mt => /^[a-z]+\/[a-z0-9*+-]+$/i.test(mt));
    if (!valid.length) return undefined;

    return { mimetype: { $in: valid } };
}

export function combineFilters(filters: (FilterObject | undefined)[]): FilterObject | undefined {
    const valid = filters.filter((f): f is FilterObject => !!f);

    if (valid.length === 0) return undefined;
    if (valid.length === 1) return valid[0];

    return { $and: valid };
}

export function validateEndpointUrl(
    endpoint: string,
    options: {
        requireHttps?: boolean;
        allowLocalhost?: boolean;
        allowPrivateIp?: boolean;
    } = {},
): { valid: boolean; errors: string[] } {
    const isProd = process.env.NODE_ENV === 'production';
    const {
        requireHttps = isProd,
        allowLocalhost = !isProd,
        allowPrivateIp = !isProd,
    } = options;

    const errors: string[] = [];

    try {
        const url = new URL(endpoint);
        const hostname = url.hostname.toLowerCase();

        if (requireHttps && url.protocol !== 'https:') {
            errors.push('Endpoint must use HTTPS in production');
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            errors.push('Endpoint must use HTTP or HTTPS');
        }

        if (!allowLocalhost) {
            if (['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost')) {
                errors.push('Endpoint cannot point to localhost');
            }
        }

        if (!allowPrivateIp && isPrivateIp(hostname)) {
            errors.push('Endpoint cannot point to private IP');
        }

        if (!allowPrivateIp && !allowLocalhost) {
            const internalSuffixes = ['.internal', '.local', '.corp', '.lan'];
            if (internalSuffixes.some(s => hostname.endsWith(s))) {
                errors.push('Endpoint cannot point to internal domains');
            }
        }
    } catch {
        errors.push('Invalid URL');
    }

    return { valid: errors.length === 0, errors };
}

function isPrivateIp(hostname: string): boolean {
    const patterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^127\./,
        /^0\./,
    ];

    if (patterns.some(p => p.test(hostname))) return true;
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true;

    return false;
}
