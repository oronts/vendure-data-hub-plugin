import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../../../shared/types';
import { toCanonicalDefinition, toVisualDefinition } from './pipeline-conversion';

describe('pipeline visual conversion', () => {
    it('round-trips advanced, gate, and unknown metadata fields without loss', () => {
        const definition = {
            version: 4,
            name: 'Approval flow',
            description: 'Preserve every canonical field',
            futureRoot: { enabled: true },
            context: { validationMode: 'LENIENT', futureContext: 'keep' },
            hooks: { beforeRun: [{ type: 'SCRIPT', config: { code: 'return true' } }] },
            steps: [
                {
                    key: 'approval',
                    type: 'GATE',
                    label: 'Approve import',
                    description: 'Human review',
                    timeoutMs: 60_000,
                    futureStep: { keep: true },
                    config: {
                        approvalType: 'MANUAL',
                        futureConfig: { keep: true },
                    },
                },
                {
                    key: 'transform',
                    type: 'TRANSFORM',
                    adapterCode: 'top-level-adapter',
                    name: 'Future step',
                    config: {
                        adapterCode: 'config-adapter',
                        nested: { keep: true },
                    },
                },
            ],
            edges: [
                {
                    from: 'approval',
                    to: 'transform',
                    branch: 'approved',
                    condition: 'record.valid === true',
                    label: 'Approved',
                    dependencyOnly: true,
                    futureEdge: 'keep',
                },
            ],
        } as unknown as PipelineDefinition;

        expect(toCanonicalDefinition(toVisualDefinition(definition))).toEqual(definition);
    });

    it('rejects unsupported canonical step types instead of coercing them', () => {
        expect(() => toVisualDefinition({
            version: 1,
            steps: [{ key: 'future', type: 'FUTURE_STEP', config: {} }],
        } as unknown as PipelineDefinition)).toThrow(
            'Unsupported pipeline step type "FUTURE_STEP"',
        );
    });

    it('rejects unsupported visual categories instead of creating transforms', () => {
        expect(() => toCanonicalDefinition({
            nodes: [{
                id: 'future',
                type: 'future',
                position: { x: 0, y: 0 },
                data: { label: 'Future', type: 'future' as never, config: {} },
            }],
            edges: [],
            variables: {},
        })).toThrow('Unsupported visual node category "future"');
    });

    it('preserves absent edges and context while displaying inferred edges', () => {
        const definition: PipelineDefinition = {
            version: 2,
            steps: [
                { key: 'first', type: 'TRIGGER', config: { type: 'MANUAL' } },
                { key: 'second', type: 'TRANSFORM', config: { operators: [] } },
            ],
        };

        const visual = toVisualDefinition(definition);
        expect(visual.edges).toHaveLength(1);
        expect(toCanonicalDefinition(visual)).toEqual(definition);
    });

    it('recognizes empty visual graphs and preserves explicit empty arrays', () => {
        const definition = {
            version: 3,
            steps: [],
            edges: [],
            futureRoot: 'keep',
        } as unknown as PipelineDefinition;

        const visual = toVisualDefinition(definition);
        expect(visual.nodes).toEqual([]);
        expect(toCanonicalDefinition(visual)).toEqual(definition);
    });

    it('overlays edited config recursively without deleting unrendered fields', () => {
        const definition = {
            version: 2,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                retries: 4,
                futureStep: 'keep',
                config: {
                    adapterCode: 'csv',
                    delimiter: ',',
                    advanced: { keep: true, edited: 1 },
                    futureConfig: 'keep',
                },
            }],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.nodes[0] = {
            ...visual.nodes[0],
            data: {
                ...visual.nodes[0].data,
                config: {
                    adapterCode: 'csv',
                    delimiter: ';',
                    advanced: { edited: 2 },
                },
            },
        };

        const converted = toCanonicalDefinition(visual) as unknown as {
            steps: Array<Record<string, unknown>>;
        };
        expect(converted.steps[0]).toEqual({
            key: 'extract',
            type: 'EXTRACT',
            retries: 4,
            futureStep: 'keep',
            config: {
                adapterCode: 'csv',
                delimiter: ';',
                advanced: { keep: true, edited: 2 },
                futureConfig: 'keep',
            },
        });
    });

    it('keeps adapter codes in their original canonical locations when edited', () => {
        const definition = {
            version: 1,
            steps: [
                { key: 'top', type: 'EXTRACT', adapterCode: 'old', config: {} },
                { key: 'config', type: 'EXTRACT', config: { adapterCode: 'old' } },
                {
                    key: 'both',
                    type: 'EXTRACT',
                    adapterCode: 'old',
                    config: { adapterCode: 'old' },
                },
            ],
            edges: [],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.nodes = visual.nodes.map(node => ({
            ...node,
            data: { ...node.data, adapterCode: 'new' },
        }));

        const converted = toCanonicalDefinition(visual) as unknown as {
            steps: Array<Record<string, unknown>>;
        };
        expect(converted.steps).toEqual([
            { key: 'top', type: 'EXTRACT', adapterCode: 'new', config: {} },
            { key: 'config', type: 'EXTRACT', config: { adapterCode: 'new' } },
            {
                key: 'both',
                type: 'EXTRACT',
                adapterCode: 'new',
                config: { adapterCode: 'new' },
            },
        ]);
    });

    it('persists schema version bindings edited in the visual node panel', () => {
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'source',
                type: 'EXTRACT',
                config: { adapterCode: 'inMemory' },
            }],
        };
        const visual = toVisualDefinition(definition);
        visual.nodes[0].data.schemaRef = {
            schemaId: 'catalog.product',
            version: '1.0.0',
        };

        expect(toCanonicalDefinition(visual).steps[0].schemaRef).toEqual({
            schemaId: 'catalog.product',
            version: '1.0.0',
        });
    });

    it('preserves advanced edge fields when a visual edge property changes', () => {
        const definition = {
            version: 1,
            steps: [
                { key: 'route', type: 'ROUTE', config: { branches: [] } },
                { key: 'load', type: 'LOAD', config: { adapterCode: 'productUpsert' } },
            ],
            edges: [{
                from: 'route',
                to: 'load',
                branch: 'old',
                condition: 'record.active',
                dependencyOnly: true,
                futureEdge: { keep: true },
            }],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.edges[0] = { ...visual.edges[0], sourceHandle: 'new' };

        expect(toCanonicalDefinition(visual).edges).toEqual([{
            from: 'route',
            to: 'load',
            branch: 'new',
            condition: 'record.active',
            dependencyOnly: true,
            futureEdge: { keep: true },
        }]);
    });

    it('updates exposed root fields without replacing unknown root metadata', () => {
        const definition = {
            version: 5,
            name: 'Root edit',
            futureRoot: { keep: true },
            context: { validationMode: 'STRICT', futureContext: 'keep' },
            steps: [],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.variables = { validationMode: 'LENIENT' };

        expect(toCanonicalDefinition(visual)).toEqual({
            version: 5,
            name: 'Root edit',
            futureRoot: { keep: true },
            context: { validationMode: 'LENIENT', futureContext: 'keep' },
            steps: [],
        });
    });

    it('edits and clears step context without losing unrendered step fields', () => {
        const definition = {
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                futureStep: 'keep',
                config: {},
                context: {
                    validationMode: 'STRICT',
                    throughput: { batchSize: 10, futureLimit: 25 },
                },
            }],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.nodes[0].data.context = {
            validationMode: 'LENIENT',
            throughput: { batchSize: 20 },
        };

        expect(toCanonicalDefinition(visual).steps[0]).toEqual({
            key: 'load',
            type: 'LOAD',
            futureStep: 'keep',
            config: {},
            context: {
                validationMode: 'LENIENT',
                throughput: { batchSize: 20, futureLimit: 25 },
            },
        });

        visual.nodes[0].data.context = undefined;
        expect(toCanonicalDefinition(visual).steps[0]).toEqual({
            key: 'load',
            type: 'LOAD',
            futureStep: 'keep',
            config: {},
        });
    });

    it('keeps an explicit empty edge set for a multi-step pipeline', () => {
        const definition = {
            version: 1,
            steps: [
                { key: 'first', type: 'EXTRACT', config: {} },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [],
        } as unknown as PipelineDefinition;

        const visual = toVisualDefinition(definition);

        expect(visual.edges).toEqual([]);
        expect(toCanonicalDefinition(visual)).toEqual(definition);
    });

    it('preserves source-only metadata when node and edge IDs are renamed', () => {
        const definition = {
            version: 1,
            steps: [
                {
                    key: 'first',
                    type: 'EXTRACT',
                    futureStep: 'keep',
                    config: { futureConfig: 'keep' },
                },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [{
                id: 'original-edge',
                from: 'first',
                to: 'second',
                futureEdge: 'keep',
            }],
        } as unknown as PipelineDefinition;
        const visual = toVisualDefinition(definition);
        visual.nodes[0] = { ...visual.nodes[0], id: 'renamed-first' };
        visual.edges[0] = {
            ...visual.edges[0],
            id: 'renamed-edge',
            source: 'renamed-first',
        };

        expect(toCanonicalDefinition(visual)).toEqual({
            version: 1,
            steps: [
                {
                    key: 'renamed-first',
                    type: 'EXTRACT',
                    futureStep: 'keep',
                    config: { futureConfig: 'keep' },
                },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [{
                id: 'renamed-edge',
                from: 'renamed-first',
                to: 'second',
                futureEdge: 'keep',
            }],
        });
    });

    it('rejects duplicate visual node and edge IDs', () => {
        const visual = toVisualDefinition({
            version: 1,
            steps: [
                { key: 'first', type: 'EXTRACT', config: {} },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [],
        });
        visual.nodes[1] = { ...visual.nodes[1], id: 'first' };

        expect(() => toCanonicalDefinition(visual)).toThrow(
            'Duplicate visual node id',
        );
    });
});
