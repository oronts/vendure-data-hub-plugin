/**
 * Redis Streams Queue Adapter
 *
 * Production-ready Redis Streams adapter for message queue operations.
 * Features:
 * - Consumer groups for distributed processing
 * - Message acknowledgment via XACK
 * - Pending entries list (PEL) management
 * - Automatic claiming of stale messages
 * - Stream trimming for memory management
 */

import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
} from './queue-adapter.interface';
import { JsonObject } from '../../../types/index';
import { AckMode, INTERNAL_TIMINGS } from '../../../constants';
import { getErrorMessage } from '../../../utils/error.utils';
import { isBlockedHostname } from '../../../utils/url-security.utils';

/**
 * Redis-specific connection configuration
 */
interface RedisConnectionConfig extends QueueConnectionConfig {
    /** Consumer group name */
    consumerGroup?: string;
    /** Consumer name within the group */
    consumerName?: string;
    /** Database index (0-15) */
    db?: number;
}

/**
 * Redis client type (from ioredis)
 */
type RedisClient = {
    xadd(key: string, id: string, ...args: string[]): Promise<string>;
    xreadgroup(
        ...args: (string | number)[]
    ): Promise<Array<[string, Array<[string, string[]]>]> | null>;
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
        ...ids: string[]
    ): Promise<Array<[string, string[]]>>;
    xpending(
        key: string,
        group: string,
        start?: string,
        end?: string,
        count?: number,
    ): Promise<Array<[string, string, number, number]> | [number, string, string, Array<[string, number]>]>;
    xlen(key: string): Promise<number>;
    xtrim(key: string, strategy: string, ...args: (string | number)[]): Promise<number>;
    ping(): Promise<string>;
    quit(): Promise<string>;
    duplicate(): RedisClient;
};

/**
 * Cache for Redis clients
 */
const MAX_CLIENTS = 100;
const clientCache = new Map<string, { client: RedisClient; lastUsed: number }>();

/**
 * Pending message entries for manual acknowledgment
 */
interface PendingEntry {
    streamKey: string;
    consumerGroup: string;
    messageId: string;
    createdAt: number;
}
const pendingEntries = new Map<string, PendingEntry>();

/**
 * Generate cache key for connection config
 */
function getCacheKey(config: RedisConnectionConfig): string {
    return `${config.host ?? 'localhost'}:${config.port ?? 6379}:${config.db ?? 0}`;
}

/**
 * Dynamically loaded Redis module
 */
let redisModule: {
    default: new (options: Record<string, unknown>) => RedisClient;
} | null = null;

/**
 * Load ioredis module dynamically
 */
async function loadRedisModule(): Promise<typeof redisModule> {
    if (redisModule) return redisModule;

    try {
        // Dynamic import - ioredis is an optional dependency
        const mod = await (Function('return import("ioredis")')() as Promise<typeof redisModule>);
        redisModule = mod;
        return mod;
    } catch {
        throw new Error(
            'Redis Streams adapter requires ioredis package. ' +
            'Install it with: npm install ioredis'
        );
    }
}

/**
 * Get or create Redis client
 */
async function getClient(config: RedisConnectionConfig): Promise<RedisClient> {
    const key = getCacheKey(config);
    const cached = clientCache.get(key);

    if (cached) {
        cached.lastUsed = Date.now();
        return cached.client;
    }

    const host = config.host ?? 'localhost';
    if (isBlockedHostname(host)) {
        throw new Error(`SSRF protection: hostname '${host}' is blocked for security reasons`);
    }

    const redis = await loadRedisModule();
    if (!redis) throw new Error('Redis module not loaded');

    const Redis = redis.default;
    const client = new Redis({
        host,
        port: config.port ?? 6379,
        password: config.password,
        db: config.db ?? 0,
        retryStrategy: (times: number) => {
            if (times > 10) return null;
            return Math.min(times * 100, 3000);
        },
        maxRetriesPerRequest: 3,
    }) as unknown as RedisClient;

    // Evict oldest client if cache is at capacity
    if (clientCache.size >= MAX_CLIENTS) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, entry] of clientCache.entries()) {
            if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestKey = k;
            }
        }
        if (oldestKey) {
            const stale = clientCache.get(oldestKey);
            if (stale) {
                stale.client.quit().catch(() => { /* ignore */ });
            }
            clientCache.delete(oldestKey);
        }
    }

    clientCache.set(key, {
        client,
        lastUsed: Date.now(),
    });

    return client;
}

/**
 * Ensure consumer group exists for a stream
 */
async function ensureConsumerGroup(
    client: RedisClient,
    streamKey: string,
    groupName: string,
): Promise<void> {
    try {
        await client.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
    } catch (error) {
        // Group already exists - that's fine
        if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
            throw error;
        }
    }
}

/**
 * Parse Redis stream entry to fields object
 */
function parseStreamEntry(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
        result[fields[i]] = fields[i + 1];
    }
    return result;
}

export class RedisStreamsAdapter implements QueueAdapter {
    readonly code = 'redis-streams';
    readonly name = 'Redis Streams';
    readonly description = 'Redis Streams for high-performance message queuing with consumer groups';

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);
        const streamKey = `stream:${queueName}`;

        const results: PublishResult[] = [];

        for (const msg of messages) {
            try {
                // Build field-value pairs
                const fields: string[] = [
                    'payload', JSON.stringify(msg.payload),
                    'messageId', msg.id,
                ];

                if (msg.routingKey) {
                    fields.push('routingKey', msg.routingKey);
                }

                if (msg.headers) {
                    fields.push('headers', JSON.stringify(msg.headers));
                }

                if (msg.priority !== undefined) {
                    fields.push('priority', String(msg.priority));
                }

                // XADD with auto-generated ID
                await client.xadd(streamKey, '*', ...fields);

                results.push({
                    success: true,
                    messageId: msg.id,
                });
            } catch (error) {
                results.push({
                    success: false,
                    messageId: msg.id,
                    error: getErrorMessage(error),
                });
            }
        }

        return results;
    }

    async consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: {
            count: number;
            ackMode: AckMode;
            prefetch?: number;
        },
    ): Promise<ConsumeResult[]> {
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? 'datahub-consumers';
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;

        // Ensure consumer group exists
        await ensureConsumerGroup(client, streamKey, groupName);

        // Read new messages (>)
        const response = await client.xreadgroup(
            'GROUP', groupName, consumerName,
            'COUNT', options.count,
            'BLOCK', 5000, // 5 second timeout
            'STREAMS', streamKey, '>',
        );

        const results: ConsumeResult[] = [];

        if (!response || response.length === 0) {
            return results;
        }

        // response format: [[streamKey, [[id, fields], ...]]]
        const [, entries] = response[0];

        for (const [streamId, fields] of entries) {
            const parsed = parseStreamEntry(fields);

            let payload: JsonObject;
            try {
                payload = JSON.parse(parsed.payload ?? '{}');
            } catch {
                payload = { rawPayload: parsed.payload };
            }

            const messageId = parsed.messageId ?? streamId;
            const deliveryTag = `redis:${streamKey}:${groupName}:${streamId}`;

            // Auto-ack: acknowledge immediately
            if (options.ackMode === AckMode.AUTO) {
                await client.xack(streamKey, groupName, streamId);
            } else {
                // Evict oldest pending entry if at capacity
                const maxPending = INTERNAL_TIMINGS.MAX_PENDING_MESSAGES ?? 10_000;
                if (pendingEntries.size >= maxPending) {
                    let oldestKey: string | null = null;
                    let oldestTime = Infinity;
                    for (const [key, entry] of pendingEntries.entries()) {
                        if (entry.createdAt < oldestTime) {
                            oldestTime = entry.createdAt;
                            oldestKey = key;
                        }
                    }
                    if (oldestKey) {
                        pendingEntries.delete(oldestKey);
                    }
                }

                // Store for manual acknowledgment
                pendingEntries.set(deliveryTag, {
                    streamKey,
                    consumerGroup: groupName,
                    messageId: streamId,
                    createdAt: Date.now(),
                });
            }

            // Parse headers if present
            let headers: Record<string, string> | undefined;
            if (parsed.headers) {
                try {
                    headers = JSON.parse(parsed.headers);
                } catch {
                    // Ignore invalid headers
                }
            }

            results.push({
                messageId,
                payload,
                headers,
                deliveryTag: options.ackMode === AckMode.MANUAL ? deliveryTag : undefined,
                redelivered: false, // Redis streams don't track redelivery count in XREADGROUP
            });
        }

        return results;
    }

    async ack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        const pending = pendingEntries.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);

        await client.xack(pending.streamKey, pending.consumerGroup, pending.messageId);
        pendingEntries.delete(deliveryTag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = pendingEntries.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);

        if (requeue) {
            // In Redis Streams, not acknowledging leaves the message in PEL
            // It can be claimed by another consumer or re-read
            // We do nothing here - the message stays in pending
        } else {
            // Acknowledge to remove from PEL (message is lost)
            await client.xack(pending.streamKey, pending.consumerGroup, pending.messageId);
        }

        pendingEntries.delete(deliveryTag);
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        try {
            const config = connectionConfig as RedisConnectionConfig;
            const client = await getClient(config);
            const result = await client.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }

    /**
     * Claim stale messages from other consumers
     * Useful for recovering from consumer failures
     */
    async claimStaleMessages(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        minIdleMs: number,
        count: number,
    ): Promise<ConsumeResult[]> {
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? 'datahub-consumers';
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;

        // Get pending messages
        const pending = await client.xpending(
            streamKey,
            groupName,
            '-', '+',
            count,
        ) as Array<[string, string, number, number]>;

        if (!pending || pending.length === 0) {
            return [];
        }

        // Filter messages older than minIdleMs
        const staleIds = pending
            .filter(([, , idleTime]) => idleTime >= minIdleMs)
            .map(([id]) => id);

        if (staleIds.length === 0) {
            return [];
        }

        // Claim the messages
        const claimed = await client.xclaim(
            streamKey,
            groupName,
            consumerName,
            minIdleMs,
            ...staleIds,
        );

        const results: ConsumeResult[] = [];

        for (const [streamId, fields] of claimed) {
            const parsed = parseStreamEntry(fields);

            let payload: JsonObject;
            try {
                payload = JSON.parse(parsed.payload ?? '{}');
            } catch {
                payload = { rawPayload: parsed.payload };
            }

            results.push({
                messageId: parsed.messageId ?? streamId,
                payload,
                deliveryTag: `redis:${streamKey}:${groupName}:${streamId}`,
                redelivered: true,
            });
        }

        return results;
    }

    /**
     * Trim stream to manage memory
     */
    async trimStream(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        maxLen: number,
    ): Promise<number> {
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config);
        const streamKey = `stream:${queueName}`;

        return client.xtrim(streamKey, 'MAXLEN', '~', maxLen);
    }
}

/**
 * Cleanup old clients periodically
 */
const CLIENT_MAX_IDLE_MS = 5 * 60 * 1000; // 5 minutes

const cleanupInterval = setInterval(async () => {
    const now = Date.now();

    for (const [key, entry] of clientCache.entries()) {
        if (now - entry.lastUsed > CLIENT_MAX_IDLE_MS) {
            try {
                await entry.client.quit();
            } catch {
                // Ignore quit errors
            }
            clientCache.delete(key);
        }
    }

    // Cleanup stale pending entries
    for (const [key, pending] of pendingEntries.entries()) {
        if (now - pending.createdAt > 10 * 60 * 1000) { // 10 minutes
            pendingEntries.delete(key);
        }
    }
}, 60_000);

if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
}

export const redisStreamsAdapter = new RedisStreamsAdapter();
