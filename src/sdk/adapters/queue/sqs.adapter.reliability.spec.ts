import { Logger } from '@nestjs/common';
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

function createModule(
    client: new (config: Record<string, unknown>) => {
        send(command: unknown): Promise<unknown>;
        destroy(): void;
    },
) {
    return {
        SQSClient: client,
        ReceiveMessageCommand,
        DeleteMessageCommand,
        SendMessageBatchCommand,
        ChangeMessageVisibilityCommand: OtherCommand,
        GetQueueUrlCommand: OtherCommand,
    };
}

const connectionConfig = {
    host: 'sqs.eu-central-1.amazonaws.com',
    port: 443,
    region: 'eu-central-1',
    queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
} as QueueConnectionConfig;

describe('SqsAdapter reliability', () => {
    it('correlates partial batch responses to every input in input order', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            return command instanceof SendMessageBatchCommand
                ? {
                    Successful: [{ Id: '1', MessageId: 'aws-message-2' }],
                    Failed: [{ Id: '0', Message: 'rejected' }],
                }
                : {};
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(
            async () => createModule(FakeSqsClient) as never,
        );

        try {
            await expect(adapter.publish(connectionConfig, 'orders', [
                { id: 'duplicate id!', payload: { index: 1 } },
                { id: 'duplicate id!', payload: { index: 2 } },
                { id: 'third', payload: { index: 3 } },
            ])).resolves.toEqual([
                { success: false, messageId: 'duplicate id!', error: 'rejected' },
                { success: true, messageId: 'duplicate id!', error: undefined },
                {
                    success: false,
                    messageId: 'third',
                    error: 'SQS did not return a result for this batch entry',
                },
            ]);
        } finally {
            await adapter.destroy();
        }

        const publish = commands.find(
            command => command instanceof SendMessageBatchCommand,
        ) as SendMessageBatchCommand;
        expect(publish.input.Entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ Id: '0' }),
            expect.objectContaining({ Id: '1' }),
            expect.objectContaining({ Id: '2' }),
        ]));
    });

    it('reserves manual receive capacity across concurrent long polls', async () => {
        let resolveReceive: ((value: unknown) => void) | undefined;
        const receive = new Promise<unknown>(resolve => {
            resolveReceive = resolve;
        });
        const send = vi.fn((command: unknown) => (
            command instanceof ReceiveMessageCommand ? receive : Promise.resolve({})
        ));
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(
            async () => createModule(FakeSqsClient) as never,
        );
        const originalLimit = QUEUE.MAX_PENDING_MESSAGES;
        Object.assign(QUEUE, { MAX_PENDING_MESSAGES: 1 });

        try {
            const first = adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            })).resolves.toEqual([]);
            expect(send).toHaveBeenCalledTimes(1);

            resolveReceive?.({
                Messages: [{
                    MessageId: 'message-1',
                    Body: '{}',
                    ReceiptHandle: 'receipt-1',
                }],
            });
            const [message] = await first;
            await adapter.ack(connectionConfig, message?.deliveryTag ?? '');
        } finally {
            Object.assign(QUEUE, { MAX_PENDING_MESSAGES: originalLimit });
            await adapter.destroy();
        }
    });

    it('rejects malformed receive responses before settling any message', async () => {
        const commands: unknown[] = [];
        const send = vi.fn(async (command: unknown) => {
            commands.push(command);
            return command instanceof ReceiveMessageCommand
                ? {
                    Messages: [{
                        MessageId: 'message-1',
                        Body: '{}',
                    }],
                }
                : {};
        });
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(
            async () => createModule(FakeSqsClient) as never,
        );
        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.AUTO,
            })).rejects.toThrow('SQS returned a message without ReceiptHandle');
        } finally {
            await adapter.destroy();
        }
        expect(commands.some(command => command instanceof DeleteMessageCommand)).toBe(false);
    });

    it('rejects invalid broker counts before issuing SQS requests', async () => {
        const send = vi.fn(async () => ({}));
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(
            async () => createModule(FakeSqsClient) as never,
        );
        try {
            await expect(adapter.consume(connectionConfig, 'orders', {
                count: Number.NaN,
                ackMode: AckMode.MANUAL,
            })).rejects.toThrow('SQS consume count must be a positive integer');
            expect(send).not.toHaveBeenCalled();
        } finally {
            await adapter.destroy();
        }
    });

    it('rejects per-message delays for FIFO queues before sending', async () => {
        const send = vi.fn(async () => ({}));
        class FakeSqsClient {
            readonly send = send;
            destroy(): void {}
        }
        const adapter = new SqsAdapter(
            async () => createModule(FakeSqsClient) as never,
        );
        const fifoConfig = {
            ...connectionConfig,
            queueUrl:
                'https://sqs.eu-central-1.amazonaws.com/123456789012/orders.fifo',
        } as QueueConnectionConfig;
        try {
            await expect(adapter.publish(fifoConfig, 'orders.fifo', [{
                id: 'message-1',
                payload: {},
                delayMs: 0,
            }])).resolves.toEqual([{
                success: false,
                messageId: 'message-1',
                error: 'SQS FIFO queues do not support per-message delays',
            }]);
            expect(send).not.toHaveBeenCalled();
        } finally {
            await adapter.destroy();
        }
    });

    it('destroys a client whose setup finishes during adapter shutdown', async () => {
        const destroy = vi.fn();
        class FakeSqsClient {
            send(): Promise<unknown> { return Promise.resolve({}); }
            readonly destroy = destroy;
        }
        const module = createModule(FakeSqsClient);
        let resolveModule: ((value: unknown) => void) | undefined;
        const modulePromise = new Promise<unknown>(resolve => {
            resolveModule = resolve;
        });
        const loader = vi.fn(() => modulePromise as never);
        const adapter = new SqsAdapter(loader);

        const connection = adapter.testConnection(connectionConfig);
        await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
        const destroyed = adapter.destroy();
        resolveModule?.(module);

        await expect(connection).resolves.toBe(false);
        await destroyed;
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('destroys a pinned handler when client module loading fails', async () => {
        const destroyHandler = vi.fn();
        const adapter = new SqsAdapter(
            async () => {
                throw new Error('module load failed');
            },
            async () => ({ destroy: destroyHandler }) as never,
        );

        try {
            await expect(adapter.publish({
                host: 'queue.partner.example',
                endpoint: 'https://queue.partner.example',
                accountId: '123456789012',
            } as QueueConnectionConfig, 'orders', []))
                .rejects.toThrow('module load failed');
            expect(destroyHandler).toHaveBeenCalledTimes(1);
        } finally {
            await adapter.destroy();
        }
    });

    it('reports a client close failure without failing shutdown', async () => {
        const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        class ThrowingDestroyClient {
            send(): Promise<unknown> { return Promise.resolve({}); }
            destroy(): void { throw new Error('close failed'); }
        }
        const adapter = new SqsAdapter(
            async () => createModule(ThrowingDestroyClient) as never,
        );

        try {
            await expect(adapter.testConnection(connectionConfig)).resolves.toBe(true);
            await expect(adapter.destroy()).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to close SQS client'),
            );
        } finally {
            warn.mockRestore();
        }
    });

    it('keeps settlement and client ownership isolated between instances', async () => {
        const firstDestroy = vi.fn();
        const firstSend = vi.fn(async (command: unknown) => (
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
        class FirstClient {
            readonly send = firstSend;
            readonly destroy = firstDestroy;
        }
        const secondDestroy = vi.fn();
        class SecondClient {
            send(): Promise<unknown> { return Promise.resolve({}); }
            readonly destroy = secondDestroy;
        }
        const first = new SqsAdapter(
            async () => createModule(FirstClient) as never,
        );
        const second = new SqsAdapter(
            async () => createModule(SecondClient) as never,
        );

        try {
            const [message] = await first.consume(connectionConfig, 'orders', {
                count: 1,
                ackMode: AckMode.MANUAL,
            });
            await expect(second.testConnection(connectionConfig)).resolves.toBe(true);
            await second.destroy();
            await expect(first.ack(connectionConfig, message?.deliveryTag ?? ''))
                .resolves.toBeUndefined();
            expect(firstDestroy).not.toHaveBeenCalled();
            expect(secondDestroy).toHaveBeenCalledTimes(1);
        } finally {
            await first.destroy();
        }
    });
});
