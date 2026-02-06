import { ExtractorAdapter, ExtractContext, RecordEnvelope } from '../../../src/sdk/types';
import { JsonObject } from '../../../src/types';
import { sleep } from '../../../src/utils/retry.utils';
import { PimcoreObjectListing } from '../types';

const DEFAULTS = {
    MAX_PAGES: 100,
    TIMEOUT_MS: 30000,
    PAGE_SIZE: 100,
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
    MAX_ERROR_LENGTH: 500,
} as const;

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export interface PimcoreGraphQLExtractorConfig {
    'connection.endpoint': string;
    'connection.apiKeySecretCode': string;
    entityType: 'product' | 'category' | 'asset' | 'facet';
    className?: string;
    query?: string;
    variables?: Record<string, unknown>;
    fields?: string[];
    filter?: string | Record<string, unknown>;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    first?: number;
    after?: string;
    includeUnpublished?: boolean;
    defaultLanguage?: string;
    languages?: string[];
    maxRetries?: number;
    retryDelayMs?: number;
}

interface GraphQLResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    statusCode?: number;
}

const DEFAULT_QUERIES: Record<string, string> = {
    product: `
        query GetProducts($first: Int, $after: String, $filter: String, $sortBy: [String], $defaultLanguage: String) {
            getProductListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy, defaultLanguage: $defaultLanguage) {
                totalCount
                pageInfo { hasNextPage endCursor }
                edges {
                    cursor
                    node {
                        id key fullPath published modificationDate creationDate
                        ... on Product {
                            sku itemNumber name description shortDescription slug price
                            images { id fullPath filename mimetype }
                            categories { id key fullPath }
                            variants { id key sku name price stockQuantity }
                        }
                    }
                }
            }
        }
    `,
    category: `
        query GetCategories($first: Int, $after: String, $filter: String, $sortBy: [String], $defaultLanguage: String) {
            getCategoryListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy, defaultLanguage: $defaultLanguage) {
                totalCount
                pageInfo { hasNextPage endCursor }
                edges {
                    cursor
                    node {
                        id key fullPath published index
                        ... on Category {
                            name description slug
                            parent { id key fullPath }
                            image { id fullPath filename }
                        }
                    }
                }
            }
        }
    `,
    asset: `
        query GetAssets($first: Int, $after: String, $filter: String, $sortBy: [String]) {
            getAssetListing(first: $first, after: $after, filter: $filter, sortBy: $sortBy) {
                totalCount
                pageInfo { hasNextPage endCursor }
                edges {
                    cursor
                    node {
                        id filename fullPath path mimetype filesize
                        ... on AssetImage { width height }
                        metadata { name language type data }
                    }
                }
            }
        }
    `,
    facet: `
        query GetFacets($first: Int, $after: String) {
            getObjectBrickListing(first: $first, after: $after) {
                totalCount
                edges { node { id key title } }
            }
        }
    `,
};

const RESPONSE_FIELDS: Record<string, string> = {
    product: 'getProductListing',
    category: 'getCategoryListing',
    asset: 'getAssetListing',
    facet: 'getObjectBrickListing',
};

export const pimcoreGraphQLExtractor: ExtractorAdapter<PimcoreGraphQLExtractorConfig> = {
    type: 'extractor',
    code: 'pimcoreGraphQL',
    name: 'Pimcore DataHub GraphQL',
    description: 'Extract data from Pimcore DataHub GraphQL API',
    schema: {
        fields: [
            { key: 'connection.endpoint', label: 'Endpoint', type: 'string', required: true },
            { key: 'connection.apiKeySecretCode', label: 'API Key Secret', type: 'secret', required: true },
            { key: 'entityType', label: 'Entity Type', type: 'select', required: true },
            { key: 'first', label: 'Page Size', type: 'number' },
            { key: 'filter', label: 'Filter', type: 'json' },
            { key: 'defaultLanguage', label: 'Default Language', type: 'string' },
        ],
    },

    async *extract(
        context: ExtractContext,
        config: PimcoreGraphQLExtractorConfig,
    ): AsyncGenerator<RecordEnvelope> {
        const {
            entityType,
            first = DEFAULTS.PAGE_SIZE,
            includeUnpublished = false,
            maxRetries = DEFAULTS.MAX_RETRIES,
            retryDelayMs = DEFAULTS.RETRY_DELAY_MS,
        } = config;

        const endpoint = config['connection.endpoint'];
        const apiKeySecretCode = config['connection.apiKeySecretCode'];

        if (!endpoint) {
            context.logger.error('Pimcore endpoint not configured');
            throw new Error('Pimcore endpoint not configured');
        }

        const apiKey = await context.secrets.get(apiKeySecretCode);
        if (!apiKey) {
            context.logger.error('Pimcore API key not configured');
            throw new Error('Pimcore API key not configured');
        }

        const query = config.query ?? DEFAULT_QUERIES[entityType];
        if (!query) {
            throw new Error(`No query for entity type: ${entityType}`);
        }

        const responseField = RESPONSE_FIELDS[entityType];
        let cursor: string | undefined = config.after ?? (context.checkpoint?.cursor as string | undefined);
        let pageCount = 0;

        context.logger.info(`Starting ${entityType} extraction`, {
            endpoint: sanitizeUrl(endpoint),
            pageSize: first,
        });

        while (pageCount < DEFAULTS.MAX_PAGES) {
            const variables: Record<string, unknown> = {
                first,
                after: cursor,
                defaultLanguage: config.defaultLanguage ?? 'en',
                ...config.variables,
            };

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
                variables.sortBy = [`${config.sortBy} ${config.sortOrder ?? 'ASC'}`];
            }

            const response = await executeWithRetry(
                endpoint,
                query,
                variables,
                apiKey,
                { maxRetries, retryDelayMs },
            );

            if (!response.success || !response.data) {
                context.logger.error('GraphQL query failed', { error: response.error ?? 'Unknown', page: pageCount });
                throw new Error(`Extraction failed: ${response.error ?? 'Unknown error'}`);
            }

            const listing = response.data[responseField] as PimcoreObjectListing | undefined;
            if (!listing) break;

            context.logger.debug(`Page ${pageCount + 1}`, {
                records: listing.edges.length,
                total: listing.totalCount,
            });

            for (const edge of listing.edges) {
                const node = edge.node;
                if (!includeUnpublished && 'published' in node && !node.published) continue;

                yield {
                    data: node as unknown as JsonObject,
                    meta: {
                        sourceId: String(node.id),
                        sourceType: `pimcore:${entityType}`,
                        cursor: edge.cursor,
                    },
                };
            }

            if (!listing.pageInfo?.hasNextPage) break;

            cursor = listing.pageInfo.endCursor;
            pageCount++;

            context.setCheckpoint({ cursor: cursor ?? '', page: pageCount });
        }

        context.logger.info(`Extraction complete`, { pages: pageCount + 1 });
    },
};

async function executeWithRetry(
    endpoint: string,
    query: string,
    variables: Record<string, unknown>,
    apiKey: string,
    options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<GraphQLResult> {
    const { maxRetries = DEFAULTS.MAX_RETRIES, retryDelayMs = DEFAULTS.RETRY_DELAY_MS } = options;

    let lastResult: GraphQLResult = { success: false, error: 'No attempts' };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        lastResult = await executeQuery(endpoint, query, variables, apiKey);

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
    endpoint: string,
    query: string,
    variables: Record<string, unknown>,
    apiKey: string,
): Promise<GraphQLResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULTS.TIMEOUT_MS);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            return { success: false, statusCode: response.status, error: `HTTP ${response.status}: ${sanitizeError(text)}` };
        }

        const json = await response.json() as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };

        if (json.errors?.length) {
            return { success: false, error: json.errors.map(e => sanitizeError(e.message)).join('; ') };
        }

        return { success: true, data: json.data };
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            return { success: false, error: `Request timed out after ${DEFAULTS.TIMEOUT_MS / 1000}s - check if the Pimcore server is reachable` };
        }
        const message = err instanceof Error ? err.message : String(err);
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
        .substring(0, DEFAULTS.MAX_ERROR_LENGTH)
        .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, '[EMAIL]')
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
        .replace(/([a-zA-Z0-9]{32,})/g, '[REDACTED]')
        .replace(/\/[^\s"'<>|:]+\.[a-z]+/gi, '[PATH]');
}

function sanitizeUrl(endpoint: string): string {
    try {
        const url = new URL(endpoint);
        url.username = '';
        url.password = '';
        return url.toString();
    } catch {
        return '[invalid]';
    }
}

export default pimcoreGraphQLExtractor;
