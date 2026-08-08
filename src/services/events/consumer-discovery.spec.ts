import { describe, expect, it, vi } from 'vitest';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import { AckMode, PipelineStatus, QUEUE, RevisionType } from '../../constants';
import {
    ConsumerDiscovery,
    getConsumerConfigFingerprint,
    shouldRunConsumer,
} from './consumer-discovery';

function createPipeline(
    message: Record<string, unknown> = {},
): Pipeline & { revisionId: number } {
    const pipeline = new Pipeline();
    pipeline.id = 1;
    pipeline.code = 'orders';
    pipeline.enabled = true;
    pipeline.status = PipelineStatus.PUBLISHED;
    pipeline.currentRevisionId = 7;
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
    return Object.assign(pipeline, { revisionId: 7 });
}

describe('ConsumerDiscovery retry configuration', () => {
    const discovery = new ConsumerDiscovery({} as never, {} as never, {} as never);

    it('preserves an explicit zero retry count', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline({ maxRetries: 0 }));

        expect(config.maxRetries).toBe(0);
    });

    it('uses central defaults and rejects unsafe persisted retry values', () => {
        const [defaultConfig] = discovery.extractMessageConfigs(createPipeline());

        expect(defaultConfig.maxRetries).toBe(QUEUE.DEFAULT_MESSAGE_RETRIES);
        expect(() => discovery.extractMessageConfigs(createPipeline({ maxRetries: 999 })))
            .toThrow(`maxRetries must be an integer from 0 to ${QUEUE.MAX_MESSAGE_RETRIES}`);
    });

    it('defaults to manual acknowledgment', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline());

        expect(config.ackMode).toBe(AckMode.MANUAL);
    });

    it.each([
        ['batchSize', 999],
        ['concurrency', 0],
        ['prefetch', 9_999],
        ['pollIntervalMs', 0],
        ['maxRetries', 1.5],
    ])('rejects unsafe persisted %s value', (field, value) => {
        expect(() => discovery.extractMessageConfigs(createPipeline({ [field]: value })))
            .toThrow(field);
    });

    it.each([undefined, 'RABBITMQ', 'redis-streams', 'UNKNOWN'])(
        'rejects missing or non-canonical queueType %s',
        queueType => {
            expect(() => discovery.extractMessageConfigs(createPipeline({ queueType })))
                .toThrow('queueType must be one of');
        },
    );

    it('rejects connectionCode for the in-process queue', () => {
        expect(() => discovery.extractMessageConfigs(createPipeline({
            connectionCode: 'unused',
        }))).toThrow('INTERNAL message triggers do not use connectionCode');
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

    it('uses persisted intent before the trigger autoStart default', () => {
        const [enabled] = discovery.extractMessageConfigs(createPipeline());
        const [disabled] = discovery.extractMessageConfigs(createPipeline({ autoStart: false }));

        expect(shouldRunConsumer(enabled, undefined)).toBe(true);
        expect(shouldRunConsumer(disabled, undefined)).toBe(false);
        expect(shouldRunConsumer(enabled, false)).toBe(false);
        expect(shouldRunConsumer(disabled, true)).toBe(true);
    });

    it('does not restart a consumer when only its autoStart default changes', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline());

        expect(getConsumerConfigFingerprint({ ...config, autoStart: false }))
            .toBe(getConsumerConfigFingerprint(config));
    });

    it('discovers configured consumers whose autoStart default is false', async () => {
        const pipeline = createPipeline({ autoStart: false });
        const revision = Object.assign(new PipelineRevision(), {
            id: pipeline.currentRevisionId,
            pipelineId: pipeline.id,
            type: RevisionType.PUBLISHED,
            definition: pipeline.definition,
        });
        const guardedDiscovery = new ConsumerDiscovery(
            {
                getRepository: vi.fn((_ctx, entity) => (
                    entity === PipelineRevision
                        ? { find: vi.fn().mockResolvedValue([revision]) }
                        : { find: vi.fn().mockResolvedValue([pipeline]) }
                )),
            } as never,
            { create: vi.fn().mockResolvedValue({ channelId: 1 }) } as never,
            { error: vi.fn() } as never,
        );

        const configs = await guardedDiscovery.discoverConfigs();

        expect(configs.get('orders:incoming')).toMatchObject({
            autoStart: false,
            pipelineCode: 'orders',
            triggerKey: 'incoming',
        });
    });

    it('only discovers an enabled published pipeline for manual startup', async () => {
        const pipeline = createPipeline();
        const findOne = vi.fn().mockResolvedValue(pipeline);
        const find = vi.fn().mockResolvedValue([Object.assign(new PipelineRevision(), {
            id: pipeline.currentRevisionId,
            pipelineId: pipeline.id,
            type: RevisionType.PUBLISHED,
            definition: pipeline.definition,
        })]);
        const guardedDiscovery = new ConsumerDiscovery(
            {
                getRepository: vi.fn((_ctx, entity) => (
                    entity === PipelineRevision ? { find } : { findOne }
                )),
            } as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
        );

        await expect(guardedDiscovery.getConfigsByPipelineCode('orders'))
            .resolves.toHaveLength(1);
        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ code: 'orders', enabled: true }),
        }));
        expect(find).toHaveBeenCalledOnce();
    });

    it('rejects manual startup when no enabled published pipeline is found', async () => {
        const guardedDiscovery = new ConsumerDiscovery(
            { getRepository: vi.fn(() => ({ findOne: vi.fn().mockResolvedValue(null) })) } as never,
            { create: vi.fn().mockResolvedValue({}) } as never,
            {} as never,
        );

        await expect(guardedDiscovery.getConfigsByPipelineCode('orders'))
            .rejects.toThrow('Runnable pipeline not found: orders');
    });
});
