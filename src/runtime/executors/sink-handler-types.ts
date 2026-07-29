import type { RequestContext } from '@vendure/core';
import type { PipelineStepDefinition } from '../../types';
import type { ExecutionResult, OnRecordErrorCallback, RecordObject } from '../executor-types';
import type { SecretService } from '../../services/config/secret.service';
import type { ConnectionService } from '../../services/config/connection.service';
import type { CircuitBreakerService } from '../../services/runtime';
import type { DataHubLogger } from '../../services/logger';

export const SINK_ADAPTER_CODES = {
    MEILISEARCH: 'meilisearch',
    ELASTICSEARCH: 'elasticsearch',
    OPENSEARCH: 'opensearch',
    ALGOLIA: 'algolia',
    TYPESENSE: 'typesense',
    QUEUE_PRODUCER: 'queueProducer',
    WEBHOOK: 'webhook',
} as const;

export type SinkAdapterCode = typeof SINK_ADAPTER_CODES[keyof typeof SINK_ADAPTER_CODES];

export interface BaseSinkCfg {
    adapterCode?: string;
    indexName?: string;
    idField?: string;
    batchSize?: number;
    fields?: string[];
    excludeFields?: string[];
    host?: string;
    node?: string;
    port?: number;
    protocol?: string;
    apiKeySecretCode?: string;
    usernameSecretCode?: string;
    passwordSecretCode?: string;
    appId?: string;
    collectionName?: string;
    primaryKey?: string;
    defaultOperation?: string;
    languageCode?: string;
}

/**
 * Queue producer sink configuration
 */
export interface QueueProducerSinkCfg extends BaseSinkCfg {
    queueType?: string;
    connectionCode?: string;
    queueName?: string;
    routingKey?: string;
    headers?: Record<string, string>;
    batchSize?: number;
    persistent?: boolean;
    priority?: number;
    ttlMs?: number;
}

/**
 * Webhook sink configuration
 */
export interface WebhookSinkCfg extends BaseSinkCfg {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    bearerTokenSecretCode?: string;
    apiKeyHeader?: string;
    hmacSecretCode?: string;
    signatureHeaderName?: string;
    batchSize?: number;
    timeoutMs?: number;
    retries?: number;
}

/**
 * Context passed to sink handler functions for executing a single sink type
 */
export interface SinkHandlerContext {
    ctx: RequestContext;
    step: PipelineStepDefinition;
    input: RecordObject[];
    cfg: BaseSinkCfg;
    indexName: string;
    idField: string;
    bulkSize: number;
    prepareDoc: (rec: RecordObject) => RecordObject;
    onRecordError?: OnRecordErrorCallback;

    operation?: string;
}

/**
 * Service dependencies injected into handler functions
 */
export interface SinkServices {
    secretService: SecretService;
    connectionService: ConnectionService;
    circuitBreaker: CircuitBreakerService;
    logger: DataHubLogger;
}

/**
 * Handler function type for built-in sink adapters
 */
export type SinkHandler = (handlerCtx: SinkHandlerContext, services: SinkServices) => Promise<ExecutionResult>;

export type SinkDeleteHandler = (
    handlerCtx: SinkHandlerContext,
    services: SinkServices,
    ids: string[],
) => Promise<ExecutionResult>;
