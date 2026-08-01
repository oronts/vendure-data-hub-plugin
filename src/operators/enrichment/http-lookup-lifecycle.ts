import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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

export function resetEnrichmentState(): void {
    clearHttpLookupCache();
    resetAllCircuitBreakers();
    resetAllRateLimiters();
}

@Injectable()
export class HttpLookupLifecycleService implements OnModuleInit, OnModuleDestroy {
    private cleanupInterval?: ReturnType<typeof setInterval>;

    onModuleInit(): void {
        if (this.cleanupInterval) return;
        this.cleanupInterval = setInterval(
            cleanEnrichmentState,
            INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS,
        );
        this.cleanupInterval.unref?.();
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
        resetEnrichmentState();
    }
}
