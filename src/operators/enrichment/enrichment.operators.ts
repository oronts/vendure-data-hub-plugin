import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import {
    LookupOperatorConfig,
    EnrichOperatorConfig,
    CoalesceOperatorConfig,
    DefaultOperatorConfig,
    HttpLookupOperatorConfig,
} from './types';
import {
    applyLookup,
    applyEnrich,
    applyCoalesce,
    applyDefault,
    applyHttpLookupBatch,
} from './helpers';
import { HTTP_METHOD_OPTIONS } from '../constants';

export const LOOKUP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'lookup',
    description: 'Lookup value from a map and set to target field.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'map', label: 'Map (JSON object)', type: 'json', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'default', label: 'Default value', type: 'string' },
        ],
    },
};

export const ENRICH_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'enrich',
    description: 'Enrich or default fields on records. "set" overwrites, "defaults" only applies to missing fields.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'set',
                label: 'Set fields (JSON)',
                type: 'json',
                description: 'JSON object of fields to set (dot paths allowed)',
            },
            {
                key: 'defaults',
                label: 'Default fields (JSON)',
                type: 'json',
                description: 'JSON object of fields to set if currently missing (dot paths allowed)',
            },
        ],
    },
};

export const COALESCE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'coalesce',
    description: 'Return the first non-null value from a list of field paths.',
    pure: true,
    schema: {
        fields: [
            {
                key: 'paths',
                label: 'Field paths (JSON array)',
                type: 'json',
                required: true,
                description: 'Array of paths to check in order',
            },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'default', label: 'Default value', type: 'json', description: 'Value if all paths are null' },
        ],
    },
};

export const DEFAULT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'default',
    description: 'Set a default value if field is null or undefined.',
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            { key: 'value', label: 'Default value (JSON)', type: 'json', required: true },
        ],
    },
};

export function lookupOperator(
    records: readonly JsonObject[],
    config: LookupOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.source || !config.map || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyLookup(record, config.source, config.map, config.target, config.default),
    );
    return { records: results };
}

export function enrichOperator(
    records: readonly JsonObject[],
    config: EnrichOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyEnrich(record, config.set, config.defaults),
    );
    return { records: results };
}

export function coalesceOperator(
    records: readonly JsonObject[],
    config: CoalesceOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.paths || !config.target) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyCoalesce(record, config.paths, config.target, config.default),
    );
    return { records: results };
}

export function defaultOperator(
    records: readonly JsonObject[],
    config: DefaultOperatorConfig,
    _helpers: AdapterOperatorHelpers,
): OperatorResult {
    if (!config.path) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyDefault(record, config.path, config.value),
    );
    return { records: results };
}

export const HTTP_LOOKUP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'httpLookup',
    description: 'Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.',
    pure: false,
    async: true,
    category: 'ENRICHMENT',
    schema: {
        fields: [
            { key: 'url', label: 'URL', type: 'string', required: true, description: 'HTTP endpoint URL. Use {{field}} for dynamic values.' },
            { key: 'method', label: 'HTTP Method', type: 'select', options: [...HTTP_METHOD_OPTIONS] },
            { key: 'target', label: 'Target Field', type: 'string', required: true, description: 'Field path to store the response data.' },
            { key: 'responsePath', label: 'Response Path', type: 'string', description: 'JSON path to extract from response (optional).' },
            { key: 'keyField', label: 'Cache Key Field', type: 'string', description: 'Field to use as cache key. If not set, URL is used.' },
            { key: 'default', label: 'Default Value', type: 'json', description: 'Value to use if lookup fails or returns 404.' },
            { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', description: 'Request timeout in milliseconds.' },
            { key: 'cacheTtlSec', label: 'Cache TTL (sec)', type: 'number', description: 'Cache time-to-live in seconds. Set to 0 to disable.' },
            { key: 'headers', label: 'Headers', type: 'json', description: 'Static HTTP headers as JSON object.' },
            { key: 'bearerTokenSecretCode', label: 'Bearer Token Secret', type: 'string', description: 'Secret code for Bearer token authentication.' },
            { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'string', description: 'Secret code for API key authentication.' },
            { key: 'apiKeyHeader', label: 'API Key Header', type: 'string', description: 'Header name for API key.' },
            { key: 'basicAuthSecretCode', label: 'Basic Auth Secret', type: 'string', description: 'Secret code for Basic auth (username:password).' },
            { key: 'bodyField', label: 'Body Field', type: 'string', description: 'Field path for POST body (uses record value at this path).' },
            { key: 'body', label: 'Static Body', type: 'json', description: 'Static POST body (JSON object).' },
            { key: 'skipOn404', label: 'Skip on 404', type: 'boolean', description: 'Skip record if endpoint returns 404.' },
            { key: 'failOnError', label: 'Fail on Error', type: 'boolean', description: 'Fail pipeline if HTTP request fails.' },
            { key: 'maxRetries', label: 'Max Retries', type: 'number', description: 'Maximum retry attempts on transient errors.' },
            { key: 'batchSize', label: 'Parallel Concurrency', type: 'number', description: 'Process this many records in parallel (default: 50).' },
            { key: 'rateLimitPerSecond', label: 'Rate Limit/sec', type: 'number', description: 'Max requests per second per domain (default: 100).' },
        ],
    },
};

export async function httpLookupOperator(
    records: readonly JsonObject[],
    config: HttpLookupOperatorConfig,
    helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
    if (!config.url || !config.target) {
        return { records: [...records] };
    }

    // Use the secret resolver from helpers for authentication
    const secretResolver = helpers.secrets
        ? { get: async (code: string) => helpers.secrets?.get(code) }
        : undefined;

    const { records: results, errors } = await applyHttpLookupBatch(
        records,
        config,
        secretResolver,
    );

    return {
        records: results,
        errors: errors.map(e => ({
            record: e.record,
            message: e.message,
            field: config.target,
        })),
    };
}
