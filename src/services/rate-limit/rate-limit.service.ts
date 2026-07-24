import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LOGGER_CONTEXTS, INTERNAL_TIMINGS } from '../../constants/index';
import { RATE_LIMIT } from '../../constants/defaults';
import { getErrorMessage } from '../../utils/error.utils';
import { getConfiguredRedisUrl } from '../runtime/redis-configuration';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { RedisRateLimitBackend } from './redis-rate-limit.backend';

export interface RateLimitKey {
    readonly ip?: string;
    readonly pipelineCode?: string;
    readonly identifier?: string;
}

export interface RateLimitResult {
    readonly limited: boolean;
    readonly resetAt: number;
    readonly retryAfter: number;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

export class RateLimitBackendUnavailableError extends Error {
    readonly backendCause?: unknown;

    constructor(backendCause?: unknown) {
        super('Distributed webhook rate limiting is temporarily unavailable');
        this.name = 'RateLimitBackendUnavailableError';
        this.backendCause = backendCause;
    }
}

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
    private readonly logger: DataHubLogger;
    private readonly store = new Map<string, RateLimitEntry>();
    private readonly redisUrl = getConfiguredRedisUrl();
    private readonly cleanupInterval?: NodeJS.Timeout;
    private redisBackend?: RedisRateLimitBackend;
    private redisInitialization?: Promise<void>;
    private nextRedisInitializationAt = 0;
    private shuttingDown = false;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.RATE_LIMIT);
        if (!this.redisUrl) {
            this.cleanupInterval = setInterval(
                () => this.cleanup(),
                INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS,
            );
            this.cleanupInterval.unref();
        }
    }

    async onModuleInit(): Promise<void> {
        if (!this.redisUrl) {
            this.logger.warn(
                'Using process-local webhook rate limiting; configure DATAHUB_REDIS_URL or REDIS_URL before running multiple API instances',
            );
            return;
        }
        await this.ensureRedisBackend().catch(() => undefined);
    }

    async onModuleDestroy(): Promise<void> {
        this.shuttingDown = true;
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        await this.redisInitialization?.catch(() => undefined);
        await this.redisBackend?.close();
        this.redisBackend = undefined;
    }

    async isRateLimited(
        key: RateLimitKey,
        maxRequests: number,
        windowMs: number,
    ): Promise<RateLimitResult> {
        this.assertLimits(maxRequests, windowMs);
        const keyString = this.generateKey(key);
        const now = Date.now();
        const entry = this.redisUrl
            ? await this.incrementRedis(keyString, windowMs)
            : this.incrementLocal(keyString, now, windowMs);
        const limited = entry.count > maxRequests;
        const retryAfter = limited ? Math.max(1, entry.resetAt - now) : 0;

        if (limited) {
            this.logger.warn(`Rate limit exceeded for key ${keyString}`, {
                count: entry.count,
                maxRequests,
                resetAt: new Date(entry.resetAt).toISOString(),
            });
        }
        return { limited, resetAt: entry.resetAt, retryAfter };
    }

    async reset(key: RateLimitKey): Promise<void> {
        const keyString = this.generateKey(key);
        if (this.redisUrl) {
            const backend = await this.ensureRedisBackend();
            try {
                await backend.reset(keyString);
            } catch (error) {
                this.invalidateRedisBackend(backend, error);
                throw new RateLimitBackendUnavailableError(error);
            }
        } else {
            this.store.delete(keyString);
        }
        this.logger.debug(`Rate limit reset for key ${keyString}`);
    }

    async getCount(key: RateLimitKey): Promise<number> {
        const keyString = this.generateKey(key);
        if (!this.redisUrl) {
            return this.store.get(keyString)?.count ?? 0;
        }
        const backend = await this.ensureRedisBackend();
        try {
            return await backend.getCount(keyString);
        } catch (error) {
            this.invalidateRedisBackend(backend, error);
            throw new RateLimitBackendUnavailableError(error);
        }
    }

    getStats(): Record<string, { count: number; resetAt: string }> {
        const stats: Record<string, { count: number; resetAt: string }> = {};
        for (const [keyString, entry] of this.store.entries()) {
            stats[keyString] = {
                count: entry.count,
                resetAt: new Date(entry.resetAt).toISOString(),
            };
        }
        return stats;
    }

    private async incrementRedis(
        key: string,
        windowMs: number,
    ): Promise<RateLimitEntry> {
        const backend = await this.ensureRedisBackend();
        try {
            const result = await backend.increment(key, windowMs);
            return {
                count: result.count,
                resetAt: Date.now() + result.ttlMs,
            };
        } catch (error) {
            this.invalidateRedisBackend(backend, error);
            throw new RateLimitBackendUnavailableError(error);
        }
    }

    private incrementLocal(
        key: string,
        now: number,
        windowMs: number,
    ): RateLimitEntry {
        let entry = this.store.get(key);
        if (!entry || entry.resetAt <= now) {
            if (!this.store.has(key) && this.store.size >= RATE_LIMIT.MAX_ENTRIES) {
                this.evictOldest();
            }
            entry = { count: 0, resetAt: now + windowMs };
            this.store.set(key, entry);
        }
        entry.count += 1;
        return entry;
    }

    private async ensureRedisBackend(): Promise<RedisRateLimitBackend> {
        if (!this.redisUrl || this.shuttingDown) {
            throw new RateLimitBackendUnavailableError();
        }
        if (this.redisBackend) return this.redisBackend;
        if (Date.now() < this.nextRedisInitializationAt) {
            throw new RateLimitBackendUnavailableError();
        }

        this.redisInitialization ??= this.initializeRedis().finally(() => {
            this.redisInitialization = undefined;
        });
        try {
            await this.redisInitialization;
        } catch (error) {
            throw new RateLimitBackendUnavailableError(error);
        }
        if (!this.redisBackend) {
            throw new RateLimitBackendUnavailableError();
        }
        return this.redisBackend;
    }

    private async initializeRedis(): Promise<void> {
        try {
            this.redisBackend = await RedisRateLimitBackend.create(
                this.redisUrl!,
                this.logger,
            );
            this.nextRedisInitializationAt = 0;
        } catch (error) {
            this.nextRedisInitializationAt =
                Date.now() + RATE_LIMIT.REDIS_RECONNECT_DELAY_MS;
            this.logger.error(
                `Redis webhook rate limiter is unavailable: ${getErrorMessage(error)}`,
            );
            throw error;
        }
    }

    private invalidateRedisBackend(
        backend: RedisRateLimitBackend,
        error: unknown,
    ): void {
        if (this.redisBackend === backend) {
            this.redisBackend = undefined;
            this.nextRedisInitializationAt =
                Date.now() + RATE_LIMIT.REDIS_RECONNECT_DELAY_MS;
            void backend.close();
        }
        this.logger.error(
            `Redis webhook rate-limit command failed: ${getErrorMessage(error)}`,
        );
    }

    private evictOldest(): void {
        const entries = Array.from(this.store.entries())
            .sort((left, right) => left[1].resetAt - right[1].resetAt);
        const removeCount = Math.ceil(RATE_LIMIT.MAX_ENTRIES * 0.1);
        for (const [key] of entries.slice(0, removeCount)) {
            this.store.delete(key);
        }
        this.logger.debug(`Evicted ${removeCount} oldest rate limit entries`);
    }

    private cleanup(): void {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.store.entries()) {
            if (entry.resetAt <= now) {
                this.store.delete(key);
                cleaned += 1;
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
        return parts.length > 0 ? parts.join(':') : 'global:default';
    }

    private assertLimits(maxRequests: number, windowMs: number): void {
        if (!Number.isSafeInteger(maxRequests) || maxRequests < 0) {
            throw new Error('Rate-limit maxRequests must be a non-negative integer');
        }
        if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
            throw new Error('Rate-limit windowMs must be a positive integer');
        }
    }
}
