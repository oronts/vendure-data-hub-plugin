import type { GraphExecutionResult } from './types';
import type { BranchOutput, RecordObject } from '../executor-types';
import { selectSeededGraph } from './seeded-graph';
import {
    buildExecutionOrder,
    createDispatcher,
    createInitialMetrics,
    getParallelConfig,
    handleNodeError,
    type ExecuteGraphParams,
} from './graph-execution-context';
import {
    executeParallel,
    executeSequential,
} from './graph-execution-strategies';
import { reconcileCompletionOutcomes } from './outcome-metrics';

export type { GraphExecutionResult };
export type { ExecuteGraphParams } from './graph-execution-context';

export async function executeGraph(
    params: ExecuteGraphParams,
): Promise<GraphExecutionResult> {
    const definition = params.seed
        ? selectSeededGraph(params.definition, params.seed)
        : params.definition;
    const executionParams = definition === params.definition
        ? params
        : { ...params, definition };
    const stepDispatcher = createDispatcher(executionParams);
    const { stepByKey, edges, topology } = buildExecutionOrder(definition);
    const { preds, indeg, queue } = topology;
    const parallelConfig = getParallelConfig(definition);

    await executionParams.hookService.run(
        executionParams.ctx,
        definition,
        'PIPELINE_STARTED',
    );
    try {
        executionParams.domainEvents.publish('PIPELINE_STARTED', {
            pipelineId: executionParams.pipelineId,
        });
    } catch (error) {
        handleNodeError(error as Error, 'PIPELINE_STARTED', {
            pipelineId: executionParams.pipelineId,
        });
    }

    const metrics = createInitialMetrics();
    const outputs = new Map<string, RecordObject[] | BranchOutput>();
    const strategy = {
        queue,
        stepByKey,
        edges,
        preds,
        indeg,
        outputs,
        metrics,
        stepDispatcher,
        params: executionParams,
        onCancelRequested: executionParams.onCancelRequested,
    };

    if (parallelConfig.enabled) {
        await executeParallel(strategy, parallelConfig);
    } else {
        await executeSequential(strategy);
    }
    reconcileCompletionOutcomes(
        metrics,
        executionParams.seed?.mode === 'RECORDS'
            ? executionParams.seed.records.length
            : 0,
    );
    return metrics;
}
