import { PipelineDefinition, StepType } from '../../types';
import { RecordObject } from '../executor-types';

export type SeededInputMode = 'RECORDS' | 'SOURCE_REFERENCES';

export interface SeededGraphInput {
    triggerKey: string;
    records: RecordObject[];
    mode: SeededInputMode;
}

export interface SeededGraphCheckpoint {
    __seed: SeededGraphInput;
}

function isRecordObject(value: unknown): value is RecordObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createSeededGraphInput(
    triggerKey: string,
    records: unknown[],
    mode: SeededInputMode = 'RECORDS',
): SeededGraphInput {
    if (triggerKey.trim().length === 0) {
        throw new Error('Seeded pipeline execution requires a trigger key');
    }
    if (!records.every(isRecordObject)) {
        throw new Error('Seeded pipeline execution accepts object records only');
    }
    return { triggerKey, records, mode };
}

export function readSeededGraphCheckpoint(checkpoint: unknown): SeededGraphInput | undefined {
    if (checkpoint === null || typeof checkpoint !== 'object' || !('__seed' in checkpoint)) {
        return undefined;
    }

    const seed = (checkpoint as { __seed?: unknown }).__seed;
    if (seed === null || typeof seed !== 'object') {
        throw new Error('Invalid seeded pipeline checkpoint');
    }

    const candidate = seed as { triggerKey?: unknown; records?: unknown; mode?: unknown };
    if (typeof candidate.triggerKey !== 'string' || !Array.isArray(candidate.records)) {
        throw new Error('Invalid seeded pipeline checkpoint');
    }
    const mode = candidate.mode ?? 'RECORDS';
    if (mode !== 'RECORDS' && mode !== 'SOURCE_REFERENCES') {
        throw new Error('Invalid seeded pipeline checkpoint');
    }
    return createSeededGraphInput(candidate.triggerKey, candidate.records, mode);
}

export function selectSeededGraph(
    definition: PipelineDefinition,
    seed: SeededGraphInput,
): PipelineDefinition {
    const edges = definition.edges ?? [];
    if (edges.length === 0) {
        throw new Error('Seeded pipeline execution requires graph edges');
    }

    const trigger = definition.steps.find(step => step.key === seed.triggerKey);
    if (!trigger) {
        throw new Error(`Seed trigger step "${seed.triggerKey}" was not found`);
    }
    if (trigger.type !== StepType.TRIGGER) {
        throw new Error(`Seed step "${seed.triggerKey}" is not a trigger`);
    }
    if (trigger.disabled) {
        throw new Error(`Seed trigger step "${seed.triggerKey}" is disabled`);
    }

    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
        const targets = outgoing.get(edge.from) ?? [];
        targets.push(edge.to);
        outgoing.set(edge.from, targets);
    }

    const reachable = new Set<string>([seed.triggerKey]);
    const queue = [seed.triggerKey];
    while (queue.length > 0) {
        const key = queue.shift();
        if (key === undefined) break;
        for (const target of outgoing.get(key) ?? []) {
            if (reachable.has(target)) continue;
            reachable.add(target);
            queue.push(target);
        }
    }

    return {
        ...definition,
        steps: definition.steps.filter(step => reachable.has(step.key)),
        edges: edges.filter(edge => reachable.has(edge.from) && reachable.has(edge.to)),
    };
}
