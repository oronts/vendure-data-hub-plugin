/**
 * Extractor adapter definitions - REST, CSV, GraphQL sources
 */
import { AdapterDefinition } from '../sdk/types';
import { HttpMethod, SortOrder, VendureEntityType } from './enums';

export const EXTRACTOR_ADAPTERS: AdapterDefinition[] = [
    {
        type: 'extractor',
        code: 'inMemory',
        description: 'Extract records from in-memory data. Use for webhook payloads, inline data, or test fixtures.',
        schema: {
            fields: [
                { key: 'data', label: 'Data (JSON)', type: 'json', description: 'Array of objects or single object. For webhooks, data is injected from trigger payload.' },
            ],
        },
    },
    {
        type: 'extractor',
        code: 'generator',
        description: 'Generate test records with configurable fields and count. Useful for testing pipelines.',
        schema: {
            fields: [
                { key: 'count', label: 'Record count', type: 'number', required: true, description: 'Number of records to generate' },
                { key: 'template', label: 'Template (JSON)', type: 'json', description: 'Template object with field generators' },
            ],
        },
    },
    {
        type: 'extractor',
        code: 'httpApi',
        description: 'Extract records from HTTP/REST APIs with authentication, pagination (offset, cursor, page, link-header), and rate limiting.',
        schema: {
            fields: [
                { key: 'url', label: 'URL', type: 'string', required: true, description: 'Full URL or path (if using connection)' },
                { key: 'connectionCode', label: 'Connection', type: 'connection', description: 'Connection for base URL and authentication' },
                { key: 'method', label: 'Method', type: 'select', options: [
                    { value: HttpMethod.GET, label: 'GET' },
                    { value: HttpMethod.POST, label: 'POST' },
                    { value: HttpMethod.PUT, label: 'PUT' },
                    { value: HttpMethod.PATCH, label: 'PATCH' },
                    { value: HttpMethod.DELETE, label: 'DELETE' },
                ] },
                { key: 'headers', label: 'Headers (JSON)', type: 'json', description: 'Additional request headers' },
                { key: 'body', label: 'Body (JSON)', type: 'json', description: 'Request body for POST/PUT/PATCH' },
                { key: 'dataPath', label: 'Data Path', type: 'string', description: 'JSON path to records array (e.g., "data.items")' },
                { key: 'pagination.type', label: 'Pagination Type', type: 'select', options: [
                    { value: 'none', label: 'None' },
                    { value: 'offset', label: 'Offset' },
                    { value: 'cursor', label: 'Cursor' },
                    { value: 'page', label: 'Page Number' },
                    { value: 'link-header', label: 'Link Header' },
                ] },
                { key: 'pagination.limit', label: 'Page Size', type: 'number', description: 'Records per request' },
                { key: 'pagination.maxPages', label: 'Max Pages', type: 'number', description: 'Safety limit for pagination' },
                { key: 'graphqlQuery', label: 'GraphQL Query', type: 'string', description: 'For GraphQL endpoints' },
                { key: 'graphqlVariables', label: 'GraphQL Variables', type: 'json', description: 'Variables for GraphQL query' },
            ],
        },
    },
    // Vendure Query extractor (runtime adapter exists; add definition for UI/validation)
    {
        type: 'extractor',
        code: 'vendureQuery',
        description: 'Extract data from Vendure entities (Products, Customers, Orders, etc.)',
        schema: {
            fields: [
                { key: 'entity', label: 'Entity Type', type: 'select', required: true, options: [
                    { value: VendureEntityType.PRODUCT, label: 'Products' },
                    { value: VendureEntityType.PRODUCT_VARIANT, label: 'Product Variants' },
                    { value: VendureEntityType.CUSTOMER, label: 'Customers' },
                    { value: VendureEntityType.ORDER, label: 'Orders' },
                    { value: VendureEntityType.COLLECTION, label: 'Collections' },
                    { value: VendureEntityType.FACET, label: 'Facets' },
                    { value: VendureEntityType.FACET_VALUE, label: 'Facet Values' },
                    { value: VendureEntityType.PROMOTION, label: 'Promotions' },
                    { value: VendureEntityType.ASSET, label: 'Assets' },
                ] },
                { key: 'relations', label: 'Relations', type: 'string', description: 'Comma-separated. Include "translations" for translatable entities' },
                { key: 'languageCode', label: 'Language Code', type: 'string', description: 'e.g. "en", "de". Flattens translations to root level (name, description, etc.)' },
                { key: 'flattenTranslations', label: 'Flatten Translations', type: 'boolean', description: 'Merge translation fields to root (default: true when languageCode is set)' },
                { key: 'batchSize', label: 'Batch Size', type: 'number' },
                { key: 'sortBy', label: 'Sort By', type: 'string' },
                { key: 'sortOrder', label: 'Sort Order', type: 'select', options: [
                    { value: SortOrder.ASC, label: 'ASC' },
                    { value: SortOrder.DESC, label: 'DESC' },
                ] },
            ],
        },
    },
    {
        type: 'extractor',
        code: 'csv',
        description: 'Extract records from CSV. Use file upload for imports, or csvText/rows for inline data.',
        schema: {
            fields: [
                { key: 'fileId', label: 'Upload CSV File', type: 'file', description: 'Upload a CSV file to extract data from. Preferred method for file imports.' },
                { key: 'delimiter', label: 'Delimiter', type: 'string', description: 'Character to separate fields (default: ,)' },
                { key: 'hasHeader', label: 'Header row', type: 'boolean', description: 'Whether first row is header (default: true)' },
                { key: 'csvText', label: 'CSV text (alternative)', type: 'json', description: 'Raw CSV string instead of file upload' },
                { key: 'rows', label: 'Rows (JSON array)', type: 'json', description: 'Alternative to file: array of arrays or objects' },
                { key: 'csvPath', label: 'CSV file path', type: 'string', description: 'Read from filesystem path (dev/testing only)' },
            ],
        },
    },
    {
        type: 'extractor',
        code: 'json',
        description: 'Extract records from JSON. Use file upload for imports, or jsonText for inline data.',
        schema: {
            fields: [
                { key: 'fileId', label: 'Upload JSON File', type: 'file', description: 'Upload a JSON file to extract data from. Preferred method for file imports.' },
                { key: 'itemsPath', label: 'Items path', type: 'string', description: 'Dot-path to array of records (e.g., "data.items")' },
                { key: 'jsonText', label: 'JSON text (alternative)', type: 'json', description: 'Raw JSON string instead of file upload' },
                { key: 'jsonPath', label: 'JSON file path', type: 'string', description: 'Read from filesystem path (dev/testing only)' },
            ],
        },
    },
    {
        type: 'extractor',
        code: 'graphql',
        description: 'Extract records by querying a GraphQL endpoint with optional cursor pagination.',
        schema: {
            fields: [
                { key: 'endpoint', label: 'Endpoint', type: 'string', required: true },
                { key: 'headers', label: 'Headers (JSON)', type: 'json' },
                { key: 'query', label: 'GraphQL query', type: 'string', required: true },
                { key: 'variables', label: 'Variables (JSON)', type: 'json' },
                { key: 'itemsField', label: 'Items field (dot path)', type: 'string', description: 'e.g. data.products.items or data.nodeList' },
                { key: 'edgesField', label: 'Edges field (dot path)', type: 'string', description: 'Optional. If set, items are edges[].node' },
                { key: 'nodeField', label: 'Node field name', type: 'string', description: 'Default: node' },
                { key: 'cursorVar', label: 'Cursor variable name', type: 'string', description: 'Variable name for cursor (default: cursor)' },
                { key: 'nextCursorField', label: 'Next cursor field (dot path)', type: 'string', description: 'If present, keeps fetching' },
                { key: 'pageInfoField', label: 'pageInfo field (dot path)', type: 'string', description: 'e.g. data.products.pageInfo' },
                { key: 'hasNextPageField', label: 'hasNextPage field (dot path)', type: 'string', description: 'e.g. data.products.pageInfo.hasNextPage' },
                { key: 'endCursorField', label: 'endCursor field (dot path)', type: 'string', description: 'e.g. data.products.pageInfo.endCursor' },
                { key: 'bearerTokenSecretCode', label: 'Bearer token secret code', type: 'string' },
                { key: 'basicSecretCode', label: 'Basic auth secret code', type: 'string' },
                { key: 'hmacSecretCode', label: 'HMAC secret code', type: 'string' },
            ],
        },
    },
];
