import { describe, expect, it, vi } from 'vitest';
import { AckMode } from '../../constants';
import type { DataHubLogger } from '../logger';
import type { MessageConsumerConfig } from './consumer-discovery';
import type { ActiveConsumer, ConsumerLifecycle } from './consumer-lifecycle';
import type { ConsumerDiscovery } from './consumer-discovery';
import type { MessageProcessing } from './message-processing';
import { MessageConsumerService } from './message-consumer.service';
import { queueAdapterRegistry } from '../../sdk/adapters/queue';
import type { QueueAdapter } from '../../sdk/adapters/queue';

function createConfig(
    overrides: Partial<MessageConsumerConfig> = {},
): MessageConsumerConfig {
    return {
        pipelineId: 1,
        pipelineCode: 'catalog-sync',
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
        ...overrides,
    };
}

function createActiveConsumer(config: MessageConsumerConfig): ActiveConsumer {
    return {
        config,
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

type ServiceInternals = {
    consumers: Map<string, ActiveConsumer>;
    discovery: ConsumerDiscovery;
    lifecycle: ConsumerLifecycle;
    processing: MessageProcessing;
    logger: DataHubLogger;
    refreshConsumers(): Promise<void>;
};

function createService(): MessageConsumerService {
    const logger = createLogger();
    return new MessageConsumerService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { createLogger: () => logger } as never,
        {} as never,
    );
}

describe('MessageConsumerService refresh', () => {
    it('stops a changed consumer before starting its replacement', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const original = createConfig();
        const replacement = createConfig({ queueName: 'priority-orders' });
        internals.consumers.set(key, createActiveConsumer(original));

        vi.spyOn(internals.discovery, 'discoverActiveConfigs')
            .mockResolvedValue(new Map([[key, replacement]]));
        const stopConsumer = vi.spyOn(internals.lifecycle, 'stopConsumer')
            .mockImplementation(async (consumerKey, consumers) => {
                consumers.delete(consumerKey);
            });
        const createConsumer = vi.spyOn(internals.lifecycle, 'createConsumer')
            .mockImplementation(async (config, consumers) => {
                const consumer = createActiveConsumer(config);
                consumers.set(key, consumer);
                return consumer;
            });
        const startPolling = vi.spyOn(internals.processing, 'startPolling')
            .mockImplementation(() => undefined);

        await internals.refreshConsumers();

        expect(stopConsumer).toHaveBeenCalledWith(key, internals.consumers);
        expect(createConsumer).toHaveBeenCalledWith(
            replacement,
            internals.consumers,
            expect.any(Function),
        );
        expect(stopConsumer.mock.invocationCallOrder[0])
            .toBeLessThan(createConsumer.mock.invocationCallOrder[0]);
        expect(startPolling).toHaveBeenCalledWith(
            key,
            expect.objectContaining({ config: replacement }),
            expect.any(Function),
        );
    });

    it('suppresses an overlapping refresh', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        let finishDiscovery: ((configs: Map<string, MessageConsumerConfig>) => void) | undefined;
        const discover = vi.spyOn(internals.discovery, 'discoverActiveConfigs')
            .mockImplementation(() => new Promise(resolve => {
                finishDiscovery = resolve;
            }));

        const firstRefresh = internals.refreshConsumers();
        await internals.refreshConsumers();

        expect(discover).toHaveBeenCalledOnce();
        finishDiscovery?.(new Map());
        await firstRefresh;
    });
});

describe('MessageConsumerService shutdown', () => {
    it('stops consumers and destroys every queue adapter', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const stopAllConsumers = vi.spyOn(internals.lifecycle, 'stopAllConsumers')
            .mockResolvedValue(undefined);
        const firstDestroy = vi.fn().mockResolvedValue(undefined);
        const secondError = new Error('close failed');
        const secondDestroy = vi.fn().mockRejectedValue(secondError);
        const adapters = [
            { code: 'first', destroy: firstDestroy },
            { code: 'second', destroy: secondDestroy },
        ] as unknown as QueueAdapter[];
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'getAll')
            .mockReturnValue(adapters);

        try {
            await service.onModuleDestroy();
        } finally {
            registrySpy.mockRestore();
        }

        expect(stopAllConsumers).toHaveBeenCalledWith(internals.consumers);
        expect(firstDestroy).toHaveBeenCalledOnce();
        expect(secondDestroy).toHaveBeenCalledOnce();
        expect(internals.logger.error).toHaveBeenCalledWith(
            'Failed to destroy queue adapter',
            secondError,
            { adapterCode: 'second' },
        );
    });

    it('waits for an active refresh and prevents post-shutdown consumers', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        let finishDiscovery: ((configs: Map<string, MessageConsumerConfig>) => void) | undefined;
        vi.spyOn(internals.discovery, 'discoverActiveConfigs')
            .mockImplementation(() => new Promise(resolve => {
                finishDiscovery = resolve;
            }));
        const createConsumer = vi.spyOn(internals.lifecycle, 'createConsumer');
        const stopAllConsumers = vi.spyOn(internals.lifecycle, 'stopAllConsumers')
            .mockResolvedValue(undefined);
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'getAll')
            .mockReturnValue([]);

        const refresh = internals.refreshConsumers();
        const shutdown = service.onModuleDestroy();
        expect(stopAllConsumers).not.toHaveBeenCalled();
        finishDiscovery?.(new Map([['catalog-sync:orders', createConfig()]]));

        try {
            await Promise.all([refresh, shutdown]);
        } finally {
            registrySpy.mockRestore();
        }

        expect(createConsumer).not.toHaveBeenCalled();
        expect(stopAllConsumers).toHaveBeenCalledOnce();
        expect(internals.consumers.size).toBe(0);
    });
});
