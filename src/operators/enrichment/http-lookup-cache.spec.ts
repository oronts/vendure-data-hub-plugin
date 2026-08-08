import { beforeEach, describe, expect, it } from 'vitest';
import {
    cacheHttpLookupValue,
    clearHttpLookupCache,
    getCachedHttpLookupValue,
    getHttpLookupCacheStats,
    MAX_HTTP_LOOKUP_CACHE_ENTRIES,
} from './http-lookup-cache';

describe('HTTP lookup cache', () => {
    beforeEach(clearHttpLookupCache);

    it('isolates stored and returned object values from caller mutation', () => {
        const source = { nested: { value: 'original' } };
        cacheHttpLookupValue('request', source, 60, 1_000);
        source.nested.value = 'source-mutated';

        const first = getCachedHttpLookupValue('request', 1_001) as typeof source;
        first.nested.value = 'result-mutated';

        expect(getCachedHttpLookupValue('request', 1_002)).toEqual({
            nested: { value: 'original' },
        });
    });

    it('never exceeds its hard entry bound', () => {
        for (let index = 0; index <= MAX_HTTP_LOOKUP_CACHE_ENTRIES; index += 1) {
            cacheHttpLookupValue(String(index), index, 60, 1_000);
        }

        expect(getHttpLookupCacheStats().size).toBeLessThanOrEqual(
            MAX_HTTP_LOOKUP_CACHE_ENTRIES,
        );
    });

    it('does not return an entry at its expiration instant', () => {
        cacheHttpLookupValue('request', 'value', 1, 1_000);

        expect(getCachedHttpLookupValue('request', 2_000)).toBeUndefined();
        expect(getHttpLookupCacheStats()).toEqual({ size: 0 });
    });
});
