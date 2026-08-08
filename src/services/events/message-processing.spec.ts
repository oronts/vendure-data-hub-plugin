import { describe, expect, it, vi } from 'vitest';
import { AckMode, QUEUE, RunStatus } from '../../constants';
import { queueAdapterRegistry } from '../../sdk/adapters/queue';
import type { QueueAdapter, QueueConnectionConfig } from '../../sdk/adapters/queue';
import type { DataHubLogger } from '../logger';
import type { MessageConsumerConfig } from './consumer-discovery';
import type { ActiveConsumer } from './consumer-lifecycle';
import { MessageProcessing } from './message-processing';
import { QueueRunWaitTimeoutError } from './message-run-waiter';
import { PipelineRevisionMismatchError } from '../pipeline/pipeline-policy';

function createConfig(overrides: Partial<MessageConsumerConfig> = {}): MessageConsumerConfig {
    return {
        pipelineId: 1,
        pipelineCode: 'orders',
        revisionId: 7,
        triggerKey: 'queue',
        queueType: 'internal',
        connectionCode: '',
        queueName: 'orders',
        batchSize: 1,
        concurrency: 1,
        ackMode: AckMode.MANUAL,
        maxRetries: 2,
        pollIntervalMs: 1_000,
        autoStart: true,
        ...overrides,
    };
}

function createConsumer(overrides: Partial<MessageConsumerConfig> = {}): ActiveConsumer {
    return {
        config: createConfig(overrides),
        running: true,
        messagesProcessed: 0,
        messagesFailed: 0,
        startedAt: new Date(),
        inFlightCount: 0,
    };
}

function createLogger(): DataHubLogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as DataHubLogger;
}

function createAdapter(overrides: Partial<QueueAdapter> = {}): QueueAdapter {
    return {
        code: 'test',
        name: 'Test',
        description: 'Test adapter',
        publish: vi.fn().mockResolvedValue([]),
        consume: vi.fn().mockResolvedValue([]),
        ack: vi.fn().mockResolvedValue(undefined),
        nack: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn().mockResolvedValue(true),
        destroy: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createProcessor(
    startIdempotentRunWithSeed: ReturnType<typeof vi.fn>,
    logger = createLogger(),
    publishTriggerFired: () => unknown = vi.fn(),
    runById: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
        status: RunStatus.COMPLETED,
        error: null,
    }),
    queueRunWaiter?: ConstructorParameters<typeof MessageProcessing>[6],
) {
    const processor = new MessageProcessing(
        { create: vi.fn().mockResolvedValue({}) } as never,
        { startIdempotentRunWithSeed, runById } as never,
        {} as never,
        {} as never,
        logger,
        { publishTriggerFired } as never,
        queueRunWaiter,
    );
    return { processor, logger, runById };
}

type ProcessingInternals = {
    processDelivery(
        consumer: ActiveConsumer,
        adapter: QueueAdapter,
        connectionConfig: QueueConnectionConfig,
        message: { messageId: string; payload: Record<string, unknown>; deliveryTag?: string },
    ): Promise<void>;
    pollMessages(consumer: ActiveConsumer): Promise<void>;
};

describe('MessageProcessing reliability', () => {
    it('requeues without retry or DLQ when the published revision changes', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockRejectedValue(
            new PipelineRevisionMismatchError(7, 8),
        );
        const nack = vi.fn().mockResolvedValue(undefined);
        const publish = vi.fn();
        const adapter = createAdapter({ nack, publish });
        const consumer = createConsumer({
            maxRetries: 3,
            deadLetterQueue: 'orders.dlq',
        });
        const { processor } = createProcessor(startIdempotentRunWithSeed);

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(consumer.running).toBe(false);
        expect(startIdempotentRunWithSeed).toHaveBeenCalledOnce();
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(publish).not.toHaveBeenCalled();
        expect(consumer.messagesFailed).toBe(0);
    });

    it('honors enqueue retries and acknowledges only after a successful terminal run', async () => {
        const startIdempotentRunWithSeed = vi.fn()
            .mockRejectedValueOnce(new Error('first'))
            .mockRejectedValueOnce(new Error('second'))
            .mockResolvedValue({
                run: { id: 'run-1', pipelineId: 1 },
                duplicate: false,
            });
        const ack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ ack });
        const consumer = createConsumer({ maxRetries: 2 });
        const { processor, runById } = createProcessor(startIdempotentRunWithSeed);

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(startIdempotentRunWithSeed).toHaveBeenCalledTimes(3);
        expect(runById).toHaveBeenCalledWith(expect.anything(), 'run-1');
        expect(ack).toHaveBeenCalledOnce();
        expect(runById.mock.invocationCallOrder[0]).toBeLessThan(ack.mock.invocationCallOrder[0]);
        expect(consumer.messagesProcessed).toBe(1);
        expect(consumer.messagesFailed).toBe(0);
    });

    it('does not retry an enqueued run when trigger event publication fails', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const publishTriggerFired = vi.fn(() => {
            throw new Error('event publication failed');
        });
        const ack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ ack });
        const consumer = createConsumer();
        const { processor, logger } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            publishTriggerFired,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(startIdempotentRunWithSeed).toHaveBeenCalledOnce();
        expect(ack).toHaveBeenCalledOnce();
        expect(logger.warn).toHaveBeenCalledWith(
            'Pipeline run was enqueued but trigger event publication failed',
            expect.objectContaining({ messageId: 'message-1' }),
        );
    });

    it('renews a built-in delivery lease and keeps observing the same active run', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const queueRunWaiter = vi.fn()
            .mockRejectedValueOnce(new QueueRunWaitTimeoutError('run-1', 10))
            .mockResolvedValueOnce(undefined);
        const renewLease = vi.fn().mockResolvedValue(undefined);
        const ack = vi.fn().mockResolvedValue(undefined);
        const nack = vi.fn();
        const adapter = createAdapter({ renewLease, ack, nack });
        const { processor, logger } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            vi.fn(),
            vi.fn(),
            queueRunWaiter,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            createConsumer(),
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(queueRunWaiter).toHaveBeenCalledTimes(2);
        expect(renewLease).toHaveBeenCalledTimes(3);
        expect(renewLease).toHaveBeenCalledWith(expect.anything(), 'delivery-1');
        expect(renewLease.mock.invocationCallOrder[0])
            .toBeLessThan(startIdempotentRunWithSeed.mock.invocationCallOrder[0]);
        expect(startIdempotentRunWithSeed.mock.invocationCallOrder[0])
            .toBeLessThan(renewLease.mock.invocationCallOrder[1]);
        expect(nack).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledOnce();
        expect(logger.debug).toHaveBeenCalledWith(
            'Renewed active queue delivery lease',
            expect.objectContaining({ runId: 'run-1' }),
        );
    });

    it('requeues an active run when the adapter cannot renew its delivery lease', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const queueRunWaiter = vi.fn()
            .mockRejectedValueOnce(new QueueRunWaitTimeoutError('run-1', 10));
        const ack = vi.fn().mockResolvedValue(undefined);
        const nack = vi.fn();
        const publish = vi.fn();
        const adapter = createAdapter({ ack, nack, publish });
        const { processor, logger } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            vi.fn(),
            vi.fn(),
            queueRunWaiter,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            createConsumer(),
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(queueRunWaiter).toHaveBeenCalledOnce();
        expect(publish).not.toHaveBeenCalled();
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(ack).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            'Queue-triggered pipeline run remains active; delivery was requeued',
            expect.objectContaining({ runId: 'run-1' }),
        );
    });

    it('requeues an active run when delivery lease renewal fails', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const queueRunWaiter = vi.fn()
            .mockRejectedValueOnce(new QueueRunWaitTimeoutError('run-1', 10));
        const renewalError = new Error('lease unavailable');
        const renewLease = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(renewalError);
        const nack = vi.fn().mockResolvedValue(undefined);
        const publish = vi.fn();
        const adapter = createAdapter({ renewLease, nack, publish });
        const { processor, logger } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            vi.fn(),
            vi.fn(),
            queueRunWaiter,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            createConsumer(),
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(publish).not.toHaveBeenCalled();
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(logger.error).toHaveBeenCalledWith(
            'Failed to renew active queue delivery lease',
            renewalError,
            expect.objectContaining({ runId: 'run-1' }),
        );
    });

    it('releases the delivery when ownership is lost during renewal failure', async () => {
        const consumer = createConsumer();
        const renewalError = new Error('lease unavailable');
        const renewLease = vi.fn().mockImplementation(async () => {
            consumer.running = false;
            throw renewalError;
        });
        const nack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ renewLease, nack });
        const { processor } = createProcessor(vi.fn());

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
    });

    it('requeues the original when a resolved DLQ publish result reports failure', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        const publish = vi.fn().mockResolvedValue([{
            success: false,
            messageId: 'message-1',
            error: 'not routed',
        }]);
        const nack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ publish, nack });
        const consumer = createConsumer({ maxRetries: 1, deadLetterQueue: 'orders.dlq' });
        const { processor, logger } = createProcessor(startIdempotentRunWithSeed);

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(startIdempotentRunWithSeed).toHaveBeenCalledTimes(2);
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(logger.info).not.toHaveBeenCalledWith(
            'Routed message to DLQ',
            expect.anything(),
        );
    });

    it('rejects the original without requeue only after confirmed DLQ delivery', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        const publish = vi.fn().mockResolvedValue([{
            success: true,
            messageId: 'message-1',
        }]);
        const nack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ publish, nack });
        const consumer = createConsumer({ maxRetries: 0, deadLetterQueue: 'orders.dlq' });
        const { processor } = createProcessor(startIdempotentRunWithSeed);

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(startIdempotentRunWithSeed).toHaveBeenCalledOnce();
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', false);
    });

    it('does not route an already-enqueued message to the DLQ when acknowledgment fails', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const publish = vi.fn();
        const ackError = new Error('ack failed');
        const adapter = createAdapter({
            ack: vi.fn().mockRejectedValue(ackError),
            publish,
        });
        const consumer = createConsumer({ deadLetterQueue: 'orders.dlq' });
        const { processor } = createProcessor(startIdempotentRunWithSeed);

        await expect(
            (processor as unknown as ProcessingInternals).processDelivery(
                consumer,
                adapter,
                {} as QueueConnectionConfig,
                { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
            ),
        ).rejects.toThrow('ack failed');

        expect(publish).not.toHaveBeenCalled();
        expect(consumer.messagesProcessed).toBe(0);
        expect(consumer.messagesFailed).toBe(1);
    });

    it.each([RunStatus.FAILED, RunStatus.TIMEOUT, RunStatus.CANCELLED])(
        'dead-letters and rejects a message when its run reaches %s',
        async status => {
            const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
                run: { id: 'run-1', pipelineId: 1 },
                duplicate: false,
            });
            const runById = vi.fn().mockResolvedValue({ status, error: 'run stopped' });
            const ack = vi.fn();
            const nack = vi.fn().mockResolvedValue(undefined);
            const publish = vi.fn().mockResolvedValue([{
                success: true,
                messageId: 'message-1',
            }]);
            const adapter = createAdapter({ ack, nack, publish });
            const consumer = createConsumer({ deadLetterQueue: 'orders.dlq' });
            const { processor } = createProcessor(
                startIdempotentRunWithSeed,
                createLogger(),
                vi.fn(),
                runById,
            );

            await (processor as unknown as ProcessingInternals).processDelivery(
                consumer,
                adapter,
                {} as QueueConnectionConfig,
                { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
            );

            expect(ack).not.toHaveBeenCalled();
            expect(startIdempotentRunWithSeed).toHaveBeenCalledOnce();
            expect(publish).toHaveBeenCalledOnce();
            expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', false);
            expect(consumer.messagesProcessed).toBe(0);
            expect(consumer.messagesFailed).toBe(1);
        },
    );

    it('reuses the correlated run on redelivery without publishing a second trigger event', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: true,
        });
        const publishTriggerFired = vi.fn();
        const ack = vi.fn().mockResolvedValue(undefined);
        const adapter = createAdapter({ ack });
        const { processor } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            publishTriggerFired,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            createConsumer(),
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(startIdempotentRunWithSeed).toHaveBeenCalledOnce();
        expect(publishTriggerFired).not.toHaveBeenCalled();
        expect(ack).toHaveBeenCalledOnce();
    });

    it('releases a completed delivery for redelivery after the consumer lease is lost', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const consumer = createConsumer();
        const runById = vi.fn().mockImplementation(async () => {
            consumer.running = false;
            return { status: RunStatus.COMPLETED, error: null };
        });
        const ack = vi.fn();
        const nack = vi.fn();
        const publish = vi.fn();
        const adapter = createAdapter({ ack, nack, publish });
        const { processor, logger } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            vi.fn(),
            runById,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(ack).not.toHaveBeenCalled();
        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(publish).not.toHaveBeenCalled();
        expect(consumer.messagesProcessed).toBe(0);
        expect(consumer.messagesFailed).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('lease'),
            expect.objectContaining({ messageId: 'message-1' }),
        );
    });

    it('fences dead-letter publication and releases the delivery after lease loss', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockResolvedValue({
            run: { id: 'run-1', pipelineId: 1 },
            duplicate: false,
        });
        const consumer = createConsumer({ deadLetterQueue: 'orders.dlq' });
        const runById = vi.fn().mockImplementation(async () => {
            consumer.running = false;
            return { status: RunStatus.FAILED, error: 'run stopped' };
        });
        const adapter = createAdapter({
            ack: vi.fn(),
            nack: vi.fn(),
            publish: vi.fn(),
        });
        const { processor } = createProcessor(
            startIdempotentRunWithSeed,
            createLogger(),
            vi.fn(),
            runById,
        );

        await (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );

        expect(adapter.publish).not.toHaveBeenCalled();
        expect(adapter.nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(consumer.messagesFailed).toBe(0);
    });

    it('fences acknowledgment and metrics when the lease is lost during DLQ publication', async () => {
        const startIdempotentRunWithSeed = vi.fn().mockRejectedValue(new Error('enqueue failed'));
        let finishPublish: ((results: Array<{ success: boolean; messageId: string }>) => void) | undefined;
        const publish = vi.fn(() => new Promise<Array<{ success: boolean; messageId: string }>>(resolve => {
            finishPublish = resolve;
        }));
        const nack = vi.fn();
        const adapter = createAdapter({ publish, nack });
        const consumer = createConsumer({ maxRetries: 0, deadLetterQueue: 'orders.dlq' });
        const { processor, logger } = createProcessor(startIdempotentRunWithSeed);

        const processing = (processor as unknown as ProcessingInternals).processDelivery(
            consumer,
            adapter,
            {} as QueueConnectionConfig,
            { messageId: 'message-1', payload: {}, deliveryTag: 'delivery-1' },
        );
        await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
        consumer.running = false;
        finishPublish?.([{ success: true, messageId: 'message-1' }]);
        await processing;

        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(consumer.messagesFailed).toBe(0);
        expect(logger.info).not.toHaveBeenCalledWith(
            'Routed message to DLQ',
            expect.anything(),
        );
    });

    it('releases deliveries fetched after consumer ownership is lost', async () => {
        const consumer = createConsumer();
        const nack = vi.fn().mockResolvedValue(undefined);
        const consume = vi.fn().mockImplementation(async () => {
            consumer.running = false;
            return [{
                messageId: 'message-1',
                payload: {},
                deliveryTag: 'delivery-1',
            }];
        });
        const adapter = createAdapter({ consume, nack });
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get').mockReturnValue(adapter);
        const { processor } = createProcessor(vi.fn());

        try {
            await (processor as unknown as ProcessingInternals).pollMessages(consumer);
        } finally {
            registrySpy.mockRestore();
        }

        expect(nack).toHaveBeenCalledWith(expect.anything(), 'delivery-1', true);
        expect(consumer.inFlightCount).toBe(0);
    });

    it('passes the configured consumerGroup to Redis Streams', async () => {
        const consume = vi.fn().mockResolvedValue([]);
        const adapter = createAdapter({ consume });
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get').mockReturnValue(adapter);
        const processor = new MessageProcessing(
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
            { getRuntimeByCode: vi.fn().mockResolvedValue({ config: { host: 'redis.example.com', port: 6379 } }) } as never,
            { resolve: vi.fn() } as never,
            createLogger(),
            {} as never,
        );
        const consumer = createConsumer({
            queueType: 'redis-streams',
            connectionCode: 'redis',
            consumerGroup: 'order-workers',
            ackMode: AckMode.MANUAL,
        });

        try {
            await (processor as unknown as ProcessingInternals).pollMessages(consumer);
        } finally {
            registrySpy.mockRestore();
        }

        expect(consume).toHaveBeenCalledWith(
            expect.objectContaining({ consumerGroup: 'order-workers' }),
            'orders',
            expect.objectContaining({ ackMode: AckMode.MANUAL }),
        );
    });

    it('enforces pressure limits when processing an unsafe persisted config', async () => {
        const consume = vi.fn().mockResolvedValue([]);
        const adapter = createAdapter({ consume });
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get').mockReturnValue(adapter);
        const { processor } = createProcessor(vi.fn());
        const consumer = createConsumer({
            batchSize: 9_999,
            concurrency: 9_999,
            prefetch: 9_999,
        });
        consumer.inFlightCount = QUEUE.MAX_MESSAGE_CONCURRENCY - 1;

        try {
            await (processor as unknown as ProcessingInternals).pollMessages(consumer);
        } finally {
            registrySpy.mockRestore();
        }

        expect(consume).toHaveBeenCalledWith({}, 'orders', {
            count: 1,
            ackMode: AckMode.MANUAL,
            prefetch: QUEUE.MAX_MESSAGE_PREFETCH,
            consumerId: 'orders:queue',
        });
    });

    it.each([
        {
            queueType: 'rabbitmq-amqp',
            rawConfig: {
                host: 'rabbitmq.example.com',
                port: 5672,
                passwordSecretCode: 'rabbitmq-password',
            },
            secrets: { 'rabbitmq-password': 'rabbitmq-secret' },
            expected: { password: 'rabbitmq-secret' },
            removedFields: ['passwordSecretCode'],
        },
        {
            queueType: 'redis-streams',
            rawConfig: {
                host: 'redis.example.com',
                port: 6379,
                passwordSecretCode: 'redis-password',
                ssl: true,
            },
            secrets: { 'redis-password': 'redis-secret' },
            expected: { password: 'redis-secret', useTls: true },
            removedFields: ['passwordSecretCode'],
        },
        {
            queueType: 'sqs',
            rawConfig: {
                region: 'eu-central-1',
                queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
                accessKeyIdSecretCode: 'sqs-access-key',
                secretAccessKeySecretCode: 'sqs-secret-key',
            },
            secrets: {
                'sqs-access-key': 'access-key',
                'sqs-secret-key': 'secret-key',
            },
            expected: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
            removedFields: ['accessKeyIdSecretCode', 'secretAccessKeySecretCode'],
        },
    ])('resolves and removes Secret Code references for $queueType consumers', async ({
        queueType,
        rawConfig,
        secrets,
        expected,
        removedFields,
    }) => {
        const consume = vi.fn().mockResolvedValue([]);
        const adapter = createAdapter({ consume });
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get').mockReturnValue(adapter);
        const resolve = vi.fn(async (_ctx: unknown, code: string) => (
            secrets[code as keyof typeof secrets] ?? null
        ));
        const processor = new MessageProcessing(
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
            { getRuntimeByCode: vi.fn().mockResolvedValue({ config: rawConfig }) } as never,
            { resolve } as never,
            createLogger(),
            {} as never,
        );

        try {
            await (processor as unknown as ProcessingInternals).pollMessages(createConsumer({
                queueType,
                connectionCode: `${queueType}-connection`,
            }));
        } finally {
            registrySpy.mockRestore();
        }

        const resolvedConfig = consume.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(resolvedConfig).toMatchObject(expected);
        for (const field of removedFields) {
            expect(resolvedConfig).not.toHaveProperty(field);
        }
    });

    it.each([
        ['rabbitmq-amqp', { host: 'rabbitmq.example.com', passwordSecretCode: 'missing-rabbitmq-password' }],
        ['redis-streams', { host: 'redis.example.com', passwordSecretCode: 'missing-redis-password' }],
        ['sqs', {
            region: 'eu-central-1',
            queueUrl: 'https://sqs.eu-central-1.amazonaws.com/123456789012/orders',
            accessKeyIdSecretCode: 'missing-sqs-access-key',
            secretAccessKeySecretCode: 'missing-sqs-secret-key',
        }],
    ])('fails closed when a %s consumer Secret Code cannot be resolved', async (queueType, rawConfig) => {
        const consume = vi.fn().mockResolvedValue([]);
        const adapter = createAdapter({ consume });
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get').mockReturnValue(adapter);
        const processor = new MessageProcessing(
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
            { getRuntimeByCode: vi.fn().mockResolvedValue({ config: rawConfig }) } as never,
            { resolve: vi.fn().mockResolvedValue(null) } as never,
            createLogger(),
            {} as never,
        );

        try {
            await expect(
                (processor as unknown as ProcessingInternals).pollMessages(createConsumer({
                    queueType,
                    connectionCode: `${queueType}-connection`,
                })),
            ).rejects.toThrow('could not be resolved');
        } finally {
            registrySpy.mockRestore();
        }
        expect(consume).not.toHaveBeenCalled();
    });

    it('fails closed on an empty configured queue Secret Code', async () => {
        const consume = vi.fn().mockResolvedValue([]);
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get')
            .mockReturnValue(createAdapter({ consume }));
        const processor = new MessageProcessing(
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
            { getRuntimeByCode: vi.fn().mockResolvedValue({
                config: { host: 'redis.example.com', passwordSecretCode: '   ' },
            }) } as never,
            { resolve: vi.fn() } as never,
            createLogger(),
            {} as never,
        );

        try {
            await expect(
                (processor as unknown as ProcessingInternals).pollMessages(createConsumer({
                    queueType: 'redis-streams',
                    connectionCode: 'redis',
                })),
            ).rejects.toThrow('must reference a non-empty Secret Code');
        } finally {
            registrySpy.mockRestore();
        }
        expect(consume).not.toHaveBeenCalled();
    });

    it.each(['', '   '])('fails closed on an empty resolved queue secret (%j)', async resolvedSecret => {
        const consume = vi.fn().mockResolvedValue([]);
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'get')
            .mockReturnValue(createAdapter({ consume }));
        const processor = new MessageProcessing(
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
            { getRuntimeByCode: vi.fn().mockResolvedValue({
                config: { host: 'redis.example.com', passwordSecretCode: 'redis-password' },
            }) } as never,
            { resolve: vi.fn().mockResolvedValue(resolvedSecret) } as never,
            createLogger(),
            {} as never,
        );

        try {
            await expect(
                (processor as unknown as ProcessingInternals).pollMessages(createConsumer({
                    queueType: 'redis-streams',
                    connectionCode: 'redis',
                })),
            ).rejects.toThrow('could not be resolved');
        } finally {
            registrySpy.mockRestore();
        }
        expect(consume).not.toHaveBeenCalled();
    });
});
