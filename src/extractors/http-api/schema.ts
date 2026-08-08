/**
 * HTTP API Extractor schema definition
 *
 * Extracted so both the runtime extractor class and extractor-handler-registry.ts
 * can reference the same schema without circular dependencies.
 *
 * IMPORTANT: Do NOT import from '../../constants/index' (barrel) here.
 * This file is imported by extractor-handler-registry.ts which is re-exported
 * from that barrel, so importing it would create a circular dependency.
 */
import { StepConfigSchema } from '../../../shared/types/extractor.types';
import { HttpMethod, PaginationType } from '../../constants/enums';
import { HTTP } from '../../../shared/constants';
import { PAGINATION } from '../../constants/defaults/ui-defaults';
import { HTTP_METHOD_EXTRACT_OPTIONS, PAGINATION_TYPE_OPTIONS } from '../../constants/adapter-schema-options';

export const HTTP_API_EXTRACTOR_SCHEMA: StepConfigSchema = {
    fields: [
        {
            key: 'connectionCode',
            label: 'Connection',
            description: 'HTTP connection to use (optional)',
            type: 'connection',
            required: false,
        },
        {
            key: 'url',
            label: 'URL',
            description: 'API endpoint URL (or path if using connection)',
            type: 'string',
            required: true,
            placeholder: 'https://api.example.com/products',
        },
        {
            key: 'method',
            label: 'HTTP Method',
            type: 'select',
            options: HTTP_METHOD_EXTRACT_OPTIONS,
            defaultValue: HttpMethod.GET,
        },
        {
            key: 'headers',
            label: 'Headers',
            description: 'HTTP headers (JSON object)',
            type: 'json',
        },
        {
            key: 'body',
            label: 'Request Body',
            description: 'Request body for POST/PUT/PATCH',
            type: 'json',
            dependsOn: { field: 'method', value: HttpMethod.GET, operator: 'ne' },
        },
        {
            key: 'dataPath',
            label: 'Data Path',
            description: 'JSON path to records array (e.g., "data.items")',
            type: 'string',
            placeholder: 'data.items',
        },
        {
            key: 'pagination.type',
            label: 'Pagination Type',
            type: 'select',
            options: PAGINATION_TYPE_OPTIONS,
            defaultValue: PaginationType.NONE,
        },
        {
            key: 'pagination.limit',
            label: 'Page Size',
            description: 'Number of records per page',
            type: 'number',
            defaultValue: PAGINATION.PAGE_SIZE,
            validation: { min: 1, max: PAGINATION.MAX_REMOTE_PAGE_SIZE },
        },
        {
            key: 'pagination.offsetParam',
            label: 'Offset Parameter',
            type: 'string',
            defaultValue: 'offset',
            dependsOn: { field: 'pagination.type', value: PaginationType.OFFSET },
        },
        {
            key: 'pagination.limitParam',
            label: 'Limit Parameter',
            type: 'string',
            defaultValue: 'limit',
        },
        {
            key: 'pagination.cursorParam',
            label: 'Cursor Parameter',
            type: 'string',
            defaultValue: 'cursor',
            dependsOn: { field: 'pagination.type', value: PaginationType.CURSOR },
        },
        {
            key: 'pagination.cursorPath',
            label: 'Response Cursor Path',
            type: 'string',
            dependsOn: { field: 'pagination.type', value: PaginationType.CURSOR },
        },
        {
            key: 'pagination.hasMorePath',
            label: 'Has More Path',
            type: 'string',
            dependsOn: { field: 'pagination.type', value: PaginationType.CURSOR },
        },
        {
            key: 'pagination.pageParam',
            label: 'Page Parameter',
            type: 'string',
            defaultValue: 'page',
            dependsOn: { field: 'pagination.type', value: PaginationType.PAGE },
        },
        {
            key: 'pagination.pageSizeParam',
            label: 'Page Size Parameter',
            type: 'string',
            defaultValue: 'limit',
            dependsOn: { field: 'pagination.type', value: PaginationType.PAGE },
        },
        {
            key: 'pagination.maxPages',
            label: 'Max Pages',
            description: 'Maximum pages to fetch (safety limit)',
            type: 'number',
            defaultValue: PAGINATION.MAX_PAGES,
            validation: { min: 1, max: PAGINATION.MAX_PAGES },
        },
        {
            key: 'retry.maxAttempts',
            label: 'Max Retry Attempts',
            type: 'number',
            defaultValue: HTTP.MAX_RETRIES,
            validation: { min: 1, max: HTTP.MAX_RETRY_ATTEMPTS },
        },
        {
            key: 'rateLimit.requestsPerSecond',
            label: 'Requests Per Second',
            type: 'number',
            validation: { min: 1, max: HTTP.MAX_REQUESTS_PER_SECOND },
        },
        {
            key: 'timeoutMs',
            label: 'Timeout (ms)',
            type: 'number',
            defaultValue: HTTP.TIMEOUT_MS,
            validation: { min: 1, max: HTTP.MAX_TIMEOUT_MS },
        },
    ],
};
