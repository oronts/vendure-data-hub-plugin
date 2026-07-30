export function resolvePimcoreAssetUrl(
    value: unknown,
    baseUrl?: string,
): string | undefined {
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }

    const candidate = value.trim();
    try {
        const absolute = new URL(candidate);
        return isHttpUrl(absolute) ? absolute.toString() : undefined;
    } catch {
        if (!baseUrl || candidate.startsWith('//')) {
            return baseUrl ? undefined : candidate;
        }
    }

    try {
        const base = new URL(baseUrl);
        const resolved = new URL(candidate, `${base.origin}/`);
        return isHttpUrl(resolved) ? resolved.toString() : undefined;
    } catch {
        return undefined;
    }
}

function isHttpUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}
