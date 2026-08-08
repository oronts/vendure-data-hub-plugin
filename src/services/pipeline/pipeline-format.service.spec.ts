import { describe, expect, it } from 'vitest';
import type { PipelineDefinition } from '../../types';
import { PipelineFormatService } from './pipeline-format.service';

describe('PipelineFormatService', () => {
    const service = new PipelineFormatService();

    it('round-trips the complete canonical structure including GATE and future fields', () => {
        const definition = {
            version: 4,
            name: 'Approval flow',
            futureRoot: { keep: true },
            context: { futureContext: 'keep' },
            steps: [
                {
                    key: 'approval',
                    type: 'GATE',
                    label: 'Review',
                    timeoutMs: 60_000,
                    futureStep: 'keep',
                    config: { approvalType: 'MANUAL', futureConfig: 'keep' },
                },
                {
                    key: 'load',
                    type: 'LOAD',
                    adapterCode: 'top-loader',
                    config: { adapterCode: 'config-loader' },
                },
            ],
            edges: [{
                from: 'approval',
                to: 'load',
                branch: 'approved',
                condition: 'record.valid',
                dependencyOnly: true,
                futureEdge: 'keep',
            }],
        } as unknown as PipelineDefinition;

        const visual = service.toVisual(definition);
        expect(visual.nodes[0].data.type).toBe('gate');
        expect(service.toCanonical(visual)).toEqual(definition);
        expect(service.validateRoundTrip(definition)).toEqual({ isValid: true, issues: [] });
    });

    it('recognizes and round-trips an empty visual graph', () => {
        const definition = {
            version: 3,
            steps: [],
            edges: [],
            futureRoot: 'keep',
        } as unknown as PipelineDefinition;
        const visual = service.toVisual(definition);

        expect(service.isVisualFormat(visual)).toBe(true);
        expect(service.toCanonical(visual)).toEqual(definition);
    });

    it('preserves unrendered step and config fields while applying an edit', () => {
        const definition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                retries: 3,
                futureStep: true,
                config: {
                    adapterCode: 'csv',
                    delimiter: ',',
                    nested: { keep: true, edited: 1 },
                    futureConfig: true,
                },
            }],
        } as unknown as PipelineDefinition;
        const visual = service.toVisual(definition);
        visual.nodes[0].data.config = {
            adapterCode: 'csv',
            delimiter: ';',
            nested: { edited: 2 },
        };

        expect(service.toCanonical(visual).steps[0]).toEqual({
            key: 'extract',
            type: 'EXTRACT',
            retries: 3,
            futureStep: true,
            config: {
                adapterCode: 'csv',
                delimiter: ';',
                nested: { keep: true, edited: 2 },
                futureConfig: true,
            },
        });
    });

    it('preserves nested step context metadata and supports clearing overrides', () => {
        const definition = {
            version: 1,
            steps: [{
                key: 'load',
                type: 'LOAD',
                futureStep: true,
                config: {},
                context: {
                    validationMode: 'STRICT',
                    throughput: { concurrency: 2, futureLimit: 50 },
                },
            }],
        } as unknown as PipelineDefinition;
        const visual = service.toVisual(definition);
        visual.nodes[0].data.context = {
            validationMode: 'LENIENT',
            throughput: { concurrency: 4 },
        };

        expect(service.toCanonical(visual).steps[0]).toEqual({
            key: 'load',
            type: 'LOAD',
            futureStep: true,
            config: {},
            context: {
                validationMode: 'LENIENT',
                throughput: { concurrency: 4, futureLimit: 50 },
            },
        });

        visual.nodes[0].data.context = undefined;
        expect(service.toCanonical(visual).steps[0]).toEqual({
            key: 'load',
            type: 'LOAD',
            futureStep: true,
            config: {},
        });
    });

    it('keeps adapter-code location and advanced edge fields during visual edits', () => {
        const definition = {
            version: 1,
            steps: [
                { key: 'route', type: 'ROUTE', config: { branches: [] } },
                { key: 'load', type: 'LOAD', adapterCode: 'old', config: {} },
            ],
            edges: [{
                from: 'route',
                to: 'load',
                branch: 'old',
                condition: 'record.active',
                dependencyOnly: true,
            }],
        } as unknown as PipelineDefinition;
        const visual = service.toVisual(definition);
        visual.nodes[1].data.adapterCode = 'new';
        visual.edges[0].sourceHandle = 'new';

        const converted = service.toCanonical(visual);
        expect(converted.steps[1]).toEqual({
            key: 'load',
            type: 'LOAD',
            adapterCode: 'new',
            config: {},
        });
        expect(converted.edges).toEqual([{
            from: 'route',
            to: 'load',
            branch: 'new',
            condition: 'record.active',
            dependencyOnly: true,
        }]);
    });

    it('keeps explicit empty edges for multi-step pipelines', () => {
        const definition = {
            version: 1,
            steps: [
                { key: 'first', type: 'EXTRACT', config: {} },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [],
        } as unknown as PipelineDefinition;

        const visual = service.toVisual(definition);

        expect(visual.edges).toEqual([]);
        expect(service.toCanonical(visual)).toEqual(definition);
    });

    it('preserves metadata and labels while renaming visual IDs', () => {
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
                label: 'Original',
                futureEdge: 'keep',
            }],
        } as unknown as PipelineDefinition;
        const visual = service.toVisual(definition);
        visual.nodes[0].id = 'renamed-first';
        visual.edges[0] = {
            ...visual.edges[0],
            id: 'renamed-edge',
            source: 'renamed-first',
            label: 'Renamed',
        };

        expect(service.toCanonical(visual)).toEqual({
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
                label: 'Renamed',
                futureEdge: 'keep',
            }],
        });
    });

    it('rejects duplicate visual IDs', () => {
        const visual = service.toVisual({
            version: 1,
            steps: [
                { key: 'first', type: 'EXTRACT', config: {} },
                { key: 'second', type: 'LOAD', config: {} },
            ],
            edges: [],
        });
        visual.nodes[1].id = 'first';

        expect(() => service.toCanonical(visual)).toThrow(
            'Duplicate visual node id',
        );
    });

    it('rejects unsupported canonical step types instead of coercing them', () => {
        expect(() => service.toVisual({
            version: 1,
            steps: [{ key: 'future', type: 'FUTURE', config: {} }],
        } as unknown as PipelineDefinition)).toThrow(
            'Unsupported pipeline step type "FUTURE"',
        );
    });

    it('rejects unsupported visual categories instead of creating transforms', () => {
        const visual = {
            nodes: [{
                id: 'future',
                type: 'future',
                position: { x: 0, y: 0 },
                data: { label: 'Future', type: 'future', config: {} },
            }],
            edges: [],
            variables: {},
        };

        expect(() => service.toCanonical(visual)).toThrow(
            'Unsupported visual node category "future"',
        );
    });
});
