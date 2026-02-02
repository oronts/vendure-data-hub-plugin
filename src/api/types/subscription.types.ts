/**
 * DataHub GraphQL Subscription Types
 *
 * Type definitions for all subscription payloads emitted through GraphQL subscriptions.
 * These types ensure type safety in subscription resolvers and match the event data
 * published by the DomainEventsService.
 */

import { RunStatus } from '../../constants/enums';
import { WebhookDeliveryStatus } from '../../services/webhooks/webhook.types';

/**
 * Pipeline run update subscription payload
 * Emitted when pipeline run status changes (started, progress, completed, failed, cancelled)
 */
export interface PipelineRunUpdate {
    /** Unique run identifier */
    runId: string;
    /** Pipeline code identifier */
    pipelineCode: string;
    /** Current run status */
    status: RunStatus;
    /** Progress percentage (0-100) */
    progressPercent: number;
    /** Human-readable progress message */
    progressMessage?: string;
    /** Total records processed so far */
    recordsProcessed: number;
    /** Total records that failed processing */
    recordsFailed: number;
    /** Currently executing step key */
    currentStep?: string;
    /** Timestamp when run started */
    startedAt?: Date;
    /** Timestamp when run finished (completed/failed/cancelled) */
    finishedAt?: Date;
    /** Error message if run failed */
    error?: string;
}

/**
 * Log entry subscription payload
 * Emitted when a new log entry is added during pipeline execution
 */
export interface LogEntry {
    /** Unique log entry identifier */
    id: string;
    /** Timestamp of the log entry */
    timestamp: Date;
    /** Log severity level */
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    /** Log message content */
    message: string;
    /** Pipeline code (if log is associated with a pipeline) */
    pipelineCode?: string;
    /** Run ID (if log is associated with a specific run) */
    runId?: string;
    /** Step key (if log is associated with a specific step) */
    stepKey?: string;
    /** Additional structured metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Webhook update subscription payload
 * Emitted when webhook delivery status changes
 */
export interface WebhookUpdate {
    /** Unique delivery identifier */
    deliveryId: string;
    /** Webhook configuration identifier */
    webhookId: string;
    /** Current delivery status */
    status: WebhookDeliveryStatus;
    /** Number of delivery attempts made */
    attempts: number;
    /** Timestamp of last delivery attempt */
    lastAttemptAt?: Date;
    /** HTTP response status code from webhook endpoint */
    responseStatus?: number;
    /** Error message if delivery failed */
    error?: string;
}

/**
 * Step progress subscription payload
 * Emitted when a pipeline step makes progress (started, progress, completed, failed)
 * Also includes record-level events (extracted, transformed, validated, loaded)
 */
export interface StepProgress {
    /** Run ID this step belongs to */
    runId: string;
    /** Step key identifier */
    stepKey: string;
    /** Step status derived from event type */
    status: string;
    /** Number of records received by the step */
    recordsIn: number;
    /** Number of records output by the step */
    recordsOut: number;
    /** Number of records that failed in this step */
    recordsFailed: number;
    /** Step execution duration in milliseconds */
    durationMs: number;
}
