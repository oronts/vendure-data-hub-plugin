import { describe, expect, it } from 'vitest';
import { AckMode } from '../../constants';
import type { MessageConsumerConfig } from './consumer-discovery';
import { assertConsumerRuntimeConfig } from './consumer-lifecycle';

function createConfig(overrides: Partial<MessageConsumerConfig>): MessageConsumerConfig {
    return {
        pipelineId: 1,
        pipelineCode: 'orders',
        triggerKey: 'queue',
        queueType: 'internal',
        connectionCode: '',
        queueName: 'orders',
        batchSize: 1,
        concurrency: 1,
        ackMode: AckMode.MANUAL,
        maxRetries: 3,
        pollIntervalMs: 1_000,
        autoStart: true,
        ...overrides,
    };
}

describe('assertConsumerRuntimeConfig', () => {
    it('allows consumerGroup for Redis Streams', () => {
        expect(() => assertConsumerRuntimeConfig(createConfig({
            queueType: 'redis-streams',
            consumerGroup: 'order-workers',
        }))).not.toThrow();
    });

    it('rejects consumerGroup for adapters that cannot apply it', () => {
        expect(() => assertConsumerRuntimeConfig(createConfig({
            queueType: 'sqs',
            consumerGroup: 'ignored-group',
        }))).toThrow('supported only for REDIS_STREAMS');
    });

    it('rejects RabbitMQ HTTP because it cannot defer acknowledgment', () => {
        expect(() => assertConsumerRuntimeConfig(createConfig({
            queueType: 'rabbitmq',
            ackMode: AckMode.MANUAL,
        }))).toThrow('use RABBITMQ_AMQP');
    });

    it('rejects malformed persisted acknowledgment modes', () => {
        expect(() => assertConsumerRuntimeConfig(createConfig({
            ackMode: 'DEFERRED' as AckMode,
        }))).toThrow('require MANUAL acknowledgment');
    });
});
