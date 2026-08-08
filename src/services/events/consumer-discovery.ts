import { TransactionalConnection, RequestContextService, ID } from '@vendure/core';
import { AckMode, QUEUE } from '../../constants/index';
import { TriggerType as TriggerTypeEnum, QueueType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types/index';
import { DataHubLogger } from '../logger';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';
import {
    type ActivePipelineDefinition,
    loadRunnablePipelineDefinitionByCode,
    loadRunnablePipelineDefinitions,
} from '../pipeline/active-pipeline-definitions';
import { toErrorOrUndefined } from '../../utils/error.utils';

function boundedInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
    field: string,
): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new Error(`${field} must be an integer from ${min} to ${max}`);
    }
    return Number(value);
}

function optionalBoundedInteger(
    value: unknown,
    min: number,
    max: number,
    field: string,
): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
        throw new Error(`${field} must be an integer from ${min} to ${max}`);
    }
    return Number(value);
}

const MESSAGE_TRIGGER_QUEUE_TYPES = new Set<string>([
    QueueType.RABBITMQ_AMQP,
    QueueType.SQS,
    QueueType.REDIS_STREAMS,
    QueueType.INTERNAL,
]);

function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} must be a non-empty string`);
    }
    return value;
}

function optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    return requiredString(value, field);
}

function parseQueueType(value: unknown): string {
    if (typeof value !== 'string' || !MESSAGE_TRIGGER_QUEUE_TYPES.has(value)) {
        throw new Error(
            `queueType must be one of ${Array.from(MESSAGE_TRIGGER_QUEUE_TYPES).join(', ')}`,
        );
    }
    return value.toLowerCase().replace(/_/g, '-');
}

/**
 * Message consumer configuration extracted from pipeline trigger
 */
export interface MessageConsumerConfig {
    pipelineId: ID;
    pipelineCode: string;
    revisionId: ID;
    /** Trigger key for tracking multiple triggers per pipeline */
    triggerKey: string;
    queueType: string;
    connectionCode: string;
    queueName: string;
    consumerGroup?: string;
    batchSize: number;
    concurrency: number;
    ackMode: AckMode;
    maxRetries: number;
    deadLetterQueue?: string;
    pollIntervalMs: number;
    autoStart: boolean;
    prefetch?: number;
}

/**
 * Consumer Discovery Module
 *
 * Handles discovering pipelines with message triggers and extracting
 * consumer configurations from pipeline definitions.
 */
export class ConsumerDiscovery {
    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private logger: DataHubLogger,
    ) {}

    /**
     * Discover every configured message consumer from runnable pipeline revisions
     */
    async discoverConfigs(): Promise<Map<string, MessageConsumerConfig>> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const pipelines = await loadRunnablePipelineDefinitions(this.connection, ctx);

        const configuredConsumers = new Map<string, MessageConsumerConfig>();

        for (const pipeline of pipelines) {
            let configs: MessageConsumerConfig[];
            try {
                configs = this.extractMessageConfigs(pipeline);
            } catch (error) {
                this.logger.error(
                    'Skipping pipeline with invalid message consumer configuration',
                    toErrorOrUndefined(error),
                    { pipelineCode: pipeline.code, revisionId: pipeline.revisionId },
                );
                continue;
            }
            for (const config of configs) {
                const compositeKey = getConsumerKey(config.pipelineCode, config.triggerKey);
                configuredConsumers.set(compositeKey, config);
            }
        }

        return configuredConsumers;
    }

    /**
     * Get consumer configs for a specific pipeline by code
     */
    async getConfigsByPipelineCode(pipelineCode: string): Promise<MessageConsumerConfig[]> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const pipeline = await loadRunnablePipelineDefinitionByCode(
            this.connection,
            ctx,
            pipelineCode,
        );

        if (!pipeline) {
            throw new Error(`Runnable pipeline not found: ${pipelineCode}`);
        }

        const configs = this.extractMessageConfigs(pipeline);
        if (configs.length === 0) {
            throw new Error(`Pipeline ${pipelineCode} does not have any message triggers`);
        }

        return configs;
    }

    /**
     * Extract ALL message consumer configurations from pipeline
     * Finds all enabled message triggers and returns a config for each
     */
    extractMessageConfigs(pipeline: ActivePipelineDefinition): MessageConsumerConfig[] {
        const definition = pipeline.definition as PipelineDefinition | undefined;
        const triggers = findEnabledTriggersByType(definition, TriggerTypeEnum.MESSAGE);
        if (triggers.length === 0) return [];

        const configs: MessageConsumerConfig[] = [];

        for (const trigger of triggers) {
            const cfg = parseTriggerConfig(trigger);
            if (!cfg) continue;

            const config = cfg as Record<string, unknown>;
            if (
                config.message === null
                || typeof config.message !== 'object'
                || Array.isArray(config.message)
            ) {
                throw new Error(`Trigger ${trigger.key} requires a message configuration object`);
            }
            const msg = config.message as Record<string, unknown>;
            const queueType = parseQueueType(msg.queueType);
            const isInternal = queueType === 'internal';
            if (isInternal && msg.connectionCode !== undefined) {
                throw new Error('INTERNAL message triggers do not use connectionCode');
            }
            const consumerGroup = optionalString(msg.consumerGroup, 'consumerGroup');
            if (consumerGroup && queueType !== 'redis-streams') {
                throw new Error('consumerGroup is supported only for REDIS_STREAMS message triggers');
            }
            const ackMode = msg.ackMode ?? AckMode.MANUAL;
            if (ackMode !== AckMode.MANUAL) {
                throw new Error('Message triggers require MANUAL acknowledgment');
            }
            if (msg.autoStart !== undefined && typeof msg.autoStart !== 'boolean') {
                throw new Error('autoStart must be a boolean');
            }
            configs.push({
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                revisionId: pipeline.revisionId,
                triggerKey: trigger.key,
                queueType,
                connectionCode: isInternal ? '' : requiredString(msg.connectionCode, 'connectionCode'),
                queueName: requiredString(msg.queueName, 'queueName'),
                consumerGroup,
                batchSize: boundedInteger(
                    msg.batchSize,
                    QUEUE.DEFAULT_MESSAGE_BATCH_SIZE,
                    QUEUE.MIN_MESSAGE_BATCH_SIZE,
                    QUEUE.MAX_MESSAGE_BATCH_SIZE,
                    'batchSize',
                ),
                concurrency: boundedInteger(
                    msg.concurrency,
                    QUEUE.DEFAULT_MESSAGE_CONCURRENCY,
                    QUEUE.MIN_MESSAGE_CONCURRENCY,
                    QUEUE.MAX_MESSAGE_CONCURRENCY,
                    'concurrency',
                ),
                ackMode,
                maxRetries: boundedInteger(
                    msg.maxRetries,
                    QUEUE.DEFAULT_MESSAGE_RETRIES,
                    0,
                    QUEUE.MAX_MESSAGE_RETRIES,
                    'maxRetries',
                ),
                deadLetterQueue: optionalString(msg.deadLetterQueue, 'deadLetterQueue'),
                pollIntervalMs: boundedInteger(
                    msg.pollIntervalMs,
                    QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
                    QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
                    QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS,
                    'pollIntervalMs',
                ),
                autoStart: msg.autoStart !== false,
                prefetch: optionalBoundedInteger(
                    msg.prefetch,
                    QUEUE.MIN_MESSAGE_PREFETCH,
                    QUEUE.MAX_MESSAGE_PREFETCH,
                    'prefetch',
                ),
            });
        }

        return configs;
    }
}

/**
 * Get composite key for consumer tracking (supports multiple triggers per pipeline)
 */
export function getConsumerKey(pipelineCode: string, triggerKey: string): string {
    return `${pipelineCode}:${triggerKey}`;
}

export function shouldRunConsumer(
    config: MessageConsumerConfig,
    override: boolean | undefined,
): boolean {
    return override ?? config.autoStart;
}

export function getConsumerConfigFingerprint(config: MessageConsumerConfig): string {
    return JSON.stringify({
        pipelineId: String(config.pipelineId),
        revisionId: String(config.revisionId),
        pipelineCode: config.pipelineCode,
        triggerKey: config.triggerKey,
        queueType: config.queueType,
        connectionCode: config.connectionCode,
        queueName: config.queueName,
        consumerGroup: config.consumerGroup ?? null,
        batchSize: config.batchSize,
        concurrency: config.concurrency,
        ackMode: config.ackMode,
        maxRetries: config.maxRetries,
        deadLetterQueue: config.deadLetterQueue ?? null,
        pollIntervalMs: config.pollIntervalMs,
        prefetch: config.prefetch ?? null,
    });
}
