/**
 * HTTP Lookup Enricher - Fetch data from external APIs to enrich records
 */
import { EnricherAdapter, EnrichContext, EnrichResult, StepConfigSchema } from '../sdk/types';
import { JsonObject } from '../types';
import { applyHttpLookupBatch, HttpLookupOperatorConfig } from '../operators/enrichment';
import { HTTP_METHOD_GET_POST_OPTIONS } from '../constants/adapter-schema-options';

export interface HttpLookupEnricherConfig {
    /** HTTP endpoint URL. Use {{field}} for dynamic values from record */
    url: string;
    /** Target field path to store the response data */
    target: string;
    /** HTTP method (default: GET) */
    method?: 'GET' | 'POST';
    /** JSON path to extract from response */
    responsePath?: string;
    /** Field to use as cache key */
    keyField?: string;
    /** Default value if lookup fails */
    default?: JsonObject;
    /** Request timeout in milliseconds */
    timeoutMs?: number;
    /** Cache TTL in seconds */
    cacheTtlSec?: number;
    /** Static HTTP headers */
    headers?: Record<string, string>;
    /** Secret code for Bearer token authentication */
    bearerTokenSecretCode?: string;
    /** Secret code for API key authentication */
    apiKeySecretCode?: string;
    /** Header name for API key */
    apiKeyHeader?: string;
    /** Secret code for Basic auth */
    basicAuthSecretCode?: string;
    /** Field path for POST body */
    bodyField?: string;
    /** Static POST body */
    body?: JsonObject;
    /** Skip record if endpoint returns 404 */
    skipOn404?: boolean;
    /** Fail pipeline if HTTP request fails */
    failOnError?: boolean;
    /** Maximum retry attempts */
    maxRetries?: number;
    /** Parallel concurrency */
    batchSize?: number;
    /** Max requests per second */
    rateLimitPerSecond?: number;
}

const HTTP_LOOKUP_ENRICHER_SCHEMA: StepConfigSchema = {
    fields: [
        { key: 'url', label: 'URL', type: 'string', required: true, description: 'HTTP endpoint URL. Use {{field}} for dynamic values.' },
        { key: 'target', label: 'Target Field', type: 'string', required: true, description: 'Field path to store the response data.' },
        { key: 'method', label: 'HTTP Method', type: 'select', options: HTTP_METHOD_GET_POST_OPTIONS },
        { key: 'responsePath', label: 'Response Path', type: 'string', description: 'JSON path to extract from response.' },
        { key: 'keyField', label: 'Cache Key Field', type: 'string', description: 'Field to use as cache key.' },
        { key: 'default', label: 'Default Value', type: 'json', description: 'Value to use if lookup fails.' },
        { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number' },
        { key: 'cacheTtlSec', label: 'Cache TTL (sec)', type: 'number' },
        { key: 'headers', label: 'Headers', type: 'json', description: 'Static HTTP headers as JSON object.' },
        { key: 'bearerTokenSecretCode', label: 'Bearer Token Secret', type: 'secret' },
        { key: 'apiKeySecretCode', label: 'API Key Secret', type: 'secret' },
        { key: 'apiKeyHeader', label: 'API Key Header', type: 'string' },
        { key: 'basicAuthSecretCode', label: 'Basic Auth Secret', type: 'secret' },
        { key: 'skipOn404', label: 'Skip on 404', type: 'boolean' },
        { key: 'failOnError', label: 'Fail on Error', type: 'boolean' },
        { key: 'maxRetries', label: 'Max Retries', type: 'number' },
        { key: 'batchSize', label: 'Concurrency', type: 'number', description: 'Parallel requests (default: 50)' },
        { key: 'rateLimitPerSecond', label: 'Rate Limit/sec', type: 'number' },
    ],
};

export const httpLookupEnricher: EnricherAdapter<HttpLookupEnricherConfig> = {
    type: 'ENRICHER',
    code: 'httpLookup',
    name: 'HTTP Lookup',
    description: 'Enrich records by fetching data from external HTTP/REST APIs with caching and authentication.',
    category: 'ENRICHMENT',
    schema: HTTP_LOOKUP_ENRICHER_SCHEMA,

    async enrich(
        context: EnrichContext,
        config: HttpLookupEnricherConfig,
        records: readonly JsonObject[],
    ): Promise<EnrichResult> {
        if (!config.url || !config.target) {
            return { records: [...records] };
        }

        const secretResolver = {
            get: async (code: string) => context.secrets.get(code),
        };

        const operatorConfig: HttpLookupOperatorConfig = {
            url: config.url,
            target: config.target,
            method: config.method,
            responsePath: config.responsePath,
            keyField: config.keyField,
            default: config.default,
            timeoutMs: config.timeoutMs,
            cacheTtlSec: config.cacheTtlSec,
            headers: config.headers,
            bearerTokenSecretCode: config.bearerTokenSecretCode,
            apiKeySecretCode: config.apiKeySecretCode,
            apiKeyHeader: config.apiKeyHeader,
            basicAuthSecretCode: config.basicAuthSecretCode,
            bodyField: config.bodyField,
            body: config.body,
            skipOn404: config.skipOn404,
            failOnError: config.failOnError,
            maxRetries: config.maxRetries,
            batchSize: config.batchSize,
            rateLimitPerSecond: config.rateLimitPerSecond,
        };

        const result = await applyHttpLookupBatch(records, operatorConfig, secretResolver);

        return {
            records: result.records,
            errors: result.errors.map(e => ({
                record: e.record,
                message: e.message,
            })),
        };
    },
};
