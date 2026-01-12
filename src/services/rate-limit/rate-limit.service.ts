/**
 * Rate Limiting Service
 * 
 * Provides in-memory rate limiting for API endpoints.
 * Supports per-IP and per-pipeline rate limits.
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { LOGGER_CONTEXTS } from '../../constants/index';

export interface RateLimitKey {
    ip?: string;
    pipelineCode?: string;
    identifier?: string;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly store = new Map<string, RateLimitEntry>();
    private readonly cleanupInterval: NodeJS.Timeout;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RATE_LIMIT);

        // Clean up expired entries every minute
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }

    /**
     * Check if request should be rate limited
     * 
     * @param key - Rate limit key (can include IP, pipeline code, etc.)
     * @param maxRequests - Maximum requests allowed in window
     * @param windowMs - Time window in milliseconds
     * @returns true if rate limit exceeded
     */
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

    /**
     * Reset rate limit for a specific key
     */
    reset(key: RateLimitKey): void {
        const keyStr = this.generateKey(key);
        this.store.delete(keyStr);
        this.logger.debug(`Rate limit reset for key ${keyStr}`);
    }

    /**
     * Clean up expired rate limit entries
     */
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

    /**
     * Generate unique key from components
     */
    private generateKey(key: RateLimitKey): string {
        const parts: string[] = [];
        
        if (key.ip) parts.push(`ip:${key.ip}`);
        if (key.pipelineCode) parts.push(`pipeline:${key.pipelineCode}`);
        if (key.identifier) parts.push(`id:${key.identifier}`);
        
        return parts.join(':');
    }

    /**
     * Get current count for a key (for monitoring)
     */
    getCount(key: RateLimitKey): number {
        const keyStr = this.generateKey(key);
        const entry = this.store.get(keyStr);
        return entry?.count || 0;
    }

    /**
     * Get all rate limit stats (for monitoring/debugging)
     */
    getStats(): Record<string, { count: number; resetAt: number }> {
        const stats: Record<string, any> = {};
        
        for (const [keyStr, entry] of this.store.entries()) {
            stats[keyStr] = {
                count: entry.count,
                resetAt: new Date(entry.resetAt).toISOString(),
            };
        }
        
        return stats;
    }
}
