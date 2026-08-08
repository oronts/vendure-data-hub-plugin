import type { PipelineDefinition, PipelineStepDefinition } from '../../types';
import type { BranchOutput, RecordObject } from '../executor-types';
import { isBranchOutput } from '../executor-types';
import { buildTopology, gatherInput } from '../orchestration/helpers';

export interface DryRunGraphStepResult<TSample> {
    output: RecordObject[] | BranchOutput;
    processedDelta: number;
    samples: TSample[];
}

export interface DryRunGraphResult<TSample> {
    processed: number;
    samples: TSample[];
    outputRecords: RecordObject[];
}

export async function executeDryRunGraph<TSample>(
    definition: PipelineDefinition,
    executeStep: (
        step: PipelineStepDefinition,
        input: RecordObject[],
    ) => Promise<DryRunGraphStepResult<TSample>>,
    initialRecords: RecordObject[] = [],
): Promise<DryRunGraphResult<TSample>> {
    const edges = definition.edges ?? [];
    const { preds, indeg, queue } = buildTopology(definition.steps, edges);
    const stepsByKey = new Map(definition.steps.map(step => [step.key, step] as const));
    const outputs = new Map<string, RecordObject[] | BranchOutput>();
    const samples: TSample[] = [];
    let processed = initialRecords.length;
    let completed = 0;

    while (queue.length > 0) {
        const key = queue.shift();
        if (key == null) {
            break;
        }
        const step = stepsByKey.get(key);
        if (!step) {
            continue;
        }

        const parents = preds.get(key) ?? [];
        const input = parents.length === 0
            ? initialRecords
            : gatherInput(key, preds, outputs);
        const result = await executeStep(step, input);
        outputs.set(key, result.output);
        processed += result.processedDelta;
        samples.push(...result.samples);
        completed++;

        for (const edge of edges) {
            if (edge.from !== key) {
                continue;
            }
            const nextIndegree = (indeg.get(edge.to) ?? 1) - 1;
            indeg.set(edge.to, nextIndegree);
            if (nextIndegree === 0) {
                queue.push(edge.to);
            }
        }
    }

    if (completed !== definition.steps.length) {
        throw new Error('Dry run graph contains a cycle or unresolved edge');
    }

    const stepsWithSuccessors = new Set(edges.map(edge => edge.from));
    const outputRecords = definition.steps
        .filter(step => !stepsWithSuccessors.has(step.key))
        .flatMap(step => {
            const output = outputs.get(step.key);
            if (!output) return [];
            return isBranchOutput(output)
                ? Object.values(output.branches).flat()
                : output;
        });

    return { processed, samples, outputRecords };
}
