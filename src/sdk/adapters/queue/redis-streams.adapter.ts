import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { getErrorMessage } from '../../../utils/error.utils';
import type {
    ConsumeResult,
    PublishResult,
    QueueAdapter,
    QueueConnectionConfig,
    QueueConsumeOptions,
    QueueMessage,
} from './queue-adapter.interface';
import {
    RedisClientPool,
    type RedisConnectionConfig,
    ensureRedisConsumerGroup,
    loadRedisModule,
    redisConnectionIdentity,
} from './redis-streams.client';
import {
    parseJsonObject,
    parseStringRecord,
    requireNonNegativeInteger,
    requirePositiveInteger,
} from './queue-message.utils';

const REDIS_BLOCK_TIMEOUT_MS = 5000;
const DEFAULT_CONSUMER_GROUP = 'datahub-consumers';

interface PendingEntry {
    streamKey: string;
    consumerGroup: string;
    consumerName: string;
    messageId: string;
    connectionIdentity: string;
    createdAt: number;
}

function parseStreamEntry(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let index = 0; index + 1 < fields.length; index += 2) {
        result[fields[index]] = fields[index + 1];
    }
    return result;
}

function createDeliveryTag(
    connectionIdentity: string,
    streamKey: string,
    groupName: string,
    streamId: string,
): string {
    return `redis:${connectionIdentity}:${streamKey}:${groupName}:${streamId}`;
}

function toConsumeResult(
    connectionIdentity: string,
    streamKey: string,
    groupName: string,
    streamId: string,
    fields: string[],
    redelivered: boolean,
    manual: boolean,
): ConsumeResult {
    const parsed = parseStreamEntry(fields);
    return {
        messageId: parsed.messageId ?? streamId,
        payload: parseJsonObject(parsed.payload),
        headers: parseStringRecord(parsed.headers),
        deliveryTag: manual
            ? createDeliveryTag(connectionIdentity, streamKey, groupName, streamId)
            : undefined,
        redelivered,
    };
}

export class RedisStreamsAdapter implements QueueAdapter {
    readonly code = 'redis-streams';
    readonly name = 'Redis Streams';
    readonly description =
        'Redis Streams for high-performance message queuing with consumer groups';

    private readonly clientPool: RedisClientPool;
    private readonly pendingEntries = new Map<string, PendingEntry>();
    private readonly autoClaimCursors = new Map<string, string>();
    private pendingEntryReservations = 0;
    private cleanupHandle?: ReturnType<typeof setInterval>;

    constructor(moduleLoader: typeof loadRedisModule = loadRedisModule) {
        this.clientPool = new RedisClientPool(moduleLoader);
    }

    startCleanup(): void {
        if (this.cleanupHandle) return;
        this.cleanupHandle = setInterval(() => {
            const now = Date.now();
            void this.clientPool.cleanupIdle(now);
            for (const [key, pending] of this.pendingEntries.entries()) {
                if (now - pending.createdAt > INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS) {
                    this.pendingEntries.delete(key);
                }
            }
        }, INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);
        this.cleanupHandle.unref?.();
    }

    async destroy(): Promise<void> {
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = undefined;
        }
        await this.clientPool.destroy();
        this.pendingEntries.clear();
        this.autoClaimCursors.clear();
        this.pendingEntryReservations = 0;
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const client = await this.clientPool.get(connectionConfig as RedisConnectionConfig);
        const streamKey = `stream:${queueName}`;
        const results: PublishResult[] = [];

        for (const message of messages) {
            try {
                const fields = [
                    'payload', JSON.stringify(message.payload),
                    'messageId', message.id,
                ];
                if (message.routingKey) fields.push('routingKey', message.routingKey);
                if (message.headers) fields.push('headers', JSON.stringify(message.headers));
                if (message.priority !== undefined) fields.push('priority', String(message.priority));
                await client.xadd(streamKey, '*', ...fields);
                results.push({ success: true, messageId: message.id });
            } catch (error) {
                results.push({
                    success: false,
                    messageId: message.id,
                    error: getErrorMessage(error),
                });
            }
        }
        return results;
    }

    async consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: QueueConsumeOptions,
    ): Promise<ConsumeResult[]> {
        this.startCleanup();
        const requestedCount = requirePositiveInteger(
            options.count,
            'Redis consume count',
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
        );
        const config = connectionConfig as RedisConnectionConfig;
        const client = await this.clientPool.get(config);
        const connectionIdentity = redisConnectionIdentity(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? DEFAULT_CONSUMER_GROUP;
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;
        await ensureRedisConsumerGroup(client, streamKey, groupName);

        const reservedCapacity = options.ackMode === AckMode.MANUAL
            ? this.reservePendingCapacity(requestedCount)
            : 0;
        if (options.ackMode === AckMode.MANUAL && reservedCapacity === 0) return [];
        const receiveCount = options.ackMode === AckMode.MANUAL
            ? reservedCapacity
            : requestedCount;

        try {
            const results = options.ackMode === AckMode.MANUAL
                ? await this.claimStaleMessagesWithinCapacity(
                    config,
                    queueName,
                    INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS,
                    receiveCount,
                )
                : [];
            const remaining = receiveCount - results.length;
            if (remaining === 0) return results;

            const response = await client.xreadgroup(
                'GROUP', groupName, consumerName,
                'COUNT', remaining,
                'BLOCK', REDIS_BLOCK_TIMEOUT_MS,
                'STREAMS', streamKey, '>',
            );
            const entries = (response ?? [])
                .flatMap(([, streamEntries]) => streamEntries)
                .slice(0, remaining);
            const autoAckIds: string[] = [];

            for (const [streamId, fields] of entries) {
                const result = toConsumeResult(
                    connectionIdentity,
                    streamKey,
                    groupName,
                    streamId,
                    fields,
                    false,
                    options.ackMode === AckMode.MANUAL,
                );
                if (options.ackMode === AckMode.AUTO) {
                    autoAckIds.push(streamId);
                } else if (result.deliveryTag) {
                    this.pendingEntries.set(result.deliveryTag, {
                        streamKey,
                        consumerGroup: groupName,
                        consumerName,
                        messageId: streamId,
                        connectionIdentity,
                        createdAt: Date.now(),
                    });
                }
                results.push(result);
            }
            if (autoAckIds.length > 0) {
                await client.xack(streamKey, groupName, ...autoAckIds);
            }
            return results;
        } finally {
            this.releasePendingCapacity(reservedCapacity);
        }
    }

    async ack(connectionConfig: QueueConnectionConfig, tag: string): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        await client.xack(pending.streamKey, pending.consumerGroup, pending.messageId);
        this.pendingEntries.delete(tag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        tag: string,
        requeue: boolean,
    ): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        if (requeue) {
            const claimed = await client.xclaim(
                pending.streamKey,
                pending.consumerGroup,
                pending.consumerName,
                0,
                pending.messageId,
                'IDLE',
                INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS + 1,
            );
            if (!claimed.some(([id]) => id === pending.messageId)) {
                throw new Error(`Redis pending message ${pending.messageId} is no longer available`);
            }
            this.autoClaimCursors.delete(
                `${pending.connectionIdentity}:${pending.streamKey}:${pending.consumerGroup}`,
            );
        } else {
            await client.xack(pending.streamKey, pending.consumerGroup, pending.messageId);
        }
        this.pendingEntries.delete(tag);
    }

    async renewLease(
        connectionConfig: QueueConnectionConfig,
        tag: string,
    ): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        const claimed = await client.xclaim(
            pending.streamKey,
            pending.consumerGroup,
            pending.consumerName,
            0,
            pending.messageId,
        );
        if (!claimed.some(([id]) => id === pending.messageId)) {
            throw new Error(`Redis pending message ${pending.messageId} is no longer available`);
        }
        pending.createdAt = Date.now();
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const client = await this.clientPool.get(
                connectionConfig as RedisConnectionConfig,
            );
            return await client.ping() === 'PONG';
        } catch {
            return false;
        }
    }

    async claimStaleMessages(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        minIdleMs: number,
        count: number,
    ): Promise<ConsumeResult[]> {
        requireNonNegativeInteger(minIdleMs, 'Redis minimum idle time');
        const requestedCount = requirePositiveInteger(
            count,
            'Redis claim count',
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
        );
        const reservedCapacity = this.reservePendingCapacity(requestedCount);
        if (reservedCapacity === 0) return [];
        try {
            return await this.claimStaleMessagesWithinCapacity(
                connectionConfig as RedisConnectionConfig,
                queueName,
                minIdleMs,
                reservedCapacity,
            );
        } finally {
            this.releasePendingCapacity(reservedCapacity);
        }
    }

    async trimStream(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        maxLen: number,
    ): Promise<number> {
        requirePositiveInteger(maxLen, 'Redis stream maximum length');
        const client = await this.clientPool.get(connectionConfig as RedisConnectionConfig);
        return client.xtrim(`stream:${queueName}`, 'MAXLEN', '~', maxLen);
    }

    private async claimStaleMessagesWithinCapacity(
        config: RedisConnectionConfig,
        queueName: string,
        minIdleMs: number,
        claimCount: number,
    ): Promise<ConsumeResult[]> {
        const client = await this.clientPool.get(config);
        const connectionIdentity = redisConnectionIdentity(config);
        const streamKey = `stream:${queueName}`;
        const groupName = config.consumerGroup ?? DEFAULT_CONSUMER_GROUP;
        const consumerName = config.consumerName ?? `consumer-${process.pid}`;
        await ensureRedisConsumerGroup(client, streamKey, groupName);
        const cursorKey = `${connectionIdentity}:${streamKey}:${groupName}`;
        const startCursor = this.autoClaimCursors.get(cursorKey) ?? '0-0';
        const [nextCursor, claimed] = await client.xautoclaim(
            streamKey,
            groupName,
            consumerName,
            minIdleMs,
            startCursor,
            'COUNT',
            claimCount,
        );
        if (nextCursor === '0-0') this.autoClaimCursors.delete(cursorKey);
        else this.autoClaimCursors.set(cursorKey, nextCursor);

        return claimed.slice(0, claimCount).map(([streamId, fields]) => {
            const result = toConsumeResult(
                connectionIdentity,
                streamKey,
                groupName,
                streamId,
                fields,
                true,
                true,
            );
            if (!result.deliveryTag) throw new Error('Redis delivery tag was not created');
            this.pendingEntries.set(result.deliveryTag, {
                streamKey,
                consumerGroup: groupName,
                consumerName,
                messageId: streamId,
                connectionIdentity,
                createdAt: Date.now(),
            });
            return result;
        });
    }

    private reservePendingCapacity(requested: number): number {
        const available = Math.max(
            0,
            QUEUE.MAX_PENDING_MESSAGES -
            this.pendingEntries.size -
            this.pendingEntryReservations,
        );
        const reserved = Math.min(requested, available);
        this.pendingEntryReservations += reserved;
        return reserved;
    }

    private releasePendingCapacity(reserved: number): void {
        this.pendingEntryReservations = Math.max(
            0,
            this.pendingEntryReservations - reserved,
        );
    }

    private requirePending(
        connectionConfig: QueueConnectionConfig,
        tag: string,
    ): { pending: PendingEntry; config: RedisConnectionConfig } {
        const pending = this.pendingEntries.get(tag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${tag}`);
        }
        const config = connectionConfig as RedisConnectionConfig;
        if (pending.connectionIdentity !== redisConnectionIdentity(config)) {
            throw new Error('Redis delivery tag belongs to a different connection');
        }
        return { pending, config };
    }
}

export const redisStreamsAdapter = new RedisStreamsAdapter();
