/**
 * Shared types for loader handlers
 */
import { RequestContext } from '@vendure/core';
import { PipelineStepDefinition, ErrorHandlingConfig, JsonObject } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';

export type LoaderSimulationOperation =
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'SKIP'
    | 'ERROR';

export interface LoaderSimulationRecordDetail extends JsonObject {
    recordId: string;
    entityType: string;
    operation: LoaderSimulationOperation;
    currentState: JsonObject | null;
    proposedState: JsonObject;
    validationErrors: string[];
    warnings: string[];
}

export interface LoaderSimulationResult extends Record<string, unknown> {
    supported: boolean;
    recordsIn: number;
    recordDetails: LoaderSimulationRecordDetail[];
    warning?: string;
}

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
    ): Promise<LoaderExecutionResult>;

    /**
     * Simulate the loader for dry-run mode (optional)
     */
    simulate?(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
    ): Promise<LoaderSimulationResult>;
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
    customFields?: Record<string, unknown>;
    enabled?: boolean;
}
