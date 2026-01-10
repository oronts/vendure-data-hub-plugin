/**
 * DataHub Default Configuration Values
 *
 * Default settings and constants for the DataHub plugin.
 * This file re-exports values from the main constants module for convenience.
 */

import { DataHubPluginOptions } from '../types/index';
import {
    RETENTION,
    BATCH,
    WEBHOOK,
    HTTP,
    FILE_STORAGE,
    TIME_INTERVALS,
} from '../constants/index';

/**
 * Default plugin options
 */
export const DEFAULT_PLUGIN_OPTIONS: DataHubPluginOptions = {
    enabled: true,
    registerBuiltinAdapters: true,
    retentionDaysRuns: RETENTION.RUNS_DAYS,
    retentionDaysErrors: RETENTION.ERRORS_DAYS,
    debug: false,
};

/**
 * Default retention periods in days
 * @deprecated Use RETENTION from '../constants/defaults' instead
 */
export const DEFAULT_RETENTION = {
    /** Days to retain pipeline run records */
    RUNS: RETENTION.RUNS_DAYS,
    /** Days to retain error records */
    ERRORS: RETENTION.ERRORS_DAYS,
    /** Days to retain log entries */
    LOGS: 14,
} as const;

/**
 * Default concurrency settings
 * @deprecated Use BATCH from '../constants/defaults' instead
 */
export const DEFAULT_CONCURRENCY = {
    /** Default batch size for processing */
    BATCH_SIZE: BATCH.BULK_SIZE,
    /** Maximum concurrent pipeline runs */
    MAX_CONCURRENT_RUNS: BATCH.MAX_IN_FLIGHT,
    /** Default rate limit for API extractors (requests per second) */
    DEFAULT_RATE_LIMIT_RPS: BATCH.RATE_LIMIT_RPS,
} as const;

/**
 * Default timeout values in milliseconds
 * @deprecated Use HTTP, TIME_INTERVALS from '../constants' instead
 */
export const DEFAULT_TIMEOUTS = {
    /** Pipeline execution timeout */
    PIPELINE_EXECUTION: TIME_INTERVALS.PIPELINE_EXECUTION_TIMEOUT_MS,
    /** Individual step timeout */
    STEP_EXECUTION: TIME_INTERVALS.STEP_EXECUTION_TIMEOUT_MS,
    /** HTTP request timeout */
    HTTP_REQUEST: HTTP.TIMEOUT_MS,
    /** Database operation timeout */
    DATABASE_OPERATION: TIME_INTERVALS.DATABASE_OPERATION_TIMEOUT_MS,
} as const;

/**
 * Webhook configuration defaults
 * @deprecated Use WEBHOOK from '../constants/defaults' instead
 */
export const DEFAULT_WEBHOOK_CONFIG = {
    /** Maximum retry attempts for failed webhooks */
    MAX_RETRY_ATTEMPTS: WEBHOOK.MAX_ATTEMPTS,
    /** Initial delay between retries in ms */
    INITIAL_RETRY_DELAY_MS: WEBHOOK.INITIAL_DELAY_MS,
    /** Maximum delay between retries in ms */
    MAX_RETRY_DELAY_MS: WEBHOOK.MAX_DELAY_MS,
    /** Backoff multiplier for exponential backoff */
    BACKOFF_MULTIPLIER: WEBHOOK.BACKOFF_MULTIPLIER,
    /** Request timeout in ms */
    TIMEOUT_MS: WEBHOOK.TIMEOUT_MS,
} as const;

/**
 * File handling defaults
 * @deprecated Use FILE_STORAGE from '../constants/defaults' instead
 */
export const DEFAULT_FILE_CONFIG = {
    /** Maximum file size for upload (in bytes) */
    MAX_FILE_SIZE: FILE_STORAGE.MAX_FILE_SIZE_BYTES,
    /** Allowed file extensions */
    ALLOWED_EXTENSIONS: ['.csv', '.json', '.xml', '.xlsx', '.xls'],
    /** Default encoding for text files */
    DEFAULT_ENCODING: 'utf-8',
} as const;

/**
 * AutoMapper defaults
 */
export const DEFAULT_AUTOMAPPER_CONFIG = {
    /** Minimum confidence score for auto-mapping suggestions */
    CONFIDENCE_THRESHOLD: 0.7,
    /** Enable fuzzy matching for field names */
    ENABLE_FUZZY_MATCHING: true,
    /** Enable type inference from sample data */
    ENABLE_TYPE_INFERENCE: true,
    /** Case-sensitive field matching */
    CASE_SENSITIVE: false,
} as const;
