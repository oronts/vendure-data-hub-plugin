import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
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
        schema: { fields: [] },
        extractAll,
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
        const onRecordError = vi.fn<Parameters<OnRecordErrorCallback>, ReturnType<OnRecordErrorCallback>>(
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
        const onRecordError = vi.fn<Parameters<OnRecordErrorCallback>, ReturnType<OnRecordErrorCallback>>(
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
});
