/**
 * GraphQL Extractor schema definition
 *
 * Extracted so both the runtime extractor class and extractor-handler-registry.ts
 * can reference the same schema without circular dependencies.
 *
 * IMPORTANT: Do NOT import from '../../constants/index' (barrel) here.
 * This file is imported by extractor-handler-registry.ts which is re-exported
 * from that barrel, so importing it would create a circular dependency.
 */
import { StepConfigSchema } from '../../../shared/types/extractor.types';
import { GraphQLPaginationType } from '../../constants/enums';
import { HTTP } from '../../../shared/constants';
import { PAGINATION } from '../../constants/defaults/ui-defaults';
import { GRAPHQL_PAGINATION_TYPE_OPTIONS } from '../../constants/adapter-schema-options';

export const GRAPHQL_EXTRACTOR_SCHEMA: StepConfigSchema = {
    groups: [
        { id: 'connection', label: 'Connection', description: 'GraphQL endpoint configuration' },
        { id: 'query', label: 'Query', description: 'GraphQL query settings' },
        { id: 'pagination', label: 'Pagination', description: 'Pagination configuration' },
        { id: 'advanced', label: 'Advanced', description: 'Advanced options' },
    ],
    fields: [
        // Connection
        {
            key: 'connectionCode',
            label: 'Connection',
            description: 'HTTP connection to use (optional)',
            type: 'connection',
            group: 'connection',
        },
        {
            key: 'url',
            label: 'GraphQL URL',
            description: 'GraphQL endpoint URL (or path if using connection)',
            type: 'string',
            required: true,
            placeholder: 'https://api.example.com/graphql',
            group: 'connection',
        },
        {
            key: 'headers',
            label: 'Additional Headers',
            description: 'Extra HTTP headers (JSON object)',
            type: 'json',
            group: 'connection',
        },
        // Query
        {
            key: 'query',
            label: 'GraphQL Query',
            description: 'GraphQL query or mutation to execute',
            type: 'string',
            required: true,
            placeholder: 'query { products { items { id name } } }',
            group: 'query',
        },
        {
            key: 'variables',
            label: 'Variables',
            description: 'Query variables (JSON object)',
            type: 'json',
            placeholder: '{"status": "active"}',
            group: 'query',
        },
        {
            key: 'operationName',
            label: 'Operation Name',
            description: 'Operation name (for queries with multiple operations)',
            type: 'string',
            group: 'query',
        },
        {
            key: 'dataPath',
            label: 'Data Path',
            description: 'Path to records array in response (e.g., "data.products.items")',
            type: 'string',
            placeholder: 'data.products.items',
            group: 'query',
        },
        // Pagination
        {
            key: 'pagination.type',
            label: 'Pagination Type',
            type: 'select',
            options: GRAPHQL_PAGINATION_TYPE_OPTIONS,
            defaultValue: GraphQLPaginationType.NONE,
            group: 'pagination',
        },
        {
            key: 'pagination.limit',
            label: 'Page Size',
            description: 'Number of records per page',
            type: 'number',
            defaultValue: PAGINATION.PAGE_SIZE,
            group: 'pagination',
        },
        {
            key: 'pagination.offsetVariable',
            label: 'Offset Variable',
            description: 'Variable name for offset (e.g., "skip")',
            type: 'string',
            defaultValue: 'skip',
            group: 'pagination',
            dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.OFFSET },
        },
        {
            key: 'pagination.limitVariable',
            label: 'Limit Variable',
            description: 'Variable name for limit (e.g., "take", "first")',
            type: 'string',
            defaultValue: 'take',
            group: 'pagination',
        },
        {
            key: 'pagination.cursorVariable',
            label: 'Cursor Variable',
            description: 'Variable name for cursor (e.g., "after")',
            type: 'string',
            defaultValue: 'after',
            group: 'pagination',
            dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.CURSOR },
        },
        {
            key: 'pagination.totalCountPath',
            label: 'Total Count Path',
            description: 'Path to total count in response (for offset pagination)',
            type: 'string',
            placeholder: 'data.products.totalItems',
            group: 'pagination',
            dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.OFFSET },
        },
        {
            key: 'pagination.pageInfoPath',
            label: 'Page Info Path',
            description: 'Path to pageInfo for Relay connections',
            type: 'string',
            placeholder: 'data.products.pageInfo',
            group: 'pagination',
            dependsOn: { field: 'pagination.type', value: GraphQLPaginationType.RELAY },
        },
        {
            key: 'pagination.maxPages',
            label: 'Max Pages',
            description: 'Maximum pages to fetch (safety limit)',
            type: 'number',
            defaultValue: PAGINATION.MAX_GRAPHQL_PAGES,
            group: 'pagination',
        },
        // Advanced
        {
            key: 'timeoutMs',
            label: 'Timeout (ms)',
            type: 'number',
            defaultValue: HTTP.TIMEOUT_MS,
            group: 'advanced',
        },
        {
            key: 'includeExtensions',
            label: 'Include Extensions',
            description: 'Include GraphQL extensions in record metadata',
            type: 'boolean',
            defaultValue: false,
            group: 'advanced',
        },
        {
            key: 'retry.maxAttempts',
            label: 'Max Retry Attempts',
            type: 'number',
            defaultValue: HTTP.MAX_RETRIES,
            group: 'advanced',
        },
    ],
};
