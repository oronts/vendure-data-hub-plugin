/**
 * AWS SQS Queue Adapter
 *
 * Production-ready AWS SQS adapter for message queue operations.
 * Features:
 * - Standard and FIFO queue support
 * - Message batching for efficient publishing
 * - Long polling for efficient consumption
 * - Proper message acknowledgment via deleteMessage
 * - Dead-letter queue support
 * - Automatic retry with exponential backoff
 */

import {
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
    PublishResult,
    ConsumeResult,
} from './queue-adapter.interface';
import { JsonObject } from '../../../types/index';
import { AckMode, INTERNAL_TIMINGS, TIME } from '../../../constants';
import { getErrorMessage } from '../../../utils/error.utils';
import { isBlockedHostname } from '../../../utils/url-security.utils';
import { createQueueConnectionIdentity } from './connection-identity';

/** Queue name used for SQS connection tests */
const SQS_TEST_CONNECTION_QUEUE = 'data-hub-test-connection';

/** Error message when SQS module fails to load (type narrowing guard) */
const SQS_MODULE_NOT_LOADED = 'SQS module not loaded';

/**
 * SQS-specific connection configuration
 */
interface SqsConnectionConfig extends QueueConnectionConfig {
    /** AWS region (e.g., 'us-east-1') */
    region?: string;
    /** AWS access key ID */
    accessKeyId?: string;
    /** AWS secret access key */
    secretAccessKey?: string;
    /** Optional endpoint URL for LocalStack or custom endpoints */
    endpoint?: string;
    /** Account ID for queue URL construction */
    accountId?: string;
    /** Direct queue URL; bypasses account-based URL construction */
    queueUrl?: string;
}

/**
 * SQS client types (from @aws-sdk/client-sqs)
 */
type SQSClient = {
    send(command: unknown): Promise<unknown>;
    destroy(): void;
};

type SendMessageBatchCommand = {
    new (input: {
        QueueUrl: string;
        Entries: Array<{
            Id: string;
            MessageBody: string;
            DelaySeconds?: number;
            MessageAttributes?: Record<string, { DataType: string; StringValue: string }>;
            MessageGroupId?: string;
            MessageDeduplicationId?: string;
        }>;
    }): unknown;
};

type ReceiveMessageCommand = {
    new (input: {
        QueueUrl: string;
        MaxNumberOfMessages?: number;
        WaitTimeSeconds?: number;
        VisibilityTimeout?: number;
        MessageAttributeNames?: string[];
        AttributeNames?: string[];
    }): unknown;
};

type DeleteMessageCommand = {
    new (input: {
        QueueUrl: string;
        ReceiptHandle: string;
    }): unknown;
};

type ChangeMessageVisibilityCommand = {
    new (input: {
        QueueUrl: string;
        ReceiptHandle: string;
        VisibilityTimeout: number;
    }): unknown;
};

type GetQueueUrlCommand = {
    new (input: {
        QueueName: string;
    }): unknown;
};

/**
 * Cache for SQS clients
 */
const MAX_CLIENTS = 100;
const clientCache = new Map<string, { client: SQSClient; lastUsed: number }>();

/**
 * Pending receipt handles for manual acknowledgment
 */
interface PendingReceipt {
    queueUrl: string;
    receiptHandle: string;
    connectionIdentity: string;
    createdAt: number;
}
const pendingReceipts = new Map<string, PendingReceipt>();

/**
 * Generate cache key for connection config
 */
function getCacheKey(config: SqsConnectionConfig): string {
    return createQueueConnectionIdentity('sqs', config);
}

/**
 * Build queue URL from config and queue name
 */
function buildQueueUrl(config: SqsConnectionConfig, queueName: string): string {
    if (config.queueUrl?.trim()) {
        return validateSqsUrl(config.queueUrl.trim(), 'queueUrl');
    }
    const accountId = config.accountId?.trim();
    if (!accountId) {
        throw new Error(
            'SQS accountId is required when queueUrl is not configured.',
        );
    }

    if (config.endpoint) {
        const endpoint = validateSqsUrl(config.endpoint, 'endpoint').replace(/\/+$/, '');
        return `${endpoint}/${encodeURIComponent(accountId)}/${encodeURIComponent(queueName)}`;
    }
    const region = config.region ?? 'us-east-1';
    return `https://sqs.${region}.amazonaws.com/${encodeURIComponent(accountId)}/${encodeURIComponent(queueName)}`;
}

function validateSqsUrl(value: string, field: 'endpoint' | 'queueUrl'): string {
    const normalizedValue = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(normalizedValue);
    } catch {
        throw new Error(`Invalid SQS ${field} URL: ${value}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`SQS ${field} must use http or https`);
    }
    if (isBlockedHostname(parsed.hostname)) {
        throw new Error(`SSRF protection: ${field} hostname '${parsed.hostname}' is blocked for security reasons`);
    }
    return normalizedValue;
}

/**
 * Dynamically loaded SQS module
 */
let sqsModule: {
    SQSClient: new (config: Record<string, unknown>) => SQSClient;
    SendMessageBatchCommand: SendMessageBatchCommand;
    ReceiveMessageCommand: ReceiveMessageCommand;
    DeleteMessageCommand: DeleteMessageCommand;
    ChangeMessageVisibilityCommand: ChangeMessageVisibilityCommand;
    GetQueueUrlCommand: GetQueueUrlCommand;
} | null = null;

/**
 * Load AWS SQS module dynamically
 */
async function loadSqsModule(): Promise<typeof sqsModule> {
    if (sqsModule) return sqsModule;

    try {
        // Dynamic import - @aws-sdk/client-sqs is an optional dependency
        const mod = await (Function('return import("@aws-sdk/client-sqs")')() as Promise<typeof sqsModule>);
        sqsModule = mod;
        return mod;
    } catch {
        throw new Error(
            'AWS SQS adapter requires @aws-sdk/client-sqs package. ' +
            'Install it with: npm install @aws-sdk/client-sqs'
        );
    }
}

/**
 * Get or create SQS client
 */
async function getClient(
    config: SqsConnectionConfig,
    moduleLoader: typeof loadSqsModule,
): Promise<SQSClient> {
    const key = getCacheKey(config);
    const cached = clientCache.get(key);

    if (cached) {
        cached.lastUsed = Date.now();
        return cached.client;
    }

    const sqs = await moduleLoader();
    if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);

    const clientConfig: Record<string, unknown> = {
        region: config.region ?? 'us-east-1',
    };
    if (config.queueUrl !== undefined) {
        validateSqsUrl(config.queueUrl, 'queueUrl');
    }

    if (Boolean(config.accessKeyId) !== Boolean(config.secretAccessKey)) {
        throw new Error('SQS accessKeyId and secretAccessKey must be configured together');
    }
    if (config.accessKeyId && config.secretAccessKey) {
        clientConfig.credentials = {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        };
    }

    if (config.endpoint) {
        clientConfig.endpoint = validateSqsUrl(config.endpoint, 'endpoint');
    }

    const client = new sqs.SQSClient(clientConfig) as unknown as SQSClient;

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
                stale.client.destroy();
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

export class SqsAdapter implements QueueAdapter {
    readonly code = 'sqs';
    readonly name = 'AWS SQS';
    readonly description = 'AWS Simple Queue Service adapter';

    private cleanupHandle?: ReturnType<typeof setInterval>;

    constructor(private readonly moduleLoader: typeof loadSqsModule = loadSqsModule) {}

    /**
     * Start the periodic cleanup interval for idle clients and stale pending receipts.
     * Called automatically on first use; safe to call multiple times.
     */
    startCleanup(): void {
        if (this.cleanupHandle) return;
        this.cleanupHandle = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of clientCache.entries()) {
                if (now - entry.lastUsed > INTERNAL_TIMINGS.CONNECTION_MAX_IDLE_MS) {
                    entry.client.destroy();
                    clientCache.delete(key);
                }
            }

            // Cleanup stale pending receipts
            for (const [key, pending] of pendingReceipts.entries()) {
                if (now - pending.createdAt > INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS) {
                    pendingReceipts.delete(key);
                }
            }
        }, INTERNAL_TIMINGS.CLEANUP_INTERVAL_MS);

        if (typeof this.cleanupHandle.unref === 'function') {
            this.cleanupHandle.unref();
        }
    }

    /**
     * Stop the periodic cleanup interval and destroy all cached clients.
     * Call during graceful shutdown to prevent the interval from keeping the process alive.
     */
    async destroy(): Promise<void> {
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = undefined;
        }

        for (const [key, entry] of clientCache.entries()) {
            try {
                entry.client.destroy();
            } catch {
                // Ignore destroy errors during shutdown
            }
            clientCache.delete(key);
        }
        pendingReceipts.clear();
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const config = connectionConfig as SqsConnectionConfig;
        const queueUrl = buildQueueUrl(config, queueName);
        const client = await getClient(config, this.moduleLoader);
        const isFifo = queueName.endsWith('.fifo') || new URL(queueUrl).pathname.endsWith('.fifo');

        const sqs = await this.moduleLoader();
        if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);
        const SendCmd = sqs.SendMessageBatchCommand;

        const results: PublishResult[] = [];

        // SQS allows max 10 messages per batch
        const batchSize = 10;
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);

            const entries = batch.map((msg) => {
                const entry: {
                    Id: string;
                    MessageBody: string;
                    DelaySeconds?: number;
                    MessageAttributes?: Record<string, { DataType: string; StringValue: string }>;
                    MessageGroupId?: string;
                    MessageDeduplicationId?: string;
                } = {
                    Id: msg.id,
                    MessageBody: JSON.stringify(msg.payload),
                };

                // Delay (0-900 seconds)
                if (msg.delayMs) {
                    entry.DelaySeconds = Math.min(900, Math.floor(msg.delayMs / TIME.SECOND));
                }

                // Message attributes for headers
                if (msg.headers) {
                    entry.MessageAttributes = {};
                    for (const [key, value] of Object.entries(msg.headers)) {
                        entry.MessageAttributes[key] = {
                            DataType: 'String',
                            StringValue: value,
                        };
                    }
                }

                // FIFO queue requirements
                if (isFifo) {
                    entry.MessageGroupId = msg.routingKey ?? 'default';
                    entry.MessageDeduplicationId = msg.id;
                }

                return entry;
            });

            try {
                const response = await client.send(new SendCmd({
                    QueueUrl: queueUrl,
                    Entries: entries,
                })) as { Successful?: Array<{ Id: string; MessageId: string }>; Failed?: Array<{ Id: string; Message: string }> };

                // Process successful messages
                for (const success of response.Successful ?? []) {
                    results.push({
                        success: true,
                        messageId: success.Id,
                    });
                }

                // Process failed messages
                for (const failure of response.Failed ?? []) {
                    results.push({
                        success: false,
                        messageId: failure.Id,
                        error: failure.Message,
                    });
                }
            } catch (error) {
                // All messages in batch failed
                for (const msg of batch) {
                    results.push({
                        success: false,
                        messageId: msg.id,
                        error: getErrorMessage(error),
                    });
                }
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
        const config = connectionConfig as SqsConnectionConfig;
        const queueUrl = buildQueueUrl(config, queueName);
        const client = await getClient(config, this.moduleLoader);
        const connectionIdentity = getCacheKey(config);

        const sqs = await this.moduleLoader();
        if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);
        const ReceiveCmd = sqs.ReceiveMessageCommand;
        const DeleteCmd = sqs.DeleteMessageCommand;

        // AUTO uses one delivery so a later delete failure cannot discard an acknowledged batch.
        const maxMessages = options.ackMode === AckMode.AUTO
            ? 1
            : Math.min(10, options.count);

        const response = await client.send(new ReceiveCmd({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: maxMessages,
            WaitTimeSeconds: 20, // Long polling
            VisibilityTimeout: 300, // 5 minutes
            MessageAttributeNames: ['All'],
            AttributeNames: ['All'],
        })) as { Messages?: Array<{
            MessageId?: string;
            Body?: string;
            ReceiptHandle?: string;
            MessageAttributes?: Record<string, { StringValue?: string }>;
            Attributes?: Record<string, string>;
        }> };

        const results: ConsumeResult[] = [];

        for (const msg of response.Messages ?? []) {
            let payload: JsonObject;
            try {
                payload = JSON.parse(msg.Body ?? '{}');
            } catch {
                payload = { rawPayload: msg.Body ?? '' };
            }

            const messageId = msg.MessageId ?? crypto.randomUUID();
            const receiptHandle = msg.ReceiptHandle ?? '';
            const now = Date.now();

            if (options.ackMode === AckMode.AUTO) {
                await client.send(new DeleteCmd({
                    QueueUrl: queueUrl,
                    ReceiptHandle: receiptHandle,
                }));
            } else {
                // Evict oldest pending receipt if at capacity
                const maxPending = INTERNAL_TIMINGS.MAX_PENDING_MESSAGES ?? 10_000;
                if (pendingReceipts.size >= maxPending) {
                    let oldestKey: string | null = null;
                    let oldestTime = Infinity;
                    for (const [key, entry] of pendingReceipts.entries()) {
                        if (entry.createdAt < oldestTime) {
                            oldestTime = entry.createdAt;
                            oldestKey = key;
                        }
                    }
                    if (oldestKey) {
                        pendingReceipts.delete(oldestKey);
                    }
                }

                // Manual ack: store receipt handle
                const deliveryTag = `sqs:${connectionIdentity}:${messageId}:${now}`;
                pendingReceipts.set(deliveryTag, {
                    queueUrl,
                    receiptHandle,
                    connectionIdentity,
                    createdAt: now,
                });
            }

            // Extract headers from message attributes
            const headers: Record<string, string> = {};
            if (msg.MessageAttributes) {
                for (const [key, attr] of Object.entries(msg.MessageAttributes)) {
                    if (attr.StringValue) {
                        headers[key] = attr.StringValue;
                    }
                }
            }

            results.push({
                messageId,
                payload,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
                deliveryTag: options.ackMode === AckMode.MANUAL
                    ? `sqs:${connectionIdentity}:${messageId}:${now}`
                    : undefined,
                redelivered: parseInt(msg.Attributes?.ApproximateReceiveCount ?? '1', 10) > 1,
            });
        }

        return results;
    }

    async ack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
    ): Promise<void> {
        const pending = pendingReceipts.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        const config = connectionConfig as SqsConnectionConfig;
        if (pending.connectionIdentity !== getCacheKey(config)) {
            throw new Error('SQS delivery tag belongs to a different connection');
        }
        const client = await getClient(config, this.moduleLoader);

        const sqs = await this.moduleLoader();
        if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);

        await client.send(new sqs.DeleteMessageCommand({
            QueueUrl: pending.queueUrl,
            ReceiptHandle: pending.receiptHandle,
        }));

        pendingReceipts.delete(deliveryTag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        deliveryTag: string,
        requeue: boolean,
    ): Promise<void> {
        const pending = pendingReceipts.get(deliveryTag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${deliveryTag}`);
        }

        const config = connectionConfig as SqsConnectionConfig;
        if (pending.connectionIdentity !== getCacheKey(config)) {
            throw new Error('SQS delivery tag belongs to a different connection');
        }
        const client = await getClient(config, this.moduleLoader);

        const sqs = await this.moduleLoader();
        if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);

        if (requeue) {
            // Set visibility timeout to 0 to make message immediately available
            await client.send(new sqs.ChangeMessageVisibilityCommand({
                QueueUrl: pending.queueUrl,
                ReceiptHandle: pending.receiptHandle,
                VisibilityTimeout: 0,
            }));
        } else {
            // Delete the message (it won't be requeued)
            await client.send(new sqs.DeleteMessageCommand({
                QueueUrl: pending.queueUrl,
                ReceiptHandle: pending.receiptHandle,
            }));
        }

        pendingReceipts.delete(deliveryTag);
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const config = connectionConfig as SqsConnectionConfig;
            const client = await getClient(config, this.moduleLoader);

            // Try to get queue URL as a connection test
            const sqs = await this.moduleLoader();
            if (!sqs) throw new Error(SQS_MODULE_NOT_LOADED);

            await client.send(new sqs.GetQueueUrlCommand({
                QueueName: SQS_TEST_CONNECTION_QUEUE,
            }));

            return true;
        } catch (error) {
            // Queue not found is OK - means connection works
            if ((error as Error).name === 'QueueDoesNotExist') {
                return true;
            }
            return false;
        }
    }
}

export const sqsAdapter = new SqsAdapter();
