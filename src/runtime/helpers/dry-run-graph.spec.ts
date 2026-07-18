import { describe, expect, it, vi } from 'vitest';
import type { PipelineDefinition } from '../../types';
import type { BranchOutput, RecordObject } from '../executor-types';
import { executeDryRunGraph } from './dry-run-graph';

describe('executeDryRunGraph', () => {
    it('uses topological order and routes branch-specific inputs', async () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'left', type: 'TRANSFORM', config: {} },
                { key: 'join', type: 'LOAD', config: {} },
                { key: 'route', type: 'ROUTE', config: {} },
                { key: 'extract', type: 'EXTRACT', config: {} },
                { key: 'right', type: 'TRANSFORM', config: {} },
            ],
            edges: [
                { from: 'extract', to: 'route' },
                { from: 'route', to: 'left', branch: 'left' },
                { from: 'route', to: 'right', branch: 'right' },
                { from: 'left', to: 'join' },
                { from: 'right', to: 'join' },
            ],
        };
        const inputs = new Map<string, RecordObject[]>();
        const executeStep = vi.fn(async (step: PipelineDefinition['steps'][number], input: RecordObject[]) => {
            inputs.set(step.key, input);
            if (step.key === 'extract') {
                return {
                    output: [{ side: 'left' }, { side: 'right' }],
                    processedDelta: 2,
                    samples: [step.key],
                };
            }
            if (step.key === 'route') {
                const output: BranchOutput = {
                    __branchOutputs: true,
                    branches: {
                        left: input.filter(record => record.side === 'left'),
                        right: input.filter(record => record.side === 'right'),
                    },
                };
                return { output, processedDelta: 0, samples: [step.key] };
            }
            return {
                output: input.map(record => ({ ...record, visited: step.key })),
                processedDelta: 0,
                samples: [step.key],
            };
        });

        const result = await executeDryRunGraph(definition, executeStep);

        expect(executeStep.mock.calls.map(call => call[0].key)).toEqual([
            'extract',
            'route',
            'left',
            'right',
            'join',
        ]);
        expect(inputs.get('left')).toEqual([{ side: 'left' }]);
        expect(inputs.get('right')).toEqual([{ side: 'right' }]);
        expect(inputs.get('join')).toEqual([
            { side: 'left', visited: 'left' },
            { side: 'right', visited: 'right' },
        ]);
        expect(result.processed).toBe(2);
        expect(result.samples).toEqual(['extract', 'route', 'left', 'right', 'join']);
    });

    it('rejects cyclic graphs instead of silently skipping steps', async () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'one', type: 'TRANSFORM', config: {} },
                { key: 'two', type: 'TRANSFORM', config: {} },
            ],
            edges: [
                { from: 'one', to: 'two' },
                { from: 'two', to: 'one' },
            ],
        };

        await expect(executeDryRunGraph(definition, async (_step, input) => ({
            output: input,
            processedDelta: 0,
            samples: [],
        }))).rejects.toThrow('Dry run graph contains a cycle or unresolved edge');
    });
});
