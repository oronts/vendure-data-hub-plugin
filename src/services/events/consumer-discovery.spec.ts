import { describe, expect, it, vi } from 'vitest';
import { Pipeline } from '../../entities/pipeline';
import { AckMode, PipelineStatus, QUEUE } from '../../constants';
import { ConsumerDiscovery, getConsumerConfigFingerprint } from './consumer-discovery';

function createPipeline(message: Record<string, unknown> = {}): Pipeline {
    const pipeline = new Pipeline();
    pipeline.id = 1;
    pipeline.code = 'orders';
    pipeline.definition = {
        version: 1,
        steps: [{
            key: 'incoming',
            type: 'TRIGGER',
            config: {
                type: 'MESSAGE',
                message: {
                    queueType: 'INTERNAL',
                    queueName: 'orders',
                    ...message,
                },
            },
        }],
    };
    return pipeline;
}

describe('ConsumerDiscovery retry configuration', () => {
    const discovery = new ConsumerDiscovery({} as never, {} as never, {} as never);

    it('preserves an explicit zero retry count', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline({ maxRetries: 0 }));

        expect(config.maxRetries).toBe(0);
    });

    it('uses central defaults and caps unsafe persisted values', () => {
        const [defaultConfig] = discovery.extractMessageConfigs(createPipeline());
        const [cappedConfig] = discovery.extractMessageConfigs(createPipeline({ maxRetries: 999 }));

        expect(defaultConfig.maxRetries).toBe(QUEUE.DEFAULT_MESSAGE_RETRIES);
        expect(cappedConfig.maxRetries).toBe(QUEUE.MAX_MESSAGE_RETRIES);
    });

    it('defaults to manual acknowledgment', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline());

        expect(config.ackMode).toBe(AckMode.MANUAL);
    });

    it('normalizes persisted pressure settings to safe limits', () => {
        const [maximums] = discovery.extractMessageConfigs(createPipeline({
            batchSize: 999,
            concurrency: 999,
            prefetch: 9_999,
            pollIntervalMs: 9_999_999,
        }));
        const [minimums] = discovery.extractMessageConfigs(createPipeline({
            batchSize: 0,
            concurrency: 0,
            prefetch: 0,
            pollIntervalMs: 0,
        }));

        expect(maximums).toMatchObject({
            batchSize: QUEUE.MAX_MESSAGE_BATCH_SIZE,
            concurrency: QUEUE.MAX_MESSAGE_CONCURRENCY,
            prefetch: QUEUE.MAX_MESSAGE_PREFETCH,
            pollIntervalMs: QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS,
        });
        expect(minimums).toMatchObject({
            batchSize: QUEUE.MIN_MESSAGE_BATCH_SIZE,
            concurrency: QUEUE.MIN_MESSAGE_CONCURRENCY,
            prefetch: QUEUE.MIN_MESSAGE_PREFETCH,
            pollIntervalMs: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
        });
    });

    it('changes consumer identity when any runtime setting changes', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline());
        const baseline = getConsumerConfigFingerprint(config);

        for (const change of [
            { queueName: 'priority-orders' },
            { connectionCode: 'rabbitmq-secondary' },
            { concurrency: config.concurrency + 1 },
            { pollIntervalMs: config.pollIntervalMs + 1_000 },
            { deadLetterQueue: 'orders.dlq' },
        ]) {
            expect(getConsumerConfigFingerprint({ ...config, ...change }))
                .not.toBe(baseline);
        }
    });

    it('only discovers an enabled published pipeline for manual startup', async () => {
        const pipeline = createPipeline();
        const findOne = vi.fn().mockResolvedValue(pipeline);
        const guardedDiscovery = new ConsumerDiscovery(
            { getRepository: vi.fn(() => ({ findOne })) } as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
        );

        await expect(guardedDiscovery.getConfigsByPipelineCode('orders'))
            .resolves.toHaveLength(1);
        expect(findOne).toHaveBeenCalledWith({
            where: {
                code: 'orders',
                status: PipelineStatus.PUBLISHED,
                enabled: true,
            },
        });
    });

    it('rejects manual startup when no enabled published pipeline is found', async () => {
        const guardedDiscovery = new ConsumerDiscovery(
            { getRepository: vi.fn(() => ({ findOne: vi.fn().mockResolvedValue(null) })) } as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
        );

        await expect(guardedDiscovery.getConfigsByPipelineCode('orders'))
            .rejects.toThrow('Enabled published pipeline not found: orders');
    });
});
