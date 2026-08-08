import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BATCH, FIELD_LIMITS, HTTP } from '../../constants';
import {
    handleAlgoliaDelete,
    handleElasticsearchDelete,
    handleMeiliSearchDelete,
    handleTypesenseDelete,
} from './search-sink-delete-handlers';
import {
    handleAlgolia,
    handleElasticsearch,
    handleMeiliSearch,
    handleTypesense,
} from './search-sink-handlers';
import {
    handleQueueProducer,
    handleQueueProducerDelete,
} from './queue-sink-handler';
import { handleWebhook, handleWebhookDelete } from './webhook-sink-handler';
import {
    SINK_ADAPTERS,
    SINK_ADAPTER_CODES,
    SINK_CODE,
    SINK_HANDLER_REGISTRY,
    type SinkDeleteHandler,
    type SinkHandler,
} from './sink-handler-registry';

const EXPECTED_HANDLER_ORDER: ReadonlyArray<readonly [
    string,
    SinkHandler,
    SinkDeleteHandler,
]> = [
    [SINK_ADAPTER_CODES.MEILISEARCH, handleMeiliSearch, handleMeiliSearchDelete],
    [SINK_ADAPTER_CODES.ELASTICSEARCH, handleElasticsearch, handleElasticsearchDelete],
    [SINK_ADAPTER_CODES.OPENSEARCH, handleElasticsearch, handleElasticsearchDelete],
    [SINK_ADAPTER_CODES.ALGOLIA, handleAlgolia, handleAlgoliaDelete],
    [SINK_ADAPTER_CODES.TYPESENSE, handleTypesense, handleTypesenseDelete],
    [SINK_ADAPTER_CODES.QUEUE_PRODUCER, handleQueueProducer, handleQueueProducerDelete],
    [SINK_ADAPTER_CODES.WEBHOOK, handleWebhook, handleWebhookDelete],
];

describe('sink handler registry contract', () => {
    it('preserves ordered codes and exact handler wiring', () => {
        const actual = Array.from(SINK_HANDLER_REGISTRY.entries()).map(
            ([code, entry]) => [code, entry.handler, entry.deleteHandler] as const,
        );

        expect(actual).toEqual(EXPECTED_HANDLER_ORDER);
    });

    it('derives public adapter definitions in registry order', () => {
        expect(SINK_ADAPTERS).toEqual(
            Array.from(SINK_HANDLER_REGISTRY.values(), entry => entry.definition),
        );
        expect(SINK_ADAPTERS.map(definition => definition.code)).toEqual(
            EXPECTED_HANDLER_ORDER.map(([code]) => code),
        );
    });

    it('preserves public sink code constants', () => {
        expect(SINK_CODE).toEqual({
            MEILISEARCH: 'meilisearch',
            ELASTICSEARCH: 'elasticsearch',
            OPENSEARCH: 'opensearch',
            ALGOLIA: 'algolia',
            TYPESENSE: 'typesense',
            QUEUE_PRODUCER: 'queueProducer',
            WEBHOOK: 'webhook',
        });
    });

    it('preserves every adapter definition property', () => {
        const digest = createHash('sha256')
            .update(JSON.stringify(SINK_ADAPTERS))
            .digest('hex');

        expect(digest).toBe('846dba5a2ef30c710fa5e41b16fd5c4af0d378707bda87c2f14f48752b707ae0');
    });

    it('publishes the enforced batch-size contract for every sink', () => {
        for (const definition of SINK_ADAPTERS) {
            const batchSize = definition.schema.fields.find(field => field.key === 'batchSize');
            expect(batchSize).toEqual(expect.objectContaining({
                type: 'number',
                defaultValue: BATCH.BULK_SIZE,
                validation: {
                    min: FIELD_LIMITS.BATCH_SIZE_MIN,
                    max: FIELD_LIMITS.BATCH_SIZE_MAX,
                },
            }));
        }
    });

    it('publishes the webhook timeout and retry limits', () => {
        const definition = SINK_HANDLER_REGISTRY.get(SINK_ADAPTER_CODES.WEBHOOK)?.definition;
        const fields = new Map(definition?.schema.fields.map(field => [field.key, field]));

        expect(fields.get('timeoutMs')).toEqual(expect.objectContaining({
            defaultValue: HTTP.TIMEOUT_MS,
            validation: { min: 1, max: HTTP.MAX_TIMEOUT_MS },
        }));
        expect(fields.get('retries')).toEqual(expect.objectContaining({
            defaultValue: HTTP.MAX_RETRIES,
            validation: { min: 0, max: HTTP.MAX_RETRY_ATTEMPTS },
        }));
    });
});
