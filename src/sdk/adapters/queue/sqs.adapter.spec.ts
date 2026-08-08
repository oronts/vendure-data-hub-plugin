import { describe, expect, it, vi } from 'vitest';
import { AckMode, QUEUE } from '../../../constants';
import type { QueueConnectionConfig } from './queue-adapter.interface';
import { SqsAdapter } from './sqs.adapter';

class ReceiveMessageCommand {
    constructor(readonly input: Record<string, unknown>) {}
}

class DeleteMessageCommand {
    constructor(readonly input: Record<string, unknown>) {}
}

class SendMessageBatchCommand {
    constructor(readonly input: Record<string, unknown>) {}
}

class OtherCommand {
    constructor(readonly input: Record<string, unknown>) {}
}

describe('SqsAdapter AUTO acknowledgment', () => {
    it('surfaces DeleteMessage failure and limits AUTO receives to one delivery', async () => {
        const commands: unknown[] = [];
        const deleteError = new Error('SQS delete failed');
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            if (command instanceof ReceiveMessageCommand) {
                return {
                    Messages: [{
                        MessageId: 'message-1',
                        Body: '{"orderId":"order-1"}',
                        ReceiptHandle: 'receipt-1',
                    }],
                };
            }
            if (command instanceof DeleteMessageCommand) {
                throw deleteError;
            }
            return {};
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);
        const connectionConfig = {
            host: 'sqs.eu-central-1.amazonaws.com',
            port: 443,
            region: 'eu-central-1',
            accountId: '123456789012',
            accessKeyId: 'auto-delete-failure-test',
            secretAccessKey: 'auto-delete-failure-secret',
        } as QueueConnectionConfig;

        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 10,
                ackMode: AckMode.AUTO,
            })).rejects.toBe(deleteError);
        } finally {
            await adapter.destroy();
        }

        const receive = commands.find(
            command => command instanceof ReceiveMessageCommand,
        ) as ReceiveMessageCommand;
        expect(receive.input.MaxNumberOfMessages).toBe(1);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('uses a direct queueUrl when its final path segment matches the requested queue', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            return command instanceof SendMessageBatchCommand
                ? { Successful: [{ Id: '0', MessageId: 'aws-message-1' }] }
                : {};
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);
        const queueUrl = 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders';

        try {
            await expect(adapter.publish({
                host: 'sqs.eu-central-1.amazonaws.com',
                port: 443,
                region: 'eu-central-1',
                queueUrl,
            } as QueueConnectionConfig, 'orders', [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }])).resolves.toEqual([{ success: true, messageId: 'message-1' }]);
        } finally {
            await adapter.destroy();
        }

        const publish = commands.find(
            command => command instanceof SendMessageBatchCommand,
        ) as SendMessageBatchCommand;
        expect(publish.input.QueueUrl).toBe(queueUrl);
    });

    it('rejects a direct queueUrl mismatch when accountId is unavailable', async () => {
        const send = vi.fn(async () => ({
            Successful: [{ Id: 'message-1', MessageId: 'aws-message-1' }],
        }));
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);

        try {
            await expect(adapter.publish({
                host: 'sqs.eu-central-1.amazonaws.com',
                port: 443,
                region: 'eu-central-1',
                queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
            } as QueueConnectionConfig, 'orders.dlq', [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }])).rejects.toThrow(
                "SQS queueUrl does not target requested queue 'orders.dlq'; " +
                'accountId is required to construct a distinct queue URL.',
            );
        } finally {
            await adapter.destroy();
        }

        expect(send).not.toHaveBeenCalled();
    });

    it('routes a distinct dead-letter queue by accountId instead of reusing queueUrl', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            return { Successful: [{ Id: '0', MessageId: 'aws-message-1' }] };
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);

        try {
            await expect(adapter.publish({
                host: 'sqs.eu-central-1.amazonaws.com',
                port: 443,
                region: 'eu-central-1',
                accountId: '123456789012',
                queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
            } as QueueConnectionConfig, 'orders.dlq', [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }])).resolves.toEqual([{ success: true, messageId: 'message-1' }]);
        } finally {
            await adapter.destroy();
        }

        const publish = commands.find(
            command => command instanceof SendMessageBatchCommand,
        ) as SendMessageBatchCommand;
        expect(publish.input.QueueUrl).toBe(
            'https://sqs.eu-central-1.amazonaws.com/123456789012/orders.dlq',
        );
    });

    it('constructs queue URLs from a custom endpoint only when accountId is available', async () => {
        const commands: unknown[] = [];
        const requestHandler = { destroy: vi.fn() };
        const requestHandlerFactory = vi.fn(async () => requestHandler as never);
        class FakeSqsClient {
            send(command: unknown): Promise<unknown> {
                commands.push(command);
                return Promise.resolve({ Successful: [] });
            }
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(
            async () => module as never,
            requestHandlerFactory,
        );

        try {
            await adapter.publish({
                host: 'sqs-compatible.example.com',
                port: 443,
                region: 'eu-central-1',
                endpoint: 'https://sqs-compatible.example.com/root/',
                accountId: '123456789012',
            } as QueueConnectionConfig, 'orders.fifo', [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }]);
            await expect(adapter.publish({
                host: 'sqs-compatible.example.com',
                port: 443,
                region: 'eu-central-1',
                endpoint: 'https://sqs-compatible.example.com',
            } as QueueConnectionConfig, 'orders', []))
                .rejects.toThrow('accountId is required when queueUrl is not configured');
        } finally {
            await adapter.destroy();
        }

        const publish = commands.find(
            command => command instanceof SendMessageBatchCommand,
        ) as SendMessageBatchCommand;
        expect(publish.input.QueueUrl).toBe(
            'https://sqs-compatible.example.com/root/123456789012/orders.fifo',
        );
        expect(requestHandlerFactory).toHaveBeenCalledWith(
            'https://sqs-compatible.example.com/root/',
        );
    });

    it('pins a custom direct queue URL origin', async () => {
        const requestHandlerFactory = vi.fn(async () => ({ destroy: vi.fn() }) as never);
        class FakeSqsClient {
            send(command: unknown): Promise<unknown> {
                return Promise.resolve(
                    command instanceof SendMessageBatchCommand
                        ? { Successful: [{ Id: '0' }] }
                        : {},
                );
            }
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(
            async () => module as never,
            requestHandlerFactory,
        );

        try {
            await expect(adapter.publish({
                host: 'queue.partner.example',
                region: 'eu-central-1',
                queueUrl: 'https://queue.partner.example/root/orders',
            } as QueueConnectionConfig, 'orders', [{
                id: 'message-1',
                payload: { orderId: 'order-1' },
            }])).resolves.toEqual([{ success: true, messageId: 'message-1' }]);
        } finally {
            await adapter.destroy();
        }

        expect(requestHandlerFactory).toHaveBeenCalledWith(
            'https://queue.partner.example',
        );
    });

    it('rejects credentials embedded in a queue URL', async () => {
        class FakeSqsClient {
            send(): Promise<unknown> { return Promise.resolve({}); }
            destroy(): void {}
        }
        const adapter = new SqsAdapter(async () => ({
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        }) as never);

        try {
            await expect(adapter.publish({
                host: 'sqs.eu-central-1.amazonaws.com',
                region: 'eu-central-1',
                queueUrl:
                    'https://access-key:secret@sqs.eu-central-1.amazonaws.com/123456789012/orders',
            } as QueueConnectionConfig, 'orders', []))
                .rejects.toThrow('SQS queueUrl must not contain URL credentials');
        } finally {
            await adapter.destroy();
        }
    });

    it('does not reuse clients across different credentials', async () => {
        const clients: Array<Record<string, unknown>> = [];
        class FakeSqsClient {
            constructor(config: Record<string, unknown>) {
                clients.push(config);
            }
            send(): Promise<unknown> { return Promise.resolve({ Successful: [] }); }
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);
        const base = {
            host: 'sqs.eu-central-1.amazonaws.com',
            port: 443,
            region: 'eu-central-1',
            queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
            accessKeyId: 'access-key',
        };

        try {
            await adapter.publish({
                ...base,
                secretAccessKey: 'first-secret',
            } as QueueConnectionConfig, 'orders', []);
            await adapter.publish({
                ...base,
                secretAccessKey: 'second-secret',
            } as QueueConnectionConfig, 'orders', []);
            expect(clients).toHaveLength(2);
        } finally {
            await adapter.destroy();
        }
    });

    it('extends SQS visibility while a manually acknowledged run remains active', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            if (command instanceof ReceiveMessageCommand) {
                return {
                    Messages: [{
                        MessageId: 'message-1',
                        Body: '{"orderId":"order-1"}',
                        ReceiptHandle: 'receipt-1',
                    }],
                };
            }
            return {};
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const module = {
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        };
        const adapter = new SqsAdapter(async () => module as never);
        const connectionConfig = {
            host: 'sqs.eu-central-1.amazonaws.com',
            port: 443,
            region: 'eu-central-1',
            queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
        } as QueueConnectionConfig;

        try {
            const [message] = await adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            await expect(adapter.renewLease(connectionConfig, message?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
        } finally {
            await adapter.destroy();
        }

        const renewal = commands.find(command =>
            command instanceof OtherCommand &&
            command.input.VisibilityTimeout !== undefined,
        ) as OtherCommand;
        expect(renewal.input).toEqual({
            QueueUrl: connectionConfig.queueUrl,
            ReceiptHandle: 'receipt-1',
            VisibilityTimeout: 300,
        });
    });

    it('stops receiving instead of evicting a live settlement at capacity', async () => {
        const send = vi.fn(async (command: unknown) => (
            command instanceof ReceiveMessageCommand
                ? {
                    Messages: [{
                        MessageId: 'message-1',
                        Body: '{}',
                        ReceiptHandle: 'receipt-1',
                    }],
                }
                : {}
        ));
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(async () => ({
            SQSClient: FakeSqsClient,
            ReceiveMessageCommand,
            DeleteMessageCommand,
            SendMessageBatchCommand,
            ChangeMessageVisibilityCommand: OtherCommand,
            GetQueueUrlCommand: OtherCommand,
        }) as never);
        const connectionConfig = {
            host: 'sqs.eu-central-1.amazonaws.com',
            port: 443,
            region: 'eu-central-1',
            queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
        } as QueueConnectionConfig;
        const originalLimit = QUEUE.MAX_PENDING_MESSAGES;
        Object.assign(QUEUE, { MAX_PENDING_MESSAGES: 1 });

        try {
            const [message] = await adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([]);
            await expect(adapter.ack(connectionConfig, message?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
        } finally {
            Object.assign(QUEUE, { MAX_PENDING_MESSAGES: originalLimit });
            await adapter.destroy();
        }

        expect(send.mock.calls.filter(([command]) =>
            command instanceof ReceiveMessageCommand)).toHaveLength(1);
    });

});
