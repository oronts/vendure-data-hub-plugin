import * as crypto from 'crypto';
import { DISTRIBUTED_LOCK, RATE_LIMIT } from '../../constants';
import { getErrorMessage } from '../../utils/error.utils';
import { sanitizeUrlForLogging } from '../../utils/url-sanitize.utils';
import type { DataHubLogger } from '../logger';

interface RedisRateLimitClient {
    on(event: 'error', listener: (error: unknown) => void): unknown;
    connect(): Promise<void>;
    ping(): Promise<string>;
    eval(
        script: string,
        numberOfKeys: number,
        ...args: Array<string | number>
    ): Promise<unknown>;
    del(key: string): Promise<number>;
    get(key: string): Promise<string | null>;
    quit(): Promise<void>;
    disconnect(reconnect?: boolean): void;
}

export interface RedisRateLimitIncrement {
    readonly count: number;
    readonly ttlMs: number;
}

const INCREMENT_SCRIPT = `
    local ttl = redis.call("pttl", KEYS[1])
    if ttl < 1 then
        redis.call("set", KEYS[1], 1, "PX", ARGV[1])
        return { 1, tonumber(ARGV[1]) }
    end
    local count = redis.call("incr", KEYS[1])
    return { count, ttl }
`;

export class RedisRateLimitBackend {
    private static readonly KEY_PREFIX = 'datahub:rate-limit:v1:';

    constructor(
        private readonly client: RedisRateLimitClient,
        private readonly logger: DataHubLogger,
    ) {}

    static async create(
        url: string,
        logger: DataHubLogger,
    ): Promise<RedisRateLimitBackend> {
        const ioredisModule = await import('ioredis') as {
            default?: unknown;
            [key: string]: unknown;
        };
        const Redis = (ioredisModule.default || ioredisModule) as new (
            url: string,
            options: {
                commandTimeout: number;
                connectTimeout: number;
                enableOfflineQueue: boolean;
                lazyConnect: boolean;
                maxRetriesPerRequest: number;
                retryStrategy: (times: number) => number | null;
            },
        ) => RedisRateLimitClient;
        const client = new Redis(url, {
            commandTimeout: RATE_LIMIT.REDIS_COMMAND_TIMEOUT_MS,
            connectTimeout: RATE_LIMIT.REDIS_CONNECT_TIMEOUT_MS,
            enableOfflineQueue: false,
            lazyConnect: true,
            maxRetriesPerRequest: DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST,
            retryStrategy: times => (
                times > DISTRIBUTED_LOCK.MAX_RETRIES_PER_REQUEST
                    ? null
                    : Math.min(
                        times * RATE_LIMIT.REDIS_RETRY_DELAY_MS,
                        DISTRIBUTED_LOCK.MAX_RETRY_DELAY_MS,
                    )
            ),
        });
        client.on('error', error => {
            logger.error(
                'Redis webhook rate-limit connection error',
                error instanceof Error ? error : new Error(getErrorMessage(error)),
            );
        });

        try {
            await client.connect();
            await client.ping();
        } catch (error) {
            client.disconnect(false);
            throw error;
        }

        logger.info('Connected to Redis for distributed webhook rate limiting', {
            url: sanitizeUrlForLogging(url),
        });
        return new RedisRateLimitBackend(client, logger);
    }

    async increment(key: string, windowMs: number): Promise<RedisRateLimitIncrement> {
        const result = await this.client.eval(
            INCREMENT_SCRIPT,
            1,
            this.redisKey(key),
            windowMs,
        );
        if (!Array.isArray(result) || result.length !== 2) {
            throw new Error('Redis returned an invalid rate-limit result');
        }
        const count = Number(result[0]);
        const ttlMs = Number(result[1]);
        if (
            !Number.isSafeInteger(count)
            || count < 1
            || !Number.isSafeInteger(ttlMs)
            || ttlMs < 1
        ) {
            throw new Error('Redis returned invalid rate-limit counter values');
        }
        return { count, ttlMs };
    }

    async reset(key: string): Promise<void> {
        await this.client.del(this.redisKey(key));
    }

    async getCount(key: string): Promise<number> {
        const value = await this.client.get(this.redisKey(key));
        if (value === null) return 0;
        const count = Number(value);
        return Number.isSafeInteger(count) && count >= 0 ? count : 0;
    }

    async close(): Promise<void> {
        try {
            await this.client.quit();
        } catch (error) {
            this.logger.warn('Error closing Redis rate-limit connection', {
                error: String(error),
            });
        }
    }

    private redisKey(key: string): string {
        const digest = crypto.createHash('sha256').update(key).digest('hex');
        return `${RedisRateLimitBackend.KEY_PREFIX}${digest}`;
    }
}
