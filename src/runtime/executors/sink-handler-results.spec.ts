import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitState } from '../../constants';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLogger } from '../../services/logger';
import type { CircuitBreakerService } from '../../services/runtime';
import type { JsonObject, PipelineStepDefinition } from '../../types';
import { secureFetch } from '../../utils/secure-fetch.utils';
import {
    SINK_ADAPTER_CODES,
    SINK_HANDLER_REGISTRY,
    type SinkHandlerContext,
    type SinkServices,
} from './sink-handler-registry';

vi.mock('../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));
vi.mock('../../utils/url-security.utils', () => ({
    assertUrlSafe: vi.fn(),
}));

const ctx = {} as RequestContext;
const records = [
    { id: 'record-1', title: 'One' },
    { id: 'record-2', title: 'Two' },
];

function response(body: string): Response {
    return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function createServices(secretValues: Record<string, string> = {}): SinkServices {
    return {
        secretService: {
            resolve: vi.fn(async (_ctx: RequestContext, code: string) => secretValues[code] ?? null),
        } as unknown as SecretService,
        connectionService: {} as ConnectionService,
        circuitBreaker: {
            getState: vi.fn(() => CircuitState.CLOSED),
            canExecute: vi.fn(() => true),
            recordSuccess: vi.fn(),
            recordFailure: vi.fn(),
        } as unknown as CircuitBreakerService,
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        } as unknown as DataHubLogger,
    };
}

async function run(
    adapterCode: string,
    config: Record<string, unknown>,
    input = records,
) {
    const entry = SINK_HANDLER_REGISTRY.get(adapterCode);
    if (!entry) throw new Error(`Missing sink ${adapterCode}`);
    const onRecordError = vi.fn();
    const step: PipelineStepDefinition = {
        key: 'search',
        type: 'SINK',
        config: config as JsonObject,
    };
    const handlerContext: SinkHandlerContext = {
        ctx,
        step,
        input,
        cfg: config,
        indexName: 'products',
        idField: 'id',
        bulkSize: 100,
        prepareDoc: record => record,
        onRecordError,
    };
    const result = await entry.handler(
        handlerContext,
        createServices({
            'search-key': 'runtime-key',
        }),
    );
    return { result, onRecordError };
}

async function runDelete(
    adapterCode: string,
    config: Record<string, unknown>,
) {
    const entry = SINK_HANDLER_REGISTRY.get(adapterCode);
    if (!entry?.deleteHandler) throw new Error(`Missing delete sink ${adapterCode}`);
    const onRecordError = vi.fn();
    const step: PipelineStepDefinition = {
        key: 'search',
        type: 'SINK',
        config: config as JsonObject,
    };
    const handlerContext: SinkHandlerContext = {
        ctx,
        step,
        input: records,
        cfg: config,
        indexName: 'products',
        idField: 'id',
        bulkSize: 100,
        prepareDoc: record => record,
        onRecordError,
    };
    const result = await entry.deleteHandler(
        handlerContext,
        createServices({ 'search-key': 'runtime-key' }),
        records.map(record => record.id),
    );
    return { result, onRecordError };
}

describe('search sink completion accounting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reports Elasticsearch item failures from an HTTP 200 bulk response', async () => {
        vi.mocked(secureFetch).mockResolvedValue(response(JSON.stringify({
            errors: true,
            items: [
                { index: { _id: 'record-1', status: 201 } },
                {
                    index: {
                        _id: 'record-2',
                        status: 400,
                        error: { reason: 'invalid mapping' },
                    },
                },
            ],
        })));

        const { result, onRecordError } = await run(SINK_ADAPTER_CODES.ELASTICSEARCH, {
            node: 'https://search.example.com',
            indexName: 'products',
            idField: 'id',
        });

        expect(result).toEqual({ ok: 1, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'search',
            'invalid mapping',
            records[1],
        );
    });

    it('reports Typesense NDJSON item failures from an HTTP 200 response', async () => {
        vi.mocked(secureFetch).mockResolvedValue(response([
            JSON.stringify({ success: true }),
            JSON.stringify({ success: false, error: 'invalid field type' }),
        ].join('\n')));

        const { result } = await run(SINK_ADAPTER_CODES.TYPESENSE, {
            host: 'search.example.com',
            apiKeySecretCode: 'search-key',
            collectionName: 'products',
            idField: 'id',
        });

        expect(result).toEqual({ ok: 1, fail: 1 });
    });

    it('waits for MeiliSearch task completion before reporting success', async () => {
        vi.mocked(secureFetch)
            .mockResolvedValueOnce(response('{"taskUid":41}'))
            .mockResolvedValueOnce(response('{"status":"succeeded"}'));

        const { result } = await run(SINK_ADAPTER_CODES.MEILISEARCH, {
            host: 'https://search.example.com',
            apiKeySecretCode: 'search-key',
            indexName: 'products',
            primaryKey: 'id',
        });

        expect(result).toEqual({ ok: 2, fail: 0 });
        expect(secureFetch).toHaveBeenNthCalledWith(
            2,
            'https://search.example.com/tasks/41',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('waits for Algolia task publication before reporting success', async () => {
        vi.mocked(secureFetch)
            .mockResolvedValueOnce(response('{"taskID":73}'))
            .mockResolvedValueOnce(response('{"status":"published"}'));

        const { result } = await run(SINK_ADAPTER_CODES.ALGOLIA, {
            appId: 'catalog',
            apiKeySecretCode: 'search-key',
            indexName: 'products',
            idField: 'id',
        });

        expect(result).toEqual({ ok: 2, fail: 0 });
        expect(secureFetch).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('/indexes/products/task/73'),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('rejects empty document identities without making a request', async () => {
        const { result, onRecordError } = await run(
            SINK_ADAPTER_CODES.ELASTICSEARCH,
            {
                node: 'https://search.example.com',
                indexName: 'products',
                idField: 'id',
            },
            [{ id: '   ', title: 'Invalid' }],
        );

        expect(result).toEqual({ ok: 0, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'search',
            'Search record is missing identity field "id"',
            { id: '   ', title: 'Invalid' },
        );
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('reports Elasticsearch delete item failures from an HTTP 200 bulk response', async () => {
        vi.mocked(secureFetch).mockResolvedValue(response(JSON.stringify({
            errors: true,
            items: [
                { delete: { _id: 'record-1', status: 200 } },
                {
                    delete: {
                        _id: 'record-2',
                        status: 409,
                        error: { reason: 'version conflict' },
                    },
                },
            ],
        })));

        const { result, onRecordError } = await runDelete(
            SINK_ADAPTER_CODES.ELASTICSEARCH,
            {
                node: 'https://search.example.com',
                indexName: 'products',
                idField: 'id',
            },
        );

        expect(result).toEqual({ ok: 1, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'search',
            'version conflict',
            { id: 'record-2' },
        );
    });

    it.each([
        {
            name: 'MeiliSearch',
            adapterCode: SINK_ADAPTER_CODES.MEILISEARCH,
            config: {
                host: 'https://search.example.com',
                apiKeySecretCode: 'search-key',
                primaryKey: 'id',
            },
            accepted: '{"taskUid":41}',
            completed: '{"status":"succeeded"}',
        },
        {
            name: 'Algolia',
            adapterCode: SINK_ADAPTER_CODES.ALGOLIA,
            config: {
                appId: 'catalog',
                apiKeySecretCode: 'search-key',
                idField: 'id',
            },
            accepted: '{"taskID":73}',
            completed: '{"status":"published"}',
        },
    ])('waits for $name delete completion', async testCase => {
        vi.mocked(secureFetch)
            .mockResolvedValueOnce(response(testCase.accepted))
            .mockResolvedValueOnce(response(testCase.completed));

        const { result } = await runDelete(testCase.adapterCode, testCase.config);

        expect(result).toEqual({ ok: 2, fail: 0 });
        expect(secureFetch).toHaveBeenCalledTimes(2);
    });
});
