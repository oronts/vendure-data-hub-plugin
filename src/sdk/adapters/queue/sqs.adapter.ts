import { createHash, randomUUID } from 'node:crypto';
import { AckMode } from '../../../constants/enums';
import { INTERNAL_TIMINGS } from '../../../constants/defaults/core-defaults';
import { QUEUE } from '../../../constants/defaults/runtime-defaults';
import { TIME } from '../../../constants/time';
import type { AwsRequestHandlerFactory } from '../../../utils/aws-request-handler.utils';
import { getErrorMessage } from '../../../utils/error.utils';
import type {
    ConsumeResult,
    PublishResult,
    QueueAdapter,
    QueueConnectionConfig,
    QueueMessage,
} from './queue-adapter.interface';
import { parseJsonObject, requirePositiveInteger } from './queue-message.utils';
import {
    type SqsBatchEntry,
    SqsClientPool,
    type SqsConnectionConfig,
    buildSqsQueueUrl,
    loadSqsModule,
    sqsConnectionIdentity,
} from './sqs.client';

const SQS_TEST_CONNECTION_QUEUE = 'data-hub-test-connection';
const SQS_VISIBILITY_TIMEOUT_SECONDS = 300;
const SQS_LONG_POLL_SECONDS = 20;
const SQS_BATCH_SIZE = 10;
const SQS_MAX_DELAY_SECONDS = 900;
const SQS_MAX_FIFO_ID_LENGTH = 128;
const SQS_FIFO_ID_PATTERN = /^[\x21-\x7e]+$/;
const MISSING_BATCH_RESULT = 'SQS did not return a result for this batch entry';

interface PendingReceipt {
    queueUrl: string;
    receiptHandle: string;
    connectionIdentity: string;
    createdAt: number;
}

interface ReceivedMessage {
    MessageId?: string;
    Body?: string;
    ReceiptHandle?: string;
    MessageAttributes?: Record<string, { StringValue?: string }>;
    Attributes?: Record<string, string>;
}

interface PreparedBatchEntry {
    entry: SqsBatchEntry;
    message: QueueMessage;
    batchIndex: number;
}

function isFifoIdentifier(value: string): boolean {
    return value.length <= SQS_MAX_FIFO_ID_LENGTH && SQS_FIFO_ID_PATTERN.test(value);
}

function toDeduplicationId(messageId: string): string {
    return isFifoIdentifier(messageId)
        ? messageId
        : createHash('sha256').update(messageId).digest('hex');
}

function prepareBatchEntry(
    message: QueueMessage,
    batchIndex: number,
    isFifo: boolean,
): SqsBatchEntry {
    const body = JSON.stringify(message.payload);
    if (body === undefined) throw new Error('SQS message payload is not serializable');
    const entry: SqsBatchEntry = { Id: String(batchIndex), MessageBody: body };

    if (message.delayMs !== undefined) {
        if (!Number.isSafeInteger(message.delayMs) || message.delayMs < 0) {
            throw new Error('SQS message delay must be a non-negative integer');
        }
        const delaySeconds = Math.ceil(message.delayMs / TIME.SECOND);
        if (delaySeconds > SQS_MAX_DELAY_SECONDS) {
            throw new Error(`SQS message delay must not exceed ${SQS_MAX_DELAY_SECONDS} seconds`);
        }
        if (isFifo) {
            throw new Error('SQS FIFO queues do not support per-message delays');
        }
        entry.DelaySeconds = delaySeconds;
    }

    if (message.headers) {
        entry.MessageAttributes = Object.fromEntries(
            Object.entries(message.headers).map(([key, value]) => [key, {
                DataType: 'String',
                StringValue: value,
            }]),
        );
    }
    if (isFifo) {
        const groupId = message.routingKey ?? 'default';
        if (!isFifoIdentifier(groupId)) {
            throw new Error(
                `SQS FIFO message group ID must be 1-${SQS_MAX_FIFO_ID_LENGTH} printable ASCII characters`,
            );
        }
        entry.MessageGroupId = groupId;
        entry.MessageDeduplicationId = toDeduplicationId(message.id);
    }
    return entry;
}

function responseResults(
    response: {
        Successful?: Array<{ Id?: string }>;
        Failed?: Array<{ Id?: string; Message?: string }>;
    },
): Map<string, { success: boolean; error?: string }> {
    const results = new Map<string, { success: boolean; error?: string }>();
    for (const success of response.Successful ?? []) {
        if (success.Id !== undefined) results.set(success.Id, { success: true });
    }
    for (const failure of response.Failed ?? []) {
        if (failure.Id !== undefined) {
            results.set(failure.Id, {
                success: false,
                error: failure.Message ?? 'SQS rejected this batch entry',
            });
        }
    }
    return results;
}

function extractHeaders(message: ReceivedMessage): Record<string, string> | undefined {
    if (!message.MessageAttributes) return undefined;
    const headers = Object.entries(message.MessageAttributes).flatMap(
        ([key, attribute]) => attribute.StringValue === undefined
            ? []
            : [[key, attribute.StringValue] as const],
    );
    return headers.length > 0 ? Object.fromEntries(headers) : undefined;
}

export class SqsAdapter implements QueueAdapter {
    readonly code = 'sqs';
    readonly name = 'AWS SQS';
    readonly description = 'AWS Simple Queue Service adapter';

    private readonly clientPool: SqsClientPool;
    private readonly pendingReceipts = new Map<string, PendingReceipt>();
    private pendingReceiptReservations = 0;
    private cleanupHandle?: ReturnType<typeof setInterval>;

    constructor(
        private readonly moduleLoader: typeof loadSqsModule = loadSqsModule,
        requestHandlerFactory?: AwsRequestHandlerFactory,
    ) {
        this.clientPool = new SqsClientPool(moduleLoader, requestHandlerFactory);
    }

    startCleanup(): void {
        if (this.cleanupHandle) return;
        this.cleanupHandle = setInterval(() => {
            const now = Date.now();
            this.clientPool.cleanupIdle(now);
            for (const [key, pending] of this.pendingReceipts.entries()) {
                if (now - pending.createdAt > INTERNAL_TIMINGS.PENDING_MESSAGES_MAX_AGE_MS) {
                    this.pendingReceipts.delete(key);
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
        this.pendingReceipts.clear();
        this.pendingReceiptReservations = 0;
    }

    async publish(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        messages: QueueMessage[],
    ): Promise<PublishResult[]> {
        this.startCleanup();
        const config = connectionConfig as SqsConnectionConfig;
        const queueUrl = buildSqsQueueUrl(config, queueName);
        const client = await this.clientPool.get(config);
        const module = await this.moduleLoader();
        const isFifo = queueName.endsWith('.fifo') ||
            new URL(queueUrl).pathname.endsWith('.fifo');
        const results = new Array<PublishResult | undefined>(messages.length);

        for (let offset = 0; offset < messages.length; offset += SQS_BATCH_SIZE) {
            const batch = messages.slice(offset, offset + SQS_BATCH_SIZE);
            const prepared: PreparedBatchEntry[] = [];
            batch.forEach((message, batchIndex) => {
                try {
                    prepared.push({
                        entry: prepareBatchEntry(message, batchIndex, isFifo),
                        message,
                        batchIndex,
                    });
                } catch (error) {
                    results[offset + batchIndex] = {
                        success: false,
                        messageId: message.id,
                        error: getErrorMessage(error),
                    };
                }
            });
            if (prepared.length === 0) continue;

            try {
                const response = await client.send(new module.SendMessageBatchCommand({
                    QueueUrl: queueUrl,
                    Entries: prepared.map(item => item.entry),
                })) as {
                    Successful?: Array<{ Id?: string }>;
                    Failed?: Array<{ Id?: string; Message?: string }>;
                };
                const reported = responseResults(response);
                for (const item of prepared) {
                    const outcome = reported.get(item.entry.Id);
                    results[offset + item.batchIndex] = {
                        success: outcome?.success ?? false,
                        messageId: item.message.id,
                        error: outcome === undefined ? MISSING_BATCH_RESULT : outcome.error,
                    };
                }
            } catch (error) {
                for (const item of prepared) {
                    results[offset + item.batchIndex] = {
                        success: false,
                        messageId: item.message.id,
                        error: getErrorMessage(error),
                    };
                }
            }
        }

        return results.map((result, index) => result ?? ({
            success: false,
            messageId: messages[index].id,
            error: MISSING_BATCH_RESULT,
        }));
    }

    async consume(
        connectionConfig: QueueConnectionConfig,
        queueName: string,
        options: { count: number; ackMode: AckMode; prefetch?: number },
    ): Promise<ConsumeResult[]> {
        this.startCleanup();
        const requestedCount = requirePositiveInteger(
            options.count,
            'SQS consume count',
            QUEUE.MAX_MESSAGE_BATCH_SIZE,
        );
        const config = connectionConfig as SqsConnectionConfig;
        const queueUrl = buildSqsQueueUrl(config, queueName);
        const client = await this.clientPool.get(config);
        const connectionIdentity = sqsConnectionIdentity(config);
        const module = await this.moduleLoader();
        const reservedCapacity = options.ackMode === AckMode.MANUAL
            ? this.reservePendingCapacity(Math.min(SQS_BATCH_SIZE, requestedCount))
            : 0;
        if (options.ackMode === AckMode.MANUAL && reservedCapacity === 0) return [];
        const maxMessages = options.ackMode === AckMode.AUTO ? 1 : reservedCapacity;

        try {
            const response = await client.send(new module.ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: maxMessages,
                WaitTimeSeconds: SQS_LONG_POLL_SECONDS,
                VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
                MessageAttributeNames: ['All'],
                AttributeNames: ['All'],
            })) as { Messages?: ReceivedMessage[] };
            const messages = response.Messages ?? [];
            if (messages.length > maxMessages) {
                throw new Error('SQS returned more messages than requested');
            }
            for (const message of messages) {
                if (!message.MessageId?.trim()) {
                    throw new Error('SQS returned a message without MessageId');
                }
                if (!message.ReceiptHandle?.trim()) {
                    throw new Error('SQS returned a message without ReceiptHandle');
                }
                if (message.Body === undefined) {
                    throw new Error('SQS returned a message without Body');
                }
            }

            const results: ConsumeResult[] = [];
            for (const message of messages) {
                const messageId = message.MessageId!;
                const receiptHandle = message.ReceiptHandle!;
                let tag: string | undefined;
                if (options.ackMode === AckMode.AUTO) {
                    await client.send(new module.DeleteMessageCommand({
                        QueueUrl: queueUrl,
                        ReceiptHandle: receiptHandle,
                    }));
                } else {
                    tag = `sqs:${connectionIdentity}:${randomUUID()}`;
                    this.pendingReceipts.set(tag, {
                        queueUrl,
                        receiptHandle,
                        connectionIdentity,
                        createdAt: Date.now(),
                    });
                }
                const receiveCount = Number.parseInt(
                    message.Attributes?.ApproximateReceiveCount ?? '1',
                    10,
                );
                results.push({
                    messageId,
                    payload: parseJsonObject(message.Body),
                    headers: extractHeaders(message),
                    deliveryTag: tag,
                    redelivered: Number.isFinite(receiveCount) && receiveCount > 1,
                });
            }
            return results;
        } finally {
            this.releasePendingCapacity(reservedCapacity);
        }
    }

    async ack(connectionConfig: QueueConnectionConfig, tag: string): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        const module = await this.moduleLoader();
        await client.send(new module.DeleteMessageCommand({
            QueueUrl: pending.queueUrl,
            ReceiptHandle: pending.receiptHandle,
        }));
        this.pendingReceipts.delete(tag);
    }

    async nack(
        connectionConfig: QueueConnectionConfig,
        tag: string,
        requeue: boolean,
    ): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        const module = await this.moduleLoader();
        if (requeue) {
            await client.send(new module.ChangeMessageVisibilityCommand({
                QueueUrl: pending.queueUrl,
                ReceiptHandle: pending.receiptHandle,
                VisibilityTimeout: 0,
            }));
        } else {
            await client.send(new module.DeleteMessageCommand({
                QueueUrl: pending.queueUrl,
                ReceiptHandle: pending.receiptHandle,
            }));
        }
        this.pendingReceipts.delete(tag);
    }

    async renewLease(
        connectionConfig: QueueConnectionConfig,
        tag: string,
    ): Promise<void> {
        const { pending, config } = this.requirePending(connectionConfig, tag);
        const client = await this.clientPool.get(config);
        const module = await this.moduleLoader();
        await client.send(new module.ChangeMessageVisibilityCommand({
            QueueUrl: pending.queueUrl,
            ReceiptHandle: pending.receiptHandle,
            VisibilityTimeout: SQS_VISIBILITY_TIMEOUT_SECONDS,
        }));
        pending.createdAt = Date.now();
    }

    async testConnection(connectionConfig: QueueConnectionConfig): Promise<boolean> {
        this.startCleanup();
        try {
            const config = connectionConfig as SqsConnectionConfig;
            const client = await this.clientPool.get(config);
            const module = await this.moduleLoader();
            await client.send(new module.GetQueueUrlCommand({
                QueueName: SQS_TEST_CONNECTION_QUEUE,
            }));
            return true;
        } catch (error) {
            return error instanceof Error && error.name === 'QueueDoesNotExist';
        }
    }

    private reservePendingCapacity(requested: number): number {
        const available = Math.max(
            0,
            QUEUE.MAX_PENDING_MESSAGES -
            this.pendingReceipts.size -
            this.pendingReceiptReservations,
        );
        const reserved = Math.min(requested, available);
        this.pendingReceiptReservations += reserved;
        return reserved;
    }

    private releasePendingCapacity(reserved: number): void {
        this.pendingReceiptReservations = Math.max(
            0,
            this.pendingReceiptReservations - reserved,
        );
    }

    private requirePending(
        connectionConfig: QueueConnectionConfig,
        tag: string,
    ): { pending: PendingReceipt; config: SqsConnectionConfig } {
        const pending = this.pendingReceipts.get(tag);
        if (!pending) {
            throw new Error(`No pending message found for delivery tag: ${tag}`);
        }
        const config = connectionConfig as SqsConnectionConfig;
        if (pending.connectionIdentity !== sqsConnectionIdentity(config)) {
            throw new Error('SQS delivery tag belongs to a different connection');
        }
        return { pending, config };
    }
}

export const sqsAdapter = new SqsAdapter();
