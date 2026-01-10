/**
 * DataHub GraphQL Output Types
 *
 * Common output types used across DataHub resolvers.
 * These types define the structure of query/mutation responses.
 */

import { ID } from '@vendure/core';

// GENERIC OUTPUTS

/**
 * Standard success response
 */
export interface SuccessResponse {
    success: boolean;
    message?: string;
}

/**
 * Standard deletion response (mirrors Vendure's DeletionResponse)
 */
export interface DeletionResponseOutput {
    result: 'DELETED' | 'NOT_DELETED';
    message?: string;
}

// PIPELINE OUTPUTS

/**
 * Pipeline validation result
 */
export interface PipelineValidationResult {
    isValid: boolean;
    errors: string[];
}

/**
 * Pipeline run result
 */
export interface PipelineRunResult {
    runId: ID;
    status: string;
    startedAt: Date;
}

// ANALYTICS OUTPUTS

/**
 * Analytics overview
 */
export interface AnalyticsOverview {
    totalPipelines: number;
    activePipelines: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
}

/**
 * Pipeline performance metrics
 */
export interface PipelinePerformanceMetrics {
    pipelineId: ID;
    pipelineCode: string;
    totalRuns: number;
    successRate: number;
    averageDuration: number;
    recordsProcessed: number;
    lastRunAt?: Date;
}

/**
 * Error analytics
 */
export interface ErrorAnalytics {
    totalErrors: number;
    errorsByType: Array<{ type: string; count: number }>;
    errorsByStep: Array<{ stepKey: string; count: number }>;
    recentErrors: Array<{ id: ID; message: string; createdAt: Date }>;
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
    recordsPerMinute: number;
    recordsPerHour: number;
    peakThroughput: number;
    currentThroughput: number;
}

/**
 * Real-time stats
 */
export interface RealTimeStats {
    activeRuns: number;
    queuedRuns: number;
    recordsInFlight: number;
    errorsLastHour: number;
}

// QUEUE OUTPUTS

/**
 * Queue statistics
 */
export interface QueueStats {
    pending: number;
    running: number;
    failed: number;
    completedToday: number;
    byPipeline: Array<{ code: string; pending: number; running: number }>;
    recentFailed: Array<{ id: ID; code: string; finishedAt: Date; error?: string }>;
}

// WEBHOOK OUTPUTS

/**
 * Webhook delivery status
 */
export interface WebhookDeliveryOutput {
    deliveryId: string;
    webhookId: string;
    status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING' | 'DEAD_LETTER';
    attempts: number;
    lastAttemptAt?: Date;
    responseStatus?: number;
    error?: string;
}

/**
 * Webhook stats
 */
export interface WebhookStats {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    deadLetterCount: number;
}

// FEED OUTPUTS

/**
 * Feed generation result
 */
export interface FeedGenerationResult {
    success: boolean;
    itemCount: number;
    generatedAt: Date;
    downloadUrl?: string;
    errors: string[];
    warnings: string[];
}

/**
 * Feed preview result
 */
export interface FeedPreviewResult {
    content: string;
    contentType: string;
    itemCount: number;
}

/**
 * Feed format info
 */
export interface FeedFormatInfo {
    code: string;
    label: string;
    description: string;
}

// EXTRACTOR OUTPUTS

/**
 * Extractor GraphQL representation
 */
export interface ExtractorOutput {
    code: string;
    name: string;
    description?: string;
    category: string;
    version?: string;
    icon?: string;
    supportsPagination: boolean;
    supportsIncremental: boolean;
    supportsCancellation: boolean;
    isStreaming: boolean;
    isBatch: boolean;
    schema: ExtractorSchemaOutput;
}

/**
 * Extractor schema output
 */
export interface ExtractorSchemaOutput {
    fields: ExtractorFieldOutput[];
    groups?: ExtractorGroupOutput[];
}

/**
 * Extractor field output
 */
export interface ExtractorFieldOutput {
    key: string;
    label: string;
    description?: string;
    type: string;
    required?: boolean;
    defaultValue?: unknown;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
    group?: string;
    dependsOn?: {
        field: string;
        value: unknown;
        operator?: string;
    };
}

/**
 * Extractor group output
 */
export interface ExtractorGroupOutput {
    id: string;
    label: string;
    description?: string;
}

/**
 * Extractors by category
 */
export interface ExtractorsByCategoryOutput {
    category: string;
    label: string;
    extractors: ExtractorOutput[];
}

// FILE STORAGE OUTPUTS

/**
 * File response
 */
export interface FileResponse {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    hash: string;
    uploadedAt: string;
    expiresAt?: string;
    downloadUrl: string;
    previewUrl: string;
}

/**
 * File preview response
 */
export interface FilePreviewResponse {
    success: boolean;
    fileId: string;
    originalName: string;
    format: string;
    fields: Array<{ name: string; type: string; sample?: any }>;
    sampleData: any[];
    totalRows: number;
    warnings: string[];
}

/**
 * Storage stats
 */
export interface StorageStats {
    totalFiles: number;
    totalSize: number;
    usedSpace: number;
    availableSpace: number;
}
