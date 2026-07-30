import type { JsonValue } from '../types';
import { deepClone } from '../helpers';

interface CacheEntry {
    readonly data: JsonValue;
    readonly expiresAt: number;
}

export const MAX_HTTP_LOOKUP_CACHE_ENTRIES = 10_000;

const CACHE_EVICTION_RATIO = 0.1;
const httpLookupCache = new Map<string, CacheEntry>();

export function getCachedHttpLookupValue(key: string, now = Date.now()): JsonValue | undefined {
    const entry = httpLookupCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
        httpLookupCache.delete(key);
        return undefined;
    }
    return deepClone(entry.data);
}

export function cacheHttpLookupValue(
    key: string,
    data: JsonValue,
    ttlSeconds: number,
    now = Date.now(),
): void {
    if (!httpLookupCache.has(key) && httpLookupCache.size >= MAX_HTTP_LOOKUP_CACHE_ENTRIES) {
        const count = Math.max(
            1,
            Math.floor(MAX_HTTP_LOOKUP_CACHE_ENTRIES * CACHE_EVICTION_RATIO),
        );
        evictOldestEntries(count);
    }
    httpLookupCache.set(key, {
        data: deepClone(data),
        expiresAt: now + ttlSeconds * 1_000,
    });
}

function evictOldestEntries(count: number): void {
    let evicted = 0;
    for (const key of httpLookupCache.keys()) {
        if (evicted >= count) return;
        httpLookupCache.delete(key);
        evicted += 1;
    }
}

export function cleanExpiredHttpLookupCache(now = Date.now()): void {
    for (const [key, entry] of httpLookupCache) {
        if (entry.expiresAt <= now) httpLookupCache.delete(key);
    }
}

export function clearHttpLookupCache(): void {
    httpLookupCache.clear();
}

export function getHttpLookupCacheStats(): { size: number } {
    return { size: httpLookupCache.size };
}
