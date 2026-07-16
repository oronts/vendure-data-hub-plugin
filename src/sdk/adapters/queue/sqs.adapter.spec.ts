import { describe, expect, it, vi } from 'vitest';
import { AckMode } from '../../../constants';
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

    it('uses a direct queueUrl without requiring accountId', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            return command instanceof SendMessageBatchCommand
                ? { Successful: [{ Id: 'message-1', MessageId: 'aws-message-1' }] }
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
            } as QueueConnectionConfig, 'ignored-name', [{
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

    it('constructs queue URLs from a custom endpoint only when accountId is available', async () => {
        const commands: unknown[] = [];
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
        const adapter = new SqsAdapter(async () => module as never);

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
});
