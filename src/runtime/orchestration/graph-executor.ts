/**
 * Graph Executor
 *
 * Handles graph-based pipeline execution where steps can have
 * complex dependencies via edges (DAG topology).
 */

import { Logger } from '@nestjs/common';
import { RequestContext, ID } from '@vendure/core';
import { PipelineDefinition, StepType } from '../../types/index';
import {
    RecordObject,
    BranchOutput,
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
import {
    PipelineEdge,
    GraphExecutionResult,
    StepExecutionResult,
    StepLogCallback,
    StepLogInfo,
} from './types';
import { buildTopology, gatherInput } from './helpers';

const logger = new Logger('DataHub:GraphExecutor');

export type { PipelineEdge, GraphExecutionResult };

/**
 * Executes a graph-based pipeline using topological sort
 */
export async function executeGraph(params: {
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
}): Promise<GraphExecutionResult> {
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

    const steps = definition.steps;
    const stepByKey = new Map<string, typeof steps[number]>();
    for (const s of steps) stepByKey.set(s.key, s);

    const edges = (definition as any).edges as PipelineEdge[];
    const { preds, indeg, queue } = buildTopology(steps, edges);

    try {
        domainEvents.publish('PipelineStarted', { pipelineId });
    } catch (error) {
        logger.warn(`Failed to publish PipelineStarted event: ${(error as Error)?.message}`, { pipelineId });
    }

    const outputs = new Map<string, RecordObject[] | BranchOutput>();

    while (queue.length) {
        const key = queue.shift()!;
        const step = stepByKey.get(key);
        if (!step) continue;
        if (onCancelRequested && (await onCancelRequested())) break;

        // Build input from predecessors
        const input = gatherInput(key, preds, outputs);

        const t0 = Date.now();
        const stepResult = await executeStep({
            ctx,
            definition,
            step,
            key,
            input,
            executorCtx,
            hookService,
            extractExecutor,
            transformExecutor,
            loadExecutor,
            exportExecutor,
            feedExecutor,
            sinkExecutor,
            loadWithThroughput,
            applyIdempotency,
            onRecordError,
            pipelineId,
            runId,
            stepLog,
        });

        // Update metrics
        outputs.set(key, stepResult.output);
        details.push({ ...stepResult.detail, durationMs: Date.now() - t0 });
        processed += stepResult.processed;
        succeeded += stepResult.succeeded;
        failed += stepResult.failed;

        // Update counters
        for (const [k, v] of Object.entries(stepResult.counters)) {
            counters[k] = (counters[k] ?? 0) + v;
        }

        // Emit events
        if (stepResult.event) {
            try {
                domainEvents.publish(stepResult.event.type, stepResult.event.data);
            } catch (error) {
                logger.warn(`Failed to publish ${stepResult.event.type} event: ${(error as Error)?.message}`, {
                    stepKey: key,
                    eventType: stepResult.event.type,
                });
            }
        }

        // Reduce indegree of neighbors
        for (const e of (edges ?? [])) {
            if (e.from === key) {
                indeg.set(e.to, (indeg.get(e.to) ?? 1) - 1);
                if ((indeg.get(e.to) ?? 0) === 0) queue.push(e.to);
            }
        }
    }

    return { processed, succeeded, failed, details, counters };
}

// Helper functions and types are now imported from ./helpers and ./types

/**
 * Execute a single step in the graph
 */
async function executeStep(params: {
    ctx: RequestContext;
    definition: PipelineDefinition;
    step: any;
    key: string;
    input: RecordObject[];
    executorCtx: ExecutorContext;
    hookService: HookService;
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
    onRecordError?: OnRecordErrorCallback;
    pipelineId?: ID;
    runId?: ID;
    stepLog?: StepLogCallback;
}): Promise<StepExecutionResult> {
    const {
        ctx,
        definition,
        step,
        key,
        input,
        executorCtx,
        hookService,
        extractExecutor,
        transformExecutor,
        loadExecutor,
        exportExecutor,
        feedExecutor,
        sinkExecutor,
        loadWithThroughput,
        applyIdempotency,
        onRecordError,
        pipelineId,
        runId,
        stepLog,
    } = params;

    const counters: Record<string, number> = {};
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    switch (step.type) {
        case StepType.TRIGGER: {
            return {
                output: [],
                detail: { stepKey: key, type: 'TRIGGER' },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters: {},
            };
        }

        case StepType.EXTRACT: {
            const adapterCode = step.config?.adapterCode ?? '';
            const t0 = Date.now();
            // Log step start
            if (stepLog?.onStepStart) {
                await stepLog.onStepStart(ctx, key, 'EXTRACT', 0);
            }
            let records = [...input];
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeExtract', records, runId, pipelineId);
            records = beforeResult.records;

            const out = await extractExecutor.execute(ctx, step, executorCtx, onRecordError);
            counters.extracted = out.length;
            processed = out.length;
            succeeded = out.length;

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterExtract', out, runId, pipelineId);
            const finalOutput = afterResult.records;
            const durationMs = Date.now() - t0;
            // Log extracted data (DEBUG level)
            if (stepLog?.onExtractData) {
                await stepLog.onExtractData(ctx, key, adapterCode, finalOutput);
            }
            // Log step complete
            if (stepLog?.onStepComplete) {
                await stepLog.onStepComplete(ctx, {
                    stepKey: key,
                    stepType: 'EXTRACT',
                    adapterCode,
                    recordsIn: 0,
                    recordsOut: finalOutput.length,
                    succeeded: finalOutput.length,
                    failed: 0,
                    durationMs,
                    sampleOutput: finalOutput[0] as RecordObject | undefined,
                });
            }
            return {
                output: finalOutput,
                detail: { stepKey: key, type: 'EXTRACT', adapterCode, out: finalOutput.length },
                processed,
                succeeded,
                failed: 0,
                counters,
                event: { type: 'RecordExtracted', data: { stepKey: key, count: finalOutput.length } },
            };
        }

        case StepType.TRANSFORM: {
            const adapterCode = step.config?.adapterCode ?? '';
            const recordsIn = input.length;
            const sampleInput = input[0] as RecordObject | undefined;
            const t0 = Date.now();
            // Log step start
            if (stepLog?.onStepStart) {
                await stepLog.onStepStart(ctx, key, 'TRANSFORM', recordsIn);
            }
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeTransform', input, runId, pipelineId);
            let records = beforeResult.records;

            const out = await transformExecutor.executeOperator(ctx, step, records, executorCtx);
            counters.transformed = out.length;

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterTransform', out, runId, pipelineId);
            const finalOutput = afterResult.records;
            const durationMs = Date.now() - t0;
            // Log field mappings (DEBUG level) - compare first input/output record
            if (stepLog?.onTransformMapping && sampleInput && finalOutput[0]) {
                await stepLog.onTransformMapping(ctx, key, adapterCode, sampleInput, finalOutput[0]);
            }
            // Log step complete
            if (stepLog?.onStepComplete) {
                await stepLog.onStepComplete(ctx, {
                    stepKey: key,
                    stepType: 'TRANSFORM',
                    adapterCode,
                    recordsIn,
                    recordsOut: finalOutput.length,
                    succeeded: finalOutput.length,
                    failed: 0,
                    durationMs,
                    sampleInput,
                    sampleOutput: finalOutput[0] as RecordObject | undefined,
                });
            }
            return {
                output: finalOutput,
                detail: { stepKey: key, type: 'TRANSFORM', adapterCode, out: finalOutput.length },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters,
                event: { type: 'RecordTransformed', data: { stepKey: key, count: finalOutput.length } },
            };
        }

        case StepType.VALIDATE: {
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeValidate', input, runId, pipelineId);
            let records = beforeResult.records;

            const out = await transformExecutor.executeValidate(ctx, step, records, onRecordError);
            counters.validated = out.length;

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterValidate', out, runId, pipelineId);
            const finalOutput = afterResult.records;
            return {
                output: finalOutput,
                detail: { stepKey: key, type: 'VALIDATE', adapterCode: step.config?.adapterCode, out: finalOutput.length },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters,
                event: { type: 'RecordValidated', data: { stepKey: key, count: finalOutput.length } },
            };
        }

        case StepType.ENRICH: {
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeEnrich', input, runId, pipelineId);
            let records = beforeResult.records;

            const out = await transformExecutor.executeOperator(ctx, step, records, executorCtx);
            counters.enriched = out.length;

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterEnrich', out, runId, pipelineId);
            const finalOutput = afterResult.records;
            return {
                output: finalOutput,
                detail: { stepKey: key, type: 'ENRICH', adapterCode: step.config?.adapterCode, out: finalOutput.length },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters,
                event: { type: 'RecordTransformed', data: { stepKey: key, count: finalOutput.length, stage: 'ENRICH' } },
            };
        }

        case StepType.ROUTE: {
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeRoute', input, runId, pipelineId);
            let records = beforeResult.records;

            const out = await transformExecutor.executeRouteBranches(ctx, step, records);
            const total = Object.values(out.branches).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
            counters.routed = total;
            const aggregated = ([] as RecordObject[]).concat(...Object.values(out.branches));

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterRoute', aggregated, runId, pipelineId);
            return {
                output: out,
                detail: { stepKey: key, type: 'ROUTE', adapterCode: step.config?.adapterCode, out: total, branches: Object.keys(out.branches) },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters,
            };
        }

        case StepType.LOAD: {
            const adapterCode = step.config?.adapterCode ?? '';
            const recordsIn = input.length;
            const t0 = Date.now();
            // Log step start
            if (stepLog?.onStepStart) {
                await stepLog.onStepStart(ctx, key, 'LOAD', recordsIn);
            }
            const beforeResult = await hookService.runInterceptors(ctx, definition, 'beforeLoad', input, runId, pipelineId);
            let records = beforeResult.records;

            const batch = applyIdempotency(records, definition);
            // Log target data before load (DEBUG level)
            if (stepLog?.onLoadData) {
                await stepLog.onLoadData(ctx, key, adapterCode, batch);
            }
            const { ok, fail } = await loadWithThroughput(ctx, step, batch, definition, onRecordError);
            counters.loaded = ok;
            counters.rejected = fail;

            const afterResult = await hookService.runInterceptors(ctx, definition, 'afterLoad', records, runId, pipelineId);
            const durationMs = Date.now() - t0;
            // Log step complete
            if (stepLog?.onStepComplete) {
                await stepLog.onStepComplete(ctx, {
                    stepKey: key,
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
            return {
                output: [],
                detail: { stepKey: key, type: 'LOAD', adapterCode, ok, fail },
                processed: 0,
                succeeded: ok,
                failed: fail,
                counters,
                event: { type: 'RecordLoaded', data: { stepKey: key, ok, fail } },
            };
        }

        case StepType.EXPORT: {
            const { ok, fail } = await exportExecutor.execute(ctx, step, input, onRecordError);
            return {
                output: [],
                detail: { stepKey: key, type: 'EXPORT', adapterCode: step.config?.adapterCode, ok, fail },
                processed: 0,
                succeeded: ok,
                failed: fail,
                counters: {},
                event: { type: 'RecordExported', data: { stepKey: key, ok, fail } },
            };
        }

        case StepType.FEED: {
            const { ok, fail, outputPath } = await feedExecutor.execute(ctx, step, input, onRecordError);
            return {
                output: [],
                detail: { stepKey: key, type: 'FEED', adapterCode: step.config?.adapterCode, ok, fail, outputPath },
                processed: 0,
                succeeded: ok,
                failed: fail,
                counters: {},
                event: { type: 'FeedGenerated', data: { stepKey: key, ok, fail, outputPath } },
            };
        }

        case StepType.SINK: {
            const { ok, fail } = await sinkExecutor.execute(ctx, step, input, onRecordError);
            return {
                output: [],
                detail: { stepKey: key, type: 'SINK', adapterCode: step.config?.adapterCode, ok, fail },
                processed: 0,
                succeeded: ok,
                failed: fail,
                counters: {},
                event: { type: 'RecordIndexed', data: { stepKey: key, ok, fail } },
            };
        }

        default:
            // Pass through records for unknown step types
            // This allows forward compatibility when new step types are added
            logger.warn(`executeStep (graph): Unhandled step type "${step.type}" for step "${key}" - passing through ${input.length} records`);
            return {
                output: input,
                detail: { stepKey: key, type: step.type, unhandled: true },
                processed: 0,
                succeeded: 0,
                failed: 0,
                counters: {},
            };
    }
}
