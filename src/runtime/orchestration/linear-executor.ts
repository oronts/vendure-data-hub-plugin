/**
 * Linear Executor
 *
 * Handles linear pipeline execution where steps are executed sequentially
 * in the order they are defined (no graph edges).
 */

import { Logger } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, StepType } from '../../types/index';
import {
    RecordObject,
    OnRecordErrorCallback,
    ExecutorContext,
} from '../executor-types';
import {
    ExtractExecutor,
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
} from '../executors';
// Direct imports to avoid circular dependencies
import { HookService } from '../../services/events/hook.service';
import { DomainEventsService } from '../../services/events/domain-events.service';
import { StepLogCallback, StepLogInfo } from './types';

const logger = new Logger('DataHub:LinearExecutor');

/**
 * Linear execution result
 */
export interface LinearExecutionResult {
    processed: number;
    succeeded: number;
    failed: number;
    details: Array<Record<string, any>>;
    counters: Record<string, number>;
}

/**
 * Executes a linear pipeline (sequential steps)
 */
export async function executeLinear(params: {
    ctx: RequestContext;
    definition: PipelineDefinition;
    executorCtx: ExecutorContext;
    hookService: HookService;
    domainEvents: DomainEventsService;
    extractExecutor: ExtractExecutor;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    loadWithThroughput: (
        ctx: RequestContext,
        step: any,
        batch: RecordObject[],
        definition: PipelineDefinition,
        onRecordError?: OnRecordErrorCallback,
    ) => Promise<{ ok: number; fail: number }>;
    applyIdempotency: (records: RecordObject[], definition: PipelineDefinition) => RecordObject[];
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    runId?: ID;
    /** Optional step logging callback for database persistence */
    stepLog?: StepLogCallback;
}): Promise<LinearExecutionResult> {
    const {
        ctx,
        definition,
        executorCtx,
        hookService,
        domainEvents,
        extractExecutor,
        transformExecutor,
        loadExecutor,
        exportExecutor,
        feedExecutor,
        sinkExecutor,
        loadWithThroughput,
        applyIdempotency,
        onCancelRequested,
        onRecordError,
        pipelineId,
        runId,
        stepLog,
    } = params;

    let records: RecordObject[] = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const details: any[] = [];
    const counters: Record<string, number> = {
        extracted: 0,
        transformed: 0,
        validated: 0,
        enriched: 0,
        routed: 0,
        loaded: 0,
        rejected: 0,
    };

    await hookService.run(ctx, definition, 'pipelineStarted');
    try {
        domainEvents.publish('PipelineStarted', { pipelineId });
    } catch (error) {
        logger.warn(`Failed to publish PipelineStarted event: ${(error as Error)?.message}`, { pipelineId });
    }

    let cancelled = false;

    for (const step of definition.steps) {
        if (onCancelRequested && (await onCancelRequested())) {
            cancelled = true;
            details.push({
                stepKey: step.key,
                type: step.type,
                status: 'cancelled',
                durationMs: 0,
            });
            try {
                domainEvents.publish('PipelineCancelled', {
                    pipelineId,
                    stepKey: step.key,
                    cancelledAt: new Date().toISOString(),
                });
                domainEvents.publish('PipelineStepSkipped', {
                    pipelineId,
                    stepKey: step.key,
                    reason: 'cancelled',
                });
            } catch (error) {
                logger.warn(`Failed to publish cancellation events: ${(error as Error)?.message}`, { pipelineId, stepKey: step.key });
            }
            break;
        }

        const t0 = Date.now();

        switch (step.type) {
            case StepType.TRIGGER:
                // Triggers are handled at pipeline start, skip here
                details.push({
                    stepKey: step.key,
                    type: 'TRIGGER',
                    skipped: true,
                    durationMs: 0,
                });
                try {
                    domainEvents.publish('PipelineStepSkipped', {
                        pipelineId,
                        stepKey: step.key,
                        reason: 'trigger-step',
                    });
                } catch (error) {
                    logger.warn(`Failed to publish PipelineStepSkipped event: ${(error as Error)?.message}`, { pipelineId, stepKey: step.key });
                }
                continue;

            case StepType.EXTRACT: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'EXTRACT', 0);
                }
                const beforeExtractResult = await hookService.runInterceptors(ctx, definition, 'beforeExtract', records, runId, pipelineId);
                records = beforeExtractResult.records;

                const out = await extractExecutor.execute(ctx, step, executorCtx, onRecordError);
                records = out;
                processed += out.length;
                succeeded += out.length;
                counters.extracted += out.length;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'EXTRACT',
                    adapterCode,
                    out: out.length,
                    durationMs,
                });
                const afterExtractResult = await hookService.runInterceptors(ctx, definition, 'afterExtract', records, runId, pipelineId);
                records = afterExtractResult.records;
                // Log extracted data (DEBUG level)
                if (stepLog?.onExtractData) {
                    await stepLog.onExtractData(ctx, step.key, adapterCode, out);
                }
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'EXTRACT',
                        adapterCode,
                        recordsIn: 0,
                        recordsOut: out.length,
                        succeeded: out.length,
                        failed: 0,
                        durationMs,
                        sampleOutput: out[0] as RecordObject | undefined,
                    });
                }
                try {
                    domainEvents.publish('RecordExtracted', { stepKey: step.key, count: out.length });
                } catch (error) {
                    logger.warn(`Failed to publish RecordExtracted event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.TRANSFORM: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                const sampleInput = records[0] as RecordObject | undefined;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'TRANSFORM', recordsIn);
                }
                const beforeTransformResult = await hookService.runInterceptors(ctx, definition, 'beforeTransform', records, runId, pipelineId);
                records = beforeTransformResult.records;

                const out = await transformExecutor.executeOperator(ctx, step, records, executorCtx);
                records = out;
                counters.transformed += out.length;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'TRANSFORM',
                    adapterCode,
                    out: out.length,
                    durationMs,
                });
                const afterTransformResult = await hookService.runInterceptors(ctx, definition, 'afterTransform', records, runId, pipelineId);
                records = afterTransformResult.records;
                // Log field mappings (DEBUG level) - compare first input/output record
                if (stepLog?.onTransformMapping && sampleInput && out[0]) {
                    await stepLog.onTransformMapping(ctx, step.key, adapterCode, sampleInput, out[0]);
                }
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'TRANSFORM',
                        adapterCode,
                        recordsIn,
                        recordsOut: out.length,
                        succeeded: out.length,
                        failed: 0,
                        durationMs,
                        sampleInput,
                        sampleOutput: out[0] as RecordObject | undefined,
                    });
                }
                try {
                    domainEvents.publish('RecordTransformed', { stepKey: step.key, count: out.length });
                } catch (error) {
                    logger.warn(`Failed to publish RecordTransformed event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.VALIDATE: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'VALIDATE', recordsIn);
                }
                const beforeValidateResult = await hookService.runInterceptors(ctx, definition, 'beforeValidate', records, runId, pipelineId);
                records = beforeValidateResult.records;

                const out = await transformExecutor.executeValidate(ctx, step, records, onRecordError);
                records = out;
                counters.validated += out.length;
                const durationMs = Date.now() - t0;
                const failedCount = recordsIn - out.length;
                details.push({
                    stepKey: step.key,
                    type: 'VALIDATE',
                    adapterCode,
                    out: out.length,
                    durationMs,
                });
                const afterValidateResult = await hookService.runInterceptors(ctx, definition, 'afterValidate', records, runId, pipelineId);
                records = afterValidateResult.records;
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'VALIDATE',
                        adapterCode,
                        recordsIn,
                        recordsOut: out.length,
                        succeeded: out.length,
                        failed: failedCount,
                        durationMs,
                    });
                }
                try {
                    domainEvents.publish('RecordValidated', { stepKey: step.key, count: out.length });
                } catch (error) {
                    logger.warn(`Failed to publish RecordValidated event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.ENRICH:
            case StepType.ROUTE: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                const stepTypeName = step.type === StepType.ENRICH ? 'ENRICH' : 'ROUTE';
                const hookPrefix = step.type === StepType.ENRICH ? 'Enrich' : 'Route';
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, stepTypeName, recordsIn);
                }
                const beforeResult = await hookService.runInterceptors(ctx, definition, `before${hookPrefix}` as any, records, runId, pipelineId);
                records = beforeResult.records;

                const out = await transformExecutor.executeRoute(ctx, step, records, onRecordError);
                records = out;
                const durationMs = Date.now() - t0;
                if (step.type === StepType.ENRICH) {
                    counters.enriched += out.length;
                    try {
                        domainEvents.publish('RecordEnriched', { stepKey: step.key, count: out.length });
                    } catch (error) {
                        logger.warn(`Failed to publish RecordEnriched event: ${(error as Error)?.message}`, { stepKey: step.key });
                    }
                } else {
                    counters.routed += out.length;
                    try {
                        domainEvents.publish('RecordRouted', { stepKey: step.key, count: out.length });
                    } catch (error) {
                        logger.warn(`Failed to publish RecordRouted event: ${(error as Error)?.message}`, { stepKey: step.key });
                    }
                }
                details.push({
                    stepKey: step.key,
                    type: step.type,
                    adapterCode,
                    out: out.length,
                    durationMs,
                });
                const afterResult = await hookService.runInterceptors(ctx, definition, `after${hookPrefix}` as any, records, runId, pipelineId);
                records = afterResult.records;
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: stepTypeName,
                        adapterCode,
                        recordsIn,
                        recordsOut: out.length,
                        succeeded: out.length,
                        failed: 0,
                        durationMs,
                    });
                }
                break;
            }

            case StepType.LOAD: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'LOAD', recordsIn);
                }
                const beforeLoadResult = await hookService.runInterceptors(ctx, definition, 'beforeLoad', records, runId, pipelineId);
                records = beforeLoadResult.records;

                const batch = applyIdempotency(records, definition);
                // Log target data before load (DEBUG level)
                if (stepLog?.onLoadData) {
                    await stepLog.onLoadData(ctx, step.key, adapterCode, batch);
                }
                const { ok, fail } = await loadWithThroughput(ctx, step, batch, definition, onRecordError);
                succeeded += ok;
                failed += fail;
                counters.loaded += ok;
                counters.rejected += fail;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'LOAD',
                    adapterCode,
                    ok,
                    fail,
                    durationMs,
                });
                const afterLoadResult = await hookService.runInterceptors(ctx, definition, 'afterLoad', records, runId, pipelineId);
                records = afterLoadResult.records;
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'LOAD',
                        adapterCode,
                        recordsIn: batch.length,
                        recordsOut: ok,
                        succeeded: ok,
                        failed: fail,
                        durationMs,
                        sampleInput: batch[0] as RecordObject | undefined,
                    });
                }
                try {
                    domainEvents.publish('RecordLoaded', { stepKey: step.key });
                } catch (error) {
                    logger.warn(`Failed to publish RecordLoaded event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.EXPORT: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'EXPORT', recordsIn);
                }
                const { ok, fail } = await exportExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'EXPORT',
                    adapterCode,
                    ok,
                    fail,
                    durationMs,
                });
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'EXPORT',
                        adapterCode,
                        recordsIn,
                        recordsOut: ok,
                        succeeded: ok,
                        failed: fail,
                        durationMs,
                    });
                }
                try {
                    domainEvents.publish('RecordExported', { stepKey: step.key, ok, fail });
                } catch (error) {
                    logger.warn(`Failed to publish RecordExported event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.FEED: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'FEED', recordsIn);
                }
                const { ok, fail, outputPath } = await feedExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'FEED',
                    adapterCode,
                    ok,
                    fail,
                    outputPath,
                    durationMs,
                });
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'FEED',
                        adapterCode,
                        recordsIn,
                        recordsOut: ok,
                        succeeded: ok,
                        failed: fail,
                        durationMs,
                    });
                }
                try {
                    domainEvents.publish('FeedGenerated', { stepKey: step.key, ok, fail, outputPath });
                } catch (error) {
                    logger.warn(`Failed to publish FeedGenerated event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            case StepType.SINK: {
                const adapterCode = (step.config as any)?.adapterCode ?? '';
                const recordsIn = records.length;
                // Log step start
                if (stepLog?.onStepStart) {
                    await stepLog.onStepStart(ctx, step.key, 'SINK', recordsIn);
                }
                const { ok, fail } = await sinkExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                const durationMs = Date.now() - t0;
                details.push({
                    stepKey: step.key,
                    type: 'SINK',
                    adapterCode,
                    ok,
                    fail,
                    durationMs,
                });
                // Log step complete
                if (stepLog?.onStepComplete) {
                    await stepLog.onStepComplete(ctx, {
                        stepKey: step.key,
                        stepType: 'SINK',
                        adapterCode,
                        recordsIn,
                        recordsOut: ok,
                        succeeded: ok,
                        failed: fail,
                        durationMs,
                    });
                }
                try {
                    domainEvents.publish('RecordIndexed', { stepKey: step.key, ok, fail });
                } catch (error) {
                    logger.warn(`Failed to publish RecordIndexed event: ${(error as Error)?.message}`, { stepKey: step.key });
                }
                break;
            }

            default: {
                details.push({
                    stepKey: step.key,
                    type: step.type,
                    skipped: true,
                    durationMs: 0,
                });
                try {
                    domainEvents.publish('PipelineStepSkipped', {
                        pipelineId,
                        stepKey: step.key,
                        reason: 'unsupported-step',
                    });
                } catch (error) {
                    logger.warn(`Failed to publish PipelineStepSkipped event: ${(error as Error)?.message}`, { pipelineId, stepKey: step.key });
                }
                break;
            }
        }
    }

    if (cancelled) {
        try {
            domainEvents.publish('PipelineRunCancelled', {
                pipelineId,
                cancelledAt: new Date().toISOString(),
            });
        } catch (error) {
            logger.warn(`Failed to publish PipelineRunCancelled event: ${(error as Error)?.message}`, { pipelineId });
        }
    }

    return { processed, succeeded, failed, details, counters };
}

/**
 * Execute pipeline with seed records (skip extract steps)
 */
export async function executeWithSeed(params: {
    ctx: RequestContext;
    definition: PipelineDefinition;
    seed: RecordObject[];
    executorCtx: ExecutorContext;
    transformExecutor: TransformExecutor;
    loadExecutor: LoadExecutor;
    exportExecutor: ExportExecutor;
    feedExecutor: FeedExecutor;
    sinkExecutor: SinkExecutor;
    onCancelRequested?: () => Promise<boolean>;
    onRecordError?: OnRecordErrorCallback;
}): Promise<{ processed: number; succeeded: number; failed: number }> {
    const {
        ctx,
        definition,
        seed,
        executorCtx,
        transformExecutor,
        loadExecutor,
        exportExecutor,
        feedExecutor,
        sinkExecutor,
        onCancelRequested,
        onRecordError,
    } = params;

    let records: RecordObject[] = seed;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const step of definition.steps) {
        if (onCancelRequested && (await onCancelRequested())) break;

        switch (step.type) {
            case StepType.TRIGGER:
            case StepType.EXTRACT:
                // Skip - using seed records
                break;

            case StepType.TRANSFORM:
            case StepType.ENRICH: {
                records = await transformExecutor.executeOperator(ctx, step, records, executorCtx);
                break;
            }

            case StepType.VALIDATE: {
                records = await transformExecutor.executeValidate(ctx, step, records, onRecordError);
                break;
            }

            case StepType.ROUTE: {
                records = await transformExecutor.executeRoute(ctx, step, records, onRecordError);
                break;
            }

            case StepType.LOAD: {
                const { ok, fail } = await loadExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += records.length;
                break;
            }

            case StepType.EXPORT: {
                const { ok, fail } = await exportExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += records.length;
                break;
            }

            case StepType.FEED: {
                const { ok, fail } = await feedExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += records.length;
                break;
            }

            case StepType.SINK: {
                const { ok, fail } = await sinkExecutor.execute(ctx, step, records, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += records.length;
                break;
            }

            default:
                // Pass through records for unknown step types
                // This allows forward compatibility when new step types are added
                logger.warn(`executeWithSeed: Unhandled step type "${step.type}" for step "${step.key}" - passing through ${records.length} records`);
                break;
        }
    }

    return { processed, succeeded, failed };
}
