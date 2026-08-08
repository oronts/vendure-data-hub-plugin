import { describe, expect, it, vi } from 'vitest';
import { AckMode } from '../../constants';
import type { DataHubLogger } from '../logger';
import type { DataHubSettingsService } from '../config/settings.service';
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
    configuredConsumers: Map<string, MessageConsumerConfig>;
    discovery: ConsumerDiscovery;
    lifecycle: ConsumerLifecycle;
    processing: MessageProcessing;
    logger: DataHubLogger;
    settings: DataHubSettingsService;
    refreshTimer?: NodeJS.Timeout;
    refreshConsumers(): Promise<void>;
};

function createService(
    ensureSynchronized: () => Promise<void> = async () => undefined,
): MessageConsumerService {
    const logger = createLogger();
    return new MessageConsumerService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { ensureSynchronized: vi.fn(ensureSynchronized) } as never,
        {
            getConsumerControlOverrides: vi.fn().mockResolvedValue({}),
            updateConsumerControlOverrides: vi.fn(async updates => updates),
        } as never,
        { createLogger: () => logger } as never,
        {} as never,
    );
}

describe('MessageConsumerService refresh', () => {
    it('does not discover consumers before configuration synchronization', async () => {
        let resolveSync: (() => void) | undefined;
        const service = createService(() => new Promise(resolve => {
            resolveSync = resolve;
        }));
        const internals = service as unknown as ServiceInternals;
        const discover = vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockResolvedValue(new Map());

        const startup = service.onApplicationBootstrap();
        await Promise.resolve();

        expect(discover).not.toHaveBeenCalled();
        resolveSync?.();
        await startup;

        expect(discover).toHaveBeenCalledOnce();
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'getAll')
            .mockReturnValue([]);
        try {
            await service.onModuleDestroy();
        } finally {
            registrySpy.mockRestore();
        }
    });

    it('does not install a refresh timer when synchronization finishes after shutdown', async () => {
        let resolveSync: (() => void) | undefined;
        const service = createService(() => new Promise(resolve => {
            resolveSync = resolve;
        }));
        const internals = service as unknown as ServiceInternals;
        const discover = vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockResolvedValue(new Map());
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'getAll')
            .mockReturnValue([]);

        try {
            const startup = service.onApplicationBootstrap();
            await Promise.resolve();
            await service.onModuleDestroy();
            resolveSync?.();
            await startup;

            expect(discover).not.toHaveBeenCalled();
            expect(internals.refreshTimer).toBeUndefined();
        } finally {
            registrySpy.mockRestore();
        }
    });

    it('stops a changed consumer before starting its replacement', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const original = createConfig();
        const replacement = createConfig({ queueName: 'priority-orders' });
        internals.consumers.set(key, createActiveConsumer(original));

        vi.spyOn(internals.discovery, 'discoverConfigs')
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

    it('stops a locally active consumer when durable intent overrides autoStart', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig();
        internals.consumers.set(key, createActiveConsumer(config));
        vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockResolvedValue(new Map([[key, config]]));
        vi.spyOn(internals.settings, 'getConsumerControlOverrides')
            .mockResolvedValue({ [key]: false });
        vi.spyOn(internals.lifecycle, 'stopConsumer')
            .mockImplementation(async (consumerKey, consumers) => {
                consumers.delete(consumerKey);
            });

        await internals.refreshConsumers();

        expect(await service.getConsumerStatus()).toEqual([
            expect.objectContaining({
                pipelineCode: 'catalog-sync',
                triggerKey: 'orders',
                running: false,
                autoStart: true,
                desiredEnabled: false,
                messagesProcessed: 0,
                messagesFailed: 0,
            }),
        ]);
    });

    it('keeps remote lock ownership truthful when durable intent enables a consumer', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig({ autoStart: false });
        vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockResolvedValue(new Map([[key, config]]));
        vi.spyOn(internals.settings, 'getConsumerControlOverrides')
            .mockResolvedValue({ [key]: true });
        const createConsumer = vi.spyOn(internals.lifecycle, 'createConsumer')
            .mockResolvedValue(null);

        await internals.refreshConsumers();

        expect(createConsumer).toHaveBeenCalledWith(
            config,
            internals.consumers,
            expect.any(Function),
        );
        expect(await service.getConsumerStatus()).toEqual([
            expect.objectContaining({
                running: false,
                autoStart: false,
                desiredEnabled: true,
            }),
        ]);
    });

    it('serializes concurrent local starts for the same consumer key', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig();
        let releaseFirst: (() => void) | undefined;
        let inFlight = 0;
        let maximumInFlight = 0;
        const createConsumer = vi.spyOn(internals.lifecycle, 'createConsumer')
            .mockImplementation(async (candidate, consumers) => {
                if (consumers.has(key)) return null;
                inFlight++;
                maximumInFlight = Math.max(maximumInFlight, inFlight);
                await new Promise<void>(resolve => {
                    releaseFirst ??= resolve;
                });
                inFlight--;
                const consumer = createActiveConsumer(candidate);
                consumers.set(key, consumer);
                return consumer;
            });
        const startPolling = vi.spyOn(internals.processing, 'startPolling')
            .mockImplementation(() => undefined);

        const first = service.startConsumer(config);
        const second = service.startConsumer(config);
        await Promise.resolve();
        await Promise.resolve();

        expect(maximumInFlight).toBe(1);
        releaseFirst?.();
        await Promise.all([first, second]);

        expect(createConsumer).toHaveBeenCalledTimes(2);
        expect(maximumInFlight).toBe(1);
        expect(startPolling).toHaveBeenCalledOnce();
    });

    it('suppresses an overlapping refresh', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        let finishDiscovery: ((configs: Map<string, MessageConsumerConfig>) => void) | undefined;
        const discover = vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockImplementation(() => new Promise(resolve => {
                finishDiscovery = resolve;
            }));

        const firstRefresh = internals.refreshConsumers();
        await internals.refreshConsumers();

        await vi.waitFor(() => expect(discover).toHaveBeenCalledOnce());
        finishDiscovery?.(new Map());
        await firstRefresh;
    });
});

describe('MessageConsumerService manual intent', () => {
    it('persists a selected start before changing local state', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const orders = createConfig();
        const inventory = createConfig({ triggerKey: 'inventory', queueName: 'inventory' });
        vi.spyOn(internals.discovery, 'getConfigsByPipelineCode')
            .mockResolvedValue([orders, inventory]);
        const update = vi.spyOn(internals.settings, 'updateConsumerControlOverrides')
            .mockResolvedValue({ 'catalog-sync:orders': true });
        const start = vi.spyOn(service, 'startConsumer').mockResolvedValue(undefined);
        const ctx = { apiType: 'admin' } as never;

        await service.startConsumerByCode('catalog-sync', 'orders', ctx);

        expect(update).toHaveBeenCalledWith({ 'catalog-sync:orders': true }, ctx);
        expect(start).toHaveBeenCalledWith(orders);
        expect(update.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
        expect(internals.configuredConsumers.get('catalog-sync:orders')).toBe(orders);
    });

    it('persists and stops every configured trigger for a pipeline', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const orders = createConfig();
        const inventory = createConfig({ triggerKey: 'inventory', queueName: 'inventory' });
        vi.spyOn(internals.discovery, 'getConfigsByPipelineCode')
            .mockResolvedValue([orders, inventory]);
        const update = vi.spyOn(internals.settings, 'updateConsumerControlOverrides')
            .mockResolvedValue({
                'catalog-sync:orders': false,
                'catalog-sync:inventory': false,
            });
        const stop = vi.spyOn(service, 'stopConsumer').mockResolvedValue(undefined);

        await service.stopConsumerByCode('catalog-sync');

        expect(update).toHaveBeenCalledWith({
            'catalog-sync:orders': false,
            'catalog-sync:inventory': false,
        }, undefined);
        expect(stop).toHaveBeenCalledTimes(2);
        expect(stop).toHaveBeenNthCalledWith(1, 'catalog-sync:orders');
        expect(stop).toHaveBeenNthCalledWith(2, 'catalog-sync:inventory');
    });

    it('stops a cached consumer after its current trigger is removed', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig();
        internals.configuredConsumers.set(key, config);
        internals.consumers.set(key, createActiveConsumer(config));
        vi.spyOn(internals.discovery, 'getConfigsByPipelineCode')
            .mockResolvedValue([]);
        const update = vi.spyOn(internals.settings, 'updateConsumerControlOverrides')
            .mockResolvedValue({ [key]: false });
        const stop = vi.spyOn(internals.lifecycle, 'stopConsumer')
            .mockImplementation(async (consumerKey, consumers) => {
                consumers.delete(consumerKey);
            });

        await service.stopConsumerByCode('catalog-sync', 'orders');

        expect(update).toHaveBeenCalledWith({ [key]: false }, undefined);
        expect(stop).toHaveBeenCalledWith(key, internals.consumers);
        expect(internals.consumers.has(key)).toBe(false);
    });

    it('does not create local state when durable intent persistence fails', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const config = createConfig();
        vi.spyOn(internals.discovery, 'getConfigsByPipelineCode')
            .mockResolvedValue([config]);
        vi.spyOn(internals.settings, 'updateConsumerControlOverrides')
            .mockRejectedValue(new Error('write failed'));
        const start = vi.spyOn(service, 'startConsumer');

        await expect(service.startConsumerByCode('catalog-sync')).rejects.toThrow('write failed');

        expect(start).not.toHaveBeenCalled();
        expect(internals.configuredConsumers.size).toBe(0);
    });

    it('does not let a stale refresh reverse a concurrent manual stop', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig();
        let releaseOverrides: ((overrides: Record<string, boolean>) => void) | undefined;
        vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockResolvedValue(new Map([[key, config]]));
        const getOverrides = vi.spyOn(internals.settings, 'getConsumerControlOverrides')
            .mockImplementation(() => new Promise(resolve => {
                releaseOverrides = resolve;
            }));
        vi.spyOn(internals.discovery, 'getConfigsByPipelineCode')
            .mockResolvedValue([config]);
        const update = vi.spyOn(internals.settings, 'updateConsumerControlOverrides')
            .mockResolvedValue({ [key]: false });
        vi.spyOn(internals.lifecycle, 'createConsumer')
            .mockImplementation(async (candidate, consumers) => {
                const consumer = createActiveConsumer(candidate);
                consumers.set(key, consumer);
                return consumer;
            });
        vi.spyOn(internals.lifecycle, 'stopConsumer')
            .mockImplementation(async (consumerKey, consumers) => {
                consumers.delete(consumerKey);
            });
        vi.spyOn(internals.processing, 'startPolling')
            .mockImplementation(() => undefined);

        const refresh = internals.refreshConsumers();
        await vi.waitFor(() => expect(getOverrides).toHaveBeenCalledOnce());
        const manualStop = service.stopConsumerByCode('catalog-sync', 'orders');
        await Promise.resolve();

        expect(update).not.toHaveBeenCalled();
        releaseOverrides?.({});
        await Promise.all([refresh, manualStop]);
        getOverrides.mockResolvedValue({ [key]: false });

        expect(await service.getConsumerStatus()).toEqual([
            expect.objectContaining({ running: false, desiredEnabled: false }),
        ]);
    });

    it('reads current durable intent without waiting for local lifecycle refresh', async () => {
        const service = createService();
        const internals = service as unknown as ServiceInternals;
        const key = 'catalog-sync:orders';
        const config = createConfig({ autoStart: false });
        internals.configuredConsumers.set(key, config);
        const getOverrides = vi.mocked(internals.settings.getConsumerControlOverrides);

        getOverrides.mockResolvedValueOnce({ [key]: false });
        await expect(service.getConsumerStatus()).resolves.toEqual([
            expect.objectContaining({
                running: false,
                autoStart: false,
                desiredEnabled: false,
            }),
        ]);

        getOverrides.mockResolvedValueOnce({ [key]: true });
        await expect(service.getConsumerStatus()).resolves.toEqual([
            expect.objectContaining({
                running: false,
                autoStart: false,
                desiredEnabled: true,
            }),
        ]);
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
        const discover = vi.spyOn(internals.discovery, 'discoverConfigs')
            .mockImplementation(() => new Promise(resolve => {
                finishDiscovery = resolve;
            }));
        const createConsumer = vi.spyOn(internals.lifecycle, 'createConsumer');
        const stopAllConsumers = vi.spyOn(internals.lifecycle, 'stopAllConsumers')
            .mockResolvedValue(undefined);
        const registrySpy = vi.spyOn(queueAdapterRegistry, 'getAll')
            .mockReturnValue([]);

        const refresh = internals.refreshConsumers();
        await vi.waitFor(() => expect(discover).toHaveBeenCalledOnce());
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
