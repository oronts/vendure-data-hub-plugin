import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    cacheHttpLookupValue,
    getHttpLookupCacheStats,
} from './http-lookup-cache';
import {
    acquireCircuitPermit,
    getCircuitBreakerStats,
} from './http-lookup-circuit-breaker';
import {
    getRateLimiterStats,
    waitForHttpLookupRateLimit,
} from './http-lookup-rate-limiter';
import {
    HttpLookupLifecycleService,
    resetEnrichmentState,
} from './http-lookup-lifecycle';

describe('HttpLookupLifecycleService', () => {
    afterEach(() => {
        resetEnrichmentState();
        vi.useRealTimers();
    });

    it('owns the cleanup timer and clears process-local state on shutdown', async () => {
        vi.useFakeTimers();
        const service = new HttpLookupLifecycleService();

        cacheHttpLookupValue('request', 'value', 60);
        acquireCircuitPermit('https://api.example.com');
        await waitForHttpLookupRateLimit('https://api.example.com', 10);

        expect(vi.getTimerCount()).toBe(0);
        expect(getHttpLookupCacheStats().size).toBe(1);
        expect(getCircuitBreakerStats().size).toBe(1);
        expect(getRateLimiterStats().size).toBe(1);

        service.onModuleInit();
        expect(vi.getTimerCount()).toBe(1);

        service.onModuleDestroy();
        expect(vi.getTimerCount()).toBe(0);
        expect(getHttpLookupCacheStats().size).toBe(0);
        expect(getCircuitBreakerStats().size).toBe(0);
        expect(getRateLimiterStats().size).toBe(0);
    });
});
