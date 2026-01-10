/**
 * Replay Executor
 *
 * Handles replaying pipeline execution from a specific step,
 * supporting both linear and graph-based pipelines.
 */

import { Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PipelineDefinition, StepType } from '../../types/index';
import {
    RecordObject,
    BranchOutput,
    isBranchOutput,
    OnRecordErrorCallback,
    ExecutorContext,
} from '../executor-types';
import {
    TransformExecutor,
    LoadExecutor,
    ExportExecutor,
    FeedExecutor,
    SinkExecutor,
} from '../executors';
import { PipelineEdge } from './graph-executor';

const logger = new Logger('DataHub:ReplayExecutor');

/**
 * Replay from a specific step in a linear pipeline
 */
export async function replayFromStepLinear(params: {
    ctx: RequestContext;
    definition: PipelineDefinition;
    startStepKey: string;
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
        startStepKey,
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

    // Find start step and get remaining steps
    const idx = definition.steps.findIndex(s => s.key === startStepKey);
    const steps = idx >= 0 ? definition.steps.slice(idx + 1) : definition.steps;

    let records: RecordObject[] = seed;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const step of steps) {
        if (onCancelRequested && (await onCancelRequested())) break;

        switch (step.type) {
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
                // Pass through records for unknown step types (TRIGGER, EXTRACT handled by replay skip)
                logger.warn(`replayFromStepLinear: Unhandled step type "${step.type}" for step "${step.key}" - passing through ${records.length} records`);
                break;
        }
    }

    return { processed, succeeded, failed };
}

/**
 * Replay from a specific step in a graph-based pipeline
 */
export async function replayFromStepGraph(params: {
    ctx: RequestContext;
    definition: PipelineDefinition;
    startStepKey: string;
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
        startStepKey,
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

    const steps = definition.steps;
    const stepByKey = new Map<string, typeof steps[number]>();
    for (const s of steps) stepByKey.set(s.key, s);

    const edges = (definition as any).edges as PipelineEdge[];

    // Build adjacency list for reachability
    const adj = new Map<string, Array<{ to: string; branch?: string }>>();
    for (const e of edges ?? []) {
        const list = adj.get(e.from) ?? [];
        list.push({ to: e.to, branch: e.branch });
        adj.set(e.from, list);
    }

    // Find all reachable steps from start step
    const reachable = new Set<string>();
    const stack = [startStepKey];
    while (stack.length) {
        const u = stack.pop()!;
        if (reachable.has(u)) continue;
        reachable.add(u);
        for (const n of adj.get(u) ?? []) stack.push(n.to);
    }

    // Build topology for reachable subgraph
    const preds = new Map<string, Array<{ from: string; branch?: string }>>();
    const indeg = new Map<string, number>();

    for (const s of steps) {
        if (reachable.has(s.key)) {
            indeg.set(s.key, 0);
        }
    }

    for (const e of edges ?? []) {
        if (!reachable.has(e.from) || !reachable.has(e.to)) continue;
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
        const list = preds.get(e.to) ?? [];
        list.push({ from: e.from, branch: e.branch });
        preds.set(e.to, list);
    }

    // Initialize outputs with seed at start step
    const outputs = new Map<string, RecordObject[] | BranchOutput>();
    outputs.set(startStepKey, seed);

    // Reduce indegree of neighbors of start step
    for (const n of adj.get(startStepKey) ?? []) {
        indeg.set(n.to, Math.max(0, (indeg.get(n.to) ?? 1) - 1));
    }

    // Build initial queue (steps with zero indegree, excluding start step)
    const queue: string[] = [];
    for (const [k, d] of indeg.entries()) {
        if (k === startStepKey) continue;
        if ((d ?? 0) === 0 && k !== startStepKey) queue.push(k);
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    while (queue.length) {
        const key = queue.shift()!;
        const step = stepByKey.get(key);
        if (!step) continue;
        if (onCancelRequested && (await onCancelRequested())) break;

        // Gather input from predecessors
        let input: RecordObject[] = [];
        const parents = (preds.get(key) ?? []).filter(
            p => p.from === startStepKey || reachable.has(p.from)
        );

        for (const p of parents) {
            const out = outputs.get(p.from);
            if (!out) continue;

            if (isBranchOutput(out)) {
                if (p.branch && out.branches[p.branch]) {
                    input = input.concat(out.branches[p.branch]);
                } else {
                    for (const arr of Object.values(out.branches)) {
                        input = input.concat(arr);
                    }
                }
            } else {
                input = input.concat(out);
            }
        }

        // Execute step
        switch (step.type) {
            case StepType.TRANSFORM:
            case StepType.ENRICH: {
                outputs.set(key, await transformExecutor.executeOperator(ctx, step, input, executorCtx));
                break;
            }

            case StepType.VALIDATE: {
                outputs.set(key, await transformExecutor.executeValidate(ctx, step, input, onRecordError));
                break;
            }

            case StepType.ROUTE: {
                outputs.set(key, await transformExecutor.executeRouteBranches(ctx, step, input));
                break;
            }

            case StepType.LOAD: {
                const { ok, fail } = await loadExecutor.execute(ctx, step, input, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += input.length;
                outputs.set(key, []);
                break;
            }

            case StepType.EXPORT: {
                const { ok, fail } = await exportExecutor.execute(ctx, step, input, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += input.length;
                outputs.set(key, []);
                break;
            }

            case StepType.FEED: {
                const { ok, fail } = await feedExecutor.execute(ctx, step, input, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += input.length;
                outputs.set(key, []);
                break;
            }

            case StepType.SINK: {
                const { ok, fail } = await sinkExecutor.execute(ctx, step, input, onRecordError);
                succeeded += ok;
                failed += fail;
                processed += input.length;
                outputs.set(key, []);
                break;
            }

            default:
                // Pass through records for unknown step types
                // This allows forward compatibility when new step types are added
                logger.warn(`replayFromStepGraph: Unhandled step type "${step.type}" for step "${key}" - passing through ${input.length} records`);
                outputs.set(key, input);
                break;
        }

        // Update neighbor indegrees
        for (const e of (edges ?? [])) {
            if (!reachable.has(e.from) || !reachable.has(e.to)) continue;
            if (e.from === key) {
                indeg.set(e.to, (indeg.get(e.to) ?? 1) - 1);
                if ((indeg.get(e.to) ?? 0) === 0) queue.push(e.to);
            }
        }
    }

    return { processed, succeeded, failed };
}
