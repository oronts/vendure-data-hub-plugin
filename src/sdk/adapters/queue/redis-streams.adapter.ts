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
import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { getErrorMessage } from '../../../utils/error.utils';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import { createQueueConnectionIdentity } from './connection-identity';

/** Maximum delay between Redis connection retries */
const REDIS_RETRY_MAX_DELAY_MS = 3000;

/** Timeout for blocking read operations on Redis streams */
const REDIS_BLOCK_TIMEOUT_MS = 5000;

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
    /** TLS flag persisted by the REDIS connection schema */
    ssl?: boolean;
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
    xautoclaim(
        key: string,
        group: string,
        consumer: string,
        minIdleTime: number,
        start: string,
        countLabel: 'COUNT',
        count: number,
    ): Promise<[string, Array<[string, string[]]>, string[]?]>;
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
    consumerName: string;
    messageId: string;
    connectionIdentity: string;
    createdAt: number;
}
const pendingEntries = new Map<string, PendingEntry>();
const autoClaimCursors = new Map<string, string>();
let pendingEntryReservations = 0;

function reservePendingEntryCapacity(requested: number): number {
    const available = Math.max(
        0,
        QUEUE.MAX_PENDING_MESSAGES - pendingEntries.size - pendingEntryReservations,
    );
    const reserved = Math.min(requested, available);
    pendingEntryReservations += reserved;
    return reserved;
}

function releasePendingEntryCapacity(reserved: number): void {
    pendingEntryReservations = Math.max(0, pendingEntryReservations - reserved);
}

/**
 * Generate cache key for connection config
 */
function getCacheKey(config: RedisConnectionConfig): string {
    return createQueueConnectionIdentity('redis-streams', config);
}

/**
 * Dynamically loaded Redis module
 */
type RedisModule = {
    default: new (options: Record<string, unknown>) => RedisClient;
};
let redisModule: RedisModule | null = null;

/**
 * Load ioredis module dynamically
 */
async function loadRedisModule(): Promise<RedisModule | null> {
    if (redisModule) return redisModule;

    try {
        // Dynamic import - ioredis is an optional dependency
        const mod = await (Function('return import("ioredis")')() as Promise<RedisModule>);
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
async function getClient(
    config: RedisConnectionConfig,
    moduleLoader: typeof loadRedisModule,
): Promise<RedisClient> {
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

    const redis = await moduleLoader();
    if (!redis) throw new Error('Redis module not loaded');

    const Redis = redis.default;
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

    private cleanupHandle?: ReturnType<typeof setInterval>;

    constructor(private readonly moduleLoader: typeof loadRedisModule = loadRedisModule) {}

    /**
     * Start the periodic cleanup interval for idle clients and stale pending entries.
     * Called automatically on first use; safe to call multiple times.
     */
    startCleanup(): void {
        if (this.cleanupHandle) return;
        this.cleanupHandle = setInterval(async () => {
            const now = Date.now();

            for (const [key, entry] of clientCache.entries()) {
                if (now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS) {
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
                if (now - pending.createdAt > INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS) {
                    pendingEntries.delete(key);
                }
            }
        }, INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);

        if (typeof this.cleanupHandle.unref === 'function') {
            this.cleanupHandle.unref();
        }
    }

    /**
     * Stop the periodic cleanup interval and close all cached clients.
     * Call during graceful shutdown to prevent the interval from keeping the process alive.
     */
    async destroy(): Promise<void> {
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = undefined;
        }

        for (const [key, entry] of clientCache.entries()) {
            try {
                await entry.client.quit();
            } catch {
                // Ignore quit errors during shutdown
            }
            clientCache.delete(key);
        }
        pendingEntries.clear();
        autoClaimCursors.clear();
        pendingEntryReservations = 0;
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config, this.moduleLoader);
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
        this.startCleanup();
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config, this.moduleLoader);
        const connectionIdentity = getCacheKey(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? 'datahub-consumers';
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;

        await ensureConsumerGroup(client, streamKey, groupName);

        const reservedCapacity = options.ackMode === AckMode.MANUAL
            ? reservePendingEntryCapacity(options.count)
            : 0;
        if (options.ackMode === AckMode.MANUAL && reservedCapacity === 0) {
            return [];
        }
        const receiveCount = options.ackMode === AckMode.MANUAL
            ? reservedCapacity
            : options.count;

        try {
            if (options.ackMode === AckMode.MANUAL) {
                const claimed = await this.claimStaleMessagesWithinCapacity(
                    connectionConfig,
                    queueName,
                    INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS,
                    receiveCount,
                );
                if (claimed.length > 0) {
                    return claimed;
                }
            }

            // Read new messages (>)
            const response = await client.xreadgroup(
                'GROUP', groupName, consumerName,
                'COUNT', receiveCount,
                'BLOCK', REDIS_BLOCK_TIMEOUT_MS,
                'STREAMS', streamKey, '>',
            );

            const results: ConsumeResult[] = [];

            if (!response || response.length === 0) {
                return [];
            }

            // response format: [[streamKey, [[id, fields], ...]]]
            const [, entries] = response[0];

            for (const [streamId, fields] of entries.slice(0, receiveCount)) {
                const parsed = parseStreamEntry(fields);

                let payload: JsonObject;
                try {
                    payload = JSON.parse(parsed.payload ?? '{}');
                } catch {
                    payload = { rawPayload: parsed.payload };
                }

                const messageId = parsed.messageId ?? streamId;
                const deliveryTag = `redis:${connectionIdentity}:${streamKey}:${groupName}:${streamId}`;

                if (options.ackMode === AckMode.AUTO) {
                    await client.xack(streamKey, groupName, streamId);
                } else {
                    pendingEntries.set(deliveryTag, {
                        streamKey,
                        consumerGroup: groupName,
                        consumerName,
                        messageId: streamId,
                        connectionIdentity,
                        createdAt: Date.now(),
                    });
                }

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
                    redelivered: false,
                });
            }

            return results;
        } finally {
            releasePendingEntryCapacity(reservedCapacity);
        }
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
        const connectionIdentity = getCacheKey(config);
        if (pending.connectionIdentity !== connectionIdentity) {
            throw new Error('Redis delivery tag belongs to a different connection');
        }
        const client = await getClient(config, this.moduleLoader);

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
        const connectionIdentity = getCacheKey(config);
        if (pending.connectionIdentity !== connectionIdentity) {
            throw new Error('Redis delivery tag belongs to a different connection');
        }
        const client = await getClient(config, this.moduleLoader);

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

    async renewLease(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        const pending = pendingEntries.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        const config = connectionConfig as RedisConnectionConfig;
        const connectionIdentity = getCacheKey(config);
        if (pending.connectionIdentity !== connectionIdentity) {
            throw new Error('Redis delivery tag belongs to a different connection');
        }
        const client = await getClient(config, this.moduleLoader);
        const claimed = await client.xclaim(
            pending.streamKey,
            pending.consumerGroup,
            pending.consumerName,
            0,
            pending.messageId,
        );
        if (!claimed.some(([messageId]) => messageId === pending.messageId)) {
            throw new Error(`Redis pending message ${pending.messageId} is no longer available`);
        }
        pending.createdAt = Date.now();
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const config = connectionConfig as RedisConnectionConfig;
            const client = await getClient(config, this.moduleLoader);
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
        const reservedCapacity = reservePendingEntryCapacity(count);
        if (reservedCapacity === 0) {
            return [];
        }
        try {
            return await this.claimStaleMessagesWithinCapacity(
                connectionConfig,
                queueName,
                minIdleMs,
                reservedCapacity,
            );
        } finally {
            releasePendingEntryCapacity(reservedCapacity);
        }
    }

    private async claimStaleMessagesWithinCapacity(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        minIdleMs: number,
        claimCount: number,
    ): Promise<ConsumeResult[]> {
        const config = connectionConfig as RedisConnectionConfig;
        const client = await getClient(config, this.moduleLoader);
        const connectionIdentity = getCacheKey(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? 'datahub-consumers';
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;
        const cursorKey = `${connectionIdentity}:${streamKey}:${groupName}`;
        const startCursor = autoClaimCursors.get(cursorKey) ?? '0-0';

        const [nextCursor, claimed] = await client.xautoclaim(
            streamKey,
            groupName,
            consumerName,
            minIdleMs,
            startCursor,
            'COUNT',
            claimCount,
        );
        if (nextCursor === '0-0') {
            autoClaimCursors.delete(cursorKey);
        } else {
            autoClaimCursors.set(cursorKey, nextCursor);
        }

        const results: ConsumeResult[] = [];

        for (const [streamId, fields] of claimed.slice(0, claimCount)) {
            const parsed = parseStreamEntry(fields);

            let payload: JsonObject;
            try {
                payload = JSON.parse(parsed.payload ?? '{}');
            } catch {
                payload = { rawPayload: parsed.payload };
            }

            const deliveryTag = `redis:${connectionIdentity}:${streamKey}:${groupName}:${streamId}`;

            results.push({
                messageId: parsed.messageId ?? streamId,
                payload,
                deliveryTag,
                redelivered: true,
            });

            // Register in pendingEntries so ack/nack can find these claimed messages
            pendingEntries.set(deliveryTag, {
                streamKey,
                consumerGroup: groupName,
                consumerName,
                messageId: streamId,
                connectionIdentity,
                createdAt: Date.now(),
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
        const client = await getClient(config, this.moduleLoader);
        const streamKey = `stream:${queueName}`;

        return client.xtrim(streamKey, 'MAXLEN', '~', maxLen);
    }
}

export const redisStreamsAdapter = new RedisStreamsAdapter();
