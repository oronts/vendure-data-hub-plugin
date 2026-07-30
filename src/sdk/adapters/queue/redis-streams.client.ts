import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import type { QueueConnectionConfig } from './queue-adapter.interface';
import { createQueueConnectionIdentity } from './connection-identity';

const REDIS_RETRY_MAX_DELAY_MS = 3000;

export interface RedisConnectionConfig extends QueueConnectionConfig {
    consumerGroup?: string;
    consumerName?: string;
    db?: number;
    ssl?: boolean;
}

export type RedisStreamEntry = [string, string[]];

export type RedisClient = {
    xadd(key: string, id: string, ...args: string[]): Promise<string>;
    xreadgroup(
        ...args: (string | number)[]
    ): Promise<Array<[string, RedisStreamEntry[]]> | null>;
    xack(key: string, group: string, ...ids: string[]): Promise<number>;
    xgroup(
        cmd: string,
        key: string,
        group: string,
        id?: string,
        mkstream?: string,
    ): Promise<string>;
    xclaim(
        key: string,
        group: string,
        consumer: string,
        minIdleTime: number,
        ...args: Array<string | number>
    ): Promise<RedisStreamEntry[]>;
    xautoclaim(
        key: string,
        group: string,
        consumer: string,
        minIdleTime: number,
        start: string,
        countLabel: 'COUNT',
        count: number,
    ): Promise<[string, RedisStreamEntry[], string[]?]>;
    xtrim(key: string, strategy: string, ...args: Array<string | number>): Promise<number>;
    ping(): Promise<string>;
    quit(): Promise<string>;
};

export type RedisModule = {
    default: new (options: Record<string, unknown>) => RedisClient;
};

let redisModule: RedisModule | null = null;

export async function loadRedisModule(): Promise<RedisModule> {
    if (redisModule) return redisModule;
    try {
        const module = await (
            Function('return import("ioredis")')() as Promise<RedisModule>
        );
        redisModule = module;
        return module;
    } catch {
        throw new Error(
            'Redis Streams adapter requires ioredis package. ' +
            'Install it with: npm install ioredis',
        );
    }
}

export function redisConnectionIdentity(config: RedisConnectionConfig): string {
    return createQueueConnectionIdentity('redis-streams', config);
}

export class RedisClientPool {
    private readonly clients = new Map<
        string,
        { client: RedisClient; lastUsed: number }
    >();
    private readonly pendingClients = new Map<string, Promise<RedisClient>>();
    private generation = 0;

    constructor(private readonly moduleLoader: typeof loadRedisModule) {}

    async get(config: RedisConnectionConfig): Promise<RedisClient> {
        const key = redisConnectionIdentity(config);
        const cached = this.clients.get(key);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.client;
        }

        const pending = this.pendingClients.get(key);
        if (pending) return pending;

        const generation = this.generation;
        const creation = this.create(config, key, generation);
        this.pendingClients.set(key, creation);
        try {
            return await creation;
        } finally {
            this.pendingClients.delete(key);
        }
    }

    private async create(
        config: RedisConnectionConfig,
        key: string,
        generation: number,
    ): Promise<RedisClient> {
        const host = config.host ?? 'localhost';
        if (isBlockedHostname(host)) {
            throw new Error(
                `SSRF protection: hostname '${host}' is blocked for security reasons`,
            );
        }

        const module = await this.moduleLoader();
        const Redis = module.default;
        const client = new Redis({
            host,
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0,
            tls: (config.useTls ?? config.ssl) ? {} : undefined,
            retryStrategy: (times: number) => {
                if (times > 10) return null;
                return Math.min(times * 100, REDIS_RETRY_MAX_DELAY_MS);
            },
            maxRetriesPerRequest: 3,
        }) as unknown as RedisClient;

        if (generation !== this.generation) {
            await this.close(client);
            throw new Error('Redis client pool was destroyed during connection setup');
        }
        if (this.clients.size >= QUEUE.MAX_CONSUMERS) {
            await this.close(client);
            throw new Error(
                `Redis client pool capacity of ${QUEUE.MAX_CONSUMERS} was reached`,
            );
        }
        this.clients.set(key, { client, lastUsed: Date.now() });
        return client;
    }

    async cleanupIdle(now = Date.now()): Promise<void> {
        const expired = [...this.clients.entries()].filter(
            ([, entry]) =>
                now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS,
        );
        await Promise.all(expired.map(async ([key, entry]) => {
            this.clients.delete(key);
            await this.close(entry.client);
        }));
    }

    async destroy(): Promise<void> {
        this.generation++;
        await Promise.allSettled(this.pendingClients.values());
        const clients = [...this.clients.values()].map(entry => entry.client);
        this.clients.clear();
        await Promise.all(clients.map(client => this.close(client)));
    }

    private async close(client: RedisClient): Promise<void> {
        try {
            await client.quit();
        } catch {
            // Connection shutdown is best-effort.
        }
    }
}

export async function ensureRedisConsumerGroup(
    client: RedisClient,
    streamKey: string,
    groupName: string,
): Promise<void> {
    try {
        await client.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
            throw error;
        }
    }
}
