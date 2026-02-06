import { TransactionalConnection, RequestContextService, ID } from '@vendure/core';
import { Pipeline } from '../../entities/pipeline';
import { PipelineStatus, AckMode, SCHEDULER } from '../../constants/index';
import type { PipelineDefinition } from '../../types/index';
import { DataHubLogger } from '../logger';
import { findEnabledTriggersByType, parseTriggerConfig } from '../../utils';

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
        const pipelines = await repo.find();

        const activeConfigs = new Map<string, MessageConsumerConfig>();

        for (const pipeline of pipelines) {
            if (pipeline.status !== PipelineStatus.PUBLISHED) continue;
            if (!pipeline.enabled) continue;

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
        const triggers = findEnabledTriggersByType(definition, 'message');
        if (triggers.length === 0) return [];

        const configs: MessageConsumerConfig[] = [];

        for (const trigger of triggers) {
            const cfg = parseTriggerConfig(trigger);
            if (!cfg) continue;

            const config = cfg as Record<string, unknown>;
            configs.push({
                pipelineId: pipeline.id,
                pipelineCode: pipeline.code,
                triggerKey: trigger.key,
                queueType: String(config.queueType ?? 'rabbitmq'),
                connectionCode: String(config.connectionCode ?? ''),
                queueName: String(config.queueName ?? ''),
                consumerGroup: config.consumerGroup as string | undefined,
                batchSize: Number(config.batchSize) || 10,
                concurrency: Number(config.concurrency) || 1,
                ackMode: (config.ackMode as AckMode) || AckMode.MANUAL,
                maxRetries: Number(config.maxRetries) || 3,
                deadLetterQueue: config.deadLetterQueue as string | undefined,
                pollIntervalMs: Number(config.pollIntervalMs) || SCHEDULER.MIN_INTERVAL_MS,
                autoStart: config.autoStart !== false,
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
