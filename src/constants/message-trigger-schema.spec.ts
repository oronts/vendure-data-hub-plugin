import { describe, expect, it } from 'vitest';
import { TriggerType } from './enums';
import { QUEUE } from './defaults/runtime-defaults';
import { TRIGGER_TYPE_SCHEMAS } from './adapter-schema-options';

describe('message trigger dynamic schema', () => {
    it('exposes nested retry and Redis consumer-group configuration', () => {
        const schema = TRIGGER_TYPE_SCHEMAS.find(option => option.value === TriggerType.MESSAGE);
        const maxRetries = schema?.fields.find(field => field.key === 'maxRetries');
        const consumerGroup = schema?.fields.find(field => field.key === 'consumerGroup');
        const connectionCode = schema?.fields.find(field => field.key === 'connectionCode');

        expect(maxRetries?.defaultValue).toBe(QUEUE.DEFAULT_MESSAGE_RETRIES);
        expect(maxRetries?.description).toContain(`0-${QUEUE.MAX_MESSAGE_RETRIES}`);
        expect(schema?.configKeyMap?.maxRetries).toBe('message.maxRetries');
        expect(consumerGroup?.description).toContain('Redis Streams');
        expect(consumerGroup?.description).not.toContain('Kafka');
        expect(connectionCode?.required).not.toBe(true);
    });
});
