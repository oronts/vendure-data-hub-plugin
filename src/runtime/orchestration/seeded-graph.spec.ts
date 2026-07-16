import { describe, expect, it } from 'vitest';
import { PipelineDefinition, StepType } from '../../types';
import {
    createSeededGraphInput,
    readSeededGraphCheckpoint,
    selectSeededGraph,
} from './seeded-graph';

function createDefinition(): PipelineDefinition {
    return {
        version: 1,
        steps: [
            { key: 'webhook', type: StepType.TRIGGER, config: {} },
            { key: 'schedule', type: StepType.TRIGGER, config: {} },
            { key: 'webhook-source', type: StepType.EXTRACT, config: {}, adapterCode: 'httpApi' },
            { key: 'schedule-source', type: StepType.EXTRACT, config: {}, adapterCode: 'httpApi' },
            { key: 'webhook-load', type: StepType.LOAD, config: {}, adapterCode: 'productUpsert' },
            { key: 'schedule-load', type: StepType.LOAD, config: {}, adapterCode: 'productUpsert' },
        ],
        edges: [
            { from: 'webhook', to: 'webhook-source' },
            { from: 'webhook-source', to: 'webhook-load' },
            { from: 'schedule', to: 'schedule-source' },
            { from: 'schedule-source', to: 'schedule-load' },
        ],
    };
}

describe('seeded graph execution', () => {
    it('keeps only the selected trigger and its reachable branch', () => {
        const seed = createSeededGraphInput('webhook', [{ sku: 'A-1' }]);
        const selected = selectSeededGraph(createDefinition(), seed);

        expect(selected.steps.map(step => step.key)).toEqual([
            'webhook',
            'webhook-source',
            'webhook-load',
        ]);
        expect(selected.edges).toEqual([
            { from: 'webhook', to: 'webhook-source' },
            { from: 'webhook-source', to: 'webhook-load' },
        ]);
    });

    it('round-trips the canonical checkpoint shape', () => {
        const seed = createSeededGraphInput('webhook', [{ sku: 'A-1' }], 'SOURCE_REFERENCES');

        expect(readSeededGraphCheckpoint({ __seed: seed })).toEqual(seed);
        expect(readSeededGraphCheckpoint({ other: true })).toBeUndefined();
    });

    it('rejects invalid checkpoint shapes', () => {
        expect(() => readSeededGraphCheckpoint({ __seed: [{ sku: 'A-1' }] })).toThrow(
            'Invalid seeded pipeline checkpoint',
        );
        expect(() => readSeededGraphCheckpoint({
            __seed: { triggerKey: 'webhook', records: [], mode: 'UNKNOWN' },
        })).toThrow('Invalid seeded pipeline checkpoint');
    });

    it('rejects invalid seed records and trigger selections', () => {
        expect(() => createSeededGraphInput('', [])).toThrow('requires a trigger key');
        expect(() => createSeededGraphInput('webhook', ['not-an-object'])).toThrow('object records only');
        expect(() => selectSeededGraph(createDefinition(), {
            triggerKey: 'missing', records: [], mode: 'RECORDS',
        })).toThrow(
            'was not found',
        );
        expect(() => selectSeededGraph(createDefinition(), {
            triggerKey: 'webhook-load', records: [], mode: 'RECORDS',
        })).toThrow(
            'is not a trigger',
        );
    });

    it('rejects disabled triggers and edge-less definitions', () => {
        const disabled = createDefinition();
        disabled.steps[0] = { ...disabled.steps[0], disabled: true };
        expect(() => selectSeededGraph(disabled, { triggerKey: 'webhook', records: [], mode: 'RECORDS' })).toThrow('is disabled');

        const edgeLess = createDefinition();
        edgeLess.edges = [];
        expect(() => selectSeededGraph(edgeLess, { triggerKey: 'webhook', records: [], mode: 'RECORDS' })).toThrow(
            'requires graph edges',
        );
    });
});
