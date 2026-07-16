import { describe, expect, it, vi } from 'vitest';
import { AckMode, DISTRIBUTED_LOCK } from '../../constants';
import type { DataHubLogger } from '../logger';
import type { MessageConsumerConfig } from './consumer-discovery';
import { ActiveConsumer, ConsumerLifecycle } from './consumer-lifecycle';

function createConfig(): MessageConsumerConfig {
    return {
        pipelineId: 1,
        pipelineCode: 'catalog-sync',
        triggerKey: 'orders',
        queueType: 'internal',
        connectionCode: '',
        queueName: 'orders',
        batchSize: 10,
        concurrency: 1,
        ackMode: AckMode.AUTO,
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
