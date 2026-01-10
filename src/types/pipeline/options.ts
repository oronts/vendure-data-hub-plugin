/**
 * Pipeline Options Types
 */

import { ErrorStrategy } from './definition';

export interface PipelineOptions {
    /** Batch size for processing */
    batchSize?: number;

    /** Error handling strategy */
    onError?: ErrorStrategy;

    /** Max retries for failed records */
    maxRetries?: number;

    /** Retry delay in milliseconds */
    retryDelayMs?: number;

    /** Dry run mode - validate without persisting */
    dryRun?: boolean;

    /** Validate against schema before processing */
    validateWithSchema?: boolean;

    /** Publish product changes (make visible) */
    publishChanges?: boolean;

    /** Skip duplicate records (based on lookup fields) */
    skipDuplicates?: boolean;

    /** For UPDATE: only update specified fields */
    updateOnlyFields?: string[];

    /** For UPSERT: fields to only set on create */
    createOnlyFields?: string[];

    /** Rate limiting */
    rateLimit?: {
        recordsPerSecond?: number;
        maxConcurrent?: number;
    };

    /** Notifications */
    notifications?: {
        onComplete?: boolean;
        onError?: boolean;
        webhookUrl?: string;
        emailTo?: string[];
    };
}
