import { RequestContext } from '@vendure/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionService } from '../../services/config/connection.service';
import type { SecretService } from '../../services/config/secret.service';
import type { DataHubLogger } from '../../services/logger';
import type { CircuitBreakerService } from '../../services/runtime';
import { CircuitState } from '../../constants';
import { queueAdapterRegistry } from '../../sdk/adapters/queue';
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

interface TestServiceOptions {
    secretValues?: Record<string, string | null>;
    throwingSecretCodes?: string[];
    connectionConfig?: Record<string, unknown> | null;
}

function createServices(options: TestServiceOptions = {}) {
    const secretValues = options.secretValues ?? {};
    const throwingSecretCodes = new Set(options.throwingSecretCodes ?? []);
    const secretService = {
        resolve: vi.fn(async (_ctx: RequestContext, code: string) => {
            if (throwingSecretCodes.has(code)) throw new Error('Secret provider unavailable');
            return secretValues[code] ?? null;
        }),
    } as unknown as SecretService;
    const connectionService = {
        getRuntimeByCode: vi.fn(async () => options.connectionConfig === null
            ? null
            : {
                code: 'queue-connection',
                type: 'RABBITMQ',
                config: (options.connectionConfig ?? {}) as JsonObject,
            }),
    } as unknown as ConnectionService;
    const circuitBreaker = {
        getState: vi.fn(() => CircuitState.CLOSED),
        canExecute: vi.fn(() => true),
        recordSuccess: vi.fn(),
        recordFailure: vi.fn(),
    } as unknown as CircuitBreakerService;
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as DataHubLogger;
    return {
        services: { secretService, connectionService, circuitBreaker, logger } satisfies SinkServices,
        secretService,
        connectionService,
    };
}

function runSink(
    adapterCode: string,
    config: Record<string, unknown>,
    services: SinkServices,
) {
    const entry = SINK_HANDLER_REGISTRY.get(adapterCode);
    if (!entry) throw new Error(`Missing sink handler: ${adapterCode}`);
    const step: PipelineStepDefinition = {
        key: `${adapterCode}-sink`,
        type: 'SINK',
        config: config as JsonObject,
    };
    const handlerContext: SinkHandlerContext = {
        ctx,
        step,
        input: [{ id: 'record-1', sku: 'SKU-1' }],
        cfg: config as SinkHandlerContext['cfg'],
        indexName: 'products',
        idField: 'id',
        bulkSize: 100,
        prepareDoc: record => record,
        operation: 'UPSERT',
    };
    return entry.handler(handlerContext, services);
}

function runDeleteSink(
    adapterCode: string,
    config: Record<string, unknown>,
    services: SinkServices,
) {
    const entry = SINK_HANDLER_REGISTRY.get(adapterCode);
    if (!entry?.deleteHandler) throw new Error(`Missing delete sink handler: ${adapterCode}`);
    const step: PipelineStepDefinition = {
        key: `${adapterCode}-delete-sink`,
        type: 'SINK',
        config: config as JsonObject,
    };
    const handlerContext: SinkHandlerContext = {
        ctx,
        step,
        input: [{ id: 'record-1' }],
        cfg: config as SinkHandlerContext['cfg'],
        indexName: 'products',
        idField: 'id',
        bulkSize: 100,
        prepareDoc: record => record,
        operation: 'DELETE',
    };
    return entry.deleteHandler(handlerContext, services, ['record-1']);
}

interface SearchSecretCase {
    name: string;
    adapterCode: string;
    config: Record<string, unknown>;
    failingSecretCode: string;
    availableSecrets?: Record<string, string>;
}

const SEARCH_SECRET_CASES: SearchSecretCase[] = [
    {
        name: 'MeiliSearch API key',
        adapterCode: SINK_ADAPTER_CODES.MEILISEARCH,
        config: { adapterCode: SINK_ADAPTER_CODES.MEILISEARCH, host: 'https://search.example.com', apiKeySecretCode: 'meili-key' },
        failingSecretCode: 'meili-key',
    },
    {
        name: 'Typesense API key',
        adapterCode: SINK_ADAPTER_CODES.TYPESENSE,
        config: { adapterCode: SINK_ADAPTER_CODES.TYPESENSE, host: 'search.example.com', apiKeySecretCode: 'typesense-key' },
        failingSecretCode: 'typesense-key',
    },
    {
        name: 'Algolia API key',
        adapterCode: SINK_ADAPTER_CODES.ALGOLIA,
        config: { adapterCode: SINK_ADAPTER_CODES.ALGOLIA, appId: 'catalog', apiKeySecretCode: 'algolia-key' },
        failingSecretCode: 'algolia-key',
    },
    {
        name: 'Elasticsearch API key',
        adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
        config: { adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH, node: 'https://search.example.com', apiKeySecretCode: 'elastic-key' },
        failingSecretCode: 'elastic-key',
    },
    {
        name: 'Elasticsearch username',
        adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
        config: {
            adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
            node: 'https://search.example.com',
            usernameSecretCode: 'elastic-user',
            passwordSecretCode: 'elastic-password',
        },
        failingSecretCode: 'elastic-user',
        availableSecrets: { 'elastic-password': 'runtime-password' },
    },
    {
        name: 'Elasticsearch password',
        adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
        config: {
            adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
            node: 'https://search.example.com',
            usernameSecretCode: 'elastic-user',
            passwordSecretCode: 'elastic-password',
        },
        failingSecretCode: 'elastic-password',
        availableSecrets: { 'elastic-user': 'runtime-user' },
    },
    {
        name: 'OpenSearch API key',
        adapterCode: SINK_ADAPTER_CODES.OPENSEARCH,
        config: { adapterCode: SINK_ADAPTER_CODES.OPENSEARCH, node: 'https://search.example.com', apiKeySecretCode: 'opensearch-key' },
        failingSecretCode: 'opensearch-key',
    },
    {
        name: 'OpenSearch username',
        adapterCode: SINK_ADAPTER_CODES.OPENSEARCH,
        config: {
            adapterCode: SINK_ADAPTER_CODES.OPENSEARCH,
            node: 'https://search.example.com',
            usernameSecretCode: 'opensearch-user',
            passwordSecretCode: 'opensearch-password',
        },
        failingSecretCode: 'opensearch-user',
        availableSecrets: { 'opensearch-password': 'runtime-password' },
    },
    {
        name: 'OpenSearch password',
        adapterCode: SINK_ADAPTER_CODES.OPENSEARCH,
        config: {
            adapterCode: SINK_ADAPTER_CODES.OPENSEARCH,
            node: 'https://search.example.com',
            usernameSecretCode: 'opensearch-user',
            passwordSecretCode: 'opensearch-password',
        },
        failingSecretCode: 'opensearch-password',
        availableSecrets: { 'opensearch-user': 'runtime-user' },
    },
];

describe('sink credential boundaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(SEARCH_SECRET_CASES)('does not request when $name is unavailable', async testCase => {
        const { services } = createServices({ secretValues: testCase.availableSecrets });

        await expect(runSink(testCase.adapterCode, testCase.config, services))
            .rejects.toThrow('empty or unavailable');

        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each(SEARCH_SECRET_CASES)('does not request when resolving $name throws', async testCase => {
        const { services } = createServices({
            secretValues: testCase.availableSecrets,
            throwingSecretCodes: [testCase.failingSecretCode],
        });

        await expect(runSink(testCase.adapterCode, testCase.config, services))
            .rejects.toThrow('could not be resolved');

        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'MeiliSearch',
            adapterCode: SINK_ADAPTER_CODES.MEILISEARCH,
            config: { adapterCode: SINK_ADAPTER_CODES.MEILISEARCH, host: 'https://search.example.com' },
        },
        {
            name: 'Typesense',
            adapterCode: SINK_ADAPTER_CODES.TYPESENSE,
            config: { adapterCode: SINK_ADAPTER_CODES.TYPESENSE, host: 'search.example.com' },
        },
        {
            name: 'Algolia',
            adapterCode: SINK_ADAPTER_CODES.ALGOLIA,
            config: { adapterCode: SINK_ADAPTER_CODES.ALGOLIA, appId: 'catalog' },
        },
    ])('requires the configured API-key reference for $name', async testCase => {
        const { services, secretService } = createServices();

        await expect(runSink(testCase.adapterCode, testCase.config, services))
            .rejects.toThrow('requires a Secret Code');

        expect(secretService.resolve).not.toHaveBeenCalled();
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'API key with basic credentials',
            config: {
                apiKeySecretCode: 'elastic-key',
                usernameSecretCode: 'elastic-user',
                passwordSecretCode: 'elastic-password',
            },
            error: 'cannot combine API-key and basic credentials',
        },
        {
            name: 'username without password',
            config: { usernameSecretCode: 'elastic-user' },
            error: 'requires both usernameSecretCode and passwordSecretCode',
        },
        {
            name: 'password without username',
            config: { passwordSecretCode: 'elastic-password' },
            error: 'requires both usernameSecretCode and passwordSecretCode',
        },
    ])('rejects Elasticsearch/OpenSearch $name before secret resolution', async testCase => {
        const { services, secretService } = createServices();
        const config = {
            adapterCode: SINK_ADAPTER_CODES.ELASTICSEARCH,
            node: 'https://search.example.com',
            ...testCase.config,
        };

        await expect(runSink(SINK_ADAPTER_CODES.ELASTICSEARCH, config, services))
            .rejects.toThrow(testCase.error);

        expect(secretService.resolve).not.toHaveBeenCalled();
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each(SEARCH_SECRET_CASES.filter(testCase => [
        'MeiliSearch API key',
        'Typesense API key',
        'Algolia API key',
        'Elasticsearch API key',
        'OpenSearch API key',
    ].includes(testCase.name)))('does not issue a delete request when $name is unavailable', async testCase => {
        const { services } = createServices();

        await expect(runDeleteSink(testCase.adapterCode, testCase.config, services))
            .rejects.toThrow('empty or unavailable');

        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('resolves localized Typesense collection templates for writes and deletes', async () => {
        const { services } = createServices({
            secretValues: { 'typesense-key': 'runtime-key' },
        });
        const config = {
            adapterCode: SINK_ADAPTER_CODES.TYPESENSE,
            host: 'search.example.com',
            apiKeySecretCode: 'typesense-key',
            collectionName: 'products-${languageCode}',
            languageCode: 'de',
        };
        vi.mocked(secureFetch).mockResolvedValue(new Response('{}', { status: 200 }));

        await runSink(SINK_ADAPTER_CODES.TYPESENSE, config, services);
        await runDeleteSink(SINK_ADAPTER_CODES.TYPESENSE, config, services);

        expect(vi.mocked(secureFetch).mock.calls.map(call => String(call[0]))).toEqual([
            expect.stringContaining('/collections/products-de/documents/import'),
            expect.stringContaining('/collections/products-de/documents/record-1'),
        ]);
    });

    it('rejects sensitive static webhook headers before any request', async () => {
        const { services } = createServices();

        await expect(runSink(SINK_ADAPTER_CODES.WEBHOOK, {
            adapterCode: SINK_ADAPTER_CODES.WEBHOOK,
            url: 'https://partner.example.com/events',
            headers: { Authorization: 'Bearer plaintext-token' },
        }, services)).rejects.toThrow(/plaintext credentials|secret-backed authentication/);

        expect(secureFetch).not.toHaveBeenCalled();
    });

    it('rejects a shared API-key and HMAC signature header before resolving secrets', async () => {
        const { services, secretService } = createServices({
            secretValues: {
                'partner-api-key': 'runtime-key',
                'partner-hmac': 'runtime-hmac',
            },
        });

        await expect(runSink(SINK_ADAPTER_CODES.WEBHOOK, {
            adapterCode: SINK_ADAPTER_CODES.WEBHOOK,
            url: 'https://partner.example.com/events',
            apiKeySecretCode: 'partner-api-key',
            apiKeyHeader: 'X-Partner-Signature',
            hmacSecretCode: 'partner-hmac',
            signatureHeaderName: 'x-partner-signature',
        }, services)).rejects.toThrow(/both auth and headerSecretCodes/);

        expect(secretService.resolve).not.toHaveBeenCalled();
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each([
        { secretField: 'apiKeySecretCode', headerField: 'apiKeyHeader' },
        { secretField: 'hmacSecretCode', headerField: 'signatureHeaderName' },
    ])('rejects $headerField replacing the JSON content header', async ({ secretField, headerField }) => {
        const { services, secretService } = createServices({
            secretValues: { 'partner-secret': 'runtime-secret' },
        });

        await expect(runSink(SINK_ADAPTER_CODES.WEBHOOK, {
            adapterCode: SINK_ADAPTER_CODES.WEBHOOK,
            url: 'https://partner.example.com/events',
            [secretField]: 'partner-secret',
            [headerField]: 'Content-Type',
        }, services)).rejects.toThrow('cannot replace Content-Type');

        expect(secretService.resolve).not.toHaveBeenCalled();
        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each([
        ['bearerTokenSecretCode', 'missing-bearer'],
        ['apiKeySecretCode', 'missing-api-key'],
        ['hmacSecretCode', 'missing-hmac'],
    ])('fails closed when webhook %s cannot be resolved', async (field, code) => {
        const { services } = createServices();

        await expect(runSink(SINK_ADAPTER_CODES.WEBHOOK, {
            adapterCode: SINK_ADAPTER_CODES.WEBHOOK,
            url: 'https://partner.example.com/events',
            [field]: code,
        }, services)).rejects.toThrow('empty or unavailable');

        expect(secureFetch).not.toHaveBeenCalled();
    });

    it.each([
        'passwordSecretCode',
        'accessKeyIdSecretCode',
        'secretAccessKeySecretCode',
    ])('does not publish when queue connection %s cannot be resolved', async field => {
        const publish = vi.spyOn(queueAdapterRegistry.get('rabbitmq-amqp')!, 'publish');
        const { services } = createServices({
            connectionConfig: {
                host: 'queue.example.com',
                port: 5672,
                [field]: 'missing-queue-secret',
            },
        });

        await expect(runSink(SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
            adapterCode: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'queue-connection',
            queueName: 'catalog-events',
        }, services)).rejects.toThrow('empty or unavailable');

        expect(publish).not.toHaveBeenCalled();
    });

    it('resolves queue credentials while preserving non-sensitive message headers', async () => {
        const adapter = queueAdapterRegistry.get('rabbitmq-amqp')!;
        const publish = vi.spyOn(adapter, 'publish').mockImplementation(async (_config, _queue, messages) =>
            messages.map(message => ({ success: true, messageId: message.id })),
        );
        const { services } = createServices({
            secretValues: { 'queue-password': 'runtime-password' },
            connectionConfig: {
                host: 'queue.example.com',
                port: 5672,
                passwordSecretCode: 'queue-password',
            },
        });

        const result = await runSink(SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
            adapterCode: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
            queueType: 'RABBITMQ_AMQP',
            connectionCode: 'queue-connection',
            queueName: 'catalog-events',
            headers: { tenant: 'catalog', 'trace-id': 'trace-1' },
        }, services);

        expect(result).toEqual({ ok: 1, fail: 0 });
        const [connectionConfig, queueName, messages] = publish.mock.calls[0];
        expect(connectionConfig).toMatchObject({
            host: 'queue.example.com',
            password: 'runtime-password',
        });
        expect(connectionConfig).not.toHaveProperty('passwordSecretCode');
        expect(queueName).toBe('catalog-events');
        expect(messages[0]?.headers).toEqual({
            tenant: 'catalog',
            'trace-id': 'trace-1',
            'x-datahub-operation': 'UPSERT',
        });
    });

    it('requires an explicit queue type instead of defaulting to RabbitMQ HTTP', async () => {
        const { services, connectionService } = createServices();

        await expect(runSink(SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
            adapterCode: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
            connectionCode: 'queue-connection',
            queueName: 'catalog-events',
        }, services)).resolves.toEqual({ ok: 0, fail: 1 });

        expect(connectionService.getRuntimeByCode).not.toHaveBeenCalled();
        expect(services.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('queueType'),
            undefined,
            expect.objectContaining({ stepKey: 'queueProducer-sink' }),
        );
    });

    it.each(['INTERNAL', 'rabbitmq-amqp', 'UNKNOWN'])(
        'rejects unsupported or non-canonical producer queue type %s',
        async queueType => {
            const { services, connectionService } = createServices();

            await expect(runSink(SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
                adapterCode: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
                queueType,
                connectionCode: 'queue-connection',
                queueName: 'catalog-events',
            }, services)).resolves.toEqual({ ok: 0, fail: 1 });

            expect(connectionService.getRuntimeByCode).not.toHaveBeenCalled();
            expect(services.logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`Unsupported queue type: ${queueType}`),
                undefined,
                expect.objectContaining({ stepKey: 'queueProducer-sink' }),
            );
        },
    );
});
