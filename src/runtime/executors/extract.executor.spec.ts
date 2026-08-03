import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { TRANSFORM_LIMITS } from '../../constants';
import { StepType } from '../../constants/enums';
import { ExtractorRegistryService } from '../../extractors/extractor-registry.service';
import { GraphQLExtractor } from '../../extractors/graphql';
import { HttpApiExtractor } from '../../extractors/http-api';
import { ConnectionService } from '../../services/config/connection.service';
import { SecretService } from '../../services/config/secret.service';
import { DataHubLoggerFactory } from '../../services/logger';
import { FileStorageService } from '../../services/storage/file-storage.service';
import { FileParserService } from '../../parsers/file-parser.service';
import { DataHubRegistryService } from '../../sdk/registry.service';
import type {
    BatchExtractorAdapter,
    ExtractorAdapter,
} from '../../sdk/types';
import type { PipelineStepDefinition } from '../../types';
import type { ExecutorContext, OnRecordErrorCallback } from '../executor-types';
import { ExtractExecutor } from './extract.executor';

function createExecutor(
    registry: DataHubRegistryService,
    extractorRegistry?: ExtractorRegistryService,
    connectionService: ConnectionService = {} as ConnectionService,
) {
    const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        logExtractorOperation: vi.fn(),
    };
    const loggerFactory = { createLogger: vi.fn(() => logger) };
    const executor = new ExtractExecutor(
        {} as SecretService,
        connectionService,
        {} as FileStorageService,
        {} as FileParserService,
        loggerFactory as unknown as DataHubLoggerFactory,
        registry,
        extractorRegistry,
    );
    return { executor, logger };
}

function createStep(adapterCode: string): PipelineStepDefinition {
    return {
        key: 'extract-source',
        type: StepType.EXTRACT,
        config: { adapterCode },
    };
}

function createExecutorContext(): ExecutorContext {
    return {
        cpData: {},
        cpDirty: false,
        markCheckpointDirty: vi.fn(),
    };
}

function createStreamingExtractor(
    code: string,
    extract: ExtractorAdapter<unknown>['extract'],
): ExtractorAdapter<unknown> {
    return {
        type: 'EXTRACTOR',
        code,
        version: '1.0.0',
        apiVersion: 1,
        schema: { fields: [] },
        extract,
    };
}

function createBatchExtractor(
    code: string,
    extractAll: BatchExtractorAdapter<unknown>['extractAll'],
): BatchExtractorAdapter<unknown> {
    return {
        type: 'EXTRACTOR',
        code,
        version: '1.0.0',
        apiVersion: 1,
        schema: { fields: [] },
        extractAll,
        async preview() {
            return { records: [] };
        },
    };
}

describe('ExtractExecutor custom extractors', () => {
    const ctx = {} as RequestContext;

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('executes a registered streaming extractor', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createStreamingExtractor(
            'custom-stream',
            async function* () {
                yield { data: { id: 'stream-record' } };
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
        )).resolves.toEqual([{ id: 'stream-record' }]);
    });

    it('executes a registered batch extractor', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createBatchExtractor(
            'custom-batch',
            async () => ({ records: [{ data: { id: 'batch-record' } }] }),
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
        )).resolves.toEqual([{ id: 'batch-record' }]);
    });

    it('rejects a partial stream instead of returning its earlier records', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createStreamingExtractor(
            'partial-stream',
            async function* () {
                yield { data: { id: 'partial' } };
                throw new Error('source disconnected');
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);
        const onRecordError = vi.fn<OnRecordErrorCallback>(
            async () => undefined,
        );

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
            onRecordError,
        )).rejects.toThrow('source disconnected');
        expect(onRecordError).toHaveBeenCalledOnce();
    });

    it('rejects a failed batch extractor', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createBatchExtractor(
            'failed-batch',
            async () => {
                throw new Error('batch source failed');
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
        )).rejects.toThrow('batch source failed');
    });

    it('preserves the source error when error recording also fails', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createBatchExtractor(
            'callback-failure',
            async () => {
                throw new Error('primary source failure');
            },
        );
        registry.registerRuntime(extractor);
        const { executor, logger } = createExecutor(registry);
        const onRecordError = vi.fn<OnRecordErrorCallback>(
            async () => {
                throw new Error('error store unavailable');
            },
        );

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
            onRecordError,
        )).rejects.toThrow('primary source failure');
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to record extractor error',
            expect.objectContaining({ error: 'error store unavailable' }),
        );
    });

    it('validates modern extractor configuration before reading the source', async () => {
        const extract = vi.fn(() => (async function* () {
            yield { data: { id: 'must-not-run' } };
        })());
        const validate = vi.fn(async () => ({
            valid: false,
            errors: [{ field: 'connectionCode', message: 'Connection is required' }],
        }));
        const extractor = {
            type: 'EXTRACTOR',
            code: 'modern-invalid',
            name: 'Modern invalid extractor',
            category: 'CUSTOM',
            schema: { fields: [] },
            validate,
            extract,
        };
        const extractorRegistry = {
            getStreamingExtractor: vi.fn(() => extractor),
            getBatchExtractor: vi.fn(),
        };
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
        );

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
        )).rejects.toThrow(
            'connectionCode: Connection is required',
        );
        expect(validate).toHaveBeenCalledOnce();
        expect(extract).not.toHaveBeenCalled();
    });

    it('routes HTTP extraction through canonical registry validation', async () => {
        const extractor = new HttpApiExtractor();
        const validate = vi.spyOn(extractor, 'validate');
        const extract = vi.spyOn(extractor, 'extract');
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const extractorRegistry = {
            getStreamingExtractor: vi.fn((code: string) => code === extractor.code ? extractor : undefined),
            getBatchExtractor: vi.fn(),
        };
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
        );
        const step: PipelineStepDefinition = {
            key: 'http-source',
            type: StepType.EXTRACT,
            config: {
                adapterCode: 'httpApi',
                url: 'https://93.184.216.34/products',
                itemsField: 'items',
            },
        };

        await expect(executor.execute(
            ctx,
            step,
            createExecutorContext(),
        )).rejects.toThrow('unsupported legacy field "itemsField"');

        expect(extractorRegistry.getStreamingExtractor).toHaveBeenCalledWith('httpApi');
        expect(validate).toHaveBeenCalledOnce();
        expect(extract).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('executes connection-backed GraphQL through the canonical registry extractor', async () => {
        const extractor = new GraphQLExtractor();
        const extractorRegistry = {
            getStreamingExtractor: vi.fn((code: string) => code === extractor.code ? extractor : undefined),
            getBatchExtractor: vi.fn(),
        };
        const connectionService = {
            getRuntimeByCode: vi.fn(async () => ({
                code: 'catalog-graphql',
                type: 'GRAPHQL',
                config: {
                    baseUrl: 'https://93.184.216.34/graphql',
                    headers: { 'X-Tenant': 'storefront' },
                },
            })),
        } as unknown as ConnectionService;
        const fetchSpy = vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response(JSON.stringify({
            data: { products: [{ id: 'product-1' }] },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchSpy);
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
            connectionService,
        );
        const step: PipelineStepDefinition = {
            key: 'graphql-source',
            type: StepType.EXTRACT,
            config: {
                adapterCode: 'graphql',
                connectionCode: 'catalog-graphql',
                url: '',
                query: 'query Products { products { id } }',
                dataPath: 'data.products',
            },
        };

        await expect(executor.execute(
            ctx,
            step,
            createExecutorContext(),
        )).resolves.toEqual([{ id: 'product-1' }]);

        expect(extractorRegistry.getStreamingExtractor).toHaveBeenCalledWith('graphql');
        expect(connectionService.getRuntimeByCode).toHaveBeenCalledWith(ctx, 'catalog-graphql');
        expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('https://93.184.216.34/graphql');
        const requestHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
        expect(requestHeaders.get('X-Tenant')).toBe('storefront');
    });

    it('rejects an unknown extractor adapter', async () => {
        const { executor } = createExecutor(new DataHubRegistryService());

        await expect(executor.execute(
            ctx,
            createStep('not-registered'),
            createExecutorContext(),
        )).rejects.toThrow('Unknown extractor adapter: not-registered');
    });

    it('allows a successful source to return no records', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createStreamingExtractor(
            'empty-stream',
            async function* () {
                yield* [];
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
        )).resolves.toEqual([]);
    });

    it('limits generator work at the source during previews', async () => {
        const { executor } = createExecutor(new DataHubRegistryService());
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const step: PipelineStepDefinition = {
            key: 'preview-generator',
            type: StepType.EXTRACT,
            config: { adapterCode: 'generator', count: 1_000 },
        };

        await expect(executor.execute(
            ctx,
            step,
            { ...createExecutorContext(), recordLimit: 3 },
        )).resolves.toHaveLength(3);
        expect(randomSpy).toHaveBeenCalledTimes(3);
        randomSpy.mockRestore();
    });

    it('preserves configured generator totals in a bounded preview', async () => {
        const { executor } = createExecutor(new DataHubRegistryService());
        const step: PipelineStepDefinition = {
            key: 'preview-generator-total',
            type: StepType.EXTRACT,
            config: {
                adapterCode: 'generator',
                count: 1_000,
                template: { summary: '{{index}}/{{total}}' },
            },
        };

        await expect(executor.preview(ctx, step, 2)).resolves.toMatchObject({
            records: [
                { data: { _index: 0, summary: '0/1000' } },
                { data: { _index: 1, summary: '1/1000' } },
            ],
        });
    });

    it('supports an explicit zero generator count', async () => {
        const { executor } = createExecutor(new DataHubRegistryService());
        const step: PipelineStepDefinition = {
            key: 'zero-generator',
            type: StepType.EXTRACT,
            config: { adapterCode: 'generator', count: 0 },
        };

        await expect(executor.execute(
            ctx,
            step,
            createExecutorContext(),
        )).resolves.toEqual([]);
    });

    it.each([Number.POSITIVE_INFINITY, -1, 1.5, 100_001])(
        'rejects an unsafe generator count: %s',
        async count => {
            const { executor } = createExecutor(new DataHubRegistryService());
            const step: PipelineStepDefinition = {
                key: 'invalid-generator-count',
                type: StepType.EXTRACT,
                config: { adapterCode: 'generator', count },
            };

            await expect(executor.execute(
                ctx,
                step,
                createExecutorContext(),
            )).rejects.toThrow('Generator count must be an integer from 0 to 100000');
        },
    );

    it('uses the registered extractor preview contract', async () => {
        const extract = vi.fn(() => (async function* () {
            yield { data: { id: 'must-not-run' } };
        })());
        const preview = vi.fn(async () => ({
            records: [{ data: { id: 'bounded-preview' } }],
            totalAvailable: 20,
        }));
        const extractor = {
            type: 'EXTRACTOR',
            code: 'modern-preview',
            name: 'Modern preview extractor',
            category: 'CUSTOM',
            schema: { fields: [] },
            validate: vi.fn(async () => ({ valid: true, errors: [] })),
            extract,
            preview,
        };
        const extractorRegistry = {
            getExtractor: vi.fn(() => extractor),
        };
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
        );

        await expect(executor.preview(ctx, createStep(extractor.code), 1)).resolves.toMatchObject({
            records: [{ data: { id: 'bounded-preview' } }],
            totalAvailable: 20,
        });
        expect(preview).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 1);
        expect(extract).not.toHaveBeenCalled();
    });

    it('bounds registered extractor preview work before adapter invocation', async () => {
        const preview = vi.fn(async () => ({ records: [] }));
        const extractor = {
            type: 'EXTRACTOR',
            code: 'bounded-registered-preview',
            name: 'Bounded registered preview',
            category: 'CUSTOM',
            schema: { fields: [] },
            validate: vi.fn(async () => ({ valid: true, errors: [] })),
            extract: vi.fn(),
            preview,
        };
        const extractorRegistry = {
            getExtractor: vi.fn(() => extractor),
        };
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
        );

        await executor.preview(
            ctx,
            createStep(extractor.code),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT + 1,
        );

        expect(preview).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
        );
    });

    it('does not request one extra streaming record at the preview limit', async () => {
        const registry = new DataHubRegistryService();
        let requested = 0;
        const extractor = createStreamingExtractor(
            'bounded-stream',
            async function* () {
                while (true) {
                    requested++;
                    yield { data: { id: requested } };
                }
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.preview(ctx, createStep(extractor.code), 3)).resolves.toMatchObject({
            records: [
                { data: { id: 1 } },
                { data: { id: 2 } },
                { data: { id: 3 } },
            ],
        });
        expect(requested).toBe(3);
    });

    it('uses an SDK extractor preview contract when provided', async () => {
        const registry = new DataHubRegistryService();
        const extractor = {
            ...createBatchExtractor('sdk-preview', vi.fn()),
            preview: vi.fn(async () => ({
                records: [{ data: { id: 'sdk-preview' } }],
                totalAvailable: 4,
            })),
        };
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.preview(ctx, createStep(extractor.code), 1)).resolves.toMatchObject({
            records: [{ data: { id: 'sdk-preview' } }],
            totalAvailable: 4,
        });
        expect(extractor.preview).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 1);
        expect(extractor.extractAll).not.toHaveBeenCalled();
    });

    it('bounds SDK preview work before adapter invocation', async () => {
        const registry = new DataHubRegistryService();
        const extractor = {
            ...createBatchExtractor('bounded-sdk-preview', vi.fn()),
            preview: vi.fn(async () => ({ records: [] })),
        };
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await executor.preview(
            ctx,
            createStep(extractor.code),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT + 1,
        );

        expect(extractor.preview).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
        );
    });
    it('uses bounded preview instead of full SDK batch extraction in dry runs', async () => {
        const registry = new DataHubRegistryService();
        const extractAll = vi.fn(async () => ({
            records: [{ data: { id: 'unbounded' } }],
        }));
        const extractor = {
            ...createBatchExtractor('sdk-bounded-batch', extractAll),
            preview: vi.fn(async () => ({
                records: [{ data: { id: 'bounded' } }],
                totalAvailable: 50,
            })),
        };
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            {
                ...createExecutorContext(),
                recordLimit: TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT + 1,
            },
        )).resolves.toEqual([{ id: 'bounded' }]);
        expect(extractor.preview).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
        );
        expect(extractAll).not.toHaveBeenCalled();
    });

    it('uses bounded preview instead of full registered batch extraction in dry runs', async () => {
        const extractAll = vi.fn(async () => ({
            records: [{ data: { id: 'unbounded' } }],
            metrics: { totalFetched: 1 },
        }));
        const preview = vi.fn(async () => ({
            records: [{ data: { id: 'bounded' } }],
            totalAvailable: 50,
        }));
        const extractor = {
            type: 'EXTRACTOR',
            code: 'registered-bounded-batch',
            name: 'Registered bounded batch',
            category: 'CUSTOM',
            schema: { fields: [] },
            validate: vi.fn(async () => ({ valid: true, errors: [] })),
            extractAll,
            preview,
        };
        const extractorRegistry = {
            getStreamingExtractor: vi.fn(),
            getBatchExtractor: vi.fn(() => extractor),
        };
        const { executor } = createExecutor(
            new DataHubRegistryService(),
            extractorRegistry as unknown as ExtractorRegistryService,
        );

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            {
                ...createExecutorContext(),
                recordLimit: TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT + 1,
            },
        )).resolves.toEqual([{ id: 'bounded' }]);
        expect(preview).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
        );
        expect(extractAll).not.toHaveBeenCalled();
    });

    it('snapshots reused stream records and closes the iterator at the limit', async () => {
        const registry = new DataHubRegistryService();
        const sharedRecord = { id: 0 };
        let iteratorClosed = false;
        const extractor = createStreamingExtractor(
            'reused-record-stream',
            async function* () {
                try {
                    sharedRecord.id = 1;
                    yield { data: sharedRecord };
                    sharedRecord.id = 2;
                    yield { data: sharedRecord };
                    sharedRecord.id = 3;
                    yield { data: sharedRecord };
                } finally {
                    iteratorClosed = true;
                }
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            { ...createExecutorContext(), recordLimit: 2 },
        )).resolves.toEqual([{ id: 1 }, { id: 2 }]);
        expect(iteratorClosed).toBe(true);
    });

    it('does not expose mutable checkpoint state to SDK extractors', async () => {
        const registry = new DataHubRegistryService();
        const extractor = createStreamingExtractor(
            'checkpoint-reader',
            async function* (context) {
                context.checkpoint.cursor = 'mutated';
                yield { data: { id: 'record' } };
            },
        );
        registry.registerRuntime(extractor);
        const executorCtx = createExecutorContext();
        executorCtx.cpData = {
            'extract-source': { cursor: 'original' },
        };
        const { executor } = createExecutor(registry);

        await executor.execute(ctx, createStep(extractor.code), executorCtx);

        expect(executorCtx.cpData['extract-source']).toEqual({ cursor: 'original' });
        expect(executorCtx.markCheckpointDirty).not.toHaveBeenCalled();
    });

    it('snapshots checkpoint updates before storing them', async () => {
        const registry = new DataHubRegistryService();
        const nextCheckpoint = { cursor: 'saved' };
        const extractor = createStreamingExtractor(
            'checkpoint-writer',
            async function* (context) {
                context.setCheckpoint(nextCheckpoint);
                nextCheckpoint.cursor = 'mutated-after-save';
                yield { data: { id: 'record' } };
            },
        );
        registry.registerRuntime(extractor);
        const executorCtx = createExecutorContext();
        const { executor } = createExecutor(registry);

        await executor.execute(ctx, createStep(extractor.code), executorCtx);

        expect(executorCtx.cpData?.['extract-source']).toEqual({ cursor: 'saved' });
        expect(executorCtx.markCheckpointDirty).toHaveBeenCalledOnce();
    });

    it('exposes cancellation and execution mode to SDK extractors', async () => {
        const registry = new DataHubRegistryService();
        const observedContexts: Array<{ dryRun: boolean; cancelled: boolean }> = [];
        const extractor = createStreamingExtractor(
            'cancellable-sdk-stream',
            async function* (context) {
                const cancelled = await context.isCancelled();
                observedContexts.push({
                    dryRun: context.dryRun,
                    cancelled,
                });
                if (!cancelled) {
                    yield { data: { id: 'record' } };
                }
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            {
                ...createExecutorContext(),
                onCancelRequested: vi.fn(async () => true),
            },
        )).resolves.toEqual([]);
        await expect(executor.preview(
            ctx,
            createStep(extractor.code),
            1,
        )).resolves.toMatchObject({
            records: [{ data: { id: 'record' } }],
        });

        expect(observedContexts).toEqual([
            { dryRun: false, cancelled: true },
            { dryRun: true, cancelled: false },
        ]);
    });

    it('provides immutable run-scoped source references to SDK extractors', async () => {
        const registry = new DataHubRegistryService();
        const sourceRecords = [{ fileId: 'file-1', path: '/imports/catalog.csv' }];
        const observedContext: Array<{
            pipelineId: string;
            runId: string;
            sourceRecords: readonly Record<string, unknown>[] | undefined;
        }> = [];
        const extractor = createStreamingExtractor(
            'run-scoped-sdk-stream',
            async function* (context) {
                observedContext.push({
                    pipelineId: String(context.pipelineId),
                    runId: String(context.runId),
                    sourceRecords: context.sourceRecords,
                });
                const firstSource = context.sourceRecords?.[0];
                if (firstSource) {
                    firstSource.path = '/mutated-by-adapter.csv';
                }
                yield { data: { id: 'record' } };
            },
        );
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            createExecutorContext(),
            undefined,
            'pipeline-7',
            'run-9',
            sourceRecords,
        )).resolves.toEqual([{ id: 'record' }]);

        expect(observedContext).toEqual([{
            pipelineId: 'pipeline-7',
            runId: 'run-9',
            sourceRecords: [{ fileId: 'file-1', path: '/mutated-by-adapter.csv' }],
        }]);
        expect(sourceRecords).toEqual([{
            fileId: 'file-1',
            path: '/imports/catalog.csv',
        }]);
    });

    it('rejects non-finite record limits before invoking the source', async () => {
        const registry = new DataHubRegistryService();
        const extract = vi.fn(() => (async function* () {
            yield { data: { id: 'must-not-run' } };
        })());
        const extractor = createStreamingExtractor('invalid-limit', extract);
        registry.registerRuntime(extractor);
        const { executor } = createExecutor(registry);

        await expect(executor.execute(
            ctx,
            createStep(extractor.code),
            { ...createExecutorContext(), recordLimit: Number.NaN },
        )).rejects.toThrow('record limit must be a finite number');
        expect(extract).not.toHaveBeenCalled();
    });
});
