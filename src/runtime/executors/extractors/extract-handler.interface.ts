/**
 * Extract Handler Interface
 *
 * Common interface for all extraction handlers to standardize
 * extraction operations across different data sources.
 *
 * @module runtime/executors/extractors
 */

import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../../executor-types';

/**
 * Configuration extracted from step.config
 */
export interface ExtractStepConfig {
    [key: string]: unknown;
}

/**
 * Result from extraction operation
 */
export interface ExtractResult {
    /** Extracted records */
    records: RecordObject[];
    /** Whether there are more records to fetch */
    hasMore?: boolean;
    /** Cursor/offset for next fetch */
    nextCursor?: string | number;
}

/**
 * HTTP authentication configuration stored in connections
 */
export interface StoredHttpAuthConfig {
    type: string;
    headerName?: string;
    secretCode?: string;
    username?: string;
    usernameSecretCode?: string;
}

/**
 * Normalized HTTP connection configuration
 */
export interface NormalizedHttpConnectionConfig {
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
    auth?: StoredHttpAuthConfig;
}

/**
 * Context for extraction operations
 */
export interface ExtractHandlerContext {
    /** Request context */
    ctx: RequestContext;
    /** Pipeline step definition */
    step: PipelineStepDefinition;
    /** Executor context with checkpoint data */
    executorCtx: ExecutorContext;
    /** Callback for record-level errors */
    onRecordError?: OnRecordErrorCallback;
}

/**
 * Base interface for all extract handlers
 */
export interface ExtractHandler {
    /**
     * Extract records from the data source
     */
    extract(context: ExtractHandlerContext): Promise<RecordObject[]>;
}

/**
 * Helper function to get typed config from step
 */
export function getExtractConfig<T>(step: PipelineStepDefinition): T {
    return (step.config ?? {}) as T;
}

/**
 * Helper to update checkpoint data
 */
export function updateCheckpoint(
    executorCtx: ExecutorContext,
    stepKey: string,
    data: Record<string, import('../../../types/index').JsonValue>,
): void {
    if (executorCtx.cpData) {
        executorCtx.cpData[stepKey] = { ...(executorCtx.cpData[stepKey] ?? {}), ...data };
        executorCtx.markCheckpointDirty();
    }
}

/**
 * Helper to get checkpoint value
 */
export function getCheckpointValue<T>(
    executorCtx: ExecutorContext,
    stepKey: string,
    key: string,
    defaultValue: T,
): T {
    return (executorCtx.cpData?.[stepKey]?.[key] as T) ?? defaultValue;
}
