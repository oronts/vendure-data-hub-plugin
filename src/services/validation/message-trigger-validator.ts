import { AckMode, QueueType } from '../../constants/enums';
import { QUEUE } from '../../constants/defaults';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import {
    addTriggerIssue,
    asConfigRecord,
    rejectUnsupportedTriggerFields,
    type TriggerConfigRecord,
} from './trigger-validation-utils';

const SUPPORTED_QUEUE_TYPES = [
    QueueType.RABBITMQ_AMQP,
    QueueType.SQS,
    QueueType.REDIS_STREAMS,
    QueueType.INTERNAL,
] as const;
const SUPPORTED_QUEUE_TYPE_SET = new Set<string>(SUPPORTED_QUEUE_TYPES);
const INTEGER_LIMITS = [
    { field: 'batchSize', min: QUEUE.MIN_MESSAGE_BATCH_SIZE, max: QUEUE.MAX_MESSAGE_BATCH_SIZE, errorCode: 'invalid-batch-size' },
    { field: 'concurrency', min: QUEUE.MIN_MESSAGE_CONCURRENCY, max: QUEUE.MAX_MESSAGE_CONCURRENCY, errorCode: 'invalid-concurrency' },
    { field: 'prefetch', min: QUEUE.MIN_MESSAGE_PREFETCH, max: QUEUE.MAX_MESSAGE_PREFETCH, errorCode: 'invalid-prefetch' },
    { field: 'pollIntervalMs', min: QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS, max: QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS, errorCode: 'invalid-poll-interval' },
] as const;

export function validateMessageTrigger(
    stepKey: string,
    config: TriggerConfigRecord,
    issues: PipelineDefinitionIssue[],
): void {
    const message = asConfigRecord(config.message);
    if (!message) {
        addTriggerIssue(
            issues,
            stepKey,
            'message trigger requires a message configuration object',
            'invalid-message-config',
        );
        return;
    }

    rejectUnsupportedTriggerFields(
        message,
        ['bindingArgs', 'filterExpression'],
        stepKey,
        'message',
        issues,
    );

    const queueType = message.queueType;
    if (typeof queueType !== 'string' || queueType.length === 0) {
        addTriggerIssue(
            issues,
            stepKey,
            `message trigger requires queueType (${SUPPORTED_QUEUE_TYPES.join(', ')})`,
            'missing-queue-type',
        );
        return;
    }
    if (!SUPPORTED_QUEUE_TYPE_SET.has(queueType)) {
        addTriggerIssue(
            issues,
            stepKey,
            `unsupported queueType "${queueType}". Supported types: ${SUPPORTED_QUEUE_TYPES.join(', ')}`,
            'unsupported-queue-type',
        );
        return;
    }

    validateRequiredString(
        message,
        'queueName',
        stepKey,
        `${queueType} message trigger requires queue name`,
        'missing-queue',
        issues,
    );
    if (queueType !== QueueType.INTERNAL) {
        validateRequiredString(
            message,
            'connectionCode',
            stepKey,
            `${queueType} message trigger requires connectionCode`,
            'missing-connection-code',
            issues,
        );
    } else if (message.connectionCode !== undefined) {
        addTriggerIssue(
            issues,
            stepKey,
            'INTERNAL message triggers do not use connectionCode',
            'unsupported-internal-connection-code',
            'connectionCode',
        );
    }

    validateConsumerGroup(message, queueType, stepKey, issues);
    validateOptionalString(message, 'deadLetterQueue', stepKey, issues);
    validateOptionalBoolean(message, 'autoStart', stepKey, issues);

    if (message.ackMode !== undefined && message.ackMode !== AckMode.MANUAL) {
        addTriggerIssue(
            issues,
            stepKey,
            'message triggers require MANUAL acknowledgment so delivery follows the terminal pipeline-run outcome',
            'unsupported-ack-mode',
            'ackMode',
        );
    }

    const maxRetries = message.maxRetries;
    if (
        maxRetries !== undefined
        && (!Number.isSafeInteger(maxRetries) || Number(maxRetries) < 0 || Number(maxRetries) > QUEUE.MAX_MESSAGE_RETRIES)
    ) {
        addTriggerIssue(
            issues,
            stepKey,
            `maxRetries must be an integer from 0 to ${QUEUE.MAX_MESSAGE_RETRIES}`,
            'invalid-max-retries',
            'maxRetries',
        );
    }

    for (const limit of INTEGER_LIMITS) {
        const value = message[limit.field];
        if (value === undefined) continue;
        if (!Number.isSafeInteger(value) || Number(value) < limit.min || Number(value) > limit.max) {
            addTriggerIssue(
                issues,
                stepKey,
                `${limit.field} must be an integer from ${limit.min} to ${limit.max}`,
                limit.errorCode,
                limit.field,
            );
        }
    }
}

function validateRequiredString(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    message: string,
    errorCode: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
        addTriggerIssue(issues, stepKey, message, errorCode, field);
    }
}

function validateOptionalString(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
        addTriggerIssue(
            issues,
            stepKey,
            `${field} must be a non-empty string`,
            `invalid-${field.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`,
            field,
        );
    }
}

function validateOptionalBoolean(
    config: TriggerConfigRecord,
    field: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const value = config[field];
    if (value !== undefined && typeof value !== 'boolean') {
        addTriggerIssue(
            issues,
            stepKey,
            `${field} must be a boolean`,
            `invalid-${field.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`,
            field,
        );
    }
}

function validateConsumerGroup(
    config: TriggerConfigRecord,
    queueType: string,
    stepKey: string,
    issues: PipelineDefinitionIssue[],
): void {
    const consumerGroup = config.consumerGroup;
    if (consumerGroup === undefined) return;
    if (typeof consumerGroup !== 'string' || consumerGroup.trim().length === 0) {
        addTriggerIssue(
            issues,
            stepKey,
            'consumerGroup must be a non-empty string',
            'invalid-consumer-group',
            'consumerGroup',
        );
    } else if (queueType !== QueueType.REDIS_STREAMS) {
        addTriggerIssue(
            issues,
            stepKey,
            'consumerGroup is supported only for REDIS_STREAMS message triggers',
            'unsupported-consumer-group',
            'consumerGroup',
        );
    }
}
