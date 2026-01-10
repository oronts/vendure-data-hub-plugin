/**
 * DataHub Jobs - Type definitions
 *
 * Types for job data, job processing, and scheduler configuration.
 */

import { ID } from '@vendure/core';

// JOB DATA TYPES

/**
 * Data payload for pipeline run jobs
 */
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

// JOB STATUS TYPES

/**
 * Job processing result
 */
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

// SCHEDULER TYPES

/**
 * Scheduled timer reference
 */
export interface ScheduledTimer {
    /** Pipeline or task code */
    code: string;
    /** Timer handle from setInterval */
    handle: NodeJS.Timeout;
    /** Timer type */
    type: 'interval' | 'cron' | 'refresh';
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

// JOB QUEUE CONFIGURATION

/**
 * Job queue configuration options
 */
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

// TYPE GUARDS

/**
 * Check if schedule config is cron-based
 */
export function isCronSchedule(config: ScheduleConfig): config is CronScheduleConfig {
    return 'cron' in config && typeof config.cron === 'string';
}

/**
 * Check if schedule config is interval-based
 */
export function isIntervalSchedule(config: ScheduleConfig): config is IntervalScheduleConfig {
    return 'intervalSec' in config && typeof config.intervalSec === 'number';
}

/**
 * Get the cron expression from a config
 */
export function getCronExpression(config: ScheduleConfig): string | undefined {
    if ('cron' in config && typeof config.cron === 'string') {
        return config.cron;
    }
    return undefined;
}
