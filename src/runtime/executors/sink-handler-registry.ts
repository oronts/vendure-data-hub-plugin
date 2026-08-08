import type { AdapterDefinition } from '../../sdk/types';
import { HTTP_METHOD_EXPORT_OPTIONS, LOCALIZATION_SCHEMA_FIELDS, PROTOCOL_OPTIONS, QUEUE_TYPE_OPTIONS, SINK_OPERATION_OPTIONS } from '../../constants/adapter-schema-options';
import { FIELD_LIMITS } from '../../constants/validation';
import { BATCH, HTTP } from '../../../shared/constants';
import { handleAlgolia, handleElasticsearch, handleMeiliSearch, handleTypesense } from './search-sink-handlers';
import { handleAlgoliaDelete, handleElasticsearchDelete, handleMeiliSearchDelete, handleTypesenseDelete } from './search-sink-delete-handlers';
import { handleQueueProducer, handleQueueProducerDelete } from './queue-sink-handler';
import { handleWebhook, handleWebhookDelete } from './webhook-sink-handler';
import { SINK_ADAPTER_CODES, type SinkDeleteHandler, type SinkHandler } from './sink-handler-types';
export { SINK_ADAPTER_CODES } from './sink-handler-types';
export type { SinkAdapterCode, SinkDeleteHandler, SinkHandler, SinkHandlerContext, SinkServices } from './sink-handler-types';

const SINK_BATCH_SIZE_FIELD = {
    key: 'batchSize',
    label: 'Batch size',
    type: 'number',
    defaultValue: BATCH.BULK_SIZE,
    validation: {
        min: FIELD_LIMITS.BATCH_SIZE_MIN,
        max: FIELD_LIMITS.BATCH_SIZE_MAX,
    },
    description: `Records per request (${FIELD_LIMITS.BATCH_SIZE_MIN}-${FIELD_LIMITS.BATCH_SIZE_MAX}).`,
} as const;

const WEBHOOK_TIMEOUT_FIELD = {
    key: 'timeoutMs',
    label: 'Timeout (ms)',
    type: 'number',
    defaultValue: HTTP.TIMEOUT_MS,
    validation: { min: 1, max: HTTP.MAX_TIMEOUT_MS },
    description: `Request timeout in milliseconds (1-${HTTP.MAX_TIMEOUT_MS}).`,
} as const;

const WEBHOOK_RETRIES_FIELD = {
    key: 'retries',
    label: 'Max retries',
    type: 'number',
    defaultValue: HTTP.MAX_RETRIES,
    validation: { min: 0, max: HTTP.MAX_RETRY_ATTEMPTS },
    description: `Retries after the first attempt (0-${HTTP.MAX_RETRY_ATTEMPTS}).`,
} as const;

// ─── Registry ────────────────────────────────────────────────────────

/**
 * Registry entry carrying both the handler function and its adapter definition.
 */
interface SinkRegistryEntry {
    handler: SinkHandler;
    deleteHandler?: SinkDeleteHandler;
    definition: AdapterDefinition;
}

/**
 * Maps each sink adapter code to its corresponding handler function and adapter definition.
 * Used by SinkExecutor for dispatch and BUILTIN_ADAPTERS for UI rendering.
 */
export const SINK_HANDLER_REGISTRY = new Map<string, SinkRegistryEntry>([
    [SINK_ADAPTER_CODES.MEILISEARCH, {
        handler: handleMeiliSearch,
        deleteHandler: handleMeiliSearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.MEILISEARCH,
            description: 'Index records to MeiliSearch.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#f5468e',
            schema: {
                fields: [
                    { key: 'host', label: 'Host URL', type: 'string', required: true, description: 'MeiliSearch host URL (e.g., https://meilisearch.example.com)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'secret', required: true },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'primaryKey', label: 'Primary key field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    SINK_BATCH_SIZE_FIELD,
                    { key: 'searchableFields', label: 'Searchable fields', type: 'json', description: 'Array of field names' },
                    { key: 'filterableFields', label: 'Filterable fields', type: 'json', description: 'Array of field names' },
                    { key: 'sortableFields', label: 'Sortable fields', type: 'json', description: 'Array of field names' },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.ELASTICSEARCH, {
        handler: handleElasticsearch,
        deleteHandler: handleElasticsearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.ELASTICSEARCH,
            description: 'Index records to Elasticsearch.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#fed10a',
            schema: {
                fields: [
                    { key: 'node', label: 'Node URL', type: 'string', required: true, description: 'Node URL (e.g., https://search.example.com:9200)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'secret' },
                    { key: 'usernameSecretCode', label: 'Username secret', type: 'secret' },
                    { key: 'passwordSecretCode', label: 'Password secret', type: 'secret' },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    SINK_BATCH_SIZE_FIELD,
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.OPENSEARCH, {
        handler: handleElasticsearch,
        deleteHandler: handleElasticsearchDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.OPENSEARCH,
            description: 'Index records to OpenSearch (Elasticsearch-compatible API).',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#005eb8',
            schema: {
                fields: [
                    { key: 'node', label: 'Node URL', type: 'string', required: true, description: 'Node URL (e.g., https://search.example.com:9200)' },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'secret' },
                    { key: 'usernameSecretCode', label: 'Username secret', type: 'secret' },
                    { key: 'passwordSecretCode', label: 'Password secret', type: 'secret' },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    SINK_BATCH_SIZE_FIELD,
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.ALGOLIA, {
        handler: handleAlgolia,
        deleteHandler: handleAlgoliaDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.ALGOLIA,
            description: 'Index records to Algolia.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#003dff',
            schema: {
                fields: [
                    { key: 'appId', label: 'Application ID', type: 'string', required: true },
                    { key: 'apiKeySecretCode', label: 'Admin API key secret', type: 'secret', required: true },
                    { key: 'indexName', label: 'Index name', type: 'string', required: true },
                    { key: 'idField', label: 'Object ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    SINK_BATCH_SIZE_FIELD,
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.TYPESENSE, {
        handler: handleTypesense,
        deleteHandler: handleTypesenseDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.TYPESENSE,
            description: 'Index records to Typesense.',
            category: 'EXTERNAL',
            icon: 'search',
            color: '#d63aff',
            schema: {
                fields: [
                    { key: 'host', label: 'Host', type: 'string', required: true },
                    { key: 'port', label: 'Port', type: 'number', required: true },
                    { key: 'protocol', label: 'Protocol', type: 'select', options: PROTOCOL_OPTIONS },
                    { key: 'apiKeySecretCode', label: 'API key secret', type: 'secret', required: true },
                    { key: 'collectionName', label: 'Collection name', type: 'string', required: true },
                    { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                    { key: 'defaultOperation', label: 'Default operation', type: 'select', options: SINK_OPERATION_OPTIONS, description: 'Fallback when records have no __operation field.' },
                    SINK_BATCH_SIZE_FIELD,
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.QUEUE_PRODUCER, {
        handler: handleQueueProducer,
        deleteHandler: handleQueueProducerDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
            description: 'Publish records to message queue. Propagates operation type as x-datahub-operation message header.',
            category: 'EXTERNAL',
            icon: 'rss',
            color: '#ff6600',
            schema: {
                fields: [
                    {
                        key: 'queueType',
                        label: 'Queue Type',
                        type: 'select',
                        required: true,
                        options: QUEUE_TYPE_OPTIONS,
                    },
                    {
                        key: 'connectionCode',
                        label: 'Connection',
                        type: 'connection',
                        required: true,
                        description: 'Reference to queue connection configuration.',
                    },
                    {
                        key: 'queueName',
                        label: 'Queue Name',
                        type: 'string',
                        required: true,
                        description: 'RabbitMQ queue name to publish to.',
                    },
                    {
                        key: 'routingKey',
                        label: 'Routing Key',
                        type: 'string',
                        description: 'Routing key for RabbitMQ exchanges.',
                    },
                    {
                        key: 'headers',
                        label: 'Message Headers',
                        type: 'json',
                        description: 'Static headers to include in messages.',
                    },
                    {
                        key: 'idField',
                        label: 'Message ID Field',
                        type: 'string',
                        description: 'Field to use as message ID for deduplication.',
                    },
                    SINK_BATCH_SIZE_FIELD,
                    {
                        key: 'persistent',
                        label: 'Persistent',
                        type: 'boolean',
                        description: 'Persist messages to disk (delivery mode 2 in RabbitMQ).',
                    },
                    {
                        key: 'priority',
                        label: 'Priority',
                        type: 'number',
                        description: 'Message priority (1-10, higher = more urgent).',
                    },
                    {
                        key: 'ttlMs',
                        label: 'TTL (ms)',
                        type: 'number',
                        description: 'Message time-to-live in milliseconds.',
                    },
                    {
                        key: 'defaultOperation',
                        label: 'Default Operation',
                        type: 'select',
                        options: SINK_OPERATION_OPTIONS,
                        description: 'Fallback when records have no __operation field.',
                    },
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
    [SINK_ADAPTER_CODES.WEBHOOK, {
        handler: handleWebhook,
        deleteHandler: handleWebhookDelete,
        definition: {
            type: 'SINK',
            code: SINK_ADAPTER_CODES.WEBHOOK,
            description: 'Send records to webhook endpoints.',
            category: 'EXTERNAL',
            icon: 'webhook',
            color: '#ec4899',
            schema: {
                fields: [
                    {
                        key: 'url',
                        label: 'Webhook URL',
                        type: 'string',
                        required: true,
                        description: 'HTTP endpoint to send records to.',
                    },
                    {
                        key: 'method',
                        label: 'HTTP Method',
                        type: 'select',
                        options: HTTP_METHOD_EXPORT_OPTIONS,
                    },
                    {
                        key: 'headers',
                        label: 'Headers',
                        type: 'json',
                        description: 'HTTP headers as JSON object.',
                    },
                    {
                        key: 'bearerTokenSecretCode',
                        label: 'Bearer Token Secret',
                        type: 'secret',
                        description: 'Secret code for Bearer authentication.',
                    },
                    {
                        key: 'apiKeySecretCode',
                        label: 'API Key Secret',
                        type: 'secret',
                        description: 'Secret code for API key authentication.',
                    },
                    {
                        key: 'apiKeyHeader',
                        label: 'API Key Header',
                        type: 'string',
                        placeholder: 'X-API-Key',
                        description: 'Header name for API key.',
                    },
                    {
                        key: 'hmacSecretCode',
                        label: 'HMAC Signing Secret',
                        type: 'secret',
                        description: 'Secret code for HMAC-SHA256 request signing. Adds X-DataHub-Signature header.',
                    },
                    {
                        key: 'signatureHeaderName',
                        label: 'Signature Header',
                        type: 'string',
                        placeholder: 'X-DataHub-Signature',
                        description: 'Header name for HMAC signature (default: X-DataHub-Signature).',
                    },
                    {
                        key: 'defaultOperation',
                        label: 'Default Operation',
                        type: 'select',
                        options: SINK_OPERATION_OPTIONS,
                        description: 'Fallback when records have no __operation field.',
                    },
                    SINK_BATCH_SIZE_FIELD,
                    WEBHOOK_TIMEOUT_FIELD,
                    WEBHOOK_RETRIES_FIELD,
                    ...LOCALIZATION_SCHEMA_FIELDS,
                ],
            },
        },
    }],
]);

/** All sink adapter definitions, auto-derived from the registry */
export const SINK_ADAPTERS: AdapterDefinition[] =
    Array.from(SINK_HANDLER_REGISTRY.values()).map(e => e.definition);

/**
 * Auto-derived sink code constants from registry keys.
 * Keys are SCREAMING_SNAKE_CASE versions of the camelCase registry codes.
 * E.g., 'meilisearch' -> SINK_CODE.MEILISEARCH = 'meilisearch'
 */
export const SINK_CODE = Object.fromEntries(
    Array.from(SINK_HANDLER_REGISTRY.keys()).map(code => [
        code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
        code,
    ]),
) as Record<string, string>;
