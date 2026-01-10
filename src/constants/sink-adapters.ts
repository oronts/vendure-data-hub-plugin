/**
 * Sink adapter definitions - Search engines and indexing targets
 */
import { AdapterDefinition } from '../sdk/types';

export const SINK_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'sink',
        code: 'meilisearch',
        description: 'Index records to MeiliSearch.',
        category: 'external',
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
        type: 'sink',
        code: 'elasticsearch',
        description: 'Index records to Elasticsearch.',
        category: 'external',
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
        type: 'sink',
        code: 'algolia',
        description: 'Index records to Algolia.',
        category: 'external',
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
        type: 'sink',
        code: 'typesense',
        description: 'Index records to Typesense.',
        category: 'external',
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
];
