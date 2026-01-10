/**
 * DataHub GraphQL Resolver Arguments
 *
 * Common argument types used in resolver methods.
 * These types define the structure of query/mutation arguments.
 */

import { ID, ListQueryOptions, VendureEntity } from '@vendure/core';

// GENERIC ARGS

/**
 * Standard ID argument
 */
export interface IdArgs {
    id: ID;
}

/**
 * Standard list query args with options
 */
export interface ListQueryArgs<T extends VendureEntity> {
    options?: ListQueryOptions<T>;
}

// PIPELINE ARGS

/**
 * Pipeline query args
 */
export interface PipelineArgs {
    id: ID;
}

/**
 * Pipeline runs query args
 */
export interface PipelineRunsArgs {
    pipelineId?: ID;
    options?: ListQueryOptions<any>;
}

/**
 * Pipeline run args
 */
export interface PipelineRunArgs {
    id: ID;
}

/**
 * Start pipeline run args
 */
export interface StartRunArgs {
    pipelineId: ID;
}

/**
 * Cancel pipeline run args
 */
export interface CancelRunArgs {
    id: ID;
}

/**
 * Pipeline dependencies args
 */
export interface PipelineDependenciesArgs {
    id: ID;
}

/**
 * Pipeline revisions args
 */
export interface PipelineRevisionsArgs {
    pipelineId: ID;
}

/**
 * Revert to revision args
 */
export interface RevertToRevisionArgs {
    revisionId: ID;
}

/**
 * Validate definition args
 */
export interface ValidateDefinitionArgs {
    definition: any;
}

// ANALYTICS ARGS

/**
 * Pipeline performance args
 */
export interface PipelinePerformanceArgs {
    pipelineId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

/**
 * Error analytics args
 */
export interface ErrorAnalyticsArgs {
    pipelineId?: string;
    fromDate?: string;
    toDate?: string;
}

/**
 * Throughput metrics args
 */
export interface ThroughputMetricsArgs {
    pipelineId?: string;
    intervalMinutes?: number;
    periods?: number;
}

// WEBHOOK ARGS

/**
 * Webhook deliveries args
 */
export interface WebhookDeliveriesArgs {
    status?: string;
    webhookId?: string;
    limit?: number;
}

/**
 * Webhook delivery args
 */
export interface WebhookDeliveryArgs {
    deliveryId: string;
}

/**
 * Retry dead letter args
 */
export interface RetryDeadLetterArgs {
    deliveryId: string;
}

// EXPORT DESTINATION ARGS

/**
 * Export destination args
 */
export interface ExportDestinationArgs {
    id: string;
}

/**
 * Deliver to destination args
 */
export interface DeliverToDestinationArgs {
    destinationId: string;
    content: string;
    filename: string;
    mimeType?: string;
}

// ERROR & QUARANTINE ARGS

/**
 * Run errors args
 */
export interface RunErrorsArgs {
    runId: ID;
}

/**
 * Retry record args
 */
export interface RetryRecordArgs {
    errorId: ID;
    patch?: any;
}

/**
 * Record retry audits args
 */
export interface RecordRetryAuditsArgs {
    errorId: ID;
}

/**
 * Mark dead letter args
 */
export interface MarkDeadLetterArgs {
    id: ID;
    deadLetter: boolean;
}

// FEED ARGS

/**
 * Generate feed args
 */
export interface GenerateFeedArgs {
    feedCode: string;
}

/**
 * Preview feed args
 */
export interface PreviewFeedArgs {
    feedCode: string;
    limit?: number;
}

// EXTRACTOR ARGS

/**
 * Extractor args
 */
export interface ExtractorArgs {
    code: string;
}

// CHECKPOINT ARGS

/**
 * Checkpoint query args
 */
export interface CheckpointArgs {
    pipelineId: ID;
}

/**
 * Set checkpoint args
 */
export interface SetCheckpointArgs {
    pipelineId: ID;
    data: any;
}

// EVENTS ARGS

/**
 * Events query args
 */
export interface EventsArgs {
    limit?: number;
}

// HOOK ARGS

/**
 * Pipeline hooks args
 */
export interface PipelineHooksArgs {
    pipelineId: ID;
}

/**
 * Run hook test args
 */
export interface RunHookTestArgs {
    pipelineId: ID;
    stage: string;
    payload?: any;
}

// LOG ARGS

/**
 * Run logs args
 */
export interface RunLogsArgs {
    runId: string;
}

/**
 * Log stats args
 */
export interface LogStatsArgs {
    pipelineId?: string;
}

/**
 * Recent logs args
 */
export interface RecentLogsArgs {
    limit?: number;
}

// SUBSCRIPTION ARGS

/**
 * Pipeline run updated subscription args
 */
export interface PipelineRunUpdatedArgs {
    pipelineCode?: string;
}

/**
 * Log added subscription args
 */
export interface LogAddedArgs {
    pipelineCode?: string;
    level?: string[];
}

/**
 * Webhook updated subscription args
 */
export interface WebhookUpdatedArgs {
    webhookId?: string;
}

/**
 * Step progress subscription args
 */
export interface StepProgressArgs {
    runId: string;
}
