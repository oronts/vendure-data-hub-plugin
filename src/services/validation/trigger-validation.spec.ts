import { describe, expect, it } from 'vitest';
import type { JsonObject, PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { validateTrigger } from './trigger-validation';

function validateMessage(message: JsonObject): string[] {
    const definition: PipelineDefinition = {
        version: 1,
        steps: [{
            key: 'incoming',
            type: 'TRIGGER',
            config: {
                type: 'MESSAGE',
                message,
            },
        }],
    };
    const issues: PipelineDefinitionIssue[] = [];
    validateTrigger(definition, issues, []);
    return issues.map(issue => issue.errorCode ?? '');
}

describe('message trigger reliability validation', () => {
    it('accepts a Redis consumer group and bounded retry count', () => {
        expect(validateMessage({
            queueType: 'REDIS_STREAMS',
            connectionCode: 'redis',
            queueName: 'orders',
            consumerGroup: 'order-workers',
            ackMode: 'MANUAL',
            maxRetries: 0,
        })).toEqual([]);
    });

    it('rejects consumer groups for adapters without consumer-group semantics', () => {
        expect(validateMessage({
            queueType: 'SQS',
            connectionCode: 'sqs',
            queueName: 'orders',
            consumerGroup: 'ignored-group',
        })).toContain('unsupported-consumer-group');
    });

    it('rejects the RabbitMQ HTTP adapter because it cannot defer acknowledgment', () => {
        expect(validateMessage({
            queueType: 'RABBITMQ',
            connectionCode: 'rabbit-http',
            queueName: 'orders',
            ackMode: 'MANUAL',
        })).toContain('unsupported-ack-mode');
    });

    it('rejects automatic acknowledgment before the run outcome is known', () => {
        expect(validateMessage({
            queueType: 'INTERNAL',
            queueName: 'orders',
            ackMode: 'AUTO',
        })).toContain('unsupported-ack-mode');
    });

    it.each([-1, 11, 1.5, Number.POSITIVE_INFINITY])(
        'rejects unsafe maxRetries value %s',
        maxRetries => {
            expect(validateMessage({
                queueType: 'INTERNAL',
                queueName: 'orders',
                maxRetries,
            })).toContain('invalid-max-retries');
        },
    );

    it.each([
        ['batchSize', 0, 'invalid-batch-size'],
        ['batchSize', 101, 'invalid-batch-size'],
        ['concurrency', 0, 'invalid-concurrency'],
        ['concurrency', 33, 'invalid-concurrency'],
        ['prefetch', 0, 'invalid-prefetch'],
        ['prefetch', 1_001, 'invalid-prefetch'],
        ['pollIntervalMs', 999, 'invalid-poll-interval'],
        ['pollIntervalMs', 300_001, 'invalid-poll-interval'],
    ])('rejects unsafe %s value %s', (field, value, errorCode) => {
        expect(validateMessage({
            queueType: 'INTERNAL',
            queueName: 'orders',
            [field]: value,
        })).toContain(errorCode);
    });

    it.each(['bindingArgs', 'filterExpression'])('rejects inert message option %s', field => {
        expect(validateMessage({
            queueType: 'INTERNAL',
            queueName: 'orders',
            [field]: field === 'bindingArgs' ? {} : 'payload.type == "order"',
        })).toContain('unsupported-message-trigger-field');
    });
});
