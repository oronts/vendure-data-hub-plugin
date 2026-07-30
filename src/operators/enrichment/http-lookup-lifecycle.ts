import { INTERNAL_TIMINGS } from '../../constants/defaults';
import {
    cleanExpiredHttpLookupCache,
    clearHttpLookupCache,
} from './http-lookup-cache';
import {
    cleanStaleCircuitBreakers,
    resetAllCircuitBreakers,
} from './http-lookup-circuit-breaker';
import {
    cleanStaleRateLimiters,
    resetAllRateLimiters,
} from './http-lookup-rate-limiter';

function cleanEnrichmentState(): void {
    const now = Date.now();
    cleanExpiredHttpLookupCache(now);
    cleanStaleCircuitBreakers(now);
    cleanStaleRateLimiters(now);
}

const cleanupInterval = setInterval(
    cleanEnrichmentState,
    INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS,
);
cleanupInterval.unref?.();

export function resetEnrichmentState(): void {
    clearHttpLookupCache();
    resetAllCircuitBreakers();
    resetAllRateLimiters();
}

export function destroyEnrichmentCleanup(): void {
    clearInterval(cleanupInterval);
}
