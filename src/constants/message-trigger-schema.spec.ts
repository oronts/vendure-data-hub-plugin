import { describe, expect, it } from 'vitest';
import { TriggerType } from './enums';
import { QUEUE } from './defaults/runtime-defaults';
import {
    ACK_MODE_OPTIONS,
    MESSAGE_QUEUE_TYPE_OPTIONS,
    TRIGGER_TYPE_SCHEMAS,
} from './adapter-schema-options';

describe('message trigger dynamic schema', () => {
    it('exposes nested retry and Redis consumer-group configuration', () => {
        const schema = TRIGGER_TYPE_SCHEMAS.find(option => option.value === TriggerType.MESSAGE);
        const maxRetries = schema?.fields.find(field => field.key === 'maxRetries');
        const batchSize = schema?.fields.find(field => field.key === 'batchSize');
        const concurrency = schema?.fields.find(field => field.key === 'concurrency');
        const prefetch = schema?.fields.find(field => field.key === 'prefetch');
        const pollInterval = schema?.fields.find(field => field.key === 'pollIntervalMs');
        const consumerGroup = schema?.fields.find(field => field.key === 'consumerGroup');
        const connectionCode = schema?.fields.find(field => field.key === 'connectionCode');

        expect(maxRetries?.defaultValue).toBe(QUEUE.DEFAULT_MESSAGE_RETRIES);
        expect(maxRetries?.description).toContain(`0-${QUEUE.MAX_MESSAGE_RETRIES}`);
        expect(batchSize).toMatchObject({
            min: QUEUE.MIN_MESSAGE_BATCH_SIZE,
            max: QUEUE.MAX_MESSAGE_BATCH_SIZE,
        });
        expect(concurrency).toMatchObject({
            min: QUEUE.MIN_MESSAGE_CONCURRENCY,
            max: QUEUE.MAX_MESSAGE_CONCURRENCY,
        });
        expect(prefetch).toMatchObject({
            min: QUEUE.MIN_MESSAGE_PREFETCH,
            max: QUEUE.MAX_MESSAGE_PREFETCH,
        });
        expect(pollInterval).toMatchObject({
            min: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
            max: QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS,
        });
        expect(schema?.configKeyMap?.maxRetries).toBe('message.maxRetries');
        expect(consumerGroup?.description).toContain('Redis Streams');
        expect(consumerGroup?.description).not.toContain('Kafka');
        expect(connectionCode?.required).not.toBe(true);
        expect(ACK_MODE_OPTIONS).toEqual([
            expect.objectContaining({ value: 'MANUAL' }),
        ]);
        expect(MESSAGE_QUEUE_TYPE_OPTIONS.map(option => option.value)).toEqual([
            'RABBITMQ_AMQP',
            'SQS',
            'REDIS_STREAMS',
            'INTERNAL',
        ]);
    });
});
