/**
 * Orchestration Helpers
 *
 * Helper functions for pipeline execution orchestration.
 */

import { RecordObject, BranchOutput, isBranchOutput } from '../executor-types';
import { PipelineEdge } from '../../types/index';
import { TopologyData } from './types';

/**
 * Build topology data structures for graph traversal
 */
export function buildTopology(
    steps: { key: string }[],
    edges: PipelineEdge[],
): TopologyData {
    const preds = new Map<string, Array<{ from: string; branch?: string }>>();
    const indeg = new Map<string, number>();

    for (const s of steps) indeg.set(s.key, 0);

    for (const e of edges ?? []) {
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
        const list = preds.get(e.to) ?? [];
        list.push({ from: e.from, branch: e.branch });
        preds.set(e.to, list);
    }

    const queue: string[] = [];
    for (const [k, d] of indeg.entries()) {
        if ((d ?? 0) === 0) queue.push(k);
    }

    return { preds, indeg, queue };
}

/**
 * Gather input from predecessor outputs
 */
export function gatherInput(
    key: string,
    preds: Map<string, Array<{ from: string; branch?: string }>>,
    outputs: Map<string, RecordObject[] | BranchOutput>,
): RecordObject[] {
    let input: RecordObject[] = [];
    const parents = preds.get(key) ?? [];

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

    return input;
}
