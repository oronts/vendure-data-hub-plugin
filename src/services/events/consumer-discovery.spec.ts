import { describe, expect, it } from 'vitest';
import { Pipeline } from '../../entities/pipeline';
import { QUEUE } from '../../constants';
import { ConsumerDiscovery } from './consumer-discovery';

function createPipeline(maxRetries?: number): Pipeline {
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
                    ...(maxRetries === undefined ? {} : { maxRetries }),
                },
            },
        }],
    };
    return pipeline;
}

describe('ConsumerDiscovery retry configuration', () => {
    const discovery = new ConsumerDiscovery({} as never, {} as never, {} as never);

    it('preserves an explicit zero retry count', () => {
        const [config] = discovery.extractMessageConfigs(createPipeline(0));

        expect(config.maxRetries).toBe(0);
    });

    it('uses central defaults and caps unsafe persisted values', () => {
        const [defaultConfig] = discovery.extractMessageConfigs(createPipeline());
        const [cappedConfig] = discovery.extractMessageConfigs(createPipeline(999));

        expect(defaultConfig.maxRetries).toBe(QUEUE.DEFAULT_MESSAGE_RETRIES);
        expect(cappedConfig.maxRetries).toBe(QUEUE.MAX_MESSAGE_RETRIES);
    });
});
