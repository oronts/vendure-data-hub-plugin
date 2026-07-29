import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import type { PipelineDefinition } from '../../types';
import type { DataHubLogger } from '../../services/logger';
import type { ExtractExecutor, LoadExecutor, TransformExecutor } from '../executors';
import type { RecordObject } from '../executor-types';
import { DryRunSimulator } from './dry-run-simulator';

describe('DryRunSimulator graph execution', () => {
    it('runs transforms against explicit seed records without truncating output to samples', async () => {
        const input = Array.from({ length: 12 }, (_, index) => ({
            sku: `SKU-${index}`,
            nested: { normalized: false },
        }));
        const transformExecutor = {
            executeOperator: vi.fn(async (_ctx, _step, records: RecordObject[]) => (
                records.map(record => ({
                    ...record,
                    nested: { normalized: true },
                }))
            )),
        } as unknown as TransformExecutor;
        const simulator = new DryRunSimulator(
            {} as ExtractExecutor,
            transformExecutor,
            {} as LoadExecutor,
            { debug: vi.fn(), error: vi.fn() } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{ key: 'normalize', type: 'TRANSFORM', config: {} }],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
            12,
            input,
        );

        expect(result.outputRecords).toHaveLength(12);
        expect(result.outputRecords[11]).toEqual({
            sku: 'SKU-11',
            nested: { normalized: true },
        });
        expect(result.sampleRecords).toHaveLength(10);
        expect(result.sampleRecords[0]).toMatchObject({
            before: { nested: { normalized: false } },
            after: { nested: { normalized: true } },
        });
        expect(input[0].nested.normalized).toBe(false);
        expect(result.metrics.recordsProcessed).toBe(12);
    });

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
            expect.objectContaining({
                channelStrategy: 'INHERIT',
                validationMode: 'STRICT',
            }),
        );
        expect(result.metrics.recordsProcessed).toBe(2);
        expect(result.metrics.details).toEqual(expect.arrayContaining([
            expect.objectContaining({ stepKey: 'route', recordsIn: 2, recordsOut: 2 }),
            expect.objectContaining({ stepKey: 'join', recordsIn: 2 }),
        ]));
    });

    it('passes effective pipeline and step context into transform and load simulations', async () => {
        const transformExecutor = {
            executeOperator: vi.fn(async (_ctx, _step, records) => records),
        } as unknown as TransformExecutor;
        const loadExecutor = {
            simulate: vi.fn(async () => ({
                supported: true,
                recordsIn: 1,
                recordDetails: [],
            })),
        } as unknown as LoadExecutor;
        const simulator = new DryRunSimulator(
            {
                execute: vi.fn(async () => [{ sku: 'SKU-1' }]),
            } as unknown as ExtractExecutor,
            transformExecutor,
            loadExecutor,
            { debug: vi.fn(), error: vi.fn() } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            context: {
                channel: 'pipeline-token',
                contentLanguage: 'en',
            },
            steps: [
                { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
                {
                    key: 'transform',
                    type: 'TRANSFORM',
                    config: { adapterCode: 'trim' },
                    context: { contentLanguage: 'de' },
                },
                { key: 'load', type: 'LOAD', config: { adapterCode: 'product' } },
            ],
        };

        await simulator.executeDryRun({
            channelId: 'source-channel',
            languageCode: 'fr',
        } as RequestContext, definition);

        expect(transformExecutor.executeOperator).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ key: 'transform' }),
            [{ sku: 'SKU-1' }],
            expect.anything(),
            expect.objectContaining({
                channel: 'pipeline-token',
                contentLanguage: 'de',
            }),
        );
        expect(loadExecutor.simulate).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ key: 'load' }),
            [{ sku: 'SKU-1' }],
            expect.objectContaining({
                channel: 'pipeline-token',
                contentLanguage: 'en',
            }),
        );
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

    it('reports unknown step types as skipped with an explicit warning', async () => {
        const simulator = new DryRunSimulator(
            {} as ExtractExecutor,
            {} as TransformExecutor,
            {} as LoadExecutor,
            { debug: vi.fn(), error: vi.fn() } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{ key: 'future', type: 'FUTURE' as never, config: {} }],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
            1,
            [{ sku: 'SKU-1' }],
        );

        expect(result.metrics.details).toContainEqual(expect.objectContaining({
            stepKey: 'future',
            simulation: 'SKIPPED',
            warning: 'Step type "FUTURE" is not supported by dry run',
        }));
        expect(result.metrics.recordsSkipped).toBe(1);
    });

    it('returns structured step failures without executing downstream records', async () => {
        const transformExecutor = {
            executeOperator: vi.fn(async () => {
                throw new Error('invalid transform expression');
            }),
        } as unknown as TransformExecutor;
        const loadExecutor = {
            simulate: vi.fn(async () => ({ supported: true, recordsIn: 0 })),
        } as unknown as LoadExecutor;
        const simulator = new DryRunSimulator(
            {} as ExtractExecutor,
            transformExecutor,
            loadExecutor,
            { debug: vi.fn(), error: vi.fn() } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'transform', type: 'TRANSFORM', config: {} },
                { key: 'load', type: 'LOAD', config: {} },
            ],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
            1,
            [{ sku: 'SKU-1' }],
        );

        expect(result.errors).toEqual([{
            stepKey: 'transform',
            message: 'invalid transform expression',
        }]);
        expect(result.metrics.details).toContainEqual(expect.objectContaining({
            stepKey: 'transform',
            simulation: 'FAILED',
            recordsOut: 0,
        }));
        expect(loadExecutor.simulate).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            [],
            expect.anything(),
        );
        expect(result.outputRecords).toEqual([]);
    });

    it('counts schema-rejected extracted records as failed processing outcomes', async () => {
        const extractExecutor = {
            execute: vi.fn(async () => [{ sku: '' }, { sku: 'SKU-2' }]),
            validateExtractedRecords: vi.fn(async (_ctx, _step, _records, onError) => {
                await onError('extract', 'sku is required');
                return [{ sku: 'SKU-2' }];
            }),
        } as unknown as ExtractExecutor;
        const simulator = new DryRunSimulator(
            extractExecutor,
            {} as TransformExecutor,
            {} as LoadExecutor,
            { debug: vi.fn(), error: vi.fn() } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [{
                key: 'extract',
                type: 'EXTRACT',
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
                config: { adapterCode: 'seed' },
            }],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
        );

        expect(result.metrics).toMatchObject({
            processed: 2,
            succeeded: 1,
            failed: 1,
        });
        expect(result.outputRecords).toEqual([{ sku: 'SKU-2' }]);
        expect(result.errors).toEqual([{
            stepKey: 'extract',
            message: 'sku is required',
        }]);
    });

    it('derives exact outcome metrics from loader simulation decisions', async () => {
        const recordDetails = [
            {
                recordId: 'SKU-1',
                entityType: 'ProductVariant',
                operation: 'CREATE' as const,
                currentState: null,
                proposedState: { sku: 'SKU-1' },
                validationErrors: [],
                warnings: [],
            },
            {
                recordId: 'SKU-2',
                entityType: 'ProductVariant',
                operation: 'SKIP' as const,
                currentState: { sku: 'SKU-2' },
                proposedState: { sku: 'SKU-2' },
                validationErrors: [],
                warnings: ['ProductVariant SKU-2 already exists'],
            },
            {
                recordId: 'SKU-3',
                entityType: 'ProductVariant',
                operation: 'ERROR' as const,
                currentState: null,
                proposedState: { sku: 'SKU-3' },
                validationErrors: ['ProductVariant SKU-3 was not found for update'],
                warnings: [],
            },
        ];
        const simulator = new DryRunSimulator(
            {
                execute: vi.fn(async () => recordDetails.map(detail => detail.proposedState)),
            } as unknown as ExtractExecutor,
            {} as TransformExecutor,
            {
                simulate: vi.fn(async () => ({
                    supported: true,
                    recordsIn: 3,
                    recordDetails,
                    wouldCreate: 1,
                    wouldUpdate: 0,
                    wouldDelete: 0,
                    wouldSkip: 1,
                    wouldFail: 1,
                })),
            } as unknown as LoadExecutor,
            {
                debug: vi.fn(),
                error: vi.fn(),
            } as unknown as DataHubLogger,
        );
        const definition: PipelineDefinition = {
            version: 1,
            steps: [
                { key: 'extract', type: 'EXTRACT', config: { adapterCode: 'seed' } },
                { key: 'load', type: 'LOAD', config: { adapterCode: 'variantUpsert' } },
            ],
        };

        const result = await simulator.executeDryRun(
            {} as RequestContext,
            definition,
        );

        expect(result.metrics).toMatchObject({
            processed: 3,
            succeeded: 1,
            skipped: 1,
            failed: 1,
        });
        expect(
            (result.metrics.succeeded ?? 0)
            + (result.metrics.skipped ?? 0)
            + (result.metrics.failed ?? 0),
        ).toBe(result.metrics.processed);
        expect(result.metrics.details).toEqual(expect.arrayContaining([
            expect.objectContaining({
                stepKey: 'load',
                recordsIn: 3,
                recordsOut: 3,
                recordDetails,
            }),
        ]));
    });
});
