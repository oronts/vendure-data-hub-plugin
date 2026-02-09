/**
 * Sink adapter definitions - Search engines, indexing targets, and message queues
 */
import { AdapterDefinition } from '../sdk/types';
import { HttpMethod, QueueType } from './enums';

/**
 * Sink adapter codes - canonical identifiers for built-in sink adapters
 */
export const SINK_ADAPTER_CODES = {
    MEILISEARCH: 'meilisearch',
    ELASTICSEARCH: 'elasticsearch',
    OPENSEARCH: 'opensearch',
    ALGOLIA: 'algolia',
    TYPESENSE: 'typesense',
    QUEUE_PRODUCER: 'queueProducer',
    WEBHOOK: 'webhook',
} as const;

export type SinkAdapterCode = typeof SINK_ADAPTER_CODES[keyof typeof SINK_ADAPTER_CODES];

export const SINK_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.MEILISEARCH,
        description: 'Index records to MeiliSearch.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'host', label: 'Host URL', type: 'string', required: true, description: 'e.g., http://localhost:7700' },
                { key: 'apiKeySecretCode', label: 'API key secret', type: 'string', required: true },
                { key: 'indexName', label: 'Index name', type: 'string', required: true },
                { key: 'primaryKey', label: 'Primary key field', type: 'string', required: true },
                { key: 'batchSize', label: 'Batch size', type: 'number' },
                { key: 'searchableFields', label: 'Searchable fields', type: 'json', description: 'Array of field names' },
                { key: 'filterableFields', label: 'Filterable fields', type: 'json', description: 'Array of field names' },
                { key: 'sortableFields', label: 'Sortable fields', type: 'json', description: 'Array of field names' },
            ],
        },
    },
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.ELASTICSEARCH,
        description: 'Index records to Elasticsearch.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'node', label: 'Node URL', type: 'string', required: true, description: 'e.g., http://localhost:9200' },
                { key: 'apiKeySecretCode', label: 'API key secret', type: 'string' },
                { key: 'usernameSecretCode', label: 'Username secret', type: 'string' },
                { key: 'passwordSecretCode', label: 'Password secret', type: 'string' },
                { key: 'indexName', label: 'Index name', type: 'string', required: true },
                { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                { key: 'batchSize', label: 'Batch size', type: 'number' },
                { key: 'refresh', label: 'Refresh after indexing', type: 'boolean' },
            ],
        },
    },
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.ALGOLIA,
        description: 'Index records to Algolia.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'appId', label: 'Application ID', type: 'string', required: true },
                { key: 'apiKeySecretCode', label: 'Admin API key secret', type: 'string', required: true },
                { key: 'indexName', label: 'Index name', type: 'string', required: true },
                { key: 'idField', label: 'Object ID field', type: 'string', required: true },
                { key: 'batchSize', label: 'Batch size', type: 'number' },
            ],
        },
    },
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.TYPESENSE,
        description: 'Index records to Typesense.',
        category: 'EXTERNAL',
        schema: {
            fields: [
                { key: 'host', label: 'Host', type: 'string', required: true },
                { key: 'port', label: 'Port', type: 'number', required: true },
                { key: 'protocol', label: 'Protocol', type: 'select', options: [
                    { value: 'http', label: 'HTTP' },
                    { value: 'https', label: 'HTTPS' },
                ] },
                { key: 'apiKeySecretCode', label: 'API key secret', type: 'string', required: true },
                { key: 'collectionName', label: 'Collection name', type: 'string', required: true },
                { key: 'idField', label: 'Document ID field', type: 'string', required: true },
                { key: 'batchSize', label: 'Batch size', type: 'number' },
            ],
        },
    },
    // Queue Producer Sink - RabbitMQ via HTTP Management API
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.QUEUE_PRODUCER,
        description: 'Publish records to RabbitMQ message queue via HTTP Management API (port 15672).',
        category: 'EXTERNAL',
        schema: {
            fields: [
                {
                    key: 'queueType',
                    label: 'Queue Type',
                    type: 'select',
                    required: true,
                    options: [
                        { value: QueueType.RABBITMQ_AMQP, label: 'RabbitMQ (AMQP) - Recommended' },
                        { value: QueueType.RABBITMQ, label: 'RabbitMQ (HTTP API)' },
                        { value: QueueType.SQS, label: 'Amazon SQS' },
                        { value: QueueType.REDIS, label: 'Redis Streams' },
                    ],
                },
                {
                    key: 'connectionCode',
                    label: 'Connection',
                    type: 'string',
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
                    key: 'messageType',
                    label: 'Message Type',
                    type: 'string',
                    description: 'Message type header for consumers.',
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
                {
                    key: 'batchSize',
                    label: 'Batch Size',
                    type: 'number',
                    description: 'Number of messages to send per batch.',
                },
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
                    key: 'delayMs',
                    label: 'Delay (ms)',
                    type: 'number',
                    description: 'Delay before message is available for consumption.',
                },
                {
                    key: 'ttlMs',
                    label: 'TTL (ms)',
                    type: 'number',
                    description: 'Message time-to-live in milliseconds.',
                },
            ],
        },
    },
    // Webhook Sink
    {
        type: 'SINK',
        code: SINK_ADAPTER_CODES.WEBHOOK,
        description: 'Send records to webhook endpoints.',
        category: 'EXTERNAL',
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
                    options: [
                        { value: HttpMethod.POST, label: 'POST' },
                        { value: HttpMethod.PUT, label: 'PUT' },
                        { value: HttpMethod.PATCH, label: 'PATCH' },
                    ],
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
                    type: 'string',
                    description: 'Secret code for Bearer authentication.',
                },
                {
                    key: 'apiKeySecretCode',
                    label: 'API Key Secret',
                    type: 'string',
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
                    key: 'batchSize',
                    label: 'Batch Size',
                    type: 'number',
                    description: 'Records per request.',
                },
                {
                    key: 'timeoutMs',
                    label: 'Timeout (ms)',
                    type: 'number',
                    placeholder: '30000',
                    description: 'Request timeout in milliseconds.',
                },
                {
                    key: 'retries',
                    label: 'Max Retries',
                    type: 'number',
                    placeholder: '3',
                    description: 'Maximum retry attempts on failure.',
                },
            ],
        },
    },
];
