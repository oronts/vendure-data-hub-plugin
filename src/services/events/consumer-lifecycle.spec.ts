import { describe, expect, it, vi } from 'vitest';
import { AckMode, DISTRIBUTED_LOCK, QUEUE } from '../../constants';
import type { DataHubLogger } from '../logger';
import type { MessageConsumerConfig } from './consumer-discovery';
import { ActiveConsumer, ConsumerLifecycle } from './consumer-lifecycle';

function createConfig(): MessageConsumerConfig {
    return {
        pipelineId: 1,
        pipelineCode: 'catalog-sync',
        revisionId: 7,
        triggerKey: 'orders',
        queueType: 'internal',
        connectionCode: '',
        queueName: 'orders',
        batchSize: 10,
        concurrency: 1,
        ackMode: AckMode.MANUAL,
        maxRetries: 3,
        pollIntervalMs: 1_000,
        autoStart: true,
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

describe('ConsumerLifecycle lease renewal', () => {
    it('retains ownership until in-flight deliveries stop', async () => {
        vi.useFakeTimers();
        try {
            const distributedLock = {
                release: vi.fn().mockResolvedValue(true),
            };
            const lifecycle = new ConsumerLifecycle(
                {} as never,
                {} as never,
                createLogger(),
                distributedLock as never,
            );
            const key = 'catalog-sync:orders';
            const consumer: ActiveConsumer = {
                config: createConfig(),
                running: true,
                messagesProcessed: 0,
                messagesFailed: 0,
                startedAt: new Date(),
                inFlightCount: 1,
                lockToken: 'worker-token',
            };
            const consumers = new Map([[key, consumer]]);

            const stopping = lifecycle.stopConsumer(key, consumers);
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_POLL_INTERVAL_MS);
            expect(distributedLock.release).not.toHaveBeenCalled();
            expect(consumers.has(key)).toBe(true);

            consumer.inFlightCount = 0;
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_POLL_INTERVAL_MS);
            await stopping;

            expect(distributedLock.release).toHaveBeenCalledWith(
                `message-consumer:${key}`,
                'worker-token',
            );
            expect(consumers.has(key)).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('bounds shutdown when an in-flight delivery does not stop', async () => {
        vi.useFakeTimers();
        try {
            const distributedLock = {
                release: vi.fn().mockResolvedValue(true),
            };
            const logger = createLogger();
            const lifecycle = new ConsumerLifecycle(
                {} as never,
                {} as never,
                logger,
                distributedLock as never,
            );
            const key = 'catalog-sync:orders';
            const consumer: ActiveConsumer = {
                config: createConfig(),
                running: true,
                messagesProcessed: 0,
                messagesFailed: 0,
                startedAt: new Date(),
                inFlightCount: 1,
                lockToken: 'worker-token',
            };
            const consumers = new Map([[key, consumer]]);

            const stopping = lifecycle.stopConsumer(key, consumers);
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_TIMEOUT_MS);
            await stopping;

            expect(distributedLock.release).toHaveBeenCalledOnce();
            expect(logger.warn).toHaveBeenCalledWith(
                'Consumer drain timed out; releasing ownership with unsettled deliveries',
                expect.objectContaining({ inFlightCount: 1 }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('retains ownership until an active broker poll settles', async () => {
        vi.useFakeTimers();
        try {
            const distributedLock = {
                release: vi.fn().mockResolvedValue(true),
            };
            const lifecycle = new ConsumerLifecycle(
                {} as never,
                {} as never,
                createLogger(),
                distributedLock as never,
            );
            const key = 'catalog-sync:orders';
            const consumer: ActiveConsumer = {
                config: createConfig(),
                running: true,
                messagesProcessed: 0,
                messagesFailed: 0,
                startedAt: new Date(),
                inFlightCount: 0,
                activePollCount: 1,
                lockToken: 'worker-token',
            };
            const consumers = new Map([[key, consumer]]);

            const stopping = lifecycle.stopConsumer(key, consumers);
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_POLL_INTERVAL_MS);
            expect(distributedLock.release).not.toHaveBeenCalled();

            consumer.activePollCount = 0;
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_POLL_INTERVAL_MS);
            await stopping;

            expect(distributedLock.release).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('drains all consumers within one global timeout window', async () => {
        vi.useFakeTimers();
        try {
            const distributedLock = {
                release: vi.fn().mockResolvedValue(true),
            };
            const lifecycle = new ConsumerLifecycle(
                {} as never,
                {} as never,
                createLogger(),
                distributedLock as never,
            );
            const createBlockedConsumer = (triggerKey: string): ActiveConsumer => ({
                config: { ...createConfig(), triggerKey },
                running: true,
                messagesProcessed: 0,
                messagesFailed: 0,
                startedAt: new Date(),
                inFlightCount: 1,
                lockToken: `${triggerKey}-token`,
            });
            const consumers = new Map<string, ActiveConsumer>([
                ['catalog-sync:orders', createBlockedConsumer('orders')],
                ['catalog-sync:returns', createBlockedConsumer('returns')],
            ]);

            const stopping = lifecycle.stopAllConsumers(consumers);
            await vi.advanceTimersByTimeAsync(QUEUE.CONSUMER_DRAIN_TIMEOUT_MS);
            await stopping;

            expect(distributedLock.release).toHaveBeenCalledTimes(2);
            expect(consumers.size).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects automatic acknowledgment before acquiring a consumer lease', async () => {
        const lifecycle = new ConsumerLifecycle(
            {} as never,
            {} as never,
            createLogger(),
        );

        await expect(lifecycle.createConsumer(
            { ...createConfig(), ackMode: AckMode.AUTO },
            new Map(),
            () => false,
        )).rejects.toThrow('require MANUAL acknowledgment');
    });

    it('releases an acquired lock when shutdown starts during consumer creation', async () => {
        let finishAcquire: ((value: {
            acquired: true;
            token: string;
            currentOwner?: string;
        }) => void) | undefined;
        const distributedLock = {
            acquire: vi.fn(() => new Promise(resolve => {
                finishAcquire = resolve;
            })),
            release: vi.fn().mockResolvedValue(true),
        };
        const lifecycle = new ConsumerLifecycle(
            {} as never,
            {} as never,
            createLogger(),
            distributedLock as never,
        );
        const consumers = new Map<string, ActiveConsumer>();
        let destroying = false;

        const creating = lifecycle.createConsumer(
            createConfig(),
            consumers,
            () => destroying,
        );
        destroying = true;
        finishAcquire?.({ acquired: true, token: 'worker-token' });

        await expect(creating).resolves.toBeNull();
        expect(distributedLock.release).toHaveBeenCalledWith(
            'message-consumer:catalog-sync:orders',
            'worker-token',
        );
        expect(consumers.size).toBe(0);
    });

    it('rejects the RabbitMQ HTTP consumer because it cannot defer acknowledgment', async () => {
        const lifecycle = new ConsumerLifecycle(
            {} as never,
            {} as never,
            createLogger(),
        );

        await expect(lifecycle.createConsumer(
            { ...createConfig(), queueType: 'rabbitmq' },
            new Map(),
            () => false,
        )).rejects.toThrow('use RABBITMQ_AMQP');
    });

    it('stops the consumer when the lock backend cannot confirm renewal', async () => {
        vi.useFakeTimers();
        try {
            const renewalError = new Error('lock database unavailable');
            const distributedLock = {
                extend: vi.fn().mockRejectedValue(renewalError),
                release: vi.fn().mockResolvedValue(true),
            };
            const logger = createLogger();
            const lifecycle = new ConsumerLifecycle(
                {} as never,
                {} as never,
                logger,
                distributedLock as never,
            );
            const key = 'catalog-sync:orders';
            const consumer: ActiveConsumer = {
                config: createConfig(),
                running: true,
                messagesProcessed: 0,
                messagesFailed: 0,
                startedAt: new Date(),
                inFlightCount: 0,
                lockToken: 'worker-token',
            };
            const consumers = new Map([[key, consumer]]);
            const internals = lifecycle as unknown as {
                startLockRefresh(
                    consumerKey: string,
                    activeConsumer: ActiveConsumer,
                    lockKey: string,
                    activeConsumers: Map<string, ActiveConsumer>,
                    isDestroying: () => boolean,
                ): void;
            };

            internals.startLockRefresh(
                key,
                consumer,
                `message-consumer:${key}`,
                consumers,
                () => false,
            );
            await vi.advanceTimersByTimeAsync(
                DISTRIBUTED_LOCK.MESSAGE_CONSUMER_LOCK_REFRESH_MS,
            );

            expect(consumer.running).toBe(false);
            expect(consumers.has(key)).toBe(false);
            expect(consumer.lockRefreshTimer).toBeUndefined();
            expect(distributedLock.release).toHaveBeenCalledWith(
                `message-consumer:${key}`,
                'worker-token',
            );
            expect(logger.error).toHaveBeenCalledWith(
                `Error extending lock for consumer ${key}`,
                renewalError,
                { pipelineCode: 'catalog-sync' },
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
