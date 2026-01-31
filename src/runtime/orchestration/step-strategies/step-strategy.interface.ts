/**
 * Step Strategy Interface
 *
 * Defines the contract for step execution strategies in linear pipeline execution.
 * Each strategy handles a specific step type (EXTRACT, TRANSFORM, LOAD, etc.).
 */

import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, PipelineStepDefinition, HookStageValue } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, ExecutorContext } from '../../executor-types';
import { HookService } from '../../../services/events/hook.service';
import { DomainEventsService } from '../../../services/events/domain-events.service';
import { StepLogCallback } from '../types';
import { getAdapterCode } from '../../../types/step-configs';

/**
 * Context passed to step strategies for execution
 */
export interface StepExecutionContext {
    /** Vendure request context */
    ctx: RequestContext;
    /** Pipeline definition */
    definition: PipelineDefinition;
    /** Current step to execute */
    step: PipelineStepDefinition;
    /** Input records for the step */
    records: RecordObject[];
    /** Executor context with checkpoint data */
    executorCtx: ExecutorContext;
    /** Hook service for running interceptors */
    hookService: HookService;
    /** Domain events service for publishing events */
    domainEvents: DomainEventsService;
    /** Pipeline ID for event context */
    pipelineId?: ID;
    /** Run ID for event context */
    runId?: ID;
    /** Optional step logging callback */
    stepLog?: StepLogCallback;
    /** Optional record error callback */
    onRecordError?: OnRecordErrorCallback;
}

/**
 * Result from step strategy execution
 */
export interface StepStrategyResult {
    /** Output records after step execution */
    records: RecordObject[];
    /** Number of records processed */
    processed: number;
    /** Number of records succeeded */
    succeeded: number;
    /** Number of records failed */
    failed: number;
    /** Step execution detail for reporting */
    detail: import('../../../types/index').JsonObject;
    /** Counter updates (extracted, transformed, loaded, etc.) */
    counters: Record<string, number>;
    /** Optional event to publish after step execution */
    event?: { type: string; data: Record<string, unknown> };
}

/**
 * Extended result for graph execution that supports branched outputs
 */
export interface GraphStepStrategyResult extends Omit<StepStrategyResult, 'records'> {
    /** Output records or branch outputs (for ROUTE steps) */
    output: RecordObject[] | import('../../executor-types').BranchOutput;
}

/**
 * Interface for step execution strategies
 *
 * Each strategy handles a specific step type and encapsulates:
 * - Hook execution (BEFORE_X/AFTER_X hooks)
 * - Actual step execution via appropriate executor
 * - Event publishing
 * - Step logging
 */
export interface StepStrategy {
    /**
     * Execute the step with the given context
     */
    execute(context: StepExecutionContext): Promise<StepStrategyResult>;
}

/**
 * Helper to safely publish domain events
 */
export function safePublish(
    domainEvents: DomainEventsService,
    eventType: string,
    payload: Record<string, unknown>,
    logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void },
): void {
    try {
        domainEvents.publish(eventType, payload);
    } catch (error) {
        logger?.warn(`Failed to publish ${eventType} event: ${(error as Error)?.message}`, payload);
    }
}

/**
 * Create a standard step detail object
 */
export function createStepDetail(
    step: PipelineStepDefinition,
    extra: import('../../../types/index').JsonObject,
    durationMs: number,
): import('../../../types/index').JsonObject {
    const adapterCode = getAdapterCode(step);
    return {
        stepKey: step.key,
        type: step.type,
        adapterCode,
        durationMs,
        ...extra,
    };
}
