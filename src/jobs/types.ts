import { ID } from '@vendure/core';
import { TimerType } from '../constants/enums';

export interface PipelineRunJobData {
    /** The ID of the pipeline run to execute */
    runId: ID;
}

/**
 * Data payload for scheduled pipeline jobs
 */
export interface ScheduledPipelineJobData {
    /** The ID of the pipeline to trigger */
    pipelineId: ID;
    /** The code of the pipeline (for logging) */
    pipelineCode: string;
    /** Trigger type: interval or cron */
    triggerType: 'interval' | 'cron';
}

/**
 * Data payload for webhook retry jobs
 */
export interface WebhookRetryJobData {
    /** The ID of the webhook delivery to retry */
    deliveryId: string;
}

export interface JobResult {
    /** Whether the job completed successfully */
    success: boolean;
    /** Optional error message if failed */
    error?: string;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Job processing context
 */
export interface JobContext {
    /** Unique job ID */
    jobId: string;
    /** Attempt number (1-based) */
    attempt: number;
    /** Maximum attempts allowed */
    maxAttempts: number;
    /** Job creation timestamp */
    createdAt: Date;
}

export interface ScheduledTimer {
    /** Pipeline or task code */
    code: string;
    /** Trigger step key (for multiple triggers per pipeline) */
    triggerKey?: string;
    /** Timer handle from setInterval */
    handle: NodeJS.Timeout;
    /** Timer type */
    type: TimerType;
}

/**
 * Cron schedule configuration
 *
 * Uses `cron` as the canonical field name (more intuitive for users).
 */
export interface CronScheduleConfig {
    /** Cron expression (5 fields: minute hour day month weekday) */
    cron: string;
    /** Optional timezone */
    timezone?: string;
}

/**
 * Interval schedule configuration
 */
export interface IntervalScheduleConfig {
    /** Interval in seconds */
    intervalSec: number;
}

/**
 * Combined schedule configuration
 */
export type ScheduleConfig = CronScheduleConfig | IntervalScheduleConfig;

export interface JobQueueConfig {
    /** Queue name */
    name: string;
    /** Maximum concurrent jobs */
    concurrency?: number;
    /** Default job timeout in milliseconds */
    timeout?: number;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Retry delay in milliseconds */
    retryDelay?: number;
}

/**
 * Job options when adding to queue
 */
export interface JobOptions {
    /** Priority (higher = more urgent) */
    priority?: number;
    /** Delay before processing in milliseconds */
    delay?: number;
    /** Maximum retry attempts for this job */
    retries?: number;
}
