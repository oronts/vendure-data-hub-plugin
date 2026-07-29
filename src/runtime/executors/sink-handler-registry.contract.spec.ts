import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
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

        expect(digest).toBe('cb12aa72bac0aab057c5dbeff2ea97071400af391bc89c8b9f8a59dae829c4b7');
    });
});
