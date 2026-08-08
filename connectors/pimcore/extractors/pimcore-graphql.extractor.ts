import { ExtractorAdapter, ExtractContext, RecordEnvelope } from '../../../src/sdk/types';
import { JsonObject } from '../../../src/types';
import { sleep } from '../../../src/utils/retry.utils';
import { getErrorMessage } from '../../../src/utils/error.utils';
import {
    secureFetch,
    type SecureFetchPolicy,
} from '../../../src/utils/secure-fetch.utils';
import { prepareConnectionBackedExtractorRequest } from '../../../src/extractors/shared';
import { sanitizeUrlForLogging } from '../../../src/utils/url-sanitize.utils';
import {
    readResponseJson,
    readResponseText,
} from '../../../src/utils/secure-response-body.utils';
import { OUTBOUND_RESPONSE_LIMITS } from '../../../src/constants';
import { CURRENT_ADAPTER_API_VERSION } from '../../../src/sdk/adapter-version';
import { PimcoreObjectListing } from '../types';
import {
    PIMCORE_EXTRACTOR_LIMITS,
    PIMCORE_SOURCE_ORIGIN_FIELD,
    PIMCORE_SOURCE_URL_FIELD,
} from '../constants';
import { getNestedValue } from '../../../shared/utils/object-path';
import { resolvePimcoreAssetUrl } from '../utils/url.utils';
import {
    createPimcoreAssetQuery,
    createPimcoreCategoryQuery,
    createPimcoreProductQuery,
    validateGraphQLFieldName,
} from './query-builder';
import { PIMCORE_GRAPHQL_EXTRACTOR_SCHEMA } from './pimcore-graphql.schema';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export interface PimcoreGraphQLExtractorConfig {
    connectionCode: string;
    entityType: 'product' | 'category' | 'asset';
    query?: string;
    responseField?: string;
    variables?: Record<string, unknown>;
    filter?: string | Record<string, unknown>;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    first?: number;
    after?: number;
    includeUnpublished?: boolean;
    defaultLanguage?: string;
    maxPages?: number;
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    assetUrlField?: string;
}

interface GraphQLResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    statusCode?: number;
}

interface PimcoreGraphQLResponse {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
}

const DEFAULT_QUERIES: Record<string, string> = {
    product: createPimcoreProductQuery(),
    category: createPimcoreCategoryQuery(),
    asset: createPimcoreAssetQuery(),
};

const RESPONSE_FIELDS: Record<string, string> = {
    product: 'getProductListing',
    category: 'getCategoryListing',
    asset: 'getAssetListing',
};

export const pimcoreGraphQLExtractor: ExtractorAdapter<PimcoreGraphQLExtractorConfig> = {
    type: 'EXTRACTOR',
    code: 'pimcoreGraphQL',
    name: 'Pimcore DataHub GraphQL',
    description: 'Extract data from Pimcore DataHub GraphQL API',
    version: '1.0.0',
    apiVersion: CURRENT_ADAPTER_API_VERSION,
    schema: PIMCORE_GRAPHQL_EXTRACTOR_SCHEMA,

    async *extract(
        context: ExtractContext,
        config: PimcoreGraphQLExtractorConfig,
    ): AsyncGenerator<RecordEnvelope> {
        const {
            entityType,
            first = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_PAGE_SIZE,
            includeUnpublished = false,
            maxPages = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_MAX_PAGES,
            timeoutMs = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_TIMEOUT_MS,
            maxRetries = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_MAX_RETRIES,
            retryDelayMs = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_RETRY_DELAY_MS,
        } = config;

        validateIntegerOption('Page size', first, 1, PIMCORE_EXTRACTOR_LIMITS.MAX_PAGE_SIZE);
        validateIntegerOption('Maximum pages', maxPages, 1, PIMCORE_EXTRACTOR_LIMITS.MAX_PAGES);
        validateIntegerOption('Request timeout', timeoutMs, 1, PIMCORE_EXTRACTOR_LIMITS.MAX_TIMEOUT_MS);
        validateIntegerOption('Maximum attempts', maxRetries, 1, PIMCORE_EXTRACTOR_LIMITS.MAX_RETRIES);
        validateIntegerOption('Retry delay', retryDelayMs, 0, PIMCORE_EXTRACTOR_LIMITS.MAX_RETRY_DELAY_MS);

        const request = await prepareConnectionBackedExtractorRequest(
            context,
            { url: '', connectionCode: config.connectionCode },
            {
                defaultHeaders: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                supportedConnectionTypes: ['HTTP', 'REST', 'GRAPHQL'],
            },
        );

        const query = config.query ?? DEFAULT_QUERIES[entityType];
        if (!query) {
            throw new Error(`No query for entity type: ${entityType}`);
        }

        const responseField = validateGraphQLFieldName(
            config.responseField ?? RESPONSE_FIELDS[entityType],
            'responseField',
        );
        let offset = config.after ?? parseCheckpointOffset(context.checkpoint?.cursor);
        validateIntegerOption('Initial offset', offset, 0, Number.MAX_SAFE_INTEGER);
        let pagesFetched = 0;

        context.logger.info(`Starting ${entityType} extraction`, {
            endpoint: sanitizeUrl(request.url),
            pageSize: first,
        });

        while (true) {
            const variables: Record<string, unknown> = {
                ...config.variables,
                first,
                after: offset,
                defaultLanguage: config.defaultLanguage ?? 'en',
            };

            if (entityType !== 'asset' && includeUnpublished) {
                variables.published = false;
            }

            if (config.filter) {
                if (typeof config.filter === 'object') {
                    variables.filter = JSON.stringify(config.filter);
                } else if (typeof config.filter === 'string') {
                    try {
                        JSON.parse(config.filter);
                        variables.filter = config.filter;
                    } catch {
                        context.logger.warn('Invalid filter JSON, skipping');
                    }
                }
            }

            if (config.sortBy) {
                variables.sortBy = [config.sortBy];
                variables.sortOrder = [config.sortOrder ?? 'ASC'];
            }

            const response = await executeWithRetry(
                request,
                query,
                variables,
                { maxRetries, retryDelayMs, timeoutMs },
            );

            if (!response.success || !response.data) {
                context.logger.error('GraphQL query failed', { error: response.error ?? 'Unknown', page: pagesFetched + 1 });
                throw new Error(`Extraction failed: ${response.error ?? 'Unknown error'}`);
            }

            const listing = response.data[responseField] as PimcoreObjectListing | undefined;
            if (!listing) {
                throw new Error(
                    `Malformed Pimcore response: missing ${responseField}; custom queries must return their listing under the configured responseField`,
                );
            }
            if (!Array.isArray(listing.edges)) {
                throw new Error(`Malformed Pimcore response: ${responseField}.edges must be an array`);
            }
            if (!Number.isInteger(listing.totalCount) || listing.totalCount < 0) {
                throw new Error(`Malformed Pimcore response: ${responseField}.totalCount must be a non-negative integer`);
            }
            const nodes = validateListingNodes(listing, responseField);

            pagesFetched++;

            context.logger.debug(`Page ${pagesFetched}`, {
                records: listing.edges.length,
                total: listing.totalCount,
            });

            for (const [index, node] of nodes.entries()) {
                if (!includeUnpublished && 'published' in node && !node.published) continue;

                const data = createRecordData(
                    node,
                    entityType,
                    request.url,
                    config.assetUrlField,
                );

                yield {
                    data,
                    meta: {
                        sourceId: String(node.id),
                        sourceType: `pimcore:${entityType}`,
                        cursor: String(offset + index + 1),
                    },
                };
            }

            const nextOffset = offset + listing.edges.length;
            if (listing.edges.length === 0 && offset < listing.totalCount) {
                throw new Error(
                    `Malformed Pimcore response: empty page at offset ${offset} before totalCount ${listing.totalCount}`,
                );
            }
            if (listing.edges.length === 0 || nextOffset >= listing.totalCount) {
                context.setCheckpoint({});
                context.logger.info('Extraction complete', { pages: pagesFetched });
                return;
            }
            if (pagesFetched >= maxPages) {
                throw new Error(
                    `Pimcore extraction truncated at maxPages=${maxPages} after ${nextOffset} of ${listing.totalCount} records; increase maxPages or narrow the source filter`,
                );
            }

            offset = nextOffset;
            context.setCheckpoint({ cursor: String(offset), page: pagesFetched });
        }
    },
};

type ValidatedPimcoreNode = Record<string, unknown> & { id: string | number };

function validateListingNodes(
    listing: PimcoreObjectListing,
    responseField: string,
): ValidatedPimcoreNode[] {
    return listing.edges.map((edge, index) => {
        if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
            throw new Error(
                `Malformed Pimcore response: ${responseField}.edges[${index}] must be an object`,
            );
        }
        const node: unknown = Reflect.get(edge, 'node');
        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            throw new Error(
                `Malformed Pimcore response: ${responseField}.edges[${index}].node must be an object`,
            );
        }
        const id = Reflect.get(node, 'id');
        if ((typeof id !== 'string' || !id.trim()) && typeof id !== 'number') {
            throw new Error(
                `Malformed Pimcore response: ${responseField}.edges[${index}].node.id must be a string or number`,
            );
        }
        return node as ValidatedPimcoreNode;
    });
}

function createRecordData(
    node: ValidatedPimcoreNode,
    entityType: PimcoreGraphQLExtractorConfig['entityType'],
    requestUrl: string,
    assetUrlField?: string,
): JsonObject {
    if (entityType !== 'asset') {
        return node as JsonObject;
    }

    const sourceOrigin = new URL(requestUrl).origin;
    const sourceUrl = resolvePimcoreAssetUrl(
        getNestedValue(node, assetUrlField ?? 'fullpath'),
        sourceOrigin,
    );
    return {
        ...(node as JsonObject),
        [PIMCORE_SOURCE_ORIGIN_FIELD]: sourceOrigin,
        ...(sourceUrl ? { [PIMCORE_SOURCE_URL_FIELD]: sourceUrl } : {}),
    };
}

async function executeWithRetry(
    request: {
        readonly url: string;
        readonly headers: Record<string, string>;
        readonly fetchPolicy: SecureFetchPolicy;
    },
    query: string,
    variables: Record<string, unknown>,
    options: { maxRetries?: number; retryDelayMs?: number; timeoutMs?: number } = {},
): Promise<GraphQLResult> {
    const {
        maxRetries = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_MAX_RETRIES,
        retryDelayMs = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_RETRY_DELAY_MS,
        timeoutMs = PIMCORE_EXTRACTOR_LIMITS.DEFAULT_TIMEOUT_MS,
    } = options;

    let lastResult: GraphQLResult = { success: false, error: 'No attempts' };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        lastResult = await executeQuery(request, query, variables, timeoutMs);

        if (lastResult.success) return lastResult;

        if (lastResult.statusCode && lastResult.statusCode >= 400 && lastResult.statusCode < 500) {
            if (!RETRYABLE_STATUS_CODES.has(lastResult.statusCode)) return lastResult;
        }

        if (attempt < maxRetries) {
            await sleep(retryDelayMs * Math.pow(2, attempt - 1));
        }
    }

    return { ...lastResult, error: `Max retries exceeded: ${lastResult.error}` };
}

async function executeQuery(
    request: {
        readonly url: string;
        readonly headers: Record<string, string>;
        readonly fetchPolicy: SecureFetchPolicy;
    },
    query: string,
    variables: Record<string, unknown>,
    timeoutMs: number,
): Promise<GraphQLResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await secureFetch(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        }, undefined, request.fetchPolicy);

        if (!response.ok) {
            let text: string;
            try {
                text = await readResponseText(response, {
                    maxBytes: OUTBOUND_RESPONSE_LIMITS.ERROR_BODY_BYTES,
                    context: 'Pimcore GraphQL error response',
                });
            } catch (error) {
                text = getErrorMessage(error);
            }
            return {
                success: false,
                statusCode: response.status,
                error: 'HTTP ' + response.status + ': ' + sanitizeError(text),
            };
        }

        const json = await readResponseJson<PimcoreGraphQLResponse>(response, {
            maxBytes: OUTBOUND_RESPONSE_LIMITS.CONNECTOR_EXTRACT_BYTES,
            context: 'Pimcore GraphQL response',
        });

        if (json.errors?.length) {
            return { success: false, error: json.errors.map(e => sanitizeError(e.message)).join('; ') };
        }

        return { success: true, data: json.data };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            return { success: false, error: `Request timed out after ${timeoutMs / 1000}s - check if the Pimcore server is reachable` };
        }
        const message = getErrorMessage(err);
        if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
            return { success: false, error: `Cannot connect to Pimcore server - verify the endpoint URL is correct and the server is running` };
        }
        if (message.includes('ETIMEDOUT') || message.includes('ENETUNREACH')) {
            return { success: false, error: `Network error - check your connection and firewall settings` };
        }
        return { success: false, error: message };
    } finally {
        clearTimeout(timeoutId);
    }
}

function sanitizeError(text: string): string {
    if (!text) return '';
    return text
        .substring(0, PIMCORE_EXTRACTOR_LIMITS.MAX_ERROR_LENGTH)
        .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, '[EMAIL]')
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
        .replace(/([a-zA-Z0-9]{32,})/g, '[REDACTED]')
        .replace(/\/[^\s"'<>|:]+\.[a-z]+/gi, '[PATH]');
}

function validateIntegerOption(name: string, value: number, min: number, max: number): void {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
}

function parseCheckpointOffset(value: unknown): number {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    throw new Error('Pimcore checkpoint cursor must be a non-negative numeric offset');
}

/** Sanitize URL for logging - strips credentials, keeps query params */
function sanitizeUrl(endpoint: string): string {
    return sanitizeUrlForLogging(endpoint, {
        stripQueryParams: false,
        stripCredentials: true,
        invalidFallback: '[invalid]',
    });
}
