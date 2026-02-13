import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS, INTERNAL_TIMINGS } from '../../constants/index';

interface RateLimitKey {
    ip?: string;
    pipelineCode?: string;
    identifier?: string;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

/** Maximum number of rate limit entries to prevent unbounded memory growth */
const MAX_RATE_LIMIT_ENTRIES = 1000;

/**
 * In-memory rate limiter for throttling requests by IP, pipeline code, or arbitrary identifier.
 *
 * **Deployment considerations:**
 * - This implementation stores all rate limit state in process memory.
 * - In multi-instance deployments (e.g., behind a load balancer), each instance
 *   maintains independent rate limit counters. Effective limits are therefore
 *   multiplied by the number of instances.
 * - For true distributed rate limiting, replace this implementation with a
 *   Redis-backed store (e.g., using a sliding-window or token-bucket algorithm
 *   backed by Redis MULTI/EXEC or Lua scripts).
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly store = new Map<string, RateLimitEntry>();
    private readonly cleanupInterval: NodeJS.Timeout;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RATE_LIMIT);

        this.cleanupInterval = setInterval(() => this.cleanup(), INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    isRateLimited(
        key: RateLimitKey,
        maxRequests: number,
        windowMs: number,
    ): { limited: boolean; resetAt: number; retryAfter: number } {
        const keyStr = this.generateKey(key);
        const now = Date.now();
        const resetAt = now + windowMs;

        let entry = this.store.get(keyStr);

        // Initialize or reset if expired
        if (!entry || entry.resetAt <= now) {
            // Evict oldest entries if at capacity
            if (!this.store.has(keyStr) && this.store.size >= MAX_RATE_LIMIT_ENTRIES) {
                this.evictOldest();
            }
            entry = { count: 0, resetAt };
            this.store.set(keyStr, entry);
        }

        // Increment counter
        entry.count++;

        this.store.set(keyStr, entry);

        const limited = entry.count > maxRequests;
        const retryAfter = limited ? entry.resetAt - now : 0;

        if (limited) {
            this.logger.warn(`Rate limit exceeded for key ${keyStr}`, {
                count: entry.count,
                maxRequests,
                resetAt: new Date(entry.resetAt).toISOString(),
            });
        }

        return { limited, resetAt: entry.resetAt, retryAfter };
    }

    reset(key: RateLimitKey): void {
        const keyStr = this.generateKey(key);
        this.store.delete(keyStr);
        this.logger.debug(`Rate limit reset for key ${keyStr}`);
    }

    private evictOldest(): void {
        const entries = Array.from(this.store.entries())
            .sort((a, b) => a[1].resetAt - b[1].resetAt);
        const toRemove = entries.slice(0, Math.ceil(MAX_RATE_LIMIT_ENTRIES * 0.1));
        for (const [key] of toRemove) {
            this.store.delete(key);
        }
        this.logger.debug(`Evicted ${toRemove.length} oldest rate limit entries`);
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [keyStr, entry] of this.store.entries()) {
            if (entry.resetAt <= now) {
                this.store.delete(keyStr);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
        }
    }

    private generateKey(key: RateLimitKey): string {
        const parts: string[] = [];

        if (key.ip) parts.push(`ip:${key.ip}`);
        if (key.pipelineCode) parts.push(`pipeline:${key.pipelineCode}`);
        if (key.identifier) parts.push(`id:${key.identifier}`);

        if (parts.length === 0) {
            return 'global:default';
        }

        return parts.join(':');
    }

    getCount(key: RateLimitKey): number {
        const keyStr = this.generateKey(key);
        const entry = this.store.get(keyStr);
        return entry?.count || 0;
    }

    getStats(): Record<string, { count: number; resetAt: string }> {
        const stats: Record<string, { count: number; resetAt: string }> = {};

        for (const [keyStr, entry] of this.store.entries()) {
            stats[keyStr] = {
                count: entry.count,
                resetAt: new Date(entry.resetAt).toISOString(),
            };
        }

        return stats;
    }
}
