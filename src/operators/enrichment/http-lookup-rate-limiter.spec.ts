import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getRateLimiterStats,
    resetAllRateLimiters,
    waitForHttpLookupRateLimit,
} from './http-lookup-rate-limiter';

describe('HTTP lookup rate limiter', () => {
    beforeEach(() => {
        resetAllRateLimiters();
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('reserves concurrent requests instead of releasing them together', async () => {
        const completed: number[] = [];
        const requests = [0, 1, 2].map(async index => {
            await waitForHttpLookupRateLimit('https://example.com/items', 1);
            completed.push(index);
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(completed).toEqual([0]);
        await vi.advanceTimersByTimeAsync(999);
        expect(completed).toEqual([0]);
        await vi.advanceTimersByTimeAsync(1);
        expect(completed).toEqual([0, 1]);
        await vi.advanceTimersByTimeAsync(1_000);
        await Promise.all(requests);
        expect(completed).toEqual([0, 1, 2]);
    });

    it('isolates different limits configured for the same origin', async () => {
        await waitForHttpLookupRateLimit('https://example.com/slow', 1);
        await Promise.all([
            waitForHttpLookupRateLimit('https://example.com/fast', 2),
            waitForHttpLookupRateLimit('https://example.com/fast', 2),
        ]);

        expect(getRateLimiterStats()).toHaveLength(2);
    });

    it('uses the documented default requests-per-second limit', async () => {
        await waitForHttpLookupRateLimit('https://example.com/items');

        expect(getRateLimiterStats().values().next().value?.limit).toBe(100);
    });

    it('returns monitoring snapshots that cannot mutate live state', async () => {
        await waitForHttpLookupRateLimit('https://example.com/items', 1);
        const snapshot = getRateLimiterStats();
        snapshot.values().next().value!.tokens = 500;

        expect(getRateLimiterStats().values().next().value?.tokens).toBe(0);
    });
});
