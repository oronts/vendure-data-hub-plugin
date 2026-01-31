/**
 * Shared types for loader handlers
 */
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutionResult } from '../../executor-types';

/**
 * Base interface for all loader handlers
 */
export interface LoaderHandler {
    /**
     * Execute the loader for the given records
     */
    execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        errorHandling?: ErrorHandlingConfig,
    ): Promise<ExecutionResult>;

    /**
     * Simulate the loader for dry-run mode (optional)
     */
    simulate?(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<Record<string, unknown>>;
}

/**
 * Helper type for coerced product fields
 */
export interface CoercedProductFields {
    slug: string | undefined;
    name: string | undefined;
    description?: string;
    sku?: string;
    priceMinor?: number;
    priceByCurrency?: Record<string, number>;
    trackInventory?: boolean;
    stockOnHand?: number;
    stockByLocation?: Record<string, number>;
}
