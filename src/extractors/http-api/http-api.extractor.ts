import { Injectable } from '@nestjs/common';
import { HttpMethod, PaginationType, TIME_UNITS, HTTP, WEBHOOK } from '../../constants/index';
import { getErrorMessage } from '../../utils/error.utils';
import {
    DataExtractor,
    ExtractorContext,
    ExtractorValidationResult,
    ConnectionTestResult,
    ExtractorPreviewResult,
    RecordEnvelope,
    StepConfigSchema,
    ExtractorCategory,
} from '../../types/index';
import {
    HttpApiExtractorConfig,
    HttpResponse,
    RETRYABLE_NETWORK_CODES,
    HTTP_DEFAULTS,
} from './types';
import {
    buildUrl,
    buildHeaders,
    buildPaginatedRequest,
    isValidUrl,
    getMethod,
    prepareRequestBody,
} from './request-builder';
import {
    extractRecords,
    buildHttpResponse,
} from './response-parser';
import {
    updatePaginationState,
    initPaginationState,
    getPaginationType,
    hasReachedMaxPages,
} from './pagination';

@Injectable()
export class HttpApiExtractor implements DataExtractor<HttpApiExtractorConfig> {
    readonly type = 'extractor' as const;
    readonly code = 'httpApi';
    readonly name = 'HTTP API Extractor';
    readonly description = 'Extract data from REST/GraphQL APIs with pagination support';
    readonly category: ExtractorCategory = 'API';
    readonly version = '1.0.0';
    readonly icon = 'globe';
    readonly supportsPagination = true;
    readonly supportsIncremental = true;
    readonly supportsCancellation = true;

    readonly schema: StepConfigSchema = {
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
                options: [
                    { value: HttpMethod.GET, label: 'GET' },
                    { value: HttpMethod.POST, label: 'POST' },
                    { value: HttpMethod.PUT, label: 'PUT' },
                    { value: HttpMethod.PATCH, label: 'PATCH' },
                ],
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
                options: [
                    { value: PaginationType.NONE, label: 'None' },
                    { value: PaginationType.OFFSET, label: 'Offset' },
                    { value: PaginationType.CURSOR, label: 'Cursor' },
                    { value: PaginationType.PAGE, label: 'Page' },
                    { value: PaginationType.LINK_HEADER, label: 'Link Header' },
                ],
                defaultValue: PaginationType.NONE,
            },
            {
                key: 'pagination.limit',
                label: 'Page Size',
                description: 'Number of records per page',
                type: 'number',
                defaultValue: HTTP_DEFAULTS.pageLimit,
            },
            {
                key: 'rateLimit.requestsPerSecond',
                label: 'Rate Limit (req/sec)',
                description: 'Maximum requests per second',
                type: 'number',
            },
            {
                key: 'retry.maxAttempts',
                label: 'Max Retry Attempts',
                type: 'number',
                defaultValue: HTTP_DEFAULTS.maxRetries,
            },
            {
                key: 'timeoutMs',
                label: 'Timeout (ms)',
                type: 'number',
                defaultValue: HTTP_DEFAULTS.timeoutMs,
            },
        ],
    };

    async *extract(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): AsyncGenerator<RecordEnvelope, void, undefined> {
        const startTime = Date.now();
        let totalFetched = 0;
        let pageCount = 0;
        let requestCount = 0;

        try {
            context.logger.info('Starting HTTP API extraction', {
                url: config.url,
                method: getMethod(config),
            });

            const paginationType = getPaginationType(config);

            if (paginationType === PaginationType.NONE) {
                const response = await this.makeRequest(context, config);
                const records = extractRecords(response.data, config.dataPath);
                requestCount++;

                for (const record of records) {
                    yield {
                        data: record,
                        meta: {
                            sourceId: config.url,
                            sourceTimestamp: new Date().toISOString(),
                        },
                    };
                    totalFetched++;
                }
            } else {
                let state = initPaginationState();
                let hasMore = true;
                const maxPages = config.pagination?.maxPages || HTTP_DEFAULTS.maxPages;

                while (hasMore && !hasReachedMaxPages(pageCount, maxPages)) {
                    if (await context.isCancelled()) {
                        context.logger.warn('Extraction cancelled');
                        break;
                    }

                    if (config.rateLimit?.requestsPerSecond) {
                        await this.rateLimitDelay(config.rateLimit.requestsPerSecond);
                    }

                    const paginatedConfig = buildPaginatedRequest(config, paginationType, state);

                    const response = await this.makeRequest(context, paginatedConfig);
                    const records = extractRecords(response.data, config.dataPath);
                    requestCount++;
                    pageCount++;

                    for (const record of records) {
                        yield {
                            data: record,
                            meta: {
                                sourceId: config.url,
                                sourceTimestamp: new Date().toISOString(),
                                sequence: totalFetched,
                            },
                        };
                        totalFetched++;
                    }

                    const updatedState = updatePaginationState(
                        paginationType,
                        response,
                        config,
                        { ...state, recordCount: records.length },
                    );

                    hasMore = updatedState.hasMore;
                    state = {
                        cursor: updatedState.cursor,
                        offset: updatedState.offset,
                        page: updatedState.page,
                        recordCount: records.length,
                    };

                    context.logger.debug(`Fetched page ${pageCount}`, {
                        records: records.length,
                        totalFetched,
                        hasMore,
                    });
                }
            }

            const durationMs = Date.now() - startTime;
            context.logger.info('HTTP API extraction completed', {
                totalFetched,
                pageCount,
                requestCount,
                durationMs,
            });

            context.setCheckpoint({
                lastExtractedAt: new Date().toISOString(),
                totalFetched,
            });
        } catch (error) {
            context.logger.error('HTTP API extraction failed', error as Error);
            throw error;
        }
    }

    async validate(
        _context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<ExtractorValidationResult> {
        const errors: Array<{ field: string; message: string; code?: string }> = [];
        const warnings: Array<{ field?: string; message: string }> = [];

        if (!config.url) {
            errors.push({ field: 'url', message: 'URL is required' });
        } else if (!isValidUrl(config.url, !!config.connectionCode)) {
            errors.push({ field: 'url', message: 'Invalid URL format' });
        }

        if (config.pagination?.type === PaginationType.CURSOR && !config.pagination.cursorPath) {
            warnings.push({
                field: 'pagination.cursorPath',
                message: 'Cursor path not specified for cursor pagination',
            });
        }

        if (config.rateLimit?.requestsPerSecond && config.rateLimit.requestsPerSecond <= 0) {
            errors.push({
                field: 'rateLimit.requestsPerSecond',
                message: 'Rate limit must be positive',
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    async testConnection(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<ConnectionTestResult> {
        const startTime = Date.now();

        try {
            const response = await this.makeRequest(context, {
                ...config,
                pagination: { type: PaginationType.NONE },
            });

            return {
                success: true,
                details: {
                    statusCode: response.status,
                    statusText: response.statusText,
                },
                latencyMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: getErrorMessage(error),
            };
        }
    }

    async preview(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
        limit: number = 10,
    ): Promise<ExtractorPreviewResult> {
        const response = await this.makeRequest(context, config);
        const records = extractRecords(response.data, config.dataPath);
        const preview = records.slice(0, limit);

        return {
            records: preview.map((record, index) => ({
                data: record,
                meta: { sourceId: config.url, sequence: index },
            })),
            totalAvailable: records.length,
            metadata: { statusCode: response.status },
        };
    }

    private async makeRequest(
        context: ExtractorContext,
        config: HttpApiExtractorConfig,
    ): Promise<HttpResponse> {
        const maxAttempts = config.retry?.maxAttempts || HTTP.MAX_RETRIES;
        const initialDelay = config.retry?.initialDelayMs || HTTP.RETRY_DELAY_MS;
        const maxDelay = config.retry?.maxDelayMs || HTTP.RETRY_MAX_DELAY_MS;
        const backoffMultiplier = config.retry?.backoffMultiplier || WEBHOOK.BACKOFF_MULTIPLIER;

        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const url = await buildUrl(context, config);
                const headers = await buildHeaders(context, config);
                const body = prepareRequestBody(config);

                context.logger.debug(`Making HTTP request (attempt ${attempt}/${maxAttempts})`, {
                    method: getMethod(config),
                    url,
                });

                const response = await fetch(url, {
                    method: getMethod(config),
                    headers,
                    body,
                    signal: AbortSignal.timeout(config.timeoutMs || HTTP.TIMEOUT_MS),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await buildHttpResponse(response);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                const isRetryable = this.isRetryableError(error, config);

                if (!isRetryable || attempt >= maxAttempts) {
                    throw lastError;
                }

                const delay = Math.min(
                    initialDelay * Math.pow(backoffMultiplier, attempt - 1),
                    maxDelay,
                );

                context.logger.warn(`Request failed, retrying in ${delay}ms`, {
                    attempt,
                    error: lastError.message,
                });

                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Request failed');
    }

    private isRetryableError(error: unknown, config: HttpApiExtractorConfig): boolean {
        const retryableStatusCodes = config.retry?.retryableStatusCodes || [...HTTP.RETRYABLE_STATUS_CODES];

        if (error && typeof error === 'object' && 'statusCode' in error) {
            const statusCode = (error as { statusCode: number }).statusCode;
            if ((retryableStatusCodes as readonly number[]).includes(statusCode)) {
                return true;
            }
        }

        if (error && typeof error === 'object' && 'code' in error) {
            const code = (error as { code: string }).code;
            if ((RETRYABLE_NETWORK_CODES as readonly string[]).includes(code)) {
                return true;
            }
        }

        return false;
    }

    private async rateLimitDelay(requestsPerSecond: number): Promise<void> {
        const delayMs = TIME_UNITS.SECOND / requestsPerSecond;
        await this.sleep(delayMs);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
