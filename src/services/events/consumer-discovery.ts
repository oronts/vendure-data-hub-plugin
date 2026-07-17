import { TransactionalConnection, RequestContextService, ID } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineStatus, AckMode, QUEUE } from '../../constants/index';
import { TriggerType as TriggerTypeEnum, QueueType } from '../../constants/enums';
import type { PipelineDefinition } from '../../types/index';
import { DataHubLogger } from '../logger';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';

function boundedInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function optionalBoundedInteger(
    value: unknown,
    min: number,
    max: number,
): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return undefined;
    return Math.min(max, Math.max(min, parsed));
}

/**
 * Message consumer configuration extracted from pipeline trigger
 */
export interface MessageConsumerConfig {
    pipelineId: ID;
    pipelineCode: string;
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
     * Discover all active message consumer configurations from published pipelines
     */
    async discoverActiveConfigs(): Promise<Map<string, MessageConsumerConfig>> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipelines = await repo.find({
            where: { status: PipelineStatus.PUBLISHED, enabled: true },
        });

        const activeConfigs = new Map<string, MessageConsumerConfig>();

        for (const pipeline of pipelines) {

            const configs = this.extractMessageConfigs(pipeline);
            for (const config of configs) {
                if (config.autoStart) {
                    const compositeKey = getConsumerKey(config.pipelineCode, config.triggerKey);
                    activeConfigs.set(compositeKey, config);
                }
            }
        }

        return activeConfigs;
    }

    /**
     * Get consumer configs for a specific pipeline by code
     */
    async getConfigsByPipelineCode(pipelineCode: string): Promise<MessageConsumerConfig[]> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const repo = this.connection.getRepository(ctx, Pipeline);
        const pipeline = await repo.findOne({ where: { code: pipelineCode } });

        if (!pipeline) {
            throw new Error(`Pipeline not found: ${pipelineCode}`);
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
    extractMessageConfigs(pipeline: Pipeline): MessageConsumerConfig[] {
        const definition = pipeline.definition as PipelineDefinition | undefined;
        const triggers = findEnabledTriggersByType(definition, TriggerTypeEnum.MESSAGE);
        if (triggers.length === 0) return [];

        const configs: MessageConsumerConfig[] = [];

        for (const trigger of triggers) {
            const cfg = parseTriggerConfig(trigger);
            if (!cfg) continue;

            const config = cfg as Record<string, unknown>;
            const msg = (config.message as Record<string, unknown> | undefined) ?? {};
            configs.push({
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                triggerKey: trigger.key,
                queueType: String(msg.queueType ?? QueueType.RABBITMQ).toLowerCase().replace(/_/g, '-'),
                connectionCode: String(msg.connectionCode ?? ''),
                queueName: String(msg.queueName ?? ''),
                consumerGroup: msg.consumerGroup as string | undefined,
                batchSize: boundedInteger(
                    msg.batchSize,
                    QUEUE.DEFAULT_MESSAGE_BATCH_SIZE,
                    QUEUE.MIN_MESSAGE_BATCH_SIZE,
                    QUEUE.MAX_MESSAGE_BATCH_SIZE,
                ),
                concurrency: boundedInteger(
                    msg.concurrency,
                    QUEUE.DEFAULT_MESSAGE_CONCURRENCY,
                    QUEUE.MIN_MESSAGE_CONCURRENCY,
                    QUEUE.MAX_MESSAGE_CONCURRENCY,
                ),
                ackMode: (msg.ackMode as AckMode) || AckMode.MANUAL,
                maxRetries: Math.min(
                    QUEUE.MAX_MESSAGE_RETRIES,
                    Math.max(0, Number(msg.maxRetries ?? QUEUE.DEFAULT_MESSAGE_RETRIES) || 0),
                ),
                deadLetterQueue: msg.deadLetterQueue as string | undefined,
                pollIntervalMs: boundedInteger(
                    msg.pollIntervalMs,
                    QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
                    QUEUE.DEFAULT_MESSAGE_POLL_INTERVAL_MS,
                    QUEUE.MAX_MESSAGE_POLL_INTERVAL_MS,
                ),
                autoStart: msg.autoStart !== false,
                prefetch: optionalBoundedInteger(
                    msg.prefetch,
                    QUEUE.MIN_MESSAGE_PREFETCH,
                    QUEUE.MAX_MESSAGE_PREFETCH,
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
