import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import type { DataHubLogger } from '../../services/logger';
import type { ExtractExecutor, LoadExecutor, TransformExecutor } from '../executors';
import type { RecordObject } from '../executor-types';
import { DryRunSimulator } from './dry-run-simulator';

describe('DryRunSimulator graph execution', () => {
    it('follows branch edges and merges branch results at joins', async () => {
        const extractExecutor = {
            execute: vi.fn(async () => [{ lane: 'left' }, { lane: 'right' }]),
        } as unknown as ExtractExecutor;
        const transformExecutor = {
            executeRouteBranches: vi.fn(async (_ctx, _step, records) => ({
                __branchOutputs: true as const,
                branches: {
                    left: records.filter((record: RecordObject) => record.lane === 'left'),
                    right: records.filter((record: RecordObject) => record.lane === 'right'),
                    default: [],
                },
            })),
            executeOperator: vi.fn(async (_ctx, step, records) => (
                records.map((record: RecordObject) => ({ ...record, transformedBy: step.key }))
            )),
        } as unknown as TransformExecutor;
        const loadExecutor = {
            simulate: vi.fn(async (_ctx, _step, records) => ({
                recordsIn: records.length,
                recordsOut: records.length,
            })),
        } as unknown as LoadExecutor;
        const logger = {
            debug: vi.fn(),
            error: vi.fn(),
        } as unknown as DataHubLogger;
        const simulator = new DryRunSimulator(
            extractExecutor,
            transformExecutor,
            loadExecutor,
            logger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'join', type: 'LOAD', config: { adapterCode: 'product' } },
                { key: 'right', type: 'TRANSFORM', config: {} },
                { key: 'route', type: 'ROUTE', config: {} },
                { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
                { key: 'left', type: 'TRANSFORM', config: {} },
            ],
            edges: [
                { from: 'extract', to: 'route' },
                { from: 'route', to: 'left', branch: 'left' },
                { from: 'route', to: 'right', branch: 'right' },
                { from: 'left', to: 'join' },
                { from: 'right', to: 'join' },
            ],
        };

        const result = await simulator.executeDryRun({} as RequestContext, definition);

        expect(transformExecutor.executeRouteBranches).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ key: 'route' }),
            [{ lane: 'left' }, { lane: 'right' }],
        );
        expect(loadExecutor.simulate).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ key: 'join' }),
            [
                { lane: 'left', transformedBy: 'left' },
                { lane: 'right', transformedBy: 'right' },
            ],
        );
        expect(result.metrics.recordsProcessed).toBe(2);
        expect(result.metrics.details).toEqual(expect.arrayContaining([
            expect.objectContaining({ stepKey: 'route', recordsIn: 2, recordsOut: 2 }),
            expect.objectContaining({ stepKey: 'join', recordsIn: 2 }),
        ]));
    });

    it('reports side-effecting step types as skipped instead of implying execution', async () => {
        const simulator = new DryRunSimulator(
            {
                execute: vi.fn(async () => [{ sku: 'SKU-1' }]),
            } as unknown as ExtractExecutor,
            {} as TransformExecutor,
            {} as LoadExecutor,
            {
                debug: vi.fn(),
                error: vi.fn(),
            } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
                { key: 'publish-feed', type: 'FEED', config: { adapterCode: 'feed' } },
            ],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
        );

        expect(result.metrics.details).toEqual(expect.arrayContaining([
            expect.objectContaining({
                stepKey: 'publish-feed',
                stepType: 'FEED',
                simulation: 'SKIPPED',
                recordsIn: 1,
                recordsOut: 1,
            }),
        ]));
        expect(result.metrics.recordsSkipped).toBe(1);
        expect(result.metrics.skipped).toBe(1);
    });
});
