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
import { HTTP_METHOD_GET_POST_OPTIONS } from '../../constants/adapter-schema-options';
import { createRecordOperator } from '../operator-factory';
import {
    createHttpLookupRuntimeNamespaces,
    HTTP_LOOKUP_LIMITS,
} from './http-lookup-security';

export const LOOKUP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'lookup',
    description: 'Lookup value from a map and set to target field.',
    category: 'ENRICHMENT',
    categoryLabel: 'Enrichment',
    categoryOrder: 7,
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
    category: 'ENRICHMENT',
    categoryLabel: 'Enrichment',
    categoryOrder: 7,
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
    category: 'ENRICHMENT',
    categoryLabel: 'Enrichment',
    categoryOrder: 7,
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
    category: 'ENRICHMENT',
    categoryLabel: 'Enrichment',
    categoryOrder: 7,
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            { key: 'value', label: 'Default value (JSON)', type: 'json', required: true },
        ],
    },
};

export function applyLookupOperator(record: JsonObject, config: LookupOperatorConfig): JsonObject {
    if (!config.source || !config.map || !config.target) {
        return record;
    }
    return applyLookup(record, config.source, config.map, config.target, config.default);
}

export const lookupOperator = createRecordOperator(applyLookupOperator);

export function applyEnrichOperator(record: JsonObject, config: EnrichOperatorConfig): JsonObject {
    return applyEnrich(record, config.set, config.defaults);
}

export const enrichOperator = createRecordOperator(applyEnrichOperator);

export function applyCoalesceOperator(record: JsonObject, config: CoalesceOperatorConfig): JsonObject {
    if (!config.paths || !config.target) {
        return record;
    }
    return applyCoalesce(record, config.paths, config.target, config.default);
}

export const coalesceOperator = createRecordOperator(applyCoalesceOperator);

export function applyDefaultOperator(record: JsonObject, config: DefaultOperatorConfig): JsonObject {
    if (!config.path) {
        return record;
    }
    return applyDefault(record, config.path, config.value);
}

export const defaultOperator = createRecordOperator(applyDefaultOperator);

export const HTTP_LOOKUP_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'httpLookup',
    description: 'Enrich records by fetching data from external HTTP endpoints with caching, authentication, and error handling.',
    pure: false,
    async: true,
    category: 'ENRICHMENT',
    categoryLabel: 'Enrichment',
    categoryOrder: 7,
    schema: {
        fields: [
            { key: 'connectionCode', label: 'Connection', type: 'connection', description: 'Saved HTTP connection. Required when authentication is configured and used to bind credentials and redirects to one origin.' },
            { key: 'url', label: 'URL', type: 'string', required: true, description: 'HTTP endpoint URL. Use {{field}} for dynamic values.' },
            { key: 'method', label: 'HTTP Method', type: 'select', options: HTTP_METHOD_GET_POST_OPTIONS },
            { key: 'target', label: 'Target Field', type: 'string', required: true, description: 'Field path to store the response data.' },
            { key: 'responsePath', label: 'Response Path', type: 'string', description: 'JSON path to extract from response (optional).' },
            { key: 'keyField', label: 'Cache Key Field', type: 'string', description: 'Optional record value included in the opaque full-request cache identity.' },
            { key: 'default', label: 'Default Value', type: 'json', description: 'Value to use if lookup fails or returns 404.' },
            { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', description: `Integer from 1 to ${HTTP_LOOKUP_LIMITS.MAX_TIMEOUT_MS}.` },
            { key: 'cacheTtlSec', label: 'Cache TTL (sec)', type: 'number', description: `Integer from 0 to ${HTTP_LOOKUP_LIMITS.MAX_CACHE_TTL_SEC}. Set to 0 to disable.` },
            { key: 'headers', label: 'Headers', type: 'json', description: 'Non-sensitive static headers only. Credentials, cookies, signatures, Host, and hop-by-hop headers are rejected; use a Secret Code field for authentication.' },
            { key: 'bearerTokenSecretCode', label: 'Bearer Token Secret', type: 'secret', description: 'Secret Code for Bearer authentication. Missing or empty values fail before any request.' },
            { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'secret', description: 'Secret Code for API key authentication. Missing or empty values fail before any request.' },
            { key: 'apiKeyHeader', label: 'API Key Header', type: 'string', description: 'Valid request header name for the resolved API key.' },
            { key: 'basicAuthSecretCode', label: 'Basic Auth Secret', type: 'secret', description: 'Secret Code resolving to username:password. Missing or empty values fail before any request.' },
            { key: 'bodyField', label: 'Body Field', type: 'string', description: 'Field path for POST body (uses record value at this path).' },
            { key: 'body', label: 'Static Body', type: 'json', description: 'Static POST body (JSON object).' },
            { key: 'skipOn404', label: 'Skip on 404', type: 'boolean', description: 'Skip record if endpoint returns 404.' },
            { key: 'failOnError', label: 'Fail on Error', type: 'boolean', description: 'Fail pipeline if HTTP request fails.' },
            { key: 'maxRetries', label: 'Max Retries', type: 'number', description: `Integer from 0 to ${HTTP_LOOKUP_LIMITS.MAX_RETRIES}.` },
            { key: 'batchSize', label: 'Parallel Concurrency', type: 'number', description: `Integer from 1 to ${HTTP_LOOKUP_LIMITS.MAX_BATCH_SIZE} (default: 50).` },
            { key: 'rateLimitPerSecond', label: 'Rate Limit/sec', type: 'number', description: `Integer from 1 to ${HTTP_LOOKUP_LIMITS.MAX_RATE_LIMIT_PER_SECOND} requests per second per domain.` },
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

    const secretResolver = {
        get: async (code: string) => helpers.secrets?.get(code),
    };

    const { records: results, errors } = await applyHttpLookupBatch(
        records,
        config,
        {
            secrets: secretResolver,
            connections: helpers.connections,
            ...createHttpLookupRuntimeNamespaces(
                helpers.ctx.ctx.channelId,
                helpers.ctx.pipelineId,
                helpers.ctx.stepKey,
            ),
        },
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
